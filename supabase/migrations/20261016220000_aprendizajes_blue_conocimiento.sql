-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Blue aprende de la tienda: la respuesta la escribe el dueño»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue aprende de la tienda: la respuesta la escribe el dueño', 'negocio', 1,
   'Blue IA responde mejor con información real de la tienda (tabla blue_conocimiento, pantalla «Lo que Blue sabe» en administración). Desde el panel de administración, Blue le propone al dueño temas pendientes a lo largo del día (de 9 a 21 h, huecos de 45 min, hasta 8 al día) y la ventana de Blue recoge la respuesta. Blue solo hace la PREGUNTA: la respuesta la pone siempre el dueño; nunca se rellena con datos inventados (horarios, plazos, precios, condiciones). Blue solo aparece en administración para el dueño, y la propuesta nunca tapa el trabajo del panel (Blue se aparta como siempre).',
   'Rellenar «Lo que Blue sabe» con respuestas supuestas, o proponer temas a quien no es el dueño.', 'Proponer el tema como pregunta, esperar la respuesta del dueño y guardarla; «Ahora no» aparca el tema hasta mañana y «No aplica» no lo vuelve a proponer.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
