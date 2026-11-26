-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-26.
--   El dueño, con captura de las sugerencias de Blue IA: «una pastilla como esta de "Ayúdame a elegir", o sea
--   integrada solamente allí».
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), app/(tabs)/blue-ia.tsx; corrige la lección «Blue IA:
--   junto al recuadro solo la pastilla del horario; equipo y nueva conversación, arriba».
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue IA: el horario se pregunta solo desde las sugerencias', 'diseno', 1,
   'Desde el 2026-11-26 (petición del dueño) «¿Cuál es el horario de atención?» es SOLO una sugerencia más de Blue IA, igual que «Ayúdame a elegir», en la fila de sugerencias del principio: no hay pastilla suelta encima del recuadro de escribir ni horario fijo. Junto al recuadro no va nada más. «Nueva» y «Equipo» siguen arriba, junto a ⓘ y el Historial, y el horario completo sale en el aviso de «Hablar con el equipo» fuera de horario. Corrige, en lo de la pastilla, a la lección «Blue IA: junto al recuadro solo la pastilla del horario; equipo y nueva conversación, arriba».',
   'Dejar «¿Cuál es el horario de atención?» como pastilla suelta encima del recuadro de escribir durante la conversación.',
   'Ponerla solo entre las sugerencias del principio, con el mismo formato que «Ayúdame a elegir».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
