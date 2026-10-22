-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos lecciones nuevas en el Centro de Aprendizajes.
--   1) «Mínimo 10 recomendaciones de mejoría en cada respuesta» (petición del dueño; sustituye a
--      «2 o 3 ideas de cada tipo» de la lección «Ambición…»).
--   2) «Comprobar los límites de la tabla antes de añadir texto» (aprendida el 2026-10-18: la migración
--      de políticas habría fallado entera por pasar de 4.000 caracteres en una lección).
-- Tipo:     inserta dos filas, una única vez cada una (por título), o las reactiva si ya existen inactivas
--           con exactamente el mismo texto. No borra ni cambia nada más.
-- ============================================================================

-- Si una lección ya existe pero está inactiva con exactamente este texto (porque antes se aplicó la vuelta
-- atrás), se vuelve a activar: así «aplicar, deshacer, aplicar» termina igual que «aplicar». Si alguien la
-- editó, no se toca.
with nueva (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien) as (
  values
    (
       'Mínimo 10 recomendaciones de mejoría en cada respuesta',
       'general',
       1,
       'En el apartado «Recomendaciones» de cada respuesta Claude da como mínimo 10 recomendaciones de mejoría, concretas y con su beneficio. Orden: primero las que sacan más partido a lo que YA funciona (guía de Blue, buscador, formulario de Vender, puente con VeoAura, avisos, analítica…) y después las ideas nuevas. Sustituye al «2 o 3 ideas de cada tipo» de la lección de ambición. No se construyen sin que el dueño las elija, y nunca se rellenan con datos inventados del negocio ni con funciones que no existen.',
       'Dar 3 recomendaciones sueltas, o rellenar hasta 10 con ideas vacías o inventadas.',
       'Dar 10 o más recomendaciones útiles, las primeras para exprimir lo que ya funciona, cada una con su beneficio.'
    ),
    (
       'Comprobar los límites de la tabla antes de añadir texto',
       'codigo',
       1,
       'Antes de escribir una migración que añade o cambia texto, se miran las restricciones CHECK de la tabla y se mide el texto resultante. En aprendizajes: regla hasta 4.000 caracteres, ejemplo_mal y ejemplo_bien hasta 2.000 y título hasta 140. Una migración es una sola transacción: si una sentencia pasa del límite, falla TODA y se deshace también lo demás. Una lección que ya está cerca del límite no admite más texto: se crea otra fila en lugar de ampliarla.',
       'Añadir un párrafo a una lección de 3.923 caracteres sin mirar el límite de 4.000.',
       'Consultar pg_constraint, medir el texto final y, si no cabe, crear una lección nueva.'
    )
), alta as (
  insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
  select n.titulo, n.categoria, n.prioridad, n.regla, n.ejemplo_mal, n.ejemplo_bien, true
    from nueva n
   where not exists (select 1 from public.aprendizajes a where a.titulo = n.titulo)
  returning id
)
update public.aprendizajes a
   set activa = true
  from nueva n
 where a.titulo = n.titulo and not a.activa and a.regla = n.regla;
