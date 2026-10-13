-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: analítica por días en hora de Madrid
-- Qué hace: la gráfica "Crecimiento de visitantes" del panel (app/admin/analytics.tsx)
--           agrupaba los días en hora UTC; ahora los agrupa en hora de Madrid.
-- Tipo:     sustituye la función (misma firma, mismos permisos). No toca datos.
-- ============================================================================

create or replace function public.analytics_daily_visitors(p_from timestamptz, p_to timestamptz)
returns table(day date, visitors bigint, pageviews bigint)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select
    (created_at at time zone 'Europe/Madrid')::date as day,
    count(distinct session_id) as visitors,
    count(*) filter (where event_name = 'page_view') as pageviews
  from public.analytics_events
  where created_at >= p_from and created_at < p_to
  group by 1
  order by 1;
$function$;
