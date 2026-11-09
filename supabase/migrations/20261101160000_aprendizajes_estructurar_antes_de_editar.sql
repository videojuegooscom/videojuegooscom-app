-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-01 (la pide el dueño).
--   El dueño mandó siete cambios a la vez (portadas, recorte, reseñas, emojis, Cesta…) y pidió que, antes de ponerse a
--   editar, Claude estructure el trabajo para optimizar tiempos y no perder tiempo.
-- Qué hace: añade esa lección al Centro de Aprendizajes (la consulta Claude antes de cada respuesta).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     solo inserta la fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Antes de editar, estructurar el trabajo', 'general', 1,
   'Cuando el dueño pide varias cosas, antes de tocar un archivo: localizar dónde está cada pieza, averiguar la causa de lo que «no funciona» (a veces es una migración sin aplicar, no el código), agrupar en bloques independientes (una PR por bloque, para poder volver atrás), ordenarlos de lo pequeño a lo grande y decidir qué se prueba en cada uno. Se le enseña el plan en pocas líneas, se pide de una vez lo que necesite su autorización y se sigue sin esperar: mientras GitHub y Vercel comprueban una PR, se trabaja en la siguiente.',
   'Ponerse a editar el primer archivo de la lista y descubrir a mitad que dos cambios tocan lo mismo o que faltaba una migración.',
   'Plan de 4 líneas (bloques, orden, qué hace falta autorizar), la autorización pedida al principio y las PR encadenadas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
