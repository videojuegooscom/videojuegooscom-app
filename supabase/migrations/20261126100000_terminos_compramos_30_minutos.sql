-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Términos y condiciones, «Si nos vendes tu aparato» con las condiciones nuevas (dueño, 2026-11-26).
-- Qué hace: cambia solo el texto de esa sección: tasación en menos de 30 minutos, las 24 horas, los 7 días de la semana;
--   en Zaragoza recogida en su dirección en menos de 1 hora y en los alrededores en menos de 1 hora y media; al recibirlo
--   se comprueba que todo esté como indicó en el formulario. Lo demás (etiqueta en menos de 2 horas, 72 horas, Bizum o
--   efectivo, nuevo precio o devolución sin coste, mayor de edad y contrato) sigue igual. Mismo texto que el de respaldo
--   de app/politicas/[slug].tsx y que las páginas «Compramos» (app/compramos/[tipo].tsx).
-- Conectado con: public.policy_pages (términos), 20261124170000_terminos_compramos.sql.
-- Tipo:     cambia el texto de una sección. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar varias
--           veces (si ya tiene el texto nuevo, no hace nada).
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Si nos vendes tu aparato'
                   then jsonb_set(s.sec, '{body}', to_jsonb('Te lo tasamos en menos de 30 minutos, las 24 horas, los 7 días de la semana, a partir de lo que nos cuentas en el formulario y de tus fotos, sin compromiso. En Zaragoza lo recogemos en tu dirección en menos de 1 hora y en los alrededores en menos de 1 hora y media, o nos lo acercas tú; desde el resto de España te enviamos en menos de 2 horas una etiqueta de envío sin coste y nos llega en 72 horas como máximo. Al recibirlo comprobamos que todo esté como nos indicaste en el formulario: si es así, te pagamos al momento por Bizum o en efectivo (en efectivo, solo en mano). Si no coincide, te proponemos un nuevo precio y, si no lo aceptas, te lo devolvemos sin coste. Para vender tienes que ser mayor de edad y el propietario del aparato, y firmamos un contrato de compraventa.'::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and p.sections::text like '%Si nos vendes tu aparato%'
  and p.sections::text not like '%Te lo tasamos en menos de 30 minutos%';
