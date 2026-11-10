-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-10 (el dueño: «quiero que Blue IA sepa que no respondemos a llamadas telefónicas para
--            atención al cliente, solo a mensajes por correo electrónico, WhatsApp o mensaje directo desde la app u
--            otra red social de mensajería en la que estemos activos»).
-- Qué hace: apunta la lección «Atención al cliente solo por mensaje, nunca por teléfono».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); la regla vive en
--           las instrucciones de api/blue-ia.ts.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Atención al cliente solo por mensaje, nunca por teléfono', 'negocio', 1,
   'La tienda no atiende a los clientes por llamada telefónica (el teléfono de la tienda tiene un buzón de voz con locución, pero no es un canal de atención). La atención es solo por mensaje: primero el chat de la tienda («Hablar con el equipo» en Blue IA) y, si el cliente lo prefiere, el correo electrónico, WhatsApp o el mensaje directo en las redes activas (social_links con enabled). Ningún texto de la tienda ni Blue IA invita a llamar, da un número para llamar ni promete devolver llamadas; si alguien pregunta por teléfono, se le explica con amabilidad y se le dan esos canales, sin inventar ninguno que no esté activo. Completa la lección «Atención al cliente dentro de la tienda» (el chat de la tienda sigue siendo lo primero).',
   'Blue IA: «Puedes llamarnos al teléfono de la tienda y te atendemos».',
   'Blue IA: «No atendemos por teléfono: escríbenos con "Hablar con el equipo" aquí mismo o, si lo prefieres, por correo, WhatsApp o mensaje directo en Instagram o TikTok».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
