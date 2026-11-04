-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la política de privacidad cuenta que la analítica propia mide si la visita llega desde las redes sociales
--            de la tienda (Instagram o TikTok) y si crea una cuenta en esa visita (dueño, 2026-11-04: contador de
--            «registros que vienen de Instagram/TikTok» en Administración → Analítica).
-- Qué hace: añade UNA frase al final del apartado «Cookies y analítica propia» de la política de privacidad. Solo se
--           cuenta a quien acepta la analítica (lib/analytics.ts), como ya dice ese apartado.
-- Tipo:     cambia el texto de una política (no borra nada). Repetirla no cambia nada: no se añade si ya está.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Cookies y analítica propia'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' También contamos, de forma agregada, si llegas a la tienda desde nuestras redes sociales (Instagram o TikTok) y si creas una cuenta en esa visita, para saber qué red nos funciona mejor.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Cookies y analítica propia')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%(Instagram o TikTok)%');
