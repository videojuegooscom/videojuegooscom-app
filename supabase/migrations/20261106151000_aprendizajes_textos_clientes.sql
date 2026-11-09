-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-06 («quiero que compruebes que en cada página no aparece nada de textos extraños para
--            los clientes, todo es profesional»). Claude la apunta tras repasar las páginas públicas.
-- Qué hace: apunta la lección de los textos para clientes (sin jerga y todos al día cuando cambia el pago o la entrega).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Textos para clientes: sin jerga ni borradores, y al cambiar cómo se paga o se entrega se cambian TODOS', 'textos', 1,
   'Lo que lee el cliente va en español claro y profesional: nada de palabras técnicas («checkout», «app», «webhook»), marcas sin rellenar («[NÚMERO DE WHATSAPP]»), notas de borrador («Supabase/Stripe u otro que uses») ni frases que ya no son verdad. Cuando cambia cómo se paga (tarjeta, Klarna) o cómo se entrega, se buscan y se cambian a la vez todos los sitios que lo cuentan: preguntas de Inicio, botones y avisos de la compra, «Mis seguimientos», la guía de Blue (Campanita), las políticas en la base de datos (con su migración) y su copia de respaldo en app/politicas/[slug].tsx, y su espejo en Administración. Un método de pago nuevo que pasa datos a otra empresa (Klarna) solo se ofrece cuando la privacidad ya la nombra (primero la privacidad), y la pantalla solo lo promete si el servidor dice que está. Para revisar, se leen las páginas reales publicadas (no solo el código): el texto bueno de las políticas vive en policy_pages.',
   'Activar Klarna en el pago y dejar la guía de Blue diciendo «Sin pago online», el pie con «Checkout» y la política de envíos con «recoger en tienda».',
   'Un solo cambio que activa Klarna tras la privacidad, pasa «Pagado con tarjeta» a «Pagado online» en la tienda y en Administración, y arregla Inicio, el pie, la guía de Blue y las políticas, con sus pruebas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
