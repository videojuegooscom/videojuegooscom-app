-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Privacidad, «Cookies y analítica propia» dice que el consentimiento se puede cambiar o retirar también
--   desde el enlace nuevo «Preferencias de cookies» del pie (dueño, 2026-11-27: «añade un enlace discreto en el pie de
--   página para que los usuarios puedan modificar o retirar su consentimiento en cualquier momento»).
-- Qué hace: cambia una sola frase de esa sección (la misma que el respaldo de app/politicas/[slug].tsx,
--   COOKIES_Y_ANALITICA). El resto del texto sigue igual.
-- Conectado con: public.policy_pages (privacidad), components/PieDePagina.tsx («Preferencias de cookies»),
--   components/AvisoAnaliticaCookies.tsx y lib/analiticaPropia.ts (abrirPreferenciasAnalitica).
-- Tipo:     cambia una frase de una sección (1 fila). No borra nada, no cambia permisos ni crea funciones. Se puede
--           aplicar varias veces (si ya tiene la frase nueva, no hace nada).
-- ============================================================================

update public.policy_pages p
set sections = replace(
      p.sections::text,
      'Puedes cambiar tu decisión cuando quieras en el recuadro «Ayúdanos a mejorar tu experiencia» del final de esta página.',
      'Puedes cambiar o retirar tu decisión cuando quieras en el recuadro «Ayúdanos a mejorar tu experiencia» del final de esta página o desde «Preferencias de cookies», en el apartado «Políticas» del pie de cualquier página.'
    )::jsonb,
    updated_at = now()
where p.slug = 'privacidad'
  and p.sections::text like '%Puedes cambiar tu decisión cuando quieras en el recuadro%'
  and p.sections::text not like '%desde «Preferencias de cookies»%';
