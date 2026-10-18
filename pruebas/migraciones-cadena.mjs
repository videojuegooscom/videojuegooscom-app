/**
 * pruebas/migraciones-cadena.mjs — TODAS las migraciones preparadas, juntas y en orden, sobre una réplica de la
 * base de producción (nunca la real).
 *
 * Qué hace: crea una base aislada con lo que producción tiene ANTES de las migraciones nuevas (esqueleto de
 * Supabase, las 55 lecciones, products, services y las tres funciones antiguas de visitas y «me gusta»,
 * reservas_cesta, pedidos y crear_pedido, analytics_events, policy_pages con las marcas de relleno y las seis
 * funciones del chat con PUBLIC), le saca una «foto» del catálogo (funciones con sus permisos y el
 * hash de su cuerpo, tablas con sus permisos y RLS, políticas, disparadores, restricciones, columnas e índices)
 * y comprueba:
 *  1) Aplicar la cadena entera en orden numérico no da ningún error, y las migraciones no se estorban entre sí.
 *  2) Aplicarla una segunda vez no cambia NADA del catálogo (idempotente).
 *  3) Un recorrido básico después de aplicarlo todo: un pedido idempotente, un «me gusta» por el camino
 *     nuevo, una reserva con cupo, un evento de analítica con tope, el contador de chat sin sesión, el limitador
 *     compartido y el nombre del titular en las políticas.
 *  4) Deshacer TODO en orden inverso devuelve a su estado anterior cada permiso, política, disparador activo y
 *     cuerpo de función que ya existían; lo único que cambia es lo que se queda a propósito sin permisos
 *     (funciones, tablas, columnas, índices y restricciones nuevas, que la vuelta atrás no borra), y esa lista
 *     de lo que se queda está fijada aquí: cualquier otro cambio hace fallar la prueba.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/migraciones-cadena.mjs postgresql://postgres@127.0.0.1:55432
 * Requisitos: todas las migraciones de las PR #52…#89 en la rama (si falta alguna, la batería la omite).
 * Sale con código 1 si algo falla.
 */
import { existsSync } from "node:fs";
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/migraciones-cadena.mjs <servidor local de pruebas>");
  process.exit(2);
}
const M = "supabase/migrations/";
const R = "supabase/rollbacks/";
// En orden numérico. `v` es la vuelta atrás (su nombre no siempre coincide con el de la migración).
const CADENA = [
  { id: "20261017200000", n: "20261017200000_politicas_nombre_titular", v: "20261017200000_politicas_nombre_titular_revertir" },
  { id: "20261018090000", n: "20261018090000_aprendizajes_lecciones_nuevas", v: "20261018090000_aprendizajes_lecciones_nuevas_revertir" },
  { id: "20261018095000", n: "20261018095000_aprendizajes_autorizacion_expresa", v: "20261018095000_aprendizajes_autorizacion_expresa_revertir" },
  { id: "20261018096000", n: "20261018096000_aprendizajes_blue_publico_y_admin", v: "20261018096000_aprendizajes_blue_publico_y_admin_revertir" },
  { id: "20261018097000", n: "20261018097000_aprendizajes_pruebas_y_permisos", v: "20261018097000_aprendizajes_pruebas_y_permisos_revertir" },
  { id: "20261018100000", n: "20261018100000_aprendizajes_reorganizar_en_grupos", v: "20261018100000_aprendizajes_reorganizar_revertir" },
  { id: "20261018110000", n: "20261018110000_pedidos_idempotencia", v: "20261018110000_pedidos_idempotencia_revertir" },
  { id: "20261018120000", n: "20261018120000_limite_peticiones", v: "20261018120000_limite_peticiones_revertir" },
  { id: "20261018130000", n: "20261018130000_visitas_y_apoyos_protegidos", v: "20261018130000_visitas_y_apoyos_protegidos_revertir" },
  { id: "20261018140000", n: "20261018140000_reservas_protegidas", v: "20261018140000_reservas_protegidas_revertir" },
  { id: "20261018150000", n: "20261018150000_analitica_topes", v: "20261018150000_analitica_topes_revertir" },
  { id: "20261018160000", n: "20261018160000_funciones_chat_sin_public", v: "20261018160000_funciones_chat_sin_public_revertir" },
].map((c) => ({ ...c, nArchivo: `${M}${c.n}.sql`, vArchivo: `${R}${c.v}.sql` }));
const faltan = CADENA.flatMap((c) => [c.nArchivo, c.vArchivo]).filter((f) => !existsSync(f));
for (const f of ["supabase/migrations/20261013090000_reservas_cesta.sql", "supabase/migrations/20261013120000_pedidos.sql"]) if (!existsSync(f)) faltan.push(f);
if (faltan.length) {
  console.error(`Faltan archivos (llegan con otras PR): ${faltan.join(", ")}`);
  process.exit(2);
}

const db = conectar(servidor);
const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};
const como = (base, rol, sql, uid = null) =>
  db
    .psql(base, [...(uid ? ["-c", `set request.jwt.claims = '${JSON.stringify({ sub: uid, role: rol })}'`] : []), ...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", sql])
    .then((s) => s.trim());
const error = async (p) => {
  try {
    await p;
    return "";
  } catch (e) {
    return String(e.message);
  }
};

// Permisos ordenados: «{a,b}» y «{b,a}» son lo mismo.
const ORDENAR = (col) => `coalesce((select string_agg(x, ',' order by x) from unnest(${col}::text[]) x), 'sin-permisos-explicitos')`;
const FOTO = `
select 'F ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') acl=' || ${ORDENAR("p.proacl")} || ' secdef=' || p.prosecdef || ' cuerpo=' || md5(p.prosrc)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
union all select 'T ' || c.relname || ' acl=' || ${ORDENAR("c.relacl")} || ' rls=' || c.relrowsecurity
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
union all select 'P ' || tablename || '.' || policyname || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public'
union all select 'G ' || c.relname || '.' || t.tgname || ' ' || t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
union all select 'K ' || t.relname || '.' || k.conname || ' ' || pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class t on t.oid = k.conrelid where t.relnamespace = 'public'::regnamespace
union all select 'C ' || table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable
  from information_schema.columns where table_schema = 'public'
union all select 'I ' || tablename || '.' || indexname
  from pg_indexes where schemaname = 'public'
order by 1
`;
const foto = async (b) => new Set((await como(b, "postgres", FOTO)).split("\n").filter(Boolean));
const diferencia = (a, b) => [...a].filter((x) => !b.has(x)).sort();

// Lo que ya existe en producción antes de las migraciones nuevas (leído el 2026-10-18).
const ANTES = `
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

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(), session_id text not null, user_id uuid references auth.users(id) on delete set null,
  event_name text not null, step_label text not null, path text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index idx_analytics_events_created_at on public.analytics_events (created_at);
alter table public.analytics_events enable row level security;
create policy analytics_events_insert_anyone on public.analytics_events for insert to public with check (true);
create policy analytics_events_select_admin on public.analytics_events for select to public using (is_admin());
create policy analytics_events_admin_delete on public.analytics_events for delete to public using (is_admin());

create table public.policy_pages (slug text primary key, intro text, sections jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());
insert into public.policy_pages (slug, intro, sections) values
  ('privacidad', 'Responsable: [NOMBRE LEGAL / RAZÓN SOCIAL].', '[{"t":"Titular: [NOMBRE LEGAL / RAZÓN SOCIAL]"}]'),
  ('terminos', 'Titular: [NOMBRE LEGAL / RAZÓN SOCIAL].', '[{"t":"Titular: [NOMBRE LEGAL / RAZÓN SOCIAL]"}]');

create function public.delete_chat_for_me(p_chat_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if; end $$;
create function public.get_or_create_product_chat(p_product_id uuid) returns uuid language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if; return gen_random_uuid(); end $$;
create function public.get_or_create_sell_request_chat(p_sell_request_id uuid) returns uuid language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if; return gen_random_uuid(); end $$;
create function public.get_or_create_support_chat() returns uuid language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if; return gen_random_uuid(); end $$;
create function public.get_unread_chat_count() returns integer language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then return 0; end if; return 3; end $$;
create function public.mark_chat_read(p_chat_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null then return; end if; end $$;
`;

const U1 = "11111111-1111-4111-8111-111111111111";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const K = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
const aplicar = (b, lista, deshacer = false) => db.aplicar(b, lista.map((c) => (deshacer ? c.vArchivo : c.nArchivo)));

try {
  console.log("Preparando la réplica de producción (55 lecciones, pedidos, reservas, analítica, políticas, chat)…");
  const b = await db.crearBaseConHistorial();
  await como(b, "postgres", ANTES);
  await db.aplicar(b, ["supabase/migrations/20261013090000_reservas_cesta.sql", "supabase/migrations/20261013120000_pedidos.sql"]);
  await como(b, "postgres", `insert into public.products (id, title, price_eur, status, like_count) values ('${P1}', 'A', 10, 'PUBLISHED', 5), ('${P2}', 'B', 20, 'PUBLISHED', 0); insert into public.services (id) values ('00000000-0000-4000-8000-0000000000b1'); insert into auth.users (id, email) values ('${U1}', 'u1@example.com')`);
  const inicial = await foto(b);
  ok(inicial.size > 40, `réplica lista: ${inicial.size} elementos en la foto del catálogo (funciones, tablas, políticas, disparadores, restricciones, columnas, índices)`);

  // 1) Cadena en orden numérico
  const e1 = await error(aplicar(b, CADENA));
  ok(e1 === "", `las ${CADENA.length} migraciones se aplican en orden numérico sin ningún error${e1 ? `: ${e1.slice(0, 300)}` : ""}`);
  const tras1 = await foto(b);

  // 2) Segunda vez: no cambia nada
  const e2 = await error(aplicar(b, CADENA));
  ok(e2 === "", `aplicar la cadena entera por segunda vez no da ningún error${e2 ? `: ${e2.slice(0, 300)}` : ""}`);
  const tras2 = await foto(b);
  const cambios2 = [...diferencia(tras1, tras2), ...diferencia(tras2, tras1)];
  ok(cambios2.length === 0, `y no cambia NADA del catálogo (${cambios2.length} diferencias${cambios2[0] ? `, p. ej. ${cambios2[0].slice(0, 160)}` : ""})`);

  // 3) Recorrido básico con todo aplicado
  {
    const datos = JSON.stringify({ nombre: "Cliente Prueba", email: "prueba@example.com", telefono: "600123123", entrega: "recogida" });
    const pedido = JSON.parse(await como(b, "anon", `select public.crear_pedido_idempotente('${K(1)}'::uuid, '${datos}'::jsonb, array['${P1}']::uuid[])`));
    const repetido = JSON.parse(await como(b, "anon", `select public.crear_pedido_idempotente('${K(1)}'::uuid, '${datos}'::jsonb, array['${P1}']::uuid[])`));
    ok(pedido.repetido === false && repetido.repetido === true && pedido.numero === repetido.numero, `pedido idempotente por el camino nuevo: la misma clave devuelve el mismo pedido nº ${pedido.numero}`);
    ok(Number(await como(b, "anon", `select public.crear_pedido('${datos}'::jsonb, array['${P2}']::uuid[])`)) > pedido.numero, "y la función antigua crear_pedido (ahora envoltorio) sigue creando pedidos");
    ok(Number(await como(b, "service_role", `select public.fijar_apoyo('${P2}', 'visitante:navegador-numero-0001', true)`)) === 1, "«me gusta» por el camino nuevo (solo servidor): suma 1");
    ok(/permission denied/.test(await error(como(b, "anon", `select public.adjust_product_like('${P2}', 1)`))), "y por el camino antiguo ya no puede un visitante (permission denied)");
    ok((await como(b, "service_role", `select public.reservar_producto_limitado('${P1}', '${K(2)}', 'ip:1', 4)`)) !== "", "reserva con cupo (solo servidor): concede 15 minutos");
    ok(/permission denied/.test(await error(como(b, "anon", `select public.reservar_producto('${P1}', '${K(3)}')`))), "y reservar_producto ya no la puede ejecutar un visitante");
    ok((await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'page_view', 'Inicio')`))) === "", "un evento de analítica normal entra");
    ok(/analytics_events_step_label_largo/.test(await error(como(b, "anon", `insert into public.analytics_events (session_id, event_name, step_label) values ('s', 'e', repeat('x', 301))`))), "y uno desmesurado no");
    ok((await como(b, "anon", "select public.get_unread_chat_count()")) === "0", "el contador de chat sin sesión sigue devolviendo 0");
    ok(/"permitido": ?true/.test(await como(b, "service_role", "select public.consumir_limite('cadena:prueba', 5, 60)")), "el limitador compartido funciona para el servidor");
    ok((await como(b, "postgres", "select count(*) from public.policy_pages where sections::text like '%Daniel Gutiérrez%' and intro like '%Daniel Gutiérrez%'")) === "2", "las políticas llevan ya el nombre del titular");
    ok((await como(b, "postgres", "select count(*) from public.aprendizajes where activa")) === "23", "el Centro de Aprendizajes queda con 23 lecciones activas (16 grupos, 3 sueltas y 4 nuevas sin agrupar)");
  }

  // 4) Deshacer todo en orden inverso
  const inverso = [...CADENA].reverse();
  const e3 = await error(aplicar(b, inverso, true));
  ok(e3 === "", `deshacer TODO en orden inverso no da ningún error${e3 ? `: ${e3.slice(0, 300)}` : ""}`);
  const final = await foto(b);
  const cambiadas = diferencia(inicial, final); // lo que estaba antes y ya no está igual
  const nuevas = diferencia(final, inicial); // lo que hay ahora y antes no estaba igual
  // Lo que cambia respecto al inicio son SOLO objetos nuevos que se quedan (sin permisos de navegador) y la
  // «foto» de lo que existía antes debe ser idéntica. Se compara por prefijos de elemento nuevo.
  const SE_QUEDAN = [
    /^F (consumir_limite|crear_pedido_idempotente|fijar_apoyo|sumar_vista_producto|sumar_vista_servicio|reservar_producto_limitado|analytics_events_tope)\(/,
    /^T (limites_peticiones|producto_apoyos) /,
    /^C (limites_peticiones|producto_apoyos)\./,
    /^C pedidos\.(clave_unica|clave_huella) /,
    /^C reservas_cesta\.persona /,
    /^I (limites_peticiones|producto_apoyos|pedidos|reservas_cesta)/,
    /^K (analytics_events\.analytics_events_\w+_largo|limites_peticiones\.|producto_apoyos\.|pedidos\.)/,
    /^G analytics_events\.analytics_events_tope D$/,
    /^P (limites_peticiones|producto_apoyos)\./,
  ];
  const inesperadas = nuevas.filter((x) => !SE_QUEDAN.some((re) => re.test(x)));
  ok(cambiadas.length === 0, `tras deshacerlo todo, NADA de lo que ya existía queda distinto: permisos, políticas, cuerpos de función, disparadores y restricciones previas (${cambiadas.length} diferencias${cambiadas[0] ? `, p. ej. ${cambiadas[0].slice(0, 200)}` : ""})`);
  ok(inesperadas.length === 0, `y lo único añadido que se queda son los objetos nuevos previstos, sin permisos de navegador (${nuevas.length} elementos; inesperados: ${inesperadas.length}${inesperadas[0] ? `, p. ej. ${inesperadas[0].slice(0, 200)}` : ""})`);
  const nuevasFunciones = nuevas.filter((x) => x.startsWith("F "));
  const conNavegador = nuevasFunciones.filter((x) => /(anon|authenticated)=X|(^| )acl=[^ ]*(^|,)=X/.test(x) && !/crear_pedido_idempotente/.test(x));
  ok(conNavegador.length === 0, `ninguna función nueva que se queda es ejecutable por el navegador tras la vuelta atrás (${conNavegador.length})`);
  console.log(`INFO objetos que se quedan tras deshacer todo (${nuevas.length}):\n${nuevas.map((x) => "     " + x.slice(0, 150)).join("\n")}`);
  const copiaInversa = await error(aplicar(b, CADENA));
  ok(copiaInversa === "", "y se puede volver a aplicar la cadena entera sobre ese estado sin errores");
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
