-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones de la guía de Blue (iconos, título de la página, tarjeta compacta, funciones difíciles)
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('En la guía de Blue siempre iconos, nunca emojis', 'diseno', 1,
   'El puntero que enseña dónde tocar en la guía de Blue es SIEMPRE un icono de la app (huella táctil blanca en un círculo azul de marca), nunca un emoji de mano. «Emoticono», para el dueño, es el icono de la app (como los de la barra de abajo). Los pasos se enseñan con filas de iconos (secciones, compra, gestos del Foro, lo que sabe hacer Blue). Se prueba con pruebas/guia-blue.mjs (ningún 👆 en la pantalla).',
   'Una mano emoji 👆 encima del botón, de un amarillo que desentona con el resto.', 'Un círculo azul con una huella táctil blanca, igual que los iconos de la barra de abajo.'),
  ('La guía enmarca el título de la página («Estás aquí»)', 'diseno', 1,
   'En cada paso de la guía de Blue se enmarca el TÍTULO de la página en la que está la persona y se rotula «Estás aquí», para que siempre sepa dónde está: en las cinco secciones es su nombre en la barra de abajo (Foro, Cesta y Blue IA no tienen otro título arriba) y en Vender, Servicios, Catálogo y la ficha es su h1. Lo que se señala y el título se ven sin oscurecer; el resto se oscurece. Si la página se desplaza sola, el recuadro la sigue.',
   'Un paso que lleva a otra pantalla sin decir cuál es.', 'El nombre de la sección enmarcado con «Estás aquí» en cada paso.'),
  ('La tarjeta de la guía deja ver la página', 'diseno', 1,
   'La tarjeta de la guía es GRANDE (mascota o iconos) en los pasos que explican algo con iconos y COMPACTA (80 px más baja, sin mascota) en los pasos que enseñan otra página (formulario, Perfil, Servicios, la ficha…), para que se vea esa página. Las dos van pegadas abajo: «Siguiente» no se mueve. Si lo señalado es muy alto, se enmarca solo su parte de arriba. Se prueba con pruebas/guia-blue.mjs.',
   'Una tarjeta de 292 px tapando la mitad del formulario que se está enseñando.', 'Una tarjeta de 212 px y el formulario a la vista.'),
  ('La guía enseña también las funciones que cuestan', 'negocio', 1,
   'La guía de Blue no se queda en lo básico: enseña las funciones que a un cliente nuevo le cuestan (reservar 15 minutos con «Añadir» frente a «Comprar ya», filtros y orden del catálogo, cómo se compra y que no hay pago online, reaccionar con un toque y responder con dos en el Foro, mantener pulsada una pestaña para moverla, «Hablar con el equipo», «Seguimientos»). Solo se explica lo que existe y la guía no crea pedidos, reservas ni visitas: para enseñar una ficha se abre con ?guia=1 y esa visita no se cuenta.',
   'Una guía que solo enseña las cinco secciones y los botones de Inicio.', 'Pasos para la ficha, los filtros, la compra, el Foro y el equipo, comprobados con el navegador.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
