-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) sobre dónde puede estar Blue flotante en la ficha de producto.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue nunca en la mitad de abajo de la ficha de producto', 'diseno', 1,
   'En la página de producto (/producto/…) Blue flotante no baja NUNCA a la mitad de abajo de la pantalla, en ninguno de los dos lados: ni al entrar, ni al soltarlo ahí, ni al apartarse para no tapar algo (components/Campanita.tsx, FY_MAX_FICHA). Su sitio preferido se recuerda tal cual: fuera de la ficha vuelve a él. Es una excepción a «sitio inicial abajo a la izquierda»; en el resto de la tienda sigue la regla de siempre (nunca abajo a la derecha).',
   'Blue abajo a la izquierda en la ficha, encima de «Volver atrás» o del carrusel de la ficha.', 'En la ficha, Blue como mucho a media pantalla en su lado; al volver a Inicio, otra vez abajo a la izquierda si ahí lo dejó la persona.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
