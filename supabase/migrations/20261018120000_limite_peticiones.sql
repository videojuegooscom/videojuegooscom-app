-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: límite de peticiones COMPARTIDO entre todas las instancias de las funciones de api/.
-- Problema: los límites que hay hoy viven en la memoria de cada instancia de Vercel (api/blue-ia.ts,
--           api/escaparate-retorno.ts): se reinician con cada instancia nueva y no se comparten, así que un
--           script con varias conexiones o varias IP los esquiva y puede gastar la clave de OpenAI.
-- Solución: una tabla de contadores y UNA función atómica que suma 1 a un contador por clave y ventana de
--           tiempo y dice si se ha pasado del máximo. Las funciones de api/ la llaman con la clave de servidor.
-- Cómo funciona: ventana fija. La primera petición de una clave abre la ventana (p_ventana_segundos); las
--           siguientes suman 1 hasta que acaba; al acabar se reinicia. El insert con «on conflict do update»
--           bloquea la fila, así que dos peticiones simultáneas nunca se pisan.
-- Claves:   las pone el servidor. Para las IP se usa un «cubo» de 4.096 (hash de IP + día), así la tabla nunca
--           pasa de ~4.100 filas y no hace falta borrar nada; la IP real no se guarda.
-- Tipo:     aditiva (una tabla y una función nuevas). No borra ni modifica nada. Lleva security definer y
--           permisos (solo service_role): la revisa y aplica el dueño.
-- Permisos: SOLO service_role puede ejecutar la función; anon y authenticated no. La tabla tiene RLS sin
--           políticas y sin permisos para anon/authenticated: nadie la lee ni la escribe desde el navegador.
-- Vuelta atrás: supabase/rollbacks/20261018120000_limite_peticiones_revertir.sql (quita el permiso a
--           service_role: las funciones de api/ siguen con su límite en memoria, que es el de antes).
-- Pruebas:  pruebas/limite-sql.mjs (SQL real con peticiones simultáneas en una base aislada).
-- ============================================================================

create table if not exists public.limites_peticiones (
  clave text primary key check (char_length(clave) between 1 and 200),
  ventana_inicio timestamptz not null default now(),
  n integer not null default 0
);

alter table public.limites_peticiones enable row level security;
-- Sin políticas: nadie la toca desde el navegador. Se quitan además los permisos por defecto de Supabase.
revoke all on table public.limites_peticiones from anon, authenticated;

-- Suma 1 al contador de p_clave en su ventana actual. Devuelve
-- {"permitido": true|false, "n": cuántas van, "max": p_max, "reinicia_en": segundos hasta que se reinicia}.
create or replace function public.consumir_limite(p_clave text, p_max integer, p_ventana_segundos integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_inicio timestamptz;
begin
  if p_clave is null or char_length(p_clave) not between 1 and 200 then
    raise exception 'clave de límite no válida';
  end if;
  if p_max is null or p_max < 1 or p_max > 1000000 then
    raise exception 'máximo de límite no válido';
  end if;
  if p_ventana_segundos is null or p_ventana_segundos < 1 or p_ventana_segundos > 86400 then
    raise exception 'ventana de límite no válida';
  end if;

  insert into public.limites_peticiones as l (clave, ventana_inicio, n)
  values (p_clave, now(), 1)
  on conflict (clave) do update
    set n = case when l.ventana_inicio + make_interval(secs => p_ventana_segundos) <= now() then 1 else l.n + 1 end,
        ventana_inicio = case when l.ventana_inicio + make_interval(secs => p_ventana_segundos) <= now() then now() else l.ventana_inicio end
  returning l.n, l.ventana_inicio into v_n, v_inicio;

  return jsonb_build_object(
    'permitido', v_n <= p_max,
    'n', v_n,
    'max', p_max,
    'reinicia_en', greatest(0, ceil(extract(epoch from (v_inicio + make_interval(secs => p_ventana_segundos) - now())))::integer)
  );
end;
$$;

revoke all on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;
