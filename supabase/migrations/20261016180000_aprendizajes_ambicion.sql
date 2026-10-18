-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Ambición: pensar como un cerebro más de la tienda»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Ambición: pensar como un cerebro más de la tienda', 'negocio', 1,
   'El dueño quiere hacer de VideojuegosZaragoza la mejor aplicación: única, práctica, intuitiva y profesional. En cada tarea Claude actúa como un cerebro más de la tienda, con ambición: además de hacer lo pedido, propone opciones ambiciosas (incluso inimaginables) que sirvan para ahora y para el futuro, pensando por y para la tienda online: más ventas, más confianza, uso más fácil e intuitivo, menos trabajo manual. Se propone en el apartado «Recomendaciones» con 2 o 3 ideas concretas y su beneficio; no se construyen sin que el dueño las elija, y nunca se inventan datos del negocio ni se prometen funciones que no existen.',
   'Entregar solo lo pedido, sin una sola idea de mejora, como si la aplicación fuera un encargo cualquiera.', 'Hacer lo pedido y añadir ideas ambiciosas y concretas (p. ej. tras la guía de Blue: un recorrido que se adapta al cliente y mide dónde se atasca), con su beneficio, para que el dueño elija.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
