/**
 * pruebas/analitica-sql.mjs — pruebas REALES (SQL en una base aislada) de los topes AUTOMÁTICOS de la analítica pública.
 *
 * Qué hace: crea una base aislada con analytics_events tal como está en producción (columnas, índices, RLS y políticas:
 * cualquiera puede insertar, solo el admin lee y borra) y prueba 20261018150000_analitica_topes.sql con sesiones de
 * PostgreSQL reales como anon, authenticated y admin:
 *  1) CONTROL (sin la migración): un visitante anónimo inserta una fila de 1 MB y 5.000 filas de golpe.
 *  2) Longitudes: cada columna rechaza lo que pasa de su máximo; las filas reales pasan; una fila ANTIGUA más larga que
 *     el límite no impide aplicar la migración ni se toca.
 *  3) Cantidad, sin errores (lo que pasa del tope no se guarda y se cuenta como «cortado»): 300 por minuto en toda la
 *     tienda como mínimo; un lote que se pasa deja entrar las que caben; 120 por minuto por sesión; pasado el minuto
 *     vuelve a dejar; el tope de cada día.
 *  4) AUTOMÁTICO: con un día de mucho movimiento en el último mes, los topes suben solos (3 × ese día, por minuto
 *     20 veces la media), con un techo de 200.000 al día; y tras un día lleno, al día siguiente el tope ya es mayor.
 *  5) Lo que ya había se cuenta al aplicarla (analitica_ritmo por día).
 *  6) Permisos: nadie llama a las funciones; analitica_ritmo solo la lee el admin y nadie la escribe; el admin sigue
 *     leyendo y borrando la analítica; anon sigue sin leer.
 *  7) Migración repetida (idempotente), vuelta atrás (desactiva el disparador, no borra nada) y volver a aplicar.
 *  8) PRUEBA DE LAS PRUEBAS: con una copia de la migración sin el tope por sesión, la comprobación lo detecta.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/analitica-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const U1 = "11111111-1111-4111-8111-111111111111";
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
const HOY = "(now() at time zone 'Europe/Madrid')::date";
const cortadosHoy = (base) => n(base, `select coalesce((select cortados from public.analitica_ritmo where dia = ${HOY}), 0)`);
const eventosHoy = (base) => n(base, `select coalesce((select eventos from public.analitica_ritmo where dia = ${HOY}), 0)`);
const topes = (base) => como(base, "postgres", "select por_dia || ' ' || por_minuto || ' ' || por_sesion from public.analitica_topes()");
// Filas de sesiones distintas («s1», «s2»…; con `sesion`, todas de la misma).
const filas = (cuantas, sesion = null) =>
  `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) select ${sesion ? `'${sesion}'` : "'s' || i"}, 'page_view', 'Inicio', '/', '{"category":"Playstation 5"}'::jsonb from generate_series(1, ${cuantas}) i`;

// analytics_events como en producción (leída el 2026-11-05).
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
create index idx_analytics_events_session_id on public.analytics_events (session_id, created_at);
alter table public.analytics_events enable row level security;
create policy analytics_events_insert_anyone on public.analytics_events for insert to public with check (true);
create policy analytics_events_select_admin on public.analytics_events for select to public using (is_admin());
create policy analytics_events_admin_delete on public.analytics_events for delete to public using (is_admin());
`;

async function nueva({ migracion = MIG, antes = "" } = {}) {
  const b = await db.crearBase();
  await db.psql(b, ["-c", TABLA]);
  await como(b, "postgres", `insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${U1}', 'u1@example.com'); insert into public.profiles (id, role) values ('${ADMIN}', 'admin')`);
  if (antes) await como(b, "postgres", antes);
  if (migracion) await db.aplicar(b, [migracion]);
  return b;
}
// Pone todas las filas «hace tanto» (para simular que pasa el tiempo; el disparador solo mira al insertar).
const envejecer = (b, intervalo) => como(b, "postgres", `update public.analytics_events set created_at = now() - interval '${intervalo}'`);

try {
  // 1) CONTROL: sin la migración
  {
    const b = await nueva({ migracion: null });
    await como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, metadata) values ('x', 'y', repeat('A', 1000000), '{}')`);
    const grande = await n(b, "select max(length(step_label)) from public.analytics_events");
    await como(b, "anon", filas(5000));
    ok(grande === 1000000 && (await total(b)) === 5001, `CONTROL (SIN la migración): un visitante sin sesión inserta una fila de 1 MB y 5.000 filas de golpe (${await total(b)} filas): el problema es real`);
  }

  // 2) Longitudes
  {
    const b = await nueva({ antes: `insert into public.analytics_events (session_id, event_name, step_label) values ('antigua', 'antigua', repeat('A', 500))` });
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
    const real = await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) values ('3f6c8b9e-1c3d-4e0a-9d0e-1a2b3c4d5e6f', 'bienvenida_lista', 'Bienvenida: tienda lista en más de 3 s y algún texto largo de los nuevos de la tienda, hasta 112 caracteres', '/producto/f35b7cdf-822e-4856-9c46-0739ffc1b7d7', '{"lista_ms":1234,"saltada":false,"desde":"/"}')`));
    ok(real === "", "una fila como las reales de hoy (etiqueta de 112, ruta de 46, metadatos pequeños) pasa");
    const justo = await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label, path, metadata) values (repeat('s', 100), repeat('e', 60), repeat('l', 300), repeat('/', 300), jsonb_build_object('k', repeat('m', 3900)))`));
    ok(justo === "", "y una fila justo en el límite de todas las columnas también");
  }

  // 3) Cantidad: lo que se pasa no se guarda, no da error y se cuenta como «cortado».
  {
    const b = await nueva();
    ok((await topes(b)) === "20000 300 120", `sin historia, los topes de partida: 20.000 al día, 300 por minuto, 120 por sesión (${await topes(b)})`);
    ok((await como(b, "anon", "select count(*) from public.analytics_events")) === "0", "anon NO puede leer la tabla (RLS): el disparador tiene que contar con permisos del dueño");
    await como(b, "anon", filas(200));
    const cien = await error(como(b, "anon", filas(100)));
    ok(cien === "" && (await total(b)) === 300, "200 + 100 filas: la 300 del último minuto todavía entra");
    const una = await error(como(b, "anon", filas(1)));
    ok(una === "" && (await total(b)) === 300 && (await cortadosHoy(b)) === 1, `la 301.ª del mismo minuto NO se guarda y NO da error (la tienda sigue igual): se cuenta como cortada (${await cortadosHoy(b)})`);
    ok((await eventosHoy(b)) === 300, `y analitica_ritmo lleva las guardadas del día (${await eventosHoy(b)})`);
    await envejecer(b, "2 minutes");
    ok((await error(como(b, "anon", filas(5)))) === "" && (await total(b)) === 305, "pasado el minuto vuelve a dejar");
    ok((await error(como(b, "authenticated", filas(5), U1))) === "" && (await total(b)) === 310, "un usuario con sesión también cuenta en el mismo tope (y entra mientras no se pase)");
  }
  {
    const b = await nueva();
    const lote = await error(como(b, "anon", filas(500)));
    ok(lote === "" && (await total(b)) === 300 && (await cortadosHoy(b)) === 200, `un lote de 500 de golpe: entran 300, se cortan 200, sin error (${await total(b)} y ${await cortadosHoy(b)})`);
  }
  {
    const b = await nueva();
    await como(b, "anon", filas(120, "un-programa"));
    await como(b, "anon", filas(5, "un-programa"));
    await como(b, "anon", filas(3, "una-persona"));
    ok((await n(b, "select count(*) from public.analytics_events where session_id = 'un-programa'")) === 120 && (await cortadosHoy(b)) === 5, `una misma sesión no pasa de 120 por minuto (${await n(b, "select count(*) from public.analytics_events where session_id = 'un-programa'")}; cortadas ${await cortadosHoy(b)})`);
    ok((await n(b, "select count(*) from public.analytics_events where session_id = 'una-persona'")) === 3, "y las demás sesiones siguen entrando");
  }
  {
    const b = await nueva();
    await como(b, "postgres", `insert into public.analitica_ritmo (dia, eventos) values (${HOY}, 19999) on conflict (dia) do update set eventos = 19999`);
    ok((await error(como(b, "anon", filas(1)))) === "" && (await total(b)) === 1, "con 19.999 guardadas hoy, la 20.000 todavía entra");
    await como(b, "anon", filas(1));
    ok((await total(b)) === 1 && (await cortadosHoy(b)) === 1, `la 20.001.ª del día no se guarda (${await total(b)}, cortadas ${await cortadosHoy(b)})`);
    // Pasa el día: lo de «hoy» se queda en ayer.
    await como(b, "postgres", `update public.analitica_ritmo set dia = dia - 1 where dia = ${HOY}`);
    ok((await topes(b)) === "60000 834 120", `AUTOMÁTICO: tras un día lleno, al día siguiente el tope ya es 3 × ese día (60.000) y 834 por minuto (${await topes(b)})`);
    ok((await error(como(b, "anon", filas(1)))) === "" && (await total(b)) === 2, "y vuelve a dejar insertar");
  }

  // 4) Automático: los topes siguen a las visitas reales, con techo.
  {
    const b = await nueva({ antes: "" });
    await como(b, "postgres", `insert into public.analitica_ritmo (dia, eventos) values (${HOY} - 3, 50000), (${HOY} - 40, 900000)`);
    ok((await topes(b)) === "150000 2084 120", `con un día de 50.000 en el último mes: 150.000 al día y 2.084 por minuto (el de hace 40 días no cuenta) (${await topes(b)})`);
    await como(b, "anon", filas(400));
    ok((await total(b)) === 400 && (await cortadosHoy(b)) === 0, `entonces 400 en un minuto (más que el mínimo de 300) entran todas (${await total(b)})`);
    await como(b, "postgres", `insert into public.analitica_ritmo (dia, eventos) values (${HOY} - 2, 1000000)`);
    ok((await topes(b)) === "200000 2778 120", `con techo: aunque hubiera un día de 1.000.000, como mucho 200.000 al día (un ataque sostenido no lo hace crecer sin fin) (${await topes(b)})`);
  }

  // 5) Lo que ya había se cuenta al aplicarla.
  {
    const b = await nueva({
      antes: `insert into public.analytics_events (session_id, event_name, step_label, created_at) select 'h' || i, 'e', 'l', now() - interval '3 days' from generate_series(1, 7) i; insert into public.analytics_events (session_id, event_name, step_label, created_at) select 'k' || i, 'e', 'l', now() - interval '10 days' from generate_series(1, 4) i`,
    });
    const dias = await como(b, "postgres", "select string_agg(eventos::text, ',' order by dia desc) from public.analitica_ritmo");
    ok(dias === "7,4", `al aplicarla, analitica_ritmo cuenta lo que ya había por día (${dias})`);
  }

  // 6) Permisos
  {
    const b = await nueva();
    for (const rol of ["anon", "authenticated"]) {
      const e1 = await error(como(b, rol, "select public.analytics_events_tope()"));
      ok(/permission denied|trigger/.test(e1), `${rol}: no puede llamar a la función del disparador`);
      const e2 = await error(como(b, rol, "select * from public.analitica_topes()"));
      ok(/permission denied/.test(e2), `${rol}: no puede llamar a analitica_topes`);
    }
    await como(b, "anon", filas(10));
    ok(/permission denied/.test(await error(como(b, "anon", "select count(*) from public.analitica_ritmo"))), "un visitante no lee analitica_ritmo");
    ok((await como(b, "authenticated", "select count(*) from public.analitica_ritmo", U1)) === "0", "un cliente con sesión no ve nada de analitica_ritmo (RLS)");
    ok((await como(b, "authenticated", "select eventos from public.analitica_ritmo", ADMIN)) === "10", "el administrador sí la lee (Administración → Analítica)");
    ok(/permission denied/.test(await error(como(b, "authenticated", `insert into public.analitica_ritmo (dia, eventos) values (${HOY} - 5, 999999)`, ADMIN))), "nadie la escribe desde la app, ni el administrador (no puede inflar los topes)");
    ok(/permission denied/.test(await error(como(b, "authenticated", "update public.analitica_ritmo set eventos = 999999", ADMIN))), "ni la cambia");
    ok((await como(b, "authenticated", "select count(*) from public.analytics_events", ADMIN)) === "10", "el admin sigue leyendo la analítica (RLS)");
    await como(b, "authenticated", "delete from public.analytics_events where session_id = 's1'", ADMIN);
    ok((await total(b)) === 9, "el admin sigue pudiendo borrar filas");
    ok((await como(b, "authenticated", "select count(*) from public.analytics_events", U1)) === "0", "un usuario normal no ve nada");
    const def = await como(b, "postgres", "select prosecdef::text || ' ' || coalesce(proconfig::text, '') from pg_proc where proname = 'analytics_events_tope'");
    ok(/^true/.test(def) && /search_path=public, pg_temp/.test(def), `la función del disparador es SECURITY DEFINER con search_path fijo (${def})`);
  }

  // 7) Idempotencia y vuelta atrás
  {
    const b = await nueva();
    await como(b, "anon", filas(3));
    await db.aplicar(b, [MIG]);
    ok((await n(b, "select count(*) from pg_constraint where conrelid = 'public.analytics_events'::regclass and conname like 'analytics_events_%_largo'")) === 5 && (await n(b, "select count(*) from pg_trigger where tgrelid = 'public.analytics_events'::regclass and tgname = 'analytics_events_tope'")) === 1 && (await n(b, "select count(*) from pg_policies where tablename = 'analitica_ritmo'")) === 1, "repetir la migración no duplica restricciones, disparador ni política (5, 1 y 1)");
    ok((await total(b)) === 3 && (await eventosHoy(b)) === 3, "ni toca las filas ni la cuenta del día");
    await db.aplicar(b, [REV]);
    ok((await como(b, "postgres", "select tgenabled from pg_trigger where tgname = 'analytics_events_tope'")) === "D", "vuelta atrás: el disparador queda DESACTIVADO (no borrado)");
    ok((await error(como(b, "anon", filas(500)))) === "" && (await total(b)) === 503, "vuelta atrás: sin disparador no hay tope de cantidad (se pueden insertar 500 de golpe)");
    ok(/analytics_events_step_label_largo/.test(await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'e', repeat('l', 301))`))), "y las restricciones de longitud se quedan");
    await db.aplicar(b, [MIG]);
    ok((await como(b, "postgres", "select tgenabled from pg_trigger where tgname = 'analytics_events_tope'")) === "O", "volver a aplicar tras la vuelta atrás REACTIVA el disparador");
    await como(b, "anon", filas(1));
    ok((await total(b)) === 503 && (await cortadosHoy(b)) === 1, "y el tope vuelve a actuar (hay más de 300 filas en el último minuto)");
  }

  // 7b) Encima de la versión de topes FIJOS, la que se pegó en producción el 2026-11-05 (antes de reescribirla): la
  //     nueva la sustituye sin duplicar nada, cuenta lo que ya había y deja de dar errores.
  {
    const ANTIGUA = `
      do $$ begin
        alter table public.analytics_events add constraint analytics_events_session_id_largo check (length(session_id) <= 100) not valid;
        alter table public.analytics_events add constraint analytics_events_event_name_largo check (length(event_name) <= 60) not valid;
        alter table public.analytics_events add constraint analytics_events_step_label_largo check (length(step_label) <= 300) not valid;
        alter table public.analytics_events add constraint analytics_events_path_largo check (path is null or length(path) <= 300) not valid;
        alter table public.analytics_events add constraint analytics_events_metadata_largo check (length(metadata::text) <= 4000) not valid;
      end $$;
      create or replace function public.analytics_events_tope() returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
      begin
        if (select count(*) from public.analytics_events where created_at > now() - interval '1 minute') >= 120 then
          raise exception 'analitica: demasiados eventos por minuto' using errcode = 'P0001';
        end if;
        if (select count(*) from public.analytics_events where created_at > now() - interval '24 hours') >= 20000 then
          raise exception 'analitica: demasiados eventos por día' using errcode = 'P0001';
        end if;
        return new;
      end $f$;
      revoke all on function public.analytics_events_tope() from public, anon, authenticated;
      create trigger analytics_events_tope before insert on public.analytics_events for each row execute function public.analytics_events_tope();`;
    const b = await nueva({ migracion: null, antes: ANTIGUA });
    await como(b, "anon", filas(120));
    ok(/demasiados eventos por minuto/.test(await error(como(b, "anon", filas(1)))), "(antes) con la versión fija, el evento 121 del minuto da error");
    await db.aplicar(b, [MIG]);
    ok((await n(b, "select count(*) from pg_constraint where conrelid = 'public.analytics_events'::regclass and conname like 'analytics_events_%_largo'")) === 5 && (await n(b, "select count(*) from pg_trigger where tgrelid = 'public.analytics_events'::regclass and tgname = 'analytics_events_tope'")) === 1, "encima de la versión fija: sin duplicar restricciones ni el disparador (5 y 1)");
    ok((await eventosHoy(b)) === 120, `cuenta lo que ya había (${await eventosHoy(b)})`);
    ok((await error(como(b, "anon", filas(150)))) === "" && (await total(b)) === 270, `y ya no da errores: entran 150 más (mínimo 300 por minuto) (${await total(b)})`);
    await como(b, "anon", filas(40));
    ok((await total(b)) === 300 && (await cortadosHoy(b)) === 10, `y lo que pasa de 300 se corta sin error y se cuenta (${await total(b)}, cortadas ${await cortadosHoy(b)})`);
    ok((await como(b, "postgres", "select tgenabled from pg_trigger where tgname = 'analytics_events_tope'")) === "O", "el disparador sigue encendido");
  }

  // 8) PRUEBA DE LAS PRUEBAS: sin el tope por sesión, la comprobación lo detecta.
  {
    const original = readFileSync(MIG, "utf8");
    const sinSesion = original.replace(/  if \(select count\(\*\) from public\.analytics_events where session_id = new\.session_id[^\n]*\n    v_cortar := true;\n  -- Toda la tienda, por minuto\.\n  elsif/, "  if");
    ok(sinSesion !== original, "(control) se ha podido quitar el tope por sesión en la copia de prueba");
    const copia = join(tmpdir(), "vz_analitica_sin_tope_sesion.sql");
    writeFileSync(copia, sinSesion);
    const b = await nueva({ migracion: copia });
    await como(b, "anon", filas(125, "un-programa"));
    ok((await n(b, "select count(*) from public.analytics_events where session_id = 'un-programa'")) === 125, "(control) sin el tope por sesión entran 125 de la misma sesión: la prueba SÍ lo detecta");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
