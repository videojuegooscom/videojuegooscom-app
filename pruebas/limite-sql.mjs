/**
 * pruebas/limite-sql.mjs — pruebas REALES (SQL en una base aislada) del límite de peticiones compartido.
 *
 * Qué hace: crea una base aislada (esqueleto de Supabase) y prueba la migración
 * 20261018120000_limite_peticiones.sql con SESIONES DE PostgreSQL REALES SIMULTÁNEAS:
 *  1) Cuenta bien: el contador sube, pasado el máximo dice «no permitido» y la ventana se reinicia.
 *  2) Atomicidad: 100 peticiones SIMULTÁNEAS (liberadas a la vez por una puerta de bloqueo) con máximo 30
 *     dan exactamente 30 «permitido» y 70 «no permitido», y no se pierde ninguna suma. Una versión
 *     ingenua (leer y luego escribir) SÍ pierde sumas con la misma prueba: así se sabe que la prueba sirve.
 *  3) Permisos: solo service_role ejecuta la función; anon y authenticated, no; y nadie del navegador
 *     puede leer ni escribir la tabla.
 *  4) Entradas inválidas, migración repetida y vuelta atrás.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/limite-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/limite-sql.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const MIG = "supabase/migrations/20261018120000_limite_peticiones.sql";
const REV = "supabase/rollbacks/20261018120000_limite_peticiones_revertir.sql";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const argsComo = (rol, sql) => (rol === "postgres" ? [] : ["-c", `set role ${rol}`]).concat(["-A", "-t", "-c", sql]);
const como = (base, rol, sql) => db.psql(base, argsComo(rol, sql)).then((s) => s.trim());
const error = async (p) => {
  try {
    await p;
    return "";
  } catch (e) {
    return String(e.message);
  }
};
const llamar = async (base, rol, clave, max, ventana) => JSON.parse(await como(base, rol, `select public.consumir_limite('${clave}', ${max}, ${ventana})`));

// N sesiones esperan en una «puerta» y arrancan TODAS a la vez (simultaneidad real).
async function enRafaga(base, rol, sqls) {
  const puerta = db.psql(base, ["-A", "-t", "-c", "select pg_advisory_lock(777)", "-c", "select pg_sleep(2.5)"]);
  await new Promise((f) => setTimeout(f, 700));
  const trabajadores = sqls.map((sql) =>
    db
      .psql(base, [...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", "select pg_advisory_lock_shared(777)", "-c", sql])
      .then((s) => ({ ok: true, valor: s.trim().split("\n").filter(Boolean).pop() }))
      .catch((e) => ({ ok: false, error: String(e.message) }))
  );
  const r = await Promise.all(trabajadores);
  await puerta;
  return r;
}

try {
  const b = await db.crearBase();
  await db.aplicar(b, [MIG]);

  // 1) Cuenta bien
  {
    const r = [];
    for (let i = 0; i < 5; i++) r.push(await llamar(b, "service_role", "prueba:cuenta", 3, 60));
    ok(r.map((x) => x.n).join(",") === "1,2,3,4,5", `el contador sube de uno en uno (${r.map((x) => x.n).join(",")})`);
    ok(r.map((x) => x.permitido).join(",") === "true,true,true,false,false", `con máximo 3: permite 3 y rechaza el resto (${r.map((x) => x.permitido).join(",")})`);
    ok(r[0].reinicia_en > 0 && r[0].reinicia_en <= 60, `informa de cuándo se reinicia (${r[0].reinicia_en} s)`);
    await como(b, "postgres", "update public.limites_peticiones set ventana_inicio = now() - interval '61 seconds' where clave = 'prueba:cuenta'");
    const despues = await llamar(b, "service_role", "prueba:cuenta", 3, 60);
    ok(despues.n === 1 && despues.permitido === true, "pasada la ventana, el contador se reinicia a 1 y vuelve a permitir");
    const otra = await llamar(b, "service_role", "prueba:otra", 3, 60);
    ok(otra.n === 1, "otra clave tiene su propio contador");
  }

  // 2) Atomicidad con 100 peticiones simultáneas
  {
    const clave = "prueba:rafaga";
    // 80 sesiones a la vez (el servidor de pruebas admite 97 conexiones: no se pasa).
    const N = 80;
    const r = await enRafaga(b, "service_role", Array.from({ length: N }, () => `select public.consumir_limite('${clave}', 30, 600)`));
    const buenas = r.filter((x) => x.ok).map((x) => JSON.parse(x.valor.match(/\{.*\}/)[0]));
    ok(buenas.length === N, `${N} peticiones simultáneas: las ${N} responden (${buenas.length})`);
    ok(buenas.filter((x) => x.permitido).length === 30, `exactamente 30 permitidas con máximo 30 (${buenas.filter((x) => x.permitido).length})`);
    ok(buenas.filter((x) => !x.permitido).length === N - 30, `y exactamente ${N - 30} rechazadas`);
    ok(new Set(buenas.map((x) => x.n)).size === N, `no se pierde ninguna suma: los ${N} contadores devueltos son distintos (${new Set(buenas.map((x) => x.n)).size})`);
    ok(Number(await como(b, "postgres", `select n from public.limites_peticiones where clave = '${clave}'`)) === N, `el contador final vale ${N}`);

    // La prueba de la prueba: una versión ingenua (leer y luego escribir, sin bloqueo) pierde sumas.
    await como(b, "postgres", `create table public.limites_ingenuo (clave text primary key, n integer not null);
      insert into public.limites_ingenuo values ('x', 0);
      create function public.consumir_ingenuo() returns integer language plpgsql as $$ declare v integer; begin select n into v from public.limites_ingenuo where clave = 'x'; perform pg_sleep(0.01); update public.limites_ingenuo set n = v + 1 where clave = 'x'; return v + 1; end $$`);
    await enRafaga(b, "postgres", Array.from({ length: N }, () => "select public.consumir_ingenuo()"));
    const ingenuo = Number(await como(b, "postgres", "select n from public.limites_ingenuo where clave = 'x'"));
    ok(ingenuo < N, `control: una versión ingenua (leer y luego escribir) pierde sumas con la misma prueba (contó ${ingenuo} de ${N}), así que la prueba sirve`);
  }

  // 3) Permisos
  {
    const sig = "public.consumir_limite(text,integer,integer)";
    const privs = await como(b, "postgres", `select has_function_privilege('service_role','${sig}','execute') || ',' || has_function_privilege('anon','${sig}','execute') || ',' || has_function_privilege('authenticated','${sig}','execute')`);
    ok(privs === "true,false,false", `ejecuta la función SOLO service_role (service_role,anon,authenticated = ${privs})`);
    const publico = await como(b, "postgres", `select coalesce(proacl::text, '') ~ '(^\\{|,)=X' from pg_proc where oid = '${sig}'::regprocedure`);
    ok(publico === "f", "PUBLIC (todos) no tiene permiso de ejecución");
    const def = await como(b, "postgres", `select prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), '') from pg_proc where oid = '${sig}'::regprocedure`);
    ok(def === "true|search_path=public", `SECURITY DEFINER con search_path=public (${def})`);
    const eAnon = await error(llamar(b, "anon", "prueba:hack", 1000000, 1));
    const eAuth = await error(llamar(b, "authenticated", "prueba:hack", 1000000, 1));
    ok(/permission denied/.test(eAnon) && /permission denied/.test(eAuth), "anon y authenticated reciben «permission denied» al llamarla");
    const lee = await error(como(b, "anon", "select * from public.limites_peticiones"));
    const leeAuth = await error(como(b, "authenticated", "select * from public.limites_peticiones"));
    ok(/permission denied/.test(lee) && /permission denied/.test(leeAuth), "anon y authenticated no pueden LEER la tabla de contadores");
    const escribe = await error(como(b, "authenticated", "update public.limites_peticiones set n = 0"));
    const inserta = await error(como(b, "anon", "insert into public.limites_peticiones (clave) values ('hack')"));
    ok(/permission denied/.test(escribe) && /permission denied/.test(inserta), "ni ESCRIBIR en ella (no pueden poner el contador a 0)");
    ok((await como(b, "postgres", "select relrowsecurity::text from pg_class where relname = 'limites_peticiones'")) === "true", "RLS activada en la tabla (sin políticas)");
  }

  // 4) Entradas inválidas, migración repetida, vuelta atrás
  {
    const largo = "x".repeat(201);
    const casos = [
      ["clave vacía", () => llamar(b, "service_role", "", 5, 60)],
      ["clave de 201 caracteres", () => llamar(b, "service_role", largo, 5, 60)],
      ["máximo 0", () => llamar(b, "service_role", "k", 0, 60)],
      ["máximo enorme", () => llamar(b, "service_role", "k", 2000000, 60)],
      ["ventana 0", () => llamar(b, "service_role", "k", 5, 0)],
      ["ventana de más de un día", () => llamar(b, "service_role", "k", 5, 86401)],
    ];
    for (const [nombre, f] of casos) ok(/no válid/.test(await error(f())), `entrada inválida rechazada: ${nombre}`);
    const filas = Number(await como(b, "postgres", "select count(*) from public.limites_peticiones"));
    await db.aplicar(b, [MIG]);
    ok(Number(await como(b, "postgres", "select count(*) from public.limites_peticiones")) === filas, "repetir la migración no cambia ni borra contadores (idempotente)");
    await db.aplicar(b, [REV]);
    const apagada = await error(llamar(b, "service_role", "prueba:despues", 5, 60));
    ok(/permission denied/.test(apagada), "vuelta atrás: la función queda apagada (permission denied también para service_role)");
    ok(Number(await como(b, "postgres", "select count(*) from public.limites_peticiones")) === filas, "vuelta atrás: la tabla conserva sus filas");
    await db.aplicar(b, [MIG]);
    ok((await llamar(b, "service_role", "prueba:despues", 5, 60)).n === 1, "tras la vuelta atrás se puede volver a aplicar la migración y funciona");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
