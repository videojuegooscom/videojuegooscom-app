-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) sobre cuándo habla Blue y dónde se queda cuando la persona lo mueve.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue habla a los 15 s y cada 15 s, y se queda donde lo deja la persona', 'diseno', 1,
   'Los mensajes que Blue dice por su cuenta pasan por una cola (decir, components/Campanita.tsx): el primero, como pronto a los 15 s de entrar en la pantalla, para que se pueda leer lo que hay, y entre uno y el siguiente al menos 15 s; al cambiar de pantalla la cola se vacía. Si la persona mueve a Blue, se queda FIJO donde lo dejó (ya no se aparta solo) hasta que cierra la sesión del navegador (sessionStorage), pero siguen las reglas de siempre: nunca abajo a la derecha y, en la ficha de producto, nunca en la mitad de abajo.',
   'El mensaje del producto a los 8 s y el de entregas 7 s después, tapando la ficha mientras se lee; Blue movido por la persona que vuelve a apartarse solo.',
   'Mensaje a los 15 s y el siguiente a los 30 s; Blue arrastrado a la izquierda se queda ahí aunque tenga un botón debajo, hasta cerrar el navegador.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
