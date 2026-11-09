-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-07 (el dueño: «no quiero que me pidas mi aprobación para esto, quiero que lo hagas
--            automáticamente», sobre las migraciones de portadas; y después «se ve raro, déjalo bien» sobre unas portadas
--            con la foto arriba y una franja roja vacía debajo).
-- Qué hace: apunta la lección de editar bien las portadas y aplicar sus migraciones sin preguntar.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Portadas de categorías: editarlas bien compuestas y aplicar su migración sin preguntar', 'diseno', 1,
   'Las migraciones que SOLO cambian portadas o imágenes de categorías (imagenes, image_url, portadas_inicio) las aplica Claude sin pedir permiso, en cuanto la PR está publicada (autorización permanente del dueño, 2026-11-07); las demás migraciones, los permisos y lo destructivo siguen necesitando su OK. Al editar una portada para su recuadro no basta con meter la foto entera y rellenar el resto: se recompone como un cartel (lo que toca el borde en la foto sigue pegado a ese borde, el producto grande y el logo centrado en el hueco libre), sin franjas vacías ni objetos cortados de golpe, y se mira en el móvil antes de darlo por bueno.',
   'Pedir «OK aplica» para una migración de portadas; o poner la foto arriba con una franja roja vacía debajo y la tele cortada de golpe.',
   'Publicar la PR, aplicar la migración de portadas sin preguntar y comprobar la web; portadas con la consola grande pegada a su borde y el logo centrado en el rojo libre.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
