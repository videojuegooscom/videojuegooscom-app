-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones «La guía de Blue se ofrece sola solo en Inicio» y «hitSlop no basta para los 44 px en la web»
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La guía de Blue se ofrece sola solo en Inicio', 'diseno', 1,
   'La guía de bienvenida se ofrece sola (a los 15 s, una vez por dispositivo y solo sin sesión) únicamente cuando la persona está en Inicio. Quien llega a una ficha de producto, al catálogo, a un chat, al pago, a Vender o al panel (por ejemplo desde un enlace compartido) no es interrumpido ni llevado a otra pantalla: la guía queda pendiente y se ofrece cuando llega a Inicio. Se prueba con pruebas/guia-blue.mjs (visitante nuevo que entra directo a una ficha).',
   'Una persona abre un enlace a un producto y a los 15 s la guía le tapa la ficha y lo lleva a Inicio.', 'La ficha sigue como está; al llegar a Inicio se le ofrece la guía.'),
  ('hitSlop no basta para los 44 px en la web', 'codigo', 2,
   'En la web, el hitSlop de un Pressable de react-native-web llega a bastante menos de lo que declara (un toque a 10 px por debajo de un botón con hitSlop de 12 ya no responde). Para cumplir los 44 px del pulgar, el botón mide 44 px REALES (minHeight 44 y el contenido centrado) y se comprueba con el navegador de pruebas (pruebas/guia-blue.mjs mide los botones de la tarjeta de la guía), no solo leyendo el código.',
   '«Saltar» con paddingVertical 4 y hitSlop 12: 23 px de alto y una zona táctil real menor de 44 px.', '«Saltar» con minHeight 44: 44 px de alto reales.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
