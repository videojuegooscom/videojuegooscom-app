-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-11 (el dueño: «cuando un cliente le pregunte cuándo le aparecerá la factura del artículo
--            que acaba de comprar, Blue le diga entre 24 y 48 horas; si no, ponerse en contacto con el soporte. Si el pago
--            ha sido en efectivo, ese plazo. Si ha sido con tarjeta, 24 horas»).
-- Qué hace: apunta la lección «Plazo de la factura: tarjeta 24 h, efectivo 24-48 h».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); la regla vive en
--           las instrucciones de api/blue-ia.ts («PLAZO DE LA FACTURA»).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Plazo de la factura: tarjeta 24 h, efectivo 24-48 h', 'negocio', 1,
   'Cuando un cliente pregunta cuándo tendrá la factura de su compra, la respuesta (Blue IA y cualquier texto de la tienda) es: aparece en Perfil → «Mis pedidos» con «Descargar factura»; si pagó con tarjeta (o el pago online), en un máximo de 24 horas; si pagó en efectivo u otra forma, entre 24 y 48 horas. Pasado ese plazo, «Hablar con el equipo» (el chat de la tienda). Tono profesional y breve; no prometer plazos más cortos ni envío por correo.',
   'Blue IA: «La factura te llega al momento por correo».',
   'Blue IA: «Tu factura aparecerá en Perfil → Mis pedidos, con «Descargar factura»: como pagaste con tarjeta, en un máximo de 24 horas. Si pasado ese plazo no la ves, pulsa «Hablar con el equipo» y lo revisamos».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
