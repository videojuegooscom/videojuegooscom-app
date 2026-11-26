-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-26.
--   El dueño, con captura: el horario, «Nueva conversación» y «Hablar con el equipo» junto al recuadro de escribir de
--   Blue IA quedaban feos al subir por el chat. Primero pidió un desplegable y luego: «mejor quiero quitarlo por completo
--   y que sea una pastilla de sugerencias "Cuál es el horario de atención"»; eligió llevar los dos botones arriba.
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), app/(tabs)/blue-ia.tsx; completa las lecciones «Blue IA
--   recuerda el horario del equipo y ofrece su ayuda» y «Saludos y animaciones de entrada…».
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue IA: junto al recuadro solo la pastilla del horario; equipo y nueva conversación, arriba', 'diseno', 1,
   'Desde el 2026-11-26 (petición del dueño) junto al recuadro de escribir de Blue IA ya no va el horario fijo ni los botones: hay una pastilla «¿Cuál es el horario de atención?» (también entre las sugerencias del principio) que se lo pregunta a Blue IA. «Hablar con el equipo» y «Nueva conversación» (esta solo con una conversación empezada) van arriba, en la fila de ⓘ y el Historial, como icono con su nombre corto («Equipo», «Nueva») y 44 px o más. El horario completo sale en el aviso de «Hablar con el equipo» fuera de horario. Sustituye, en lo que dicen de la colocación, a «Junto a «Hablar con el equipo» se ve siempre el horario» y a «Nueva conversación… junto a los botones de abajo».',
   'Poner el horario y los botones de equipo y nueva conversación en el panel de abajo, encima del recuadro de escribir.',
   'Abajo, la pastilla del horario y el recuadro; arriba, ⓘ, Historial, Nueva y Equipo; fuera de horario, el aviso con el horario completo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
