-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: privacidad (2026-11-14, mejoras 8 y 9): la política dice que la tienda guarda en el propio dispositivo los
--            productos que se comparan y los vistos recientemente.
-- Qué hace: añade una frase al final del apartado «Cookies y analítica propia» de la política de privacidad, una sola vez.
--   Si el apartado no está, no cambia nada.
-- Conectado con: public.policy_pages (slug «privacidad»); components/CategoryProductsShelf.tsx (useComparar, useVistos).
-- Tipo:     actualiza un texto (añade una frase). No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Cookies y analítica propia'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Para que la tienda funcione mejor, tu navegador guarda en tu propio dispositivo los productos que eliges para comparar y los que has visto recientemente; no se envían a nadie y puedes quitarlos desde la propia tienda («Quitar», «Borrar historial») o borrando los datos del sitio.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1 from jsonb_array_elements(p.sections) as s (sec)
    where s.sec ->> 'heading' = 'Cookies y analítica propia'
      and s.sec ->> 'body' not like '%visto recientemente%'
  );
