-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: políticas al día con las fotos y el vídeo obligatorios de «Vender ahora» y su autorrelleno (dueño,
--            2026-11-16).
-- Qué hace: añade una frase al final de dos apartados (por su título), solo si aún no la tienen:
--   - Términos → «Nuestros productos y servicios»: el formulario «Vender ahora» pide entre 7 y 10 fotos y un vídeo de
--     20 a 30 segundos en el que se vea funcionando, para valorarlo y dar un precio.
--   - Privacidad → «Qué datos tratamos»: se guardan las fotos y el vídeo de la solicitud de venta (solo los ve la tienda
--     y se borran con la solicitud) y, con sesión iniciada, el formulario se rellena con los datos de la cuenta y de
--     Mi perfil, que se pueden cambiar antes de enviarlo.
--   Cada cambio solo se hace si el apartado existe y aún no tiene la frase; repetirla no cambia nada. No toca ningún
--   otro apartado.
-- Conectado con: public.policy_pages (app/politicas/[slug].tsx), components/VenderAhoraModal.tsx y
--           components/SellRequestMedia.tsx (fotos, vídeo y autorrelleno) y app/admin/cotizaciones.tsx.
-- Tipo:     añade texto a dos políticas. No borra nada.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Nuestros productos y servicios'
                      and position('formulario «Vender ahora» pide entre 7 y 10 fotos' in coalesce(s.sec ->> 'body', '')) = 0
                 then jsonb_set(s.sec, '{body}', to_jsonb(
                   trim(coalesce(s.sec ->> 'body', '') || ' Para vendernos un artículo, el formulario «Vender ahora» pide entre 7 y 10 fotos y un vídeo de 20 a 30 segundos en el que se vea funcionando; nos sirven para valorarlo y darte un precio.')))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and exists (
    select 1
    from jsonb_array_elements(p.sections) as e (sec)
    where e.sec ->> 'heading' = 'Nuestros productos y servicios'
      and position('formulario «Vender ahora» pide entre 7 y 10 fotos' in coalesce(e.sec ->> 'body', '')) = 0
  );

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Qué datos tratamos'
                      and position('Si nos envías una solicitud de venta, guardamos las fotos y el vídeo' in coalesce(s.sec ->> 'body', '')) = 0
                 then jsonb_set(s.sec, '{body}', to_jsonb(
                   trim(coalesce(s.sec ->> 'body', '') || ' Si nos envías una solicitud de venta, guardamos las fotos y el vídeo del artículo que adjuntas; solo los ve la tienda, para valorarlo, y se borran con la solicitud. Si tienes la sesión iniciada, el formulario se rellena con los datos de tu cuenta y de Mi perfil para que no tengas que escribirlos; puedes cambiarlos antes de enviarlo.')))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1
    from jsonb_array_elements(p.sections) as e (sec)
    where e.sec ->> 'heading' = 'Qué datos tratamos'
      and position('Si nos envías una solicitud de venta, guardamos las fotos y el vídeo' in coalesce(e.sec ->> 'body', '')) = 0
  );
