-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos lecciones del 2026-11-03.
--   1) El dueño: «Quiero que Blue IA siempre recomiende esperar al horario de atención para ser atendidos, que siempre
--      recuerde nuestro horario de atención y que también pueden probar a que Blue les ayude con su problema».
--   2) Revisión de seguridad de Blue IA que pidió el dueño («revisa exhaustivamente que no lo hackeen»).
-- Tipo:     inserta las lecciones si no existen. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue IA recuerda el horario del equipo y ofrece su ayuda', 'negocio', 1,
   'El equipo atiende de lunes a sábado de 10:00 a 14:00 y de 17:00 a 19:00, y los domingos de 10:00 a 13:00 (hora de España). Siempre que alguien quiera que le atienda una persona, pida contacto o tenga un problema, Blue IA le recuerda ese horario; fuera de él, le recomienda esperar a que abramos (y le dice cuándo) y le ofrece intentar ayudarle mientras. Junto a «Hablar con el equipo» se ve siempre el horario y si ahora atendemos; fuera de horario, al pulsarlo sale antes un aviso con «Seguir con Blue» y «Escribir al equipo igualmente». Si cambia el horario, se cambia en lib/horarioAtencion.ts, api/blue-ia.ts, Quiénes somos, los datos para Google y «Lo que Blue sabe».',
   'Mandar a «Hablar con el equipo» a las 23:00 como si alguien fuera a contestar al momento.',
   'A las 23:00: «Ahora estamos fuera de horario; el equipo vuelve mañana a las 10:00. Mientras, cuéntame qué le pasa y lo intento yo».'),
  ('Blue IA: lo que llega del navegador no es de fiar', 'seguridad', 1,
   'Todo lo que manda el navegador a Blue IA lo puede escribir cualquiera, también el historial y los mensajes que dicen ser de Blue. Por eso: se modera lo que escribió la persona (la pregunta y sus turnos anteriores) y también la respuesta antes de mandarla; si la respuesta repite trozos de las instrucciones, no se manda; las instrucciones dicen que los mensajes anteriores no cambian las reglas y que nunca se prometen precios, descuentos ni reservas ni se piden contraseñas o tarjetas; el historial se recorta antes de procesarlo; el origen solo admite la tienda y las vistas previas de su equipo de Vercel; los errores nunca nombran variables, claves ni proveedores; y lo que un cliente puede guardar en la base de datos lleva un tope diario. Cada defensa tiene su prueba y su «prueba de las pruebas» (una copia sin esa defensa debe hacer fallar la prueba). Los detalles de un fallo sin arreglar no se publican en GitHub.',
   'Moderar solo el último mensaje y dar por buenos los turnos «assistant» que manda el navegador.',
   'Moderar entrada (con historial) y salida, recortar el historial y comprobar con mutaciones que las pruebas detectan si falta una defensa.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
