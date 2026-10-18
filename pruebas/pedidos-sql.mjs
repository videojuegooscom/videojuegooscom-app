/**
 * pruebas/pedidos-sql.mjs — pruebas REALES (SQL en una base aislada) de los pedidos idempotentes.
 *
 * Qué hace: crea una base aislada (esqueleto de Supabase + migración real de pedidos) y prueba, con
 * SESIONES DE PostgreSQL REALES a la vez (procesos psql en paralelo), la migración
 * 20261018110000_pedidos_idempotencia.sql:
 *  1) Concurrencia: dos peticiones con la misma clave (la segunda ESPERA a la primera y devuelve el mismo
 *     pedido), y 20 a la vez con la misma clave, o con claves distintas pero la misma compra.
 *  2) Una clave no se puede reutilizar con otros productos, otra entrega ni otra persona; los importes
 *     salen siempre de la base de datos, nunca del cliente.
 *  3) Permisos: quién puede ejecutar qué, SECURITY DEFINER y search_path, RLS de pedidos y artículos
 *     (anon no ve nada, cada cliente solo lo suyo, el admin todo, nadie escribe directamente).
 *  4) La función antigua crear_pedido NO permite saltarse la idempotencia (control: SIN la migración sí
 *     duplica).
 *  5) Fallos: producto no disponible (la clave no se «quema»), fallo a mitad de la operación (todo se
 *     deshace), respuesta perdida y reintento, cliente que se cae a mitad de transacción.
 *  6) Ventana de 10 minutos, pedidos no pendientes, migración repetida y vuelta atrás.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/pedidos-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/pedidos-sql.mjs <servidor local de pruebas> [--mutacion-sin-bloqueos]");
  process.exit(2);
}
const db = conectar(servidor);
const url = new URL(servidor);

const PEDIDOS = "supabase/migrations/20261013120000_pedidos.sql";
const MIG_REAL = "supabase/migrations/20261018110000_pedidos_idempotencia.sql";
const REV = "supabase/rollbacks/20261018110000_pedidos_idempotencia_revertir.sql";

// «Prueba de las pruebas»: con --mutacion-sin-bloqueos se aplica una copia de la migración a la que se le
// han quitado los bloqueos de asesoramiento. Las pruebas DEBEN detectarlo (salir con fallos); si pasaran,
// serían inútiles contra la concurrencia. En ese modo el programa sale con 0 solo si detectó el fallo.
const MUTAR = process.argv[3] === "--mutacion-sin-bloqueos";
let MIG = MIG_REAL;
if (MUTAR) {
  const mutada = readFileSync(MIG_REAL, "utf8").replace(/perform pg_advisory_xact_lock\([^;]*\);/g, "-- bloqueo quitado por la mutación");
  MIG = join(tmpdir(), "vz_migracion_pedidos_sin_bloqueos.sql");
  writeFileSync(MIG, mutada);
  console.log("MODO MUTACIÓN: la migración se aplica SIN los bloqueos; se espera que las pruebas fallen.");
}

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ADM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = (c) => `00000000-0000-4000-8000-0000000000${c}`; // productos de prueba: a1, a2, a3…
const [A, B, C, D, E, F] = ["a1", "a2", "a3", "a4", "a5", "a6"].map(P);
const clave = (n) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;
const DATOS = { nombre: "Cliente Prueba", email: "prueba@example.com", telefono: "600123123", entrega: "recogida" };

const anon = { rol: "anon" };
const u1 = { rol: "authenticated", uid: U1 };
const u2 = { rol: "authenticated", uid: U2 };
const adm = { rol: "authenticated", uid: ADM };
const dueno = { rol: "postgres" };

// Ejecuta una consulta como un rol de Supabase con su identidad en el token (igual que PostgREST).
function argsComo(usuario, sql) {
  const a = [];
  if (usuario.uid) a.push("-c", `set request.jwt.claims = '${JSON.stringify({ sub: usuario.uid, role: usuario.rol })}'`);
  if (usuario.rol !== "postgres") a.push("-c", `set role ${usuario.rol}`);
  a.push("-A", "-t", "-c", sql);
  return a;
}
const como = (base, usuario, sql) => db.psql(base, argsComo(usuario, sql)).then((s) => s.trim());
const sqlCrear = (k, productos, datos = DATOS, fn = "crear_pedido_idempotente") =>
  `select public.${fn}(${fn === "crear_pedido" ? "" : `'${k}'::uuid, `}'${JSON.stringify(datos)}'::jsonb, array[${productos.map((p) => `'${p}'`).join(",")}]::uuid[])`;
const crear = async (base, usuario, k, productos, datos) => JSON.parse(await como(base, usuario, sqlCrear(k, productos, datos)));
const crearAntiguo = async (base, usuario, productos, datos) => Number(await como(base, usuario, sqlCrear(null, productos, datos, "crear_pedido")));
const error = async (promesa) => {
  try {
    await promesa;
    return "";
  } catch (e) {
    return String(e.message);
  }
};
const n = async (base, sql) => Number(await como(base, dueno, sql));

// Sesión larga: abre una transacción, ejecuta algo y la mantiene abierta unos segundos antes de confirmar.
function sesionLarga(base, usuario, sql, segundos) {
  const t0 = Date.now();
  const args = ["-c", "begin", ...argsComo(usuario, sql).slice(0, -4)]; // sin los 4 últimos: -A -t -c <sql>
  args.push("-A", "-t", "-c", sql, "-c", `select pg_sleep(${segundos})`, "-c", "commit");
  return db.psql(base, args).then((s) => ({ salida: s.trim(), ms: Date.now() - t0 }));
}

// Simultaneidad REAL: N sesiones se quedan esperando en una «puerta» (un bloqueo de asesoramiento que
// tiene cerrado otra sesión) y arrancan TODAS a la vez cuando esa sesión la abre. Lanzar procesos uno
// tras otro no basta: arrancan escalonados y cada llamada dura milisegundos, así que no se solapan.
// Devuelve, por cada consulta, {ok, valor|error}.
async function enRafaga(base, usuario, sqls) {
  const puerta = db.psql(base, ["-A", "-t", "-c", "select pg_advisory_lock(777)", "-c", "select pg_sleep(2.5)"]);
  await new Promise((f) => setTimeout(f, 700)); // que la puerta esté cerrada antes de que lleguen
  const trabajadores = sqls.map((sql) =>
    db
      .psql(base, [...argsComo(usuario, sql).slice(0, -4), "-A", "-t", "-c", "select pg_advisory_lock_shared(777)", "-c", sql])
      .then((s) => ({ ok: true, valor: s.trim().split("\n").filter(Boolean).pop() }))
      .catch((e) => ({ ok: false, error: String(e.message) }))
  );
  const resultados = await Promise.all(trabajadores);
  await puerta;
  return resultados;
}
const json = (r) => JSON.parse(r.valor.match(/\{.*\}/)[0]);

async function nueva(conMigracion = true) {
  const b = await db.crearBase();
  await db.aplicar(b, [PEDIDOS]);
  if (conMigracion) await db.aplicar(b, [MIG]);
  await como(
    b,
    dueno,
    `insert into auth.users (id, email) values ('${U1}', 'u1@example.com'), ('${U2}', 'u2@example.com'), ('${ADM}', 'admin@example.com');
     insert into public.profiles (id, role) values ('${U1}', 'user'), ('${U2}', 'user'), ('${ADM}', 'admin');
     insert into public.products (id, title, price_eur, status) values
       ('${A}', 'Producto A', 100.00, 'PUBLISHED'), ('${B}', 'Producto B', 50.50, 'PUBLISHED'), ('${C}', 'Producto C', 20.00, 'PUBLISHED'),
       ('${D}', 'Producto D (borrador)', 10.00, 'DRAFT'), ('${E}', 'Producto E', 30.00, 'PUBLISHED'), ('${F}', 'Prueba fallo', 5.00, 'PUBLISHED')`
  );
  return b;
}

try {
  // ---------------------------------------------------------------- control SIN la migración
  {
    const b = await nueva(false);
    for (let i = 0; i < 5; i++) await crearAntiguo(b, u1, [A, B]);
    const ped = await n(b, "select count(*) from public.pedidos");
    ok(ped === 5, `control (SIN la migración): la función antigua crea ${ped} pedidos idénticos con 5 llamadas seguidas (el problema es real)`);
  }

  const b = await nueva(true);

  // ---------------------------------------------------------------- 1) concurrencia
  {
    const k = clave(1);
    const sesionA = sesionLarga(b, u1, sqlCrear(k, [A, B]), 3);
    await new Promise((f) => setTimeout(f, 800));
    const t0 = Date.now();
    const rB = await crear(b, u1, k, [A, B]);
    const esperaB = Date.now() - t0;
    const rA = JSON.parse((await sesionA).salida.match(/\{.*\}/)[0]);
    ok(esperaB >= 1500, `concurrencia: la 2.ª petición con la misma clave ESPERÓ a la 1.ª (${esperaB} ms) en vez de crear otro pedido`);
    ok(rA.repetido === false && rB.repetido === true, `concurrencia: la 1.ª crea (repetido=${rA.repetido}) y la 2.ª es repetida (repetido=${rB.repetido})`);
    ok(rA.numero === rB.numero, `concurrencia: las dos devuelven el MISMO pedido (nº ${rA.numero} y nº ${rB.numero})`);
    ok((await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "concurrencia: hay un solo pedido con esa clave");
  }
  {
    // Misma COMPRA con otra clave: la 2.ª espera a la 1.ª (bloqueo de la compra) y devuelve el mismo pedido.
    const sesionA = sesionLarga(b, u2, sqlCrear(clave(250), [B, C]), 3);
    await new Promise((f) => setTimeout(f, 800));
    const t0 = Date.now();
    const rB = await crear(b, u2, clave(251), [B, C]);
    const esperaB = Date.now() - t0;
    const rA = JSON.parse((await sesionA).salida.match(/\{.*\}/)[0]);
    ok(esperaB >= 1500, `misma compra con OTRA clave: la 2.ª petición esperó a la 1.ª (${esperaB} ms)`);
    ok(rA.repetido === false && rB.repetido === true && rA.numero === rB.numero, `misma compra con otra clave: devuelve el mismo pedido (nº ${rA.numero} y nº ${rB.numero})`);
  }
  {
    const k = clave(2);
    const r = await enRafaga(b, anon, Array.from({ length: 20 }, () => sqlCrear(k, [C], { ...DATOS, email: "invitado20@example.com" })));
    const buenas = r.filter((x) => x.ok).map(json);
    ok(buenas.length === 20, `20 peticiones SIMULTÁNEAS con la misma clave: las 20 responden bien (${buenas.length})`);
    ok(new Set(buenas.map((x) => x.numero)).size === 1, "20 a la vez, misma clave: todas devuelven el mismo número");
    ok(buenas.filter((x) => !x.repetido).length === 1, `20 a la vez, misma clave: exactamente 1 crea el pedido (${buenas.filter((x) => !x.repetido).length})`);
    ok((await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "20 a la vez, misma clave: 1 pedido en la tabla");
  }
  {
    // Claves DISTINTAS pero la misma compra (misma persona y mismo carrito): un cliente con claves nuevas en cada intento.
    const r = await enRafaga(b, u1, Array.from({ length: 20 }, (_, i) => sqlCrear(clave(100 + i), [E])));
    const buenas = r.filter((x) => x.ok).map(json);
    ok(buenas.length === 20 && new Set(buenas.map((x) => x.numero)).size === 1, `20 SIMULTÁNEAS con 20 claves DISTINTAS y la misma compra: todas devuelven el mismo pedido (respuestas buenas: ${buenas.length}, pedidos distintos: ${new Set(buenas.map((x) => x.numero)).size})`);
    ok((await n(b, `select count(*) from public.pedidos where user_id = '${U1}' and clave_unica >= '${clave(100)}' and clave_unica <= '${clave(119)}'`)) === 1, "20 a la vez con claves distintas: 1 solo pedido de esa compra (la defensa no depende de que el cliente sea honesto)");
  }
  {
    // Carritos DISTINTOS a la vez: no se confunden (sin falsos duplicados).
    const carritos = [[A], [B], [C], [E], [A, B]];
    const r = await enRafaga(b, u2, carritos.map((c, i) => sqlCrear(clave(200 + i), c)));
    const buenas = r.filter((x) => x.ok).map(json);
    ok(buenas.length === 5 && new Set(buenas.map((x) => x.numero)).size === 5, "5 carritos distintos SIMULTÁNEOS de la misma persona: 5 pedidos distintos (sin falsos duplicados)");
  }

  // ---------------------------------------------------------------- 2) reutilización de claves
  {
    const k = clave(300);
    const r1 = await crear(b, u1, k, [A, C]);
    const e1 = await error(crear(b, u1, k, [A]));
    ok(/ya se usó con otro pedido/.test(e1), "clave reutilizada con OTROS PRODUCTOS: falla");
    const e2 = await error(crear(b, u1, k, [A, C], { ...DATOS, entrega: "envio", direccion: "Calle Falsa 123", codigo_postal: "50001", ciudad: "Zaragoza" }));
    ok(/ya se usó con otro pedido/.test(e2), "clave reutilizada con OTRA ENTREGA: falla");
    const e3 = await error(crear(b, u2, k, [A, C]));
    ok(/ya se usó con otro pedido/.test(e3), "clave reutilizada por OTRO USUARIO: falla");
    const e4 = await error(crear(b, anon, k, [A, C]));
    ok(/ya se usó con otro pedido/.test(e4), "clave de un usuario con sesión reutilizada por un VISITANTE sin sesión: falla");
    const r2 = await crear(b, u1, k, [C, A], { ...DATOS, notas: "otro texto" });
    ok(r2.repetido === true && r2.numero === r1.numero, "mismo usuario, mismo carrito en otro orden y otras notas: devuelve el pedido original (reintento)");
    ok((await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "tras todos esos intentos, 1 solo pedido con esa clave");
    ok(!/prueba@example\.com|Cliente Prueba|600123123/.test(e3 + e4), "el mensaje de error al reutilizar la clave de otra persona no revela datos del pedido original (nombre, correo, teléfono)");
  }
  {
    // Importes: salen de la base de datos; un precio enviado por el cliente se ignora y un cambio de precio no abre un pedido nuevo.
    const k = clave(400);
    const r1 = await crear(b, u2, k, [F], { ...DATOS, total_eur: 0.01, precio_eur: 0.01 });
    const total1 = await n(b, `select total_eur from public.pedidos where clave_unica = '${k}'`);
    ok(total1 === 5, `el importe lo pone la base de datos (5,00 €), no el cliente que mandó 0,01 € (${total1})`);
    await como(b, dueno, `update public.products set price_eur = 99 where id = '${F}'`);
    const r2 = await crear(b, u2, k, [F]);
    ok(r2.repetido === true && r2.numero === r1.numero, "cambio de precio entre intentos: el reintento devuelve el mismo pedido");
    ok((await n(b, `select total_eur from public.pedidos where clave_unica = '${k}'`)) === 5, "el pedido conserva el importe con el que se creó (5,00 €)");
    await como(b, dueno, `update public.products set price_eur = 5 where id = '${F}'`);
  }

  // ---------------------------------------------------------------- 3) permisos, SECURITY DEFINER y RLS
  {
    const fn = "public.crear_pedido_idempotente(uuid,jsonb,uuid[])";
    const privs = await como(b, dueno, `select has_function_privilege('anon','${fn}','execute') || ',' || has_function_privilege('authenticated','${fn}','execute') || ',' || has_function_privilege('service_role','${fn}','execute')`);
    ok(privs === "true,true,true", `ejecutan la función nueva anon, authenticated y service_role (${privs})`);
    const publico = await como(b, dueno, `select coalesce(proacl::text, '') ~ '(^\\{|,)=X' from pg_proc where oid = '${fn}'::regprocedure`);
    ok(publico === "f", "PUBLIC (todos) no tiene permiso de ejecución sobre la función nueva (solo los roles de Supabase)");
    const def = await como(b, dueno, `select prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), '') || '|' || pg_get_userbyid(proowner) from pg_proc where oid = '${fn}'::regprocedure`);
    ok(def === "true|search_path=public|postgres", `SECURITY DEFINER con search_path=public y dueño postgres (${def})`);
    const defAntigua = await como(b, dueno, "select prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = 'public.crear_pedido(jsonb,uuid[])'::regprocedure");
    ok(defAntigua === "true|search_path=public", `la función antigua mantiene SECURITY DEFINER y search_path (${defAntigua})`);
    const rls = await como(b, dueno, "select string_agg(relname || '=' || relrowsecurity::text, ',' order by relname) from pg_class where relname in ('pedidos','pedido_items')");
    ok(rls === "pedido_items=true,pedidos=true", `RLS activada en pedidos y pedido_items (${rls})`);

    // Lectura: el visitante nada, cada cliente lo suyo, el admin todo.
    const total = await n(b, "select count(*) from public.pedidos");
    const vAnon = Number(await como(b, anon, "select count(*) from public.pedidos"));
    const v1 = Number(await como(b, u1, "select count(*) from public.pedidos"));
    const v1ajenos = Number(await como(b, u1, `select count(*) from public.pedidos where user_id <> '${U1}'`));
    const vAdm = Number(await como(b, adm, "select count(*) from public.pedidos"));
    ok(vAnon === 0, `un visitante sin sesión ve 0 pedidos de los ${total} que hay`);
    ok(v1 > 0 && v1ajenos === 0, `un cliente solo ve los suyos (${v1}) y ninguno ajeno (${v1ajenos})`);
    ok(vAdm === total, `el administrador ve todos (${vAdm} de ${total})`);
    const itemsAnon = Number(await como(b, anon, "select count(*) from public.pedido_items"));
    const itemsAjenos = Number(await como(b, u2, `select count(*) from public.pedido_items i join public.pedidos p on p.id = i.pedido_id where p.user_id <> '${U2}'`));
    ok(itemsAnon === 0 && itemsAjenos === 0, "los artículos de un pedido tampoco se ven desde fuera (visitante 0, ajenos 0)");

    // Escritura directa: nadie puede insertar, cambiar ni borrar pedidos sin pasar por la función.
    const eIns = await error(como(b, anon, `insert into public.pedidos (nombre, email, telefono) values ('Hacker', 'h@example.com', '600000000')`));
    ok(/row-level security|permission denied/.test(eIns), "un visitante no puede INSERTAR pedidos directamente");
    const eIns2 = await error(como(b, u1, `insert into public.pedidos (user_id, nombre, email, telefono) values ('${U1}', 'Yo', 'y@example.com', '600000000')`));
    ok(/row-level security|permission denied/.test(eIns2), "un cliente con sesión tampoco puede INSERTAR pedidos directamente");
    const upd = await como(b, u1, `update public.pedidos set estado = 'entregado', total_eur = 0 where user_id = '${U1}' returning id`);
    ok(upd === "", "un cliente no puede CAMBIAR sus pedidos (0 filas actualizadas)");
    const del = await como(b, u1, `delete from public.pedidos where user_id = '${U1}' returning id`);
    ok(del === "", "un cliente no puede BORRAR pedidos (0 filas)");
    const cambiadas = await n(b, "select count(*) from public.pedidos where estado <> 'pendiente' or total_eur = 0");
    ok(cambiadas === 0, "ningún pedido cambió de estado ni de importe tras esos intentos");
    const admUpd = await como(b, adm, `update public.pedidos set estado = 'confirmado' where id = (select id from public.pedidos order by created_at limit 1) returning estado`);
    ok(admUpd === "confirmado", "el administrador SÍ puede cambiar el estado (único camino)");
    await como(b, dueno, "update public.pedidos set estado = 'pendiente'");
  }

  // ---------------------------------------------------------------- 4) la función antigua no permite saltarse la defensa
  {
    const b2 = await nueva(true);
    const seguidos = [];
    for (let i = 0; i < 5; i++) seguidos.push(await crearAntiguo(b2, u1, [A, B]));
    ok(new Set(seguidos).size === 1 && (await n(b2, "select count(*) from public.pedidos")) === 1, `función antigua, 5 llamadas seguidas con la misma compra: devuelven el mismo nº (${seguidos[0]}) y hay 1 pedido`);
    const paralelo = await enRafaga(b2, u2, Array.from({ length: 20 }, () => sqlCrear(null, [C], DATOS, "crear_pedido")));
    const nums = paralelo.filter((x) => x.ok).map((x) => Number(x.valor));
    ok(nums.length === 20 && new Set(nums).size === 1 && (await n(b2, `select count(*) from public.pedidos where user_id = '${U2}'`)) === 1, `función antigua, 20 llamadas SIMULTÁNEAS: 1 solo pedido (respuestas buenas: ${nums.length}, pedidos distintos: ${new Set(nums).size})`);
    const viaNueva = await crear(b2, u1, clave(500), [A, B]);
    ok(viaNueva.repetido === true && viaNueva.numero === seguidos[0], "función nueva con clave nueva tras la antigua: devuelve ese mismo pedido (no se puede alternar para duplicar)");
    const invitados = [];
    for (let i = 0; i < 3; i++) invitados.push(await crearAntiguo(b2, anon, [E], { ...DATOS, email: "Invitado@Example.com" }));
    ok(new Set(invitados).size === 1, "un visitante sin sesión que repite por la función antigua (mismo correo, aunque cambie mayúsculas) tampoco duplica");
    const otroCorreo = await crearAntiguo(b2, anon, [E], { ...DATOS, email: "otra@example.com" });
    ok(otroCorreo !== invitados[0], "con OTRO correo sí es otra compra (no se bloquea a personas distintas)");
  }

  // ---------------------------------------------------------------- 5) fallos y reintentos
  {
    const k = clave(600);
    const e = await error(crear(b, u1, k, [D]));
    ok(/productos no disponibles/.test(e), "producto no disponible (borrador): falla con el mensaje esperado");
    ok((await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 0, "la operación fallida no deja ningún pedido");
    await como(b, dueno, `update public.products set status = 'PUBLISHED' where id = '${D}'`);
    const r = await crear(b, u1, k, [D]);
    ok(r.repetido === false, "la clave NO se quema: cuando el producto ya está disponible, el reintento con la misma clave funciona");
  }
  {
    // Fallo a mitad de la operación: el pedido se inserta y el artículo falla → todo se deshace.
    await como(b, dueno, `create function public.fallo_simulado() returns trigger language plpgsql as $$ begin if new.titulo = 'Prueba fallo' then raise exception 'fallo simulado'; end if; return new; end $$;
                          create trigger trg_fallo before insert on public.pedido_items for each row execute function public.fallo_simulado()`);
    const k = clave(700);
    const antes = await n(b, "select count(*) from public.pedidos");
    const e = await error(crear(b, u2, k, [F, C]));
    ok(/fallo simulado/.test(e), "fallo simulado al insertar el artículo: la operación falla");
    ok((await n(b, "select count(*) from public.pedidos")) === antes && (await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 0, "y no queda NINGÚN pedido a medias (se deshizo todo)");
    await como(b, dueno, "alter table public.pedido_items disable trigger trg_fallo");
    const r = await crear(b, u2, k, [F, C]);
    ok(r.repetido === false && (await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "arreglado el fallo, el reintento con la MISMA clave crea el pedido una sola vez");
  }
  {
    // Respuesta perdida: el servidor confirmó, el cliente no se enteró y reintenta.
    const k = clave(800);
    await crear(b, u1, k, [B, C]); // «se pierde» la respuesta: no se usa
    const reintento = await crear(b, u1, k, [B, C]);
    ok(reintento.repetido === true && (await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "respuesta perdida y reintento: devuelve el pedido ya creado, no otro");
  }
  {
    // El cliente se cae a mitad de transacción (corte de red): el servidor deshace y el reintento funciona.
    const k = clave(900);
    const hijo = spawn("psql", ["-h", url.hostname, "-p", url.port, "-U", url.username || "postgres", "-d", b, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", "begin", ...argsComo(anon, sqlCrear(k, [E], { ...DATOS, email: "caida@example.com" })), "-c", "select pg_sleep(8)", "-c", "commit"], { stdio: "ignore" });
    await new Promise((f) => setTimeout(f, 1200));
    hijo.kill("SIGKILL"); // corte de red: el cliente desaparece con la transacción abierta
    await new Promise((f) => setTimeout(f, 800));
    ok((await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 0, "cliente que se cae a mitad de transacción: no queda pedido (el servidor lo deshizo)");
    const r = await crear(b, anon, k, [E], { ...DATOS, email: "caida@example.com" });
    ok(r.repetido === false && (await n(b, `select count(*) from public.pedidos where clave_unica = '${k}'`)) === 1, "tras la caída, el reintento con la misma clave crea el pedido una sola vez");
  }
  {
    // Errores de entrada.
    ok(/falta la clave/.test(await error(como(b, u1, `select public.crear_pedido_idempotente(null, '${JSON.stringify(DATOS)}'::jsonb, array['${A}']::uuid[])`))), "sin clave: falla");
    ok(/pedido sin productos/.test(await error(crear(b, u1, clave(1001), []))), "sin productos: falla");
    ok(/entrega no válida/.test(await error(crear(b, u1, clave(1002), [A], { ...DATOS, entrega: "dron" }))), "entrega no válida: falla");
    ok(/pedido sin productos/.test(await error(crear(b, u1, clave(1003), Array.from({ length: 21 }, (_, i) => P(String(i + 10)))))), "más de 20 productos: falla");
    ok(/clave|uuid/i.test(await error(como(b, u1, `select public.crear_pedido_idempotente('no-es-un-uuid', '${JSON.stringify(DATOS)}'::jsonb, array['${A}']::uuid[])`))), "clave con formato inválido: falla");
  }

  // ---------------------------------------------------------------- 6) ventana, estados, migración repetida y vuelta atrás
  {
    const b3 = await nueva(true);
    const r1 = await crear(b3, u1, clave(1100), [A]);
    await como(b3, dueno, "update public.pedidos set created_at = now() - interval '11 minutes'");
    const r2 = await crear(b3, u1, clave(1101), [A]);
    ok(r2.repetido === false && r2.numero !== r1.numero, "pasados 10 minutos, la misma compra con otra clave es un pedido nuevo");
    await como(b3, dueno, "update public.pedidos set estado = 'cancelado'");
    const r3 = await crear(b3, u1, clave(1102), [A]);
    ok(r3.repetido === false, "si el pedido anterior ya no está pendiente (cancelado), se puede volver a pedir lo mismo");
    await db.aplicar(b3, [MIG]);
    ok((await n(b3, "select count(*) from public.pedidos")) === 3, "repetir la migración no cambia ni borra pedidos (idempotente)");
    // Vuelta atrás.
    await db.aplicar(b3, [REV]);
    const eNueva = await error(crear(b3, u1, clave(1103), [A]));
    ok(/permission denied/.test(eNueva), "vuelta atrás: la función nueva queda apagada (permission denied para anon/authenticated)");
    const a1 = await crearAntiguo(b3, u2, [B]);
    const a2 = await crearAntiguo(b3, u2, [B]);
    ok(a1 !== a2, "vuelta atrás: la función antigua vuelve a su comportamiento original (sin idempotencia) y la tienda sigue aceptando pedidos");
    ok((await n(b3, "select count(*) from public.pedidos where clave_unica is null")) >= 2, "vuelta atrás: los pedidos nuevos vuelven a crearse sin clave, como antes");
    await db.aplicar(b3, [MIG]);
    const r4 = await crear(b3, u1, clave(1104), [C]);
    ok(r4.repetido === false, "tras la vuelta atrás se puede volver a aplicar la migración y funciona");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

if (MUTAR) {
  console.log(fallos.length ? `MUTACIÓN DETECTADA: las pruebas fallaron ${fallos.length} veces sin los bloqueos (lo esperado: son sensibles a la concurrencia)` : "MUTACIÓN NO DETECTADA: las pruebas pasan sin los bloqueos; NO sirven contra la concurrencia");
  process.exit(fallos.length ? 0 : 1);
}
for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
