-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-27.
--   El dueño: «estas cosas [los comandos de Termius] quiero que me las des aquí en el chat en formato pastillas con un
--   botón de copiar directamente» y «las opciones que me des a elegir … me los des [en] pastilla con un botón de copiar».
--   Al copiar de texto corrido se le colaba texto extra delante del comando («veoaura, escríbela:»).
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes); CLAUDE.md («Formato de respuesta»).
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Comandos y opciones para el dueño, cada uno en su pastilla con botón de copiar', 'general', 1,
   'Todo lo que el dueño tenga que copiar (comandos de Termius, SQL para el SQL Editor y las respuestas cortas cuando le doy opciones a elegir) va en su propio bloque de código, uno por bloque y sin nada más dentro, para que le salga como pastilla con botón de copiar. Encima, una línea corta que diga qué hace. Nunca se ponen contraseñas ni valores secretos en esas pastillas, y si un comando muestra un secreto se le avisa de no mandar foto y de limpiar la pantalla con clear. Además, se le dan los menos pasos posibles: lo que pueda hacer Claude lo hace Claude, y si hace falta un dato no secreto (un host, por ejemplo) se busca o se pide en el chat en vez de mandarle a editar archivos.',
   'Escribir «ejecuta sudo vz-instalar-claude» dentro de una frase, o dar las opciones «apágalo entero / déjalo» en texto corrido.',
   'Una línea «Instala la política:» y debajo un bloque de código solo con sudo vz-instalar-claude; las opciones, cada una en su bloque: «término medio», «apágalo entero», «déjalo».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
