-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones de las guías rápidas por pantalla y de los avisos de Blue (reservas y «Avísame cuando llegue»).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La ayuda por pantalla vive en el panel de Blue', 'diseno', 1,
   'Blue y su panel NO se ven en Vender, el Foro, Blue IA ni los chats (taparían los campos de escribir). Por eso cualquier ayuda por pantalla (las «Guías rápidas») se elige desde el panel de Blue, en otra pantalla, y la guía lleva a esa pantalla y al terminar vuelve a donde estabas; nunca un botón de ayuda que solo viva dentro de una de esas pantallas. Una guía rápida enseña SOLO los pasos de su pantalla (campo `seccion` de cada paso de la guía), no marca la guía de bienvenida como vista (quien no la ha visto la sigue recibiendo), no pisa una guía abierta y se mide aparte (miniguia_*) para no mezclarse con el embudo de la guía completa. Si no hay nada que enseñar (p. ej. sin artículos), se queda con su paso y NUNCA cae en silencio a la guía completa. Se prueba con pruebas/blue-panel.mjs.',
   'Un botón «Ayuda» dentro del Foro, donde Blue no se ve, o una mini-guía que al fallar la lectura de un artículo se convierte sola en la guía completa.', 'Una fila «Guías rápidas» en el panel de Blue con todas las pantallas, comprobada con el navegador desde otra pantalla.'),
  ('Los avisos de Blue salen con icono, una vez y sin ruido', 'diseno', 2,
   'En «Noticias y avisos» de Blue todo aviso es una fila con icono (círculo azul claro) y, si se toca, lleva a lo que dice; solo suman al número rojo los avisos que piden hacer algo ya (mensajes, novedades, bajadas de precio y una reserva de la cesta a 5 minutos o menos de vencer). Una reserva con tiempo solo informa («Reservado para ti… te quedan N min»). Blue dice lo urgente en un mensaje UNA vez por reserva, nunca en la Cesta ni en el pedido (allí ya se ve la cuenta atrás) y nunca con el aviso de cookies sin contestar. Las comprobaciones periódicas son locales (sin red). El buscador de Inicio, cuando no encuentra nada ni encaja una sección, ofrece «Avísame cuando llegue» (el mismo aviso de Blue y del catálogo). Se prueba con pruebas/blue-panel.mjs y pruebas/buscador-inicio.mjs.',
   'Sumar al número rojo cada reserva desde el primer minuto, o repetir el mensaje de vencimiento en cada pantalla y en la propia Cesta.', 'Informar de las reservas con tiempo, sumar y avisar una vez cuando quedan 5 minutos o menos.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
