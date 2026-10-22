/**
 * pruebas/reservas-sql.mjs — pruebas REALES (SQL en una base aislada) de la migración de reservas protegidas.
 *
 * Qué hace: crea una base aislada (esqueleto de Supabase + la migración real de reservas de la cesta) y prueba
 * 20261018140000_reservas_protegidas.sql con sesiones de PostgreSQL reales:
 *  1) CONTROL (sin la migración): un visitante anónimo reserva TODOS los productos con tokens inventados: el
 *     problema es real (con 21 productos publicados, un script deja la tienda entera «en la cesta de otro»).
 *  2) Permisos: tras la migración anon, authenticated y un rol cualquiera NO pueden ejecutar reservar_producto
 *     ni reservar_producto_limitado; service_role sí; liberar_reserva y productos_reservados siguen como antes.
 *  3) Cupo por persona: no más de N reservas vivas; renovar una existente no gasta cupo; soltar libera cupo;
 *     las personas son independientes; el token de otro cliente no le quita una reserva viva; una reserva
 *     caducada sí se puede coger; el producto inexistente falla; los datos de entrada raros no hacen nada.
 *  4) Simultaneidad REAL: 12 peticiones a la vez de la misma persona con cupo 4 reservan exactamente 4.
 *  5) Migración repetida (idempotente) y vuelta atrás exacta de permisos.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/reservas-sql.mjs postgresql://postgres@127.0.0.1:55432 [--mutacion-sin-bloqueo]
 * Con --mutacion-sin-bloqueo se aplica una copia de la migración sin el bloqueo por persona: las pruebas de
 * simultaneidad DEBEN fallar («prueba de las pruebas»); en ese modo sale con 0 solo si lo detectaron.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/reservas-sql.mjs <servidor local de pruebas> [--mutacion-sin-bloqueo]");
  process.exit(2);
}
const db = conectar(servidor);
const RESERVAS = "supabase/migrations/20261013090000_reservas_cesta.sql";
const MIG_REAL = "supabase/migrations/20261018140000_reservas_protegidas.sql";
const REV = "supabase/rollbacks/20261018140000_reservas_protegidas_revertir.sql";

const MUTAR = process.argv[3] === "--mutacion-sin-bloqueo";
let MIG = MIG_REAL;
if (MUTAR) {
  const original = readFileSync(MIG_REAL, "utf8");
  const mutada = original.replace(/perform pg_advisory_xact_lock\([^;]*\);/g, "-- bloqueo quitado por la mutación");
  if (mutada === original) throw new Error("la mutación no encontró el bloqueo en la migración");
  MIG = join(tmpdir(), "vz_migracion_reservas_sin_bloqueo.sql");
  writeFileSync(MIG, mutada);
  console.log("MODO MUTACIÓN: la migración se aplica SIN el bloqueo por persona; se espera que las pruebas fallen.");
}

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const P = (i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
const T = (i) => `cccccccc-cccc-4ccc-8ccc-${i.toString(16).padStart(12, "0")}`;
const PRODUCTOS = 21;

const como = (base, rol, sql) => db.psql(base, [...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", sql]).then((s) => s.trim());
const error = async (promesa) => {
  try {
    await promesa;
    return "";
  } catch (e) {
    return String(e.message);
  }
};
const n = async (base, sql) => Number(await como(base, "postgres", sql));
const antigua = (base, rol, p, t) => como(base, rol, `select public.reservar_producto('${P(p)}', '${T(t)}')`);
const limitada = (base, rol, p, t, persona, max) => como(base, rol, `select public.reservar_producto_limitado('${P(p)}', '${T(t)}', '${persona}', ${max})`);
const vivas = (base, persona) => n(base, `select count(*) from public.reservas_cesta where persona = '${persona}' and reservado_hasta > now()`);

// Simultaneidad REAL: N sesiones esperan en una «puerta» (un bloqueo que tiene cerrado otra sesión) y arrancan
// todas a la vez cuando se abre. Lanzar procesos uno tras otro no basta: no se solapan.
async function enRafaga(base, rol, sqls) {
  const puerta = db.psql(base, ["-A", "-t", "-c", "select pg_advisory_lock(778)", "-c", "select pg_sleep(2.5)"]);
  await new Promise((f) => setTimeout(f, 700));
  const trabajadores = sqls.map((sql) =>
    db
      .psql(base, ["-c", `set role ${rol}`, "-A", "-t", "-c", "select pg_advisory_lock_shared(778)", "-c", sql])
      .then((s) => ({ ok: true, valor: s.trim().split("\n").filter(Boolean).pop() }))
      .catch((e) => ({ ok: false, error: String(e.message) }))
  );
  const resultados = await Promise.all(trabajadores);
  await puerta;
  return resultados;
}

async function nueva({ migracion = true } = {}) {
  const b = await db.crearBase();
  await como(b, "postgres", `insert into public.products (id, title, price_eur, status) select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'P' || i, 10, 'PUBLISHED' from generate_series(1, ${PRODUCTOS}) i`);
  await db.aplicar(b, [RESERVAS]);
  if (migracion) await db.aplicar(b, [MIG]);
  await como(b, "postgres", "do $$ begin if not exists (select 1 from pg_roles where rolname = 'vz_rol_cualquiera') then create role vz_rol_cualquiera nologin; end if; end $$");
  await como(b, "postgres", "grant usage on schema public to vz_rol_cualquiera");
  return b;
}

try {
  // 1) CONTROL: sin la migración, un anónimo acapara toda la tienda
  {
    const b = await nueva({ migracion: false });
    for (let i = 1; i <= PRODUCTOS; i++) await antigua(b, "anon", i, 1000 + i);
    const retenidas = await n(b, "select count(*) from public.reservas_cesta where reservado_hasta > now()");
    ok(retenidas === PRODUCTOS, `CONTROL (SIN la migración): un visitante sin sesión, con ${PRODUCTOS} tokens inventados, deja los ${PRODUCTOS} productos reservados (${retenidas}): el problema es real`);
    const quitaOtro = await antigua(b, "anon", 1, 5000);
    ok(quitaOtro === "", "CONTROL: y nadie más puede reservar ninguno mientras renueve cada 14 minutos");
  }

  // 2) Permisos
  {
    const b = await nueva();
    const acl = await como(b, "postgres", "select p.proacl::text from pg_proc p where p.proname = 'reservar_producto'");
    ok(!/(^\{|,)=X\//.test(acl) && !/anon=X/.test(acl) && !/authenticated=X/.test(acl) && /service_role=X/.test(acl), `reservar_producto: ni PUBLIC, ni anon ni authenticated; sí service_role (${acl})`);
    for (const rol of ["anon", "authenticated", "vz_rol_cualquiera"]) {
      const e1 = await error(antigua(b, rol, 1, 1));
      const e2 = await error(limitada(b, rol, 1, 1, "ip:1", 4));
      ok(/permission denied/.test(e1) && /permission denied/.test(e2), `${rol}: NO puede ejecutar reservar_producto ni reservar_producto_limitado`);
    }
    ok((await limitada(b, "service_role", 1, 1, "ip:1", 4)) !== "", "service_role sí puede reservar por la función limitada");
    ok((await antigua(b, "service_role", 2, 2)) !== "", "y por la antigua (la usa el servidor si hiciera falta)");
    ok((await error(como(b, "anon", `select public.productos_reservados(array['${P(1)}']::uuid[], '${T(9)}')`))) === "", "productos_reservados sigue disponible para anon (solo lectura)");
    ok((await error(como(b, "anon", `select public.liberar_reserva('${P(1)}', '${T(9)}')`))) === "", "liberar_reserva sigue disponible para anon (con otro token no hace nada)");
    ok((await n(b, `select count(*) from public.reservas_cesta where product_id = '${P(1)}' and reservado_hasta > now()`)) === 1, "y liberar con un token ajeno no soltó la reserva de otro");
    const definer = await como(b, "postgres", "select string_agg(proname || ':' || prosecdef || ':' || coalesce(proconfig::text, ''), ' ' order by proname) from pg_proc where proname = 'reservar_producto_limitado'");
    ok(/true/.test(definer) && /search_path=public/.test(definer), `la función nueva es SECURITY DEFINER con search_path fijo (${definer})`);
  }

  // 3) Cupo por persona
  {
    const b = await nueva();
    const a = "ip:100";
    for (let i = 1; i <= 3; i++) ok((await limitada(b, "service_role", i, 10 + i, a, 3)) !== "", `persona A reserva el producto ${i} (cupo 3)`);
    const cuarta = await error(limitada(b, "service_role", 4, 14, a, 3));
    ok(/demasiadas reservas activas/.test(cuarta), "la 4.ª reserva de la misma persona se rechaza («demasiadas reservas activas»)");
    ok((await vivas(b, a)) === 3, "y la persona sigue con 3 reservas vivas");
    ok((await limitada(b, "service_role", 2, 12, a, 3)) !== "", "renovar una reserva que ya tiene NO gasta cupo (aunque esté al máximo)");
    await como(b, "service_role", `select public.liberar_reserva('${P(1)}', '${T(11)}')`);
    ok((await limitada(b, "service_role", 4, 14, a, 3)) !== "", "soltar una reserva libera cupo: ya puede reservar otra");
    ok((await limitada(b, "service_role", 10, 20, "ip:200", 3)) !== "", "otra persona tiene su propio cupo");
    ok((await limitada(b, "service_role", 2, 99, "ip:200", 3)) === "", "el token de otro cliente NO le quita una reserva viva (devuelve null)");
    ok((await n(b, `select count(*) from public.reservas_cesta where product_id = '${P(2)}' and persona = '${a}'`)) === 1, "y la reserva sigue siendo de su dueño");
    await como(b, "postgres", `update public.reservas_cesta set reservado_hasta = now() - interval '1 minute' where product_id = '${P(2)}'`);
    ok((await limitada(b, "service_role", 2, 99, "ip:200", 3)) !== "", "una reserva CADUCADA sí la puede coger otra persona");
    ok((await n(b, `select count(*) from public.reservas_cesta where product_id = '${P(2)}' and persona = 'ip:200'`)) === 1, "y pasa a ser suya");
    ok((await error(limitada(b, "service_role", 9999, 5, "ip:300", 3))).length > 0, "un producto que no existe falla (clave externa) y no deja ninguna fila");
    ok((await n(b, `select count(*) from public.reservas_cesta where product_id = '${P(9999)}'`)) === 0, "sin filas para el producto inexistente");
    ok((await como(b, "service_role", `select public.reservar_producto_limitado('${P(5)}', '${T(5)}', '', 3)`)) === "", "persona vacía: no hace nada");
    ok((await como(b, "service_role", `select public.reservar_producto_limitado('${P(5)}', '${T(5)}', 'ip:1', 0)`)) === "", "cupo 0: no hace nada");
    ok((await n(b, `select count(*) from public.reservas_cesta where product_id = '${P(5)}'`)) === 0, "y no deja ninguna reserva");
    const retardo = await como(b, "postgres", `select (reservado_hasta between now() + interval '14 minutes' and now() + interval '16 minutes')::text from public.reservas_cesta where product_id = '${P(3)}'`);
    ok(retardo === "true", "las reservas duran 15 minutos");
    ok((await n(b, "select count(*) from public.reservas_cesta where persona ~ '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+'")) === 0, "la columna persona no guarda ninguna IP real (solo cubos)");
  }

  // 4) Simultaneidad real
  {
    const b = await nueva();
    const sqls = Array.from({ length: 12 }, (_, i) => `select public.reservar_producto_limitado('${P(i + 1)}', '${T(i + 1)}', 'ip:777', 4)`);
    const rs = await enRafaga(b, "service_role", sqls);
    const buenas = rs.filter((r) => r.ok).length;
    const reales = await vivas(b, "ip:777");
    ok(buenas === 4 && reales === 4, `12 reservas SIMULTÁNEAS de la misma persona con cupo 4: se reservan exactamente 4 (${buenas} respondidas bien, ${reales} vivas)`);
    ok(rs.filter((r) => !r.ok).every((r) => /demasiadas reservas activas/.test(r.error)), "y las otras 8 reciben «demasiadas reservas activas»");
    const mismoProducto = await nueva();
    const quince = Array.from({ length: 15 }, (_, i) => `select public.reservar_producto_limitado('${P(1)}', '${T(i + 1)}', 'ip:${i}', 4)`);
    const rs2 = await enRafaga(mismoProducto, "service_role", quince);
    const ganadores = rs2.filter((r) => r.ok && r.valor && r.valor !== "").length;
    ok(ganadores === 1 && (await n(mismoProducto, "select count(*) from public.reservas_cesta")) === 1, `15 clientes distintos a la vez por el MISMO producto: solo uno lo consigue (${ganadores})`);
  }

  // 5) Idempotencia y vuelta atrás
  if (!MUTAR) {
    const b = await nueva();
    await limitada(b, "service_role", 1, 1, "ip:1", 4);
    const antes = await como(b, "postgres", "select count(*) || '/' || coalesce(max(persona), '') from public.reservas_cesta");
    await db.aplicar(b, [MIG]);
    ok((await como(b, "postgres", "select count(*) || '/' || coalesce(max(persona), '') from public.reservas_cesta")) === antes, "repetir la migración no cambia ni borra reservas (idempotente)");
    await db.aplicar(b, [REV]);
    ok((await error(antigua(b, "anon", 5, 5))) === "", "vuelta atrás: anon vuelve a poder usar reservar_producto (estado anterior)");
    ok(/permission denied/.test(await error(limitada(b, "service_role", 6, 6, "ip:1", 4))), "vuelta atrás: la función nueva queda sin permisos (no se borra)");
    ok((await n(b, "select count(*) from public.reservas_cesta")) >= 2, "vuelta atrás: no se pierde ninguna reserva");
    const acl = await como(b, "postgres", "select p.proacl::text from pg_proc p where p.proname = 'reservar_producto'");
    ok(!/(^\{|,)=X\//.test(acl), `vuelta atrás: reservar_producto NO recupera el permiso de PUBLIC que nunca tuvo (${acl})`);
    await db.aplicar(b, [MIG]);
    ok(/permission denied/.test(await error(antigua(b, "anon", 7, 7))) && (await limitada(b, "service_role", 7, 7, "ip:1", 4)) !== "", "volver a aplicar tras la vuelta atrás deja el estado protegido");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

if (MUTAR) {
  console.log(fallos.length
    ? `MUTACIÓN DETECTADA: las pruebas fallaron ${fallos.length} veces sin el bloqueo (lo esperado: son sensibles a la concurrencia)`
    : "MUTACIÓN NO DETECTADA: las pruebas pasan sin el bloqueo; NO sirven contra la concurrencia");
  process.exit(fallos.length ? 0 : 1);
}
for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
