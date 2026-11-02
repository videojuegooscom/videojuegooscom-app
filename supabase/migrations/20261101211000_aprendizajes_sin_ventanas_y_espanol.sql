-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-01 (captura del dueño a las 22:21).
--   1) Para ver cómo juzga el controlador de publicación las migraciones, Claude lanzó un grep sobre
--      /usr/local/bin/vz-publicar: al dueño le salió en el móvil la ventana «Bash quiere ejecutar… Denegar / Permitir
--      una vez». La lección «Nada de Bash fuera del proyecto» ya lo prohibía; el mismo código está en el repositorio
--      (infraestructura/publicacion/controlador.py). Se añade este caso a sus ejemplos.
--   2) En la misma captura, los avisos de avance que Claude escribe mientras trabaja salían en inglés.
-- Tipo:     pone al día, por su título, los ejemplos de una lección e inserta otra si no existe. No borra nada.
-- ============================================================================

update public.aprendizajes
set ejemplo_mal = ejemplo_mal || ' O un grep sobre /usr/local/bin/vz-publicar para ver qué SQL rechaza el controlador (ventana en el móvil a las 22:21 del 2026-11-01).',
    ejemplo_bien = ejemplo_bien || ' Para el controlador de publicación, su copia en el repositorio: infraestructura/publicacion/controlador.py (y el guardián, infraestructura/claude-code/).',
    updated_at = now()
where titulo = 'Nada de Bash fuera del proyecto: cada comando así es una ventana en el móvil del dueño'
  and ejemplo_mal not like '%vz-publicar%';

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Todo en español, también los avisos mientras se trabaja', 'textos', 1,
   'El dueño sigue el trabajo desde el móvil: los avisos cortos que Claude escribe entre comando y comando («Ahora miro…», «Ya está…»), los títulos de lo que hace y las respuestas van SIEMPRE en español sencillo, igual que la respuesta final. Solo se quedan en inglés los nombres de código, comandos y mensajes de error copiados tal cual.',
   'Avisos de avance como «The profiles migration removes all access for visitors. I''ll copy how it does that:» mientras el dueño mira el chat en el móvil.',
   '«La migración de los perfiles quita todo el acceso a los visitantes; copio cómo lo hace.»')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
