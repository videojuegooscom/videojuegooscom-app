-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Términos y condiciones, «Si nos vendes tu aparato»: guía de embalaje obligatoria de las televisiones
--   (dueño, 2026-11-27: «toda España como el resto, con un paso a paso de embalaje obligatorio y bien explicado para no
--   dañar la TV»).
-- Qué hace: añade al final del texto de esa sección una frase: si nos envías una televisión desde otra ciudad, hay que
--   embalarla siguiendo la guía paso a paso de su página (/compramos/televisores). Lo demás no cambia. Mismo texto que el
--   de respaldo de app/politicas/[slug].tsx.
-- Conectado con: public.policy_pages (términos), 20261126100000_terminos_compramos_30_minutos.sql,
--   app/compramos/[tipo].tsx (la guía).
-- Tipo:     cambia el texto de una sección. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar varias
--           veces (si ya tiene la frase, no hace nada).
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Si nos vendes tu aparato'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si nos envías una televisión desde otra ciudad, tienes que embalarla siguiendo la guía de embalaje paso a paso de la página «Compramos tu televisión», para que llegue sin daños.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and p.sections::text like '%Si nos vendes tu aparato%'
  and p.sections::text not like '%guía de embalaje paso a paso%';
