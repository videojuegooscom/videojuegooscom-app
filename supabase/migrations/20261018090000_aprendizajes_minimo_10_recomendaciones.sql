-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección nueva «Mínimo 10 recomendaciones de mejoría en cada respuesta».
-- Tipo:     inserta una sola fila, una única vez (por título). No borra ni cambia nada más.
-- Origen:   petición del dueño. Sustituye a «2 o 3 ideas de cada tipo» de la lección «Ambición…».
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
select 'Mínimo 10 recomendaciones de mejoría en cada respuesta',
       'general',
       1,
       'En el apartado «Recomendaciones» de cada respuesta Claude da como mínimo 10 recomendaciones de mejoría, concretas y con su beneficio. Orden: primero las que sacan más partido a lo que YA funciona (guía de Blue, buscador, formulario de Vender, puente con VeoAura, avisos, analítica…) y después las ideas nuevas. Sustituye al «2 o 3 ideas de cada tipo» de la lección de ambición. No se construyen sin que el dueño las elija, y nunca se rellenan con datos inventados del negocio ni con funciones que no existen.',
       'Dar 3 recomendaciones sueltas, o rellenar hasta 10 con ideas vacías o inventadas.',
       'Dar 10 o más recomendaciones útiles, las primeras para exprimir lo que ya funciona, cada una con su beneficio.',
       true
where not exists (
  select 1 from public.aprendizajes where titulo = 'Mínimo 10 recomendaciones de mejoría en cada respuesta'
);
