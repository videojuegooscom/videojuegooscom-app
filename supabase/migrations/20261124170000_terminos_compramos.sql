-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Términos y condiciones, «Si nos vendes tu aparato» (páginas «Compramos tu…», dueño 2026-11-24).
-- Qué hace: añade a Términos y condiciones, justo después de «Nuestros productos y servicios» (o al final si el dueño
--   la ha quitado), cómo compramos: precio en menos de 1 hora; en Zaragoza y alrededores recogida o entrega en menos de
--   2 horas; desde el resto de España etiqueta sin coste en menos de 2 horas y llegada en 72 horas como máximo; revisión
--   y pago al momento por Bizum o en efectivo; si no coincide, nuevo precio o devolución sin coste; mayor de edad,
--   propietario y contrato de compraventa. Las condiciones las dio el dueño; etiqueta y devolución sin coste, «como lo
--   hacen las tiendas profesionales». Mismo texto que el de respaldo de app/politicas/[slug].tsx.
-- Conectado con: public.policy_pages (términos), app/compramos/[tipo].tsx, app/politicas/[slug].tsx.
-- Tipo:     aditiva: solo añade una sección de texto. No borra nada, no cambia permisos ni crea funciones. Se puede
--           aplicar varias veces (si la sección ya está, no hace nada).
-- ============================================================================

-- 1) Después de «Nuestros productos y servicios».
update public.policy_pages p
set sections = (
      select jsonb_agg(x.sec order by x.ord, x.sub)
      from (
        select s.sec, s.ord, 0 as sub
        from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
        union all
        select jsonb_build_object(
                 'heading', 'Si nos vendes tu aparato',
                 'body', 'Te damos un precio en menos de 1 hora a partir de lo que nos cuentas y de tus fotos, sin compromiso. En Zaragoza y alrededores lo recogemos o nos lo acercas en menos de 2 horas; desde el resto de España te enviamos en menos de 2 horas una etiqueta de envío sin coste y nos llega en 72 horas como máximo. Al recibirlo lo revisamos: si está como nos indicaste, te pagamos al momento por Bizum o en efectivo (en efectivo, solo en mano). Si no coincide, te proponemos un nuevo precio y, si no lo aceptas, te lo devolvemos sin coste. Para vender tienes que ser mayor de edad y el propietario del aparato, y firmamos un contrato de compraventa.'),
               s.ord, 1
        from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
        where s.sec ->> 'heading' = 'Nuestros productos y servicios'
      ) as x
    ),
    updated_at = now()
where p.slug = 'terminos'
  and p.sections::text not like '%Si nos vendes tu aparato%'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Nuestros productos y servicios');

-- 2) Si el dueño quitó esa sección: al final.
update public.policy_pages p
set sections = coalesce(p.sections, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'heading', 'Si nos vendes tu aparato',
      'body', 'Te damos un precio en menos de 1 hora a partir de lo que nos cuentas y de tus fotos, sin compromiso. En Zaragoza y alrededores lo recogemos o nos lo acercas en menos de 2 horas; desde el resto de España te enviamos en menos de 2 horas una etiqueta de envío sin coste y nos llega en 72 horas como máximo. Al recibirlo lo revisamos: si está como nos indicaste, te pagamos al momento por Bizum o en efectivo (en efectivo, solo en mano). Si no coincide, te proponemos un nuevo precio y, si no lo aceptas, te lo devolvemos sin coste. Para vender tienes que ser mayor de edad y el propietario del aparato, y firmamos un contrato de compraventa.')),
    updated_at = now()
where p.slug = 'terminos'
  and coalesce(p.sections::text, '') not like '%Si nos vendes tu aparato%';
