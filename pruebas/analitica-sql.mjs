/**
 * pruebas/analitica-sql.mjs — pruebas REALES (SQL en una base aislada) de los topes a la analítica pública.
 *
 * Qué hace: crea una base aislada con analytics_events tal como está en producción (columnas, índice, RLS y
 * políticas leídas el 2026-10-18: cualquiera puede insertar, solo el admin lee y borra) y prueba
 * 20261018150000_analitica_topes.sql con sesiones de PostgreSQL reales como anon, authenticated y admin:
 *  1) CONTROL (sin la migración): un visitante anónimo inserta una fila de 1 MB y 5.000 filas de golpe.
 *  2) Longitudes: cada columna rechaza lo que pasa de su máximo; las filas reales (máximos de producción) pasan;
 *     una fila ANTIGUA más larga que el límite no impide aplicar la migración ni se toca.
 *  3) Cantidad: a las 120 filas del último minuto la siguiente se rechaza, aunque el visitante NO pueda leer la
 *     tabla (el disparador cuenta con permisos del dueño); un lote que se pasa falla entero; pasado el minuto
 *     vuelve a dejar; a las 20.000 filas de las últimas 24 h, igual.
 *  4) Permisos: nadie llama a la función del disparador; el admin sigue leyendo y borrando; anon sigue sin leer.
 *  5) Migración repetida (idempotente), vuelta atrás (desactiva el disparador, no borra nada) y volver a aplicar
 *     (lo reactiva).
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/analitica-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/analitica-sql.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const MIG = "supabase/migrations/20261018150000_analitica_topes.sql";
const REV = "supabase/rollbacks/20261018150000_analitica_topes_revertir.sql";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const como = (base, rol, sql, uid = null) =>
  db
    .psql(base, [...(uid ? ["-c", `set request.jwt.claims = '${JSON.stringify({ sub: uid, role: rol })}'`] : []), ...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", sql])
    .then((s) => s.trim());
const error = async (promesa) => {
  try {
    await promesa;
    return "";
  } catch (e) {
    return String(e.message);
  }
};
const n = async (base, sql) => Number(await como(base, "postgres", sql));
const total = (base) => n(base, "select count(*) from public.analytics_events");
const filas = (cuantas) =>
  `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) select 's' || i, 'page_view', 'Inicio', '/', '{"category":"Playstation 5"}'::jsonb from generate_series(1, ${cuantas}) i`;

// analytics_events como en producción.
const TABLA = `
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  step_label text not null,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_analytics_events_created_at on public.analytics_events (created_at);
alter table public.analytics_events enable row level security;
create policy analytics_events_insert_anyone on public.analytics_events for insert to public with check (true);
create policy analytics_events_select_admin on public.analytics_events for select to public using (is_admin());
create policy analytics_events_admin_delete on public.analytics_events for delete to public using (is_admin());
`;

async function nueva({ migracion = true } = {}) {
  const b = await db.crearBase();
  await db.psql(b, ["-c", TABLA]);
  await como(b, "postgres", `insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'); insert into public.profiles (id, role) values ('${ADMIN}', 'admin')`);
  if (migracion) await db.aplicar(b, [MIG]);
  return b;
}
// Pone todas las filas «hace tanto» (para simular que pasa el tiempo; el disparador solo mira al insertar).
const envejecer = (b, intervalo) => como(b, "postgres", `update public.analytics_events set created_at = now() - interval '${intervalo}'`);
// Siembra filas sin que actúe el disparador (sembrar 20.000 una a una con el tope puesto sería muy lento).
const sembrar = async (b, cuantas, hace) => {
  await como(b, "postgres", "alter table public.analytics_events disable trigger analytics_events_tope");
  await como(b, "postgres", `insert into public.analytics_events (session_id, event_name, step_label, created_at) select 's' || i, 'e', 'l', now() - (random() * interval '${hace}') from generate_series(1, ${cuantas}) i`);
  await como(b, "postgres", "alter table public.analytics_events enable trigger analytics_events_tope");
};

try {
  // 1) CONTROL: sin la migración
  {
    const b = await nueva({ migracion: false });
    await como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, metadata) values ('x', 'y', repeat('A', 1000000), '{}')`);
    const grande = await n(b, "select max(length(step_label)) from public.analytics_events");
    await como(b, "anon", filas(5000));
    ok(grande === 1000000 && (await total(b)) === 5001, `CONTROL (SIN la migración): un visitante sin sesión inserta una fila de 1 MB y 5.000 filas de golpe (${await total(b)} filas): el problema es real`);
  }

  // 2) Longitudes
  {
    const b = await nueva({ migracion: false });
    await como(b, "postgres", `insert into public.analytics_events (session_id, event_name, step_label) values ('antigua', 'antigua', repeat('A', 500))`);
    await db.aplicar(b, [MIG]);
    ok((await n(b, "select count(*) from public.analytics_events where length(step_label) = 500")) === 1, "una fila ANTIGUA más larga que el límite no impide aplicar la migración y no se toca");
    const casos = [
      ["session_id", `insert into public.analytics_events (session_id, event_name, step_label) values (repeat('s', 101), 'e', 'l')`, /analytics_events_session_id_largo/],
      ["event_name", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', repeat('e', 61), 'l')`, /analytics_events_event_name_largo/],
      ["step_label", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'e', repeat('l', 301))`, /analytics_events_step_label_largo/],
      ["path", `insert into public.analytics_events (session_id, event_name, step_label, path) values ('s', 'e', 'l', repeat('/', 301))`, /analytics_events_path_largo/],
      ["metadata", `insert into public.analytics_events (session_id, event_name, step_label, metadata) values ('s', 'e', 'l', jsonb_build_object('k', repeat('m', 4001)))`, /analytics_events_metadata_largo/],
    ];
    for (const [columna, sql, esperado] of casos) {
      const e = await error(como(b, "anon", sql));
      ok(esperado.test(e), `${columna}: un valor por encima del máximo se rechaza (${(e.match(/analytics_events_\w+_largo/) ?? ["sin restricción"])[0]})`);
    }
    const real = await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) values ('3f6c8b9e-1c3d-4e0a-9d0e-1a2b3c4d5e6f', 'page_view', 'Producto Playstation 5 + Mando DualSense edición especial', '/producto/f35b7cdf-822e-4856-9c46-0739ffc1b7d7', '{"category":"Playstation 5","items":1}')`));
    ok(real === "", "una fila como las reales (sesión de 36, etiqueta de 77, ruta de 46, metadatos de 88) pasa");
    const justo = await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) values (repeat('s', 100), repeat('e', 60), repeat('l', 300), repeat('/', 300), jsonb_build_object('k', repeat('m', 3900)))`));
    ok(justo === "", "y una fila justo en el límite de todas las columnas también");
    const nulos = await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'e', 'l')`));
    ok(nulos === "", "path puede seguir siendo nulo y metadata el valor por defecto");
  }

  // 3) Cantidad
  {
    const b = await nueva();
    ok((await error(como(b, "anon", "select count(*) from public.analytics_events"))) === "" && (await como(b, "anon", "select count(*) from public.analytics_events")) === "0", "anon NO puede leer la tabla (RLS): el disparador tiene que contar con permisos del dueño");
    await como(b, "anon", filas(100));
    const veinte = await error(como(b, "anon", filas(20)));
    ok(veinte === "" && (await total(b)) === 120, "100 + 20 filas: la fila 120 del último minuto todavía entra");
    const una = await error(como(b, "anon", filas(1)));
    ok(/demasiados eventos por minuto/.test(una) && (await total(b)) === 120, `la 121.ª fila del mismo minuto se rechaza aunque quien inserta no pueda leer la tabla (${(una.match(/analitica: [^\n]+/) ?? [""])[0]})`);
    const lote = await error(como(b, "anon", filas(500)));
    ok(/demasiados eventos/.test(lote) && (await total(b)) === 120, "un lote de 500 filas de golpe falla entero y no deja ninguna");
    await envejecer(b, "2 minutes");
    ok((await error(como(b, "anon", filas(5)))) === "" && (await total(b)) === 125, "pasado el minuto vuelve a dejar insertar");
    ok((await error(como(b, "authenticated", filas(5), "11111111-1111-4111-8111-111111111111"))) === "", "un usuario con sesión también cuenta en el mismo tope (y entra mientras no se pase)");
  }
  {
    const b = await nueva();
    await como(b, "anon", filas(115));
    const mitad = await error(como(b, "anon", filas(10)));
    ok(/demasiados eventos/.test(mitad) && (await total(b)) === 115, `un lote de 10 que cruza el tope (115 + 10 > 120) falla entero: sigue habiendo 115 (${await total(b)})`);
  }
  {
    const b = await nueva();
    await sembrar(b, 19999, "23 hours");
    ok((await total(b)) === 19999, "sembradas 19.999 filas de las últimas 23 horas");
    ok((await error(como(b, "anon", filas(1)))) === "", "la fila 20.000 de las últimas 24 horas todavía entra");
    const dia = await error(como(b, "anon", filas(1)));
    ok(/demasiados eventos por día/.test(dia) && (await total(b)) === 20000, `la 20.001.ª se rechaza (${(dia.match(/analitica: [^\n]+/) ?? [""])[0]})`);
    await envejecer(b, "25 hours");
    ok((await error(como(b, "anon", filas(1)))) === "" && (await total(b)) === 20001, "cuando las filas tienen más de 24 horas vuelve a dejar insertar");
  }

  // 4) Permisos
  {
    const b = await nueva();
    for (const rol of ["anon", "authenticated"]) {
      const e = await error(como(b, rol, "select public.analytics_events_tope()"));
      ok(/permission denied|trigger/.test(e), `${rol}: no puede llamar a la función del disparador (${(e.match(/permission denied[^\n]*|[^\n]*trigger[^\n]*/) ?? [""])[0].slice(0, 90)})`);
    }
    await como(b, "anon", filas(10));
    ok((await como(b, "authenticated", "select count(*) from public.analytics_events", ADMIN)) === "10", "el admin sigue leyendo la tabla (RLS)");
    await como(b, "authenticated", "delete from public.analytics_events where session_id = 's1'", ADMIN);
    ok((await total(b)) === 9, "el admin sigue pudiendo borrar filas");
    ok((await como(b, "authenticated", "select count(*) from public.analytics_events", "11111111-1111-4111-8111-111111111111")) === "0", "un usuario normal no ve nada");
    const def = await como(b, "postgres", "select prosecdef::text || ' ' || coalesce(proconfig::text, '') from pg_proc where proname = 'analytics_events_tope'");
    ok(/^true/.test(def) && /search_path=public, pg_temp/.test(def), `la función es SECURITY DEFINER con search_path fijo (${def})`);
  }

  // 5) Idempotencia y vuelta atrás
  {
    const b = await nueva();
    await como(b, "anon", filas(3));
    await db.aplicar(b, [MIG]);
    ok((await n(b, "select count(*) from pg_constraint where conrelid = 'public.analytics_events'::regclass and conname like 'analytics_events_%_largo'")) === 5 && (await n(b, "select count(*) from pg_trigger where tgrelid = 'public.analytics_events'::regclass and tgname = 'analytics_events_tope'")) === 1, "repetir la migración no duplica restricciones ni el disparador (5 y 1)");
    ok((await total(b)) === 3, "ni toca las filas");
    await db.aplicar(b, [REV]);
    ok((await como(b, "postgres", "select tgenabled from pg_trigger where tgname = 'analytics_events_tope'")) === "D", "vuelta atrás: el disparador queda DESACTIVADO (no borrado)");
    ok((await error(como(b, "anon", filas(500)))) === "" && (await total(b)) === 503, "vuelta atrás: sin disparador no hay tope de cantidad (se pueden insertar 500 de golpe)");
    ok(/analytics_events_step_label_largo/.test(await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'e', repeat('l', 301))`))), "y las restricciones de longitud se quedan (no se quitan solas)");
    await db.aplicar(b, [MIG]);
    ok((await como(b, "postgres", "select tgenabled from pg_trigger where tgname = 'analytics_events_tope'")) === "O", "volver a aplicar tras la vuelta atrás REACTIVA el disparador");
    const tope = await error(como(b, "anon", filas(1)));
    ok(/demasiados eventos por minuto/.test(tope), "y el tope vuelve a actuar (hay más de 120 filas recientes)");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
