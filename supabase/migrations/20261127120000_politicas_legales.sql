-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: revisión de las políticas (dueño, 2026-11-27: «sí, haz las políticas»; garantía de 12 meses en segunda mano).
-- Qué hace:
--   1) Crea «Aviso legal» (/politicas/aviso-legal, lo pide la LSSI: titular, NIF, domicilio y contacto) y «Garantía»
--      (/politicas/garantia: 3 años los nuevos y 12 meses los de segunda mano, qué cubre, cómo pedirla y la garantía de
--      las reparaciones, de 3 meses como mínimo). Solo si aún no existen.
--   2) Devoluciones: añade «Excepciones» y el «Formulario de desistimiento» (modelo que exige la ley), el reembolso con
--      sus plazos y medios de pago (tarjeta, Bizum, Klarna o en mano) y la garantía con sus plazos. Los apartados «Estado
--      del producto a devolver» y «Gastos de la devolución» quedan igual que estaban.
--   3) Privacidad: añade «Transferencias internacionales» (proveedores que pueden tratar datos fuera del EEE).
--   4) Reparación por envío: la garantía de una reparación es, como mínimo, de 3 meses.
--   Los mismos textos son el respaldo de app/politicas/[slug].tsx. Conviene que los revise un gestor o un abogado.
-- Conectado con: public.policy_pages, app/politicas/[slug].tsx, components/PieDePagina.tsx («Políticas»),
--   api/sitemap.ts y components/EtiquetasCabeceraWeb.tsx.
-- Tipo:     solo añade filas y cambia textos. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar
--           varias veces (cada parte comprueba si ya está hecha).
-- ============================================================================

-- 1) Aviso legal y Garantía (si no existen).
insert into public.policy_pages (slug, title, intro, sections, is_active, sort_order)
select 'aviso-legal', 'Aviso legal',
  $t$Quién está detrás de Videojuegoszaragoza.com y las condiciones de uso de la web, según la Ley 34/2002 de servicios de la sociedad de la información y de comercio electrónico.$t$,
  jsonb_build_array(
    jsonb_build_object('heading', 'Titular de la web', 'body', $t$Videojuegoszaragoza.com es una web de Daniel Gutiérrez, con NIF Y4751659B y domicilio en C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza. Somos una tienda online, sin tienda física: vendemos, compramos y reparamos consolas y electrónica.$t$),
    jsonb_build_object('heading', 'Contacto', 'body', $t$Correo: VideojuegosZaragoza.com@gmail.com. WhatsApp: 627 748 741 (solo mensajes; no atendemos llamadas). También puedes escribirnos desde el chat de la tienda o desde Blue IA.$t$),
    jsonb_build_object('heading', 'Condiciones de uso', 'body', $t$Al usar esta web te comprometes a hacerlo de buena fe, sin dañarla ni usarla para fines ilegales. Comprar, vendernos un aparato o contratar un servicio se rige además por los Términos y condiciones y por las políticas de envíos, devoluciones, garantía y privacidad.$t$),
    jsonb_build_object('heading', 'Propiedad intelectual', 'body', $t$Los textos, el diseño, el logotipo, las mascotas y las fotos de nuestros productos son de Videojuegoszaragoza.com o los usamos con permiso: no puedes copiarlos ni reutilizarlos sin nuestra autorización. Las noticias son resúmenes propios de artículos de otros medios, que citamos y enlazamos. Las marcas y los nombres de consolas, juegos y fabricantes pertenecen a sus dueños.$t$),
    jsonb_build_object('heading', 'Enlaces a otras webs', 'body', $t$Algunas páginas enlazan a webs de otros (los medios de las noticias, las redes sociales o la página de pago). No somos responsables de su contenido ni de sus condiciones.$t$),
    jsonb_build_object('heading', 'Responsabilidad', 'body', $t$Cuidamos que la información de la web sea correcta y esté al día, pero puede contener algún error puntual: si ves alguno, avísanos y lo corregimos.$t$),
    jsonb_build_object('heading', 'Ley aplicable', 'body', $t$Este aviso legal se rige por la legislación española.$t$)
  ),
  true, 50
where not exists (select 1 from public.policy_pages where slug = 'aviso-legal');

insert into public.policy_pages (slug, title, intro, sections, is_active, sort_order)
select 'garantia', 'Garantía',
  $t$Todo lo que vendemos tiene garantía. Te explicamos cuánto dura, qué cubre y cómo pedirla.$t$,
  jsonb_build_array(
    jsonb_build_object('heading', 'Cuánto dura', 'body', $t$Productos nuevos: 3 años desde que los recibes, como marca la ley. Productos de segunda mano: 12 meses desde que los recibes (la ley permite pactar para los productos de segunda mano un plazo menor que el de los nuevos, nunca inferior a 1 año). Si la ficha del producto indica una garantía mayor, se aplica esa.$t$),
    jsonb_build_object('heading', 'Qué cubre', 'body', $t$Cualquier fallo o defecto de funcionamiento que el producto ya tuviera al entregártelo, o que no se corresponda con lo que describimos en su ficha. Antes de ponerse a la venta, cada producto pasa una revisión de funcionamiento.$t$),
    jsonb_build_object('heading', 'Qué no cubre', 'body', $t$Los daños por golpes, caídas, líquidos, mal uso, manipulación o reparaciones hechas por otros, ni el desgaste normal por el uso. Tampoco lo que ya se indicaba en la ficha del producto (por ejemplo, una marca estética).$t$),
    jsonb_build_object('heading', 'Cómo pedirla', 'body', $t$Escríbenos desde Perfil → Mis pedidos o por el chat de la tienda, con el número de pedido y lo que le pasa. Te diremos cómo enviárnoslo o entregárnoslo. Si el fallo está cubierto, no te cuesta nada, tampoco el envío.$t$),
    jsonb_build_object('heading', 'Cómo lo solucionamos', 'body', $t$Lo reparamos o lo cambiamos por otro igual. Como muchos artículos son unidades únicas de segunda mano, si no se puede reparar ni hay otro equivalente, te hacemos una rebaja del precio o te devolvemos el dinero, como prevé la ley.$t$),
    jsonb_build_object('heading', 'Garantía de las reparaciones', 'body', $t$Cuando reparamos tu aparato, la reparación tiene una garantía de al menos 3 meses, o la que figure en tu presupuesto o en Mis seguimientos si es mayor.$t$),
    jsonb_build_object('heading', 'Garantía y devolución', 'body', $t$La garantía es distinta del derecho de desistimiento: durante 14 días puedes devolver tu compra aunque funcione bien, como explica la política de devoluciones.$t$)
  ),
  true, 12
where not exists (select 1 from public.policy_pages where slug = 'garantia');

-- 2) Devoluciones (si aún no tiene el formulario). «Estado del producto a devolver» y «Gastos de la devolución» se
--    conservan tal cual estaban (se copian de la propia fila).
update public.policy_pages p
set intro = $t$Queremos que compres con confianza. Además de la garantía que incluye todo lo que vendemos, tienes derecho legal a devolver tu compra si cambias de opinión.$t$,
    sections = jsonb_build_array(
      jsonb_build_object('heading', 'Derecho de desistimiento (14 días)', 'body', $t$Como consumidor, dispones de 14 días naturales desde que recibes el producto para desistir de la compra sin necesidad de justificar el motivo, conforme a la normativa española y europea de protección de consumidores. Para ejercerlo, escríbenos por el chat de la tienda o desde Mis pedidos indicando el pedido a devolver. También puedes usar el formulario de desistimiento que tienes al final de esta página.$t$),
      jsonb_build_object('heading', 'Excepciones', 'body', $t$No se puede desistir de videojuegos, películas o programas que venían precintados si los has desprecintado después de recibirlos, ni de productos hechos a tu medida.$t$)
    )
    || coalesce((select jsonb_agg(s.sec order by s.ord) from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
                 where s.sec ->> 'heading' in ('Estado del producto a devolver', 'Gastos de la devolución')), '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object('heading', 'Reembolso', 'body', $t$Te devolvemos todo lo que pagaste, incluido el envío estándar del pedido, en un plazo máximo de 14 días naturales desde que nos dices que desistes; podemos esperar a recibir el producto, o a que nos demuestres que lo has enviado, antes de devolverte el dinero. Te lo devolvemos por el mismo medio con que pagaste: tarjeta, Bizum o Klarna (a través de Stripe). Si lo pagaste en mano, te lo devolvemos por Bizum o en efectivo, como prefieras.$t$),
      jsonb_build_object('heading', 'Garantía de tienda (distinta de la devolución)', 'body', $t$Todo lo que vendemos tiene garantía: 3 años los productos nuevos y 12 meses los de segunda mano. Qué cubre y cómo pedirla lo tienes en la política de garantía. Es independiente de los 14 días para devolver.$t$),
      jsonb_build_object('heading', 'Formulario de desistimiento', 'body', $t$Si quieres desistir por escrito, copia este texto, rellénalo y envíalo a VideojuegosZaragoza.com@gmail.com (o por el chat de la tienda):

A la atención de Daniel Gutiérrez (Videojuegoszaragoza.com), C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza. VideojuegosZaragoza.com@gmail.com.
Por la presente le comunico que desisto de mi contrato de venta del siguiente bien: …
Número de pedido: …
Pedido el: … / Recibido el: …
Nombre: …
Dirección: …
Firma (solo si lo envías en papel): …
Fecha: …$t$)
    ),
    updated_at = now()
where p.slug = 'devoluciones'
  and p.sections::text not like '%Formulario de desistimiento%';

-- 3) Privacidad: transferencias internacionales (al final, si aún no está).
update public.policy_pages p
set sections = p.sections || jsonb_build_array(
      jsonb_build_object('heading', 'Transferencias internacionales', 'body', $t$Algunos de los proveedores que hacen funcionar la tienda (OpenAI, Vercel, Supabase, Resend y Stripe) pueden tratar datos fuera del Espacio Económico Europeo, por ejemplo en Estados Unidos. En esos casos, la transferencia se ampara en el Marco de Privacidad de Datos UE-EE. UU., si el proveedor está adherido, o en las cláusulas contractuales tipo aprobadas por la Comisión Europea.$t$)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and p.sections::text not like '%Transferencias internacionales%';

-- 4) Reparación por envío: garantía mínima de 3 meses.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Garantía'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Como mínimo, la garantía de una reparación es de 3 meses.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'reparacion-envio'
  and p.sections::text like '%"heading": "Garantía"%'
  and p.sections::text not like '%Como mínimo, la garantía de una reparación%';
