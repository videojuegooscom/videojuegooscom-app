-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Privacidad, «Cookies y analítica propia» corregida (dueño, 2026-11-27: «sí, cambia la analítica»).
-- Qué hace: cambia solo el texto de esa sección para que diga lo que la tienda hace de verdad (lib/analiticaPropia.ts):
--   no se registra ni se guarda nada de la visita hasta pulsar «Aceptar» (antes decía, por error, que se registraba
--   «mientras no contestes»), y cómo cambiar la decisión cuando se quiera (botones al final de la página). El resto del
--   texto sigue igual. Mismo texto que el respaldo de app/politicas/[slug].tsx (COOKIES_Y_ANALITICA).
-- Conectado con: public.policy_pages (privacidad), app/politicas/[slug].tsx (PreferenciaAnalitica),
--   components/AvisoAnaliticaCookies.tsx y lib/analiticaPropia.ts.
-- Tipo:     cambia el texto de una sección. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar varias
--           veces (si ya tiene el texto nuevo, no hace nada).
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Cookies y analítica propia'
                   then jsonb_set(s.sec, '{body}', to_jsonb($t$Usamos una herramienta de analítica propia, sin servicios de terceros como Google Analytics, para registrar de forma agregada cómo se navega por la tienda: qué secciones y categorías se visitan, qué productos se consultan y hasta dónde se llega en cada visita. Esta información nos ayuda a mejorar el catálogo y la experiencia de compra; nunca se vende ni se comparte con terceros. Al entrar en la tienda te lo preguntamos con un aviso: no registramos ni guardamos nada de tu visita hasta que pulsas «Aceptar» (si aceptas, también se registra lo que hiciste en esa misma visita antes de aceptar). Si pulsas «Rechazar» o no contestas, no se registra nada. Puedes cambiar tu decisión cuando quieras con los botones «Aceptar la analítica» y «Rechazar la analítica» del final de esta página. Si tienes una cuenta y la sesión iniciada, tu recorrido queda asociado a tu perfil solo para este análisis interno. También contamos, de forma agregada, si llegas a la tienda desde nuestras redes sociales (Instagram o TikTok) y si creas una cuenta en esa visita, para saber qué red nos funciona mejor. Para que la tienda funcione mejor, tu navegador guarda en tu propio dispositivo tu decisión sobre la analítica, los productos que eliges para comparar y los que has visto recientemente; no se envían a nadie y puedes quitarlos desde la propia tienda («Quitar», «Borrar historial») o borrando los datos del sitio.$t$::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and p.sections::text like '%Cookies y analítica propia%'
  and p.sections::text not like '%hasta que pulsas «Aceptar»%';
