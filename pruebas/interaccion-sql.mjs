/**
 * pruebas/interaccion-sql.mjs — pruebas REALES (SQL en una base aislada) de visitas y «me gusta» protegidos.
 *
 * Qué hace: crea una base aislada con el esqueleto de Supabase, las tres funciones ANTIGUAS tal como están en
 * producción (leídas el 2026-10-18) y la migración 20261018130000_visitas_y_apoyos_protegidos.sql, y prueba con
 * SESIONES REALES SIMULTÁNEAS:
 *  CONTROL) Antes de la migración, cualquiera (anon) infla «me gusta» y visitas llamando a la función 100 veces.
 *  1) Permisos: las funciones antiguas y las nuevas ya no las ejecutan anon ni authenticated; las nuevas sí
 *     service_role; la tabla de apoyos no se lee ni se escribe desde el navegador.
 *  2) «Me gusta» por persona: repetir 50 veces suma 1; quitar resta 1; quitar sin tenerlo no resta; nunca
 *     negativo; el contador previo se respeta.
 *  3) Concurrencia: 60 simultáneas de la misma persona suman 1; 60 personas distintas suman 60; mezcla de dar y
 *     quitar a la vez deja contador y apunte coherentes.
 *  4) Entradas inválidas y producto inexistente; visitas de producto y de servicio.
 *  5) Migración repetida (idempotente) y vuelta atrás (las funciones antiguas vuelven a funcionar).
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/interaccion-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/interaccion-sql.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const MIG = "supabase/migrations/20261018130000_visitas_y_apoyos_protegidos.sql";
const REV = "supabase/rollbacks/20261018130000_visitas_y_apoyos_protegidos_revertir.sql";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};
const argsComo = (rol, sql) => (rol === "postgres" ? [] : ["-c", `set role ${rol}`]).concat(["-A", "-t", "-c", sql]);
const como = (base, rol, sql) => db.psql(base, argsComo(rol, sql)).then((s) => s.trim());
const n = async (base, sql) => Number(await como(base, "postgres", sql));
const error = async (p) => {
  try {
    await p;
    return "";
  } catch (e) {
    return String(e.message);
  }
};

async function enRafaga(base, rol, sqls) {
  const puerta = db.psql(base, ["-A", "-t", "-c", "select pg_advisory_lock(777)", "-c", "select pg_sleep(2.5)"]);
  await new Promise((f) => setTimeout(f, 700));
  const r = await Promise.all(
    sqls.map((sql) =>
      db
        .psql(base, [...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", "select pg_advisory_lock_shared(777)", "-c", sql])
        .then((s) => ({ ok: true, valor: s.trim().split("\n").filter(Boolean).pop() }))
        .catch((e) => ({ ok: false, error: String(e.message) }))
    )
  );
  await puerta;
  return r;
}

// Las tres funciones antiguas, con el cuerpo que tienen en producción.
const ANTIGUAS = `
  create table public.services (id uuid primary key default gen_random_uuid(), title text not null default 's', view_count integer not null default 0);
  create or replace function public.adjust_product_like(product_id uuid, delta integer) returns integer language plpgsql security definer set search_path = public as $$
  declare new_count int; begin
    if delta not in (1, -1) then raise exception 'delta must be 1 or -1'; end if;
    update public.products set like_count = greatest(0, like_count + delta) where id = product_id returning like_count into new_count;
    return new_count; end; $$;
  create or replace function public.increment_product_view(product_id uuid) returns integer language plpgsql security definer set search_path = public as $$
  declare new_count int; begin
    update public.products set view_count = view_count + 1 where id = product_id returning view_count into new_count; return new_count; end; $$;
  create or replace function public.increment_service_view(service_id uuid) returns integer language plpgsql security definer set search_path = public as $$
  declare new_count int; begin
    update public.services set view_count = view_count + 1 where id = service_id returning view_count into new_count; return new_count; end; $$;
`;
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const S1 = "00000000-0000-4000-8000-0000000000b1";
const likes = (b, p) => n(b, `select like_count from public.products where id = '${p}'`);
const apoyo = (b, p, persona, activo, rol = "service_role") => como(b, rol, `select public.fijar_apoyo('${p}', '${persona}', ${activo})`).then(Number);
const persona = (i) => `visitante:navegador-numero-${String(i).padStart(4, "0")}`;

async function nueva(conMigracion) {
  const b = await db.crearBase();
  await como(b, "postgres", ANTIGUAS);
  await como(b, "postgres", `insert into public.products (id, title, price_eur, status, like_count) values ('${P1}', 'A', 10, 'PUBLISHED', 5), ('${P2}', 'B', 10, 'PUBLISHED', 0); insert into public.services (id) values ('${S1}')`);
  if (conMigracion) await db.aplicar(b, [MIG]);
  return b;
}

try {
  // CONTROL
  {
    const b = await nueva(false);
    for (let i = 0; i < 100; i++) await como(b, "anon", `select public.adjust_product_like('${P2}', 1)`);
    for (let i = 0; i < 100; i++) await como(b, "anon", `select public.increment_product_view('${P2}')`);
    const vistas = await n(b, `select view_count from public.products where id = '${P2}'`);
    ok((await likes(b, P2)) === 100 && vistas === 100, `CONTROL (SIN la migración): un visitante sin sesión sube un producto a 100 «me gusta» y 100 visitas (${await likes(b, P2)} y ${vistas}) llamando a la función: el problema es real`);
  }

  const b = await nueva(true);

  // 1) Permisos
  {
    const funcs = {
      antiguas: ["public.adjust_product_like(uuid,integer)", "public.increment_product_view(uuid)", "public.increment_service_view(uuid)"],
      nuevas: ["public.fijar_apoyo(uuid,text,boolean)", "public.sumar_vista_producto(uuid)", "public.sumar_vista_servicio(uuid)"],
    };
    for (const [tipo, lista] of Object.entries(funcs)) {
      const r = [];
      for (const f of lista) r.push(await como(b, "postgres", `select has_function_privilege('anon','${f}','execute') || ',' || has_function_privilege('authenticated','${f}','execute') || ',' || has_function_privilege('service_role','${f}','execute')`));
      ok(r.every((x) => x === (tipo === "antiguas" ? "false,false,true" : "false,false,true")), `funciones ${tipo}: anon y authenticated NO pueden ejecutarlas, service_role sí (${r.join(" | ")})`);
    }
    const publico = await como(b, "postgres", `select bool_or(coalesce(proacl::text, '') ~ '(^\\{|,)=X') from pg_proc where proname in ('fijar_apoyo','sumar_vista_producto','sumar_vista_servicio')`);
    ok(publico === "f", "PUBLIC (todos) no puede ejecutar las funciones nuevas");
    const def = await como(b, "postgres", `select string_agg(proname || ':' || prosecdef::text || ':' || coalesce(array_to_string(proconfig, ','), ''), ' | ' order by proname) from pg_proc where proname in ('fijar_apoyo','sumar_vista_producto','sumar_vista_servicio')`);
    ok(def === "fijar_apoyo:true:search_path=public | sumar_vista_producto:true:search_path=public | sumar_vista_servicio:true:search_path=public", `las nuevas son SECURITY DEFINER con search_path=public (${def})`);
    const eAnon = await error(como(b, "anon", `select public.adjust_product_like('${P2}', 1)`));
    const eAuth = await error(como(b, "authenticated", `select public.increment_product_view('${P2}')`));
    ok(/permission denied/.test(eAnon) && /permission denied/.test(eAuth), "desde el navegador, la vía antigua da «permission denied» (anon y authenticated)");
    const antes = await likes(b, P2);
    const eNueva = await error(como(b, "anon", `select public.fijar_apoyo('${P2}', 'visitante:hackhackhack', true)`));
    ok(/permission denied/.test(eNueva) && (await likes(b, P2)) === antes, "y la nueva tampoco: un visitante no puede llamar a fijar_apoyo (el contador no cambia)");
    const lee = await error(como(b, "anon", "select * from public.producto_apoyos"));
    const esc = await error(como(b, "authenticated", `insert into public.producto_apoyos (producto_id, persona) values ('${P1}', 'visitante:hackhackhack')`));
    ok(/permission denied/.test(lee) && /permission denied/.test(esc), "la tabla de apoyos no se lee ni se escribe desde el navegador");
    ok((await como(b, "postgres", "select relrowsecurity::text from pg_class where relname = 'producto_apoyos'")) === "true", "RLS activada en producto_apoyos");
  }

  // 2) «Me gusta» por persona
  {
    const base0 = await likes(b, P1); // 5
    ok((await apoyo(b, P1, persona(1), true)) === base0 + 1, `dar «me gusta» suma 1 sobre el contador previo (${base0} → ${base0 + 1})`);
    let total = 0;
    for (let i = 0; i < 50; i++) total = await apoyo(b, P1, persona(1), true);
    ok(total === base0 + 1, `repetir «me gusta» 50 veces de la misma persona sigue en ${total} (suma 1 una sola vez)`);
    ok((await apoyo(b, P1, persona(1), false)) === base0, "quitarlo resta 1");
    ok((await apoyo(b, P1, persona(1), false)) === base0, "quitarlo otra vez no resta más");
    ok((await apoyo(b, P1, persona(2), false)) === base0, "quitar sin haberlo dado no resta nada");
    ok((await apoyo(b, P2, persona(3), false)) === (await likes(b, P2)) && (await likes(b, P2)) >= 0, "el contador nunca baja de 0");
    ok((await apoyo(b, P1, persona(1), true)) === base0 + 1, "volver a darlo suma 1 (queda 1 apunte por persona y producto)");
    ok((await n(b, `select count(*) from public.producto_apoyos where producto_id = '${P1}' and persona = '${persona(1)}'`)) === 1, "en la tabla solo hay 1 fila de esa persona y producto");
  }

  // 3) Concurrencia
  {
    const base0 = await likes(b, P2);
    const mismas = await enRafaga(b, "service_role", Array.from({ length: 60 }, () => `select public.fijar_apoyo('${P2}', '${persona(500)}', true)`));
    ok(mismas.every((x) => x.ok) && (await likes(b, P2)) === base0 + 1, `60 «me gusta» SIMULTÁNEOS de la misma persona suman exactamente 1 (${base0} → ${await likes(b, P2)})`);
    const distintas = await enRafaga(b, "service_role", Array.from({ length: 60 }, (_, i) => `select public.fijar_apoyo('${P2}', '${persona(1000 + i)}', true)`));
    ok(distintas.every((x) => x.ok) && (await likes(b, P2)) === base0 + 61, `60 personas distintas a la vez suman exactamente 60 (${base0 + 1} → ${await likes(b, P2)})`);
    const mezcla = await enRafaga(b, "service_role", Array.from({ length: 60 }, (_, i) => `select public.fijar_apoyo('${P2}', '${persona(900)}', ${i % 2 === 0})`));
    const activo = (await como(b, "postgres", `select activo::text from public.producto_apoyos where producto_id = '${P2}' and persona = '${persona(900)}'`)) === "true";
    const total = await n(b, `select count(*) from public.producto_apoyos where producto_id = '${P2}' and activo`);
    ok(mezcla.every((x) => x.ok) && (await likes(b, P2)) === base0 + 61 + (activo ? 1 : 0), `dar y quitar a la vez (60 mezcladas): contador y apunte coherentes (estado final ${activo ? "dado" : "quitado"}, contador ${await likes(b, P2)}, apuntes activos ${total + 0})`);
    ok((await likes(b, P2)) === 5 * 0 + (await n(b, `select count(*) from public.producto_apoyos where producto_id = '${P2}' and activo`)) + base0, "el contador es siempre el de antes más los apuntes activos de la tabla (ninguna suma perdida)");
  }

  // 4) Entradas inválidas, inexistente, visitas
  {
    const cortas = await error(como(b, "service_role", `select public.fijar_apoyo('${P1}', 'corta', true)`));
    ok(/apoyo no válido/.test(cortas), "persona demasiado corta: falla");
    const nula = await error(como(b, "service_role", `select public.fijar_apoyo('${P1}', null, true)`));
    ok(/apoyo no válido/.test(nula), "persona nula: falla");
    const inexistente = await error(como(b, "service_role", `select public.fijar_apoyo('00000000-0000-4000-8000-0000000000ff', '${persona(7)}', true)`));
    ok(/producto no encontrado/.test(inexistente), "producto inexistente: «producto no encontrado»");
    const v0 = await n(b, `select view_count from public.products where id = '${P1}'`);
    const v1 = Number(await como(b, "service_role", `select public.sumar_vista_producto('${P1}')`));
    ok(v1 === v0 + 1, `sumar_vista_producto suma 1 (${v0} → ${v1})`);
    const s1 = Number(await como(b, "service_role", `select public.sumar_vista_servicio('${S1}')`));
    ok(s1 === 1, "sumar_vista_servicio suma 1");
    const noExiste = await como(b, "service_role", "select public.sumar_vista_producto('00000000-0000-4000-8000-0000000000fe')");
    ok(noExiste === "", "una visita a un producto inexistente no hace nada ni falla");
  }

  // 5) Migración repetida y vuelta atrás
  {
    const antes = await n(b, "select count(*) from public.producto_apoyos");
    const contador = await likes(b, P1);
    await db.aplicar(b, [MIG]);
    ok((await n(b, "select count(*) from public.producto_apoyos")) === antes && (await likes(b, P1)) === contador, "repetir la migración no cambia ni borra apuntes ni contadores (idempotente)");
    await db.aplicar(b, [REV]);
    const r = Number(await como(b, "anon", `select public.increment_product_view('${P1}')`));
    ok(r > 0, "vuelta atrás: la función antigua vuelve a funcionar para anon (como antes de la migración)");
    ok(/permission denied/.test(await error(como(b, "service_role", `select public.fijar_apoyo('${P1}', '${persona(8)}', true)`))), "vuelta atrás: la función nueva queda apagada");
    ok((await n(b, "select count(*) from public.producto_apoyos")) === antes, "vuelta atrás: los apuntes ya hechos se conservan");
    await db.aplicar(b, [MIG]);
    ok(/permission denied/.test(await error(como(b, "anon", `select public.increment_product_view('${P1}')`))) && (await apoyo(b, P1, persona(9), true)) > 0, "tras la vuelta atrás se puede volver a aplicar la migración y funciona");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
