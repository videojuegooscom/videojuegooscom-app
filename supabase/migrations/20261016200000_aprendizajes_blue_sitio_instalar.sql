-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable', 'diseno', 1,
   'Blue flotante NUNCA se pone en el lado derecho inferior (de la mitad de la pantalla hacia abajo): ahí van el botón de volver arriba, «Volver» y enviar. Si lo suelta ahí o su posición guardada cae ahí, sube a la mitad en el mismo lado; sitio inicial: abajo a la izquierda. Se aparta en seguida cuando estorba (mira cada 1,2 s y al tocar algo o aparecer contenido). Sus mensajes son una tarjeta alargada de pocas líneas (un solo párrafo: «Blue · mensaje · acción ›»), nunca una tarjeta gorda. La tienda es instalable (public/manifest.json + iconos del logo): Blue ofrece instalarla en Android con el diálogo del navegador y en iPhone con los pasos «Añadir a pantalla de inicio»; solo se ofrece si se puede y no está ya instalada.',
   'Dejar a Blue abajo a la derecha, con tarjetas de 5 líneas, o prometer «instalar la app» en un navegador que no puede.', 'Probar con el navegador que Blue sube si su sitio antiguo era abajo a la derecha, que se aparta en menos de 2,5 s y que el botón de instalar solo sale cuando se puede.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
