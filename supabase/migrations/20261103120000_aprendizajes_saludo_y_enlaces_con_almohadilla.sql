-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos lecciones del 2026-11-03.
--   1) El dueño avisó de que en Blue IA, con una conversación ya empezada, «se vuelve a reescribir el primer mensaje».
--      El saludo se escribía letra a letra nada más entrar y la última conversación guardada llegaba después, debajo:
--      parecía que Blue IA lo reescribía. Ahora se espera a saber si hay una conversación que abrir y, con ella, el
--      saludo se queda quieto y sale «Nueva conversación».
--   2) Al volver de un enlace de cambio de correo con error (#error=…), la tarjeta de Mi perfil no decía nada: el
--      enrutador quita la parte «#…» de la dirección en cuanto arranca, antes de que se abra la tarjeta.
-- Tipo:     inserta las lecciones si no existen. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Saludos y animaciones de entrada: primero saber si hay algo guardado', 'diseno', 1,
   'Un saludo que se escribe letra a letra, unas sugerencias o cualquier animación de «recién abierto» solo se enseñan cuando se sabe que de verdad es una pantalla nueva: si con sesión puede llegar una conversación, una cesta o un borrador guardados, se espera a esa respuesta (con una rueda discreta) y, si llega, se muestra tal cual, sin animar nada encima. Con algo empezado, la pantalla ofrece «Nueva conversación» (o lo equivalente) a la vista, junto a los botones de abajo, y lo anterior queda guardado. La prueba simula una red lenta y cuenta si la animación llega a verse.',
   'Escribir el saludo nada más entrar y que la conversación guardada aparezca después debajo: parece que Blue IA reescribe el primer mensaje.',
   'Rueda mientras se mira el historial; si hay conversación, se abre con el saludo quieto y «Nueva conversación» junto a «Hablar con el equipo»; si no, saluda escribiendo.'),
  ('Lo que llega en «#…» de la dirección se lee al cargar la página', 'codigo', 2,
   'El enrutador de la tienda (Expo Router en la web) reescribe la dirección en cuanto arranca y quita la parte «#…». Lo que Supabase u otro servicio manda ahí (por ejemplo error_description o error_code al volver de un enlace del correo) se lee al cargar el módulo de la pantalla, no cuando se monta un componente que aparece más tarde (tras cargar la sesión o el perfil). Lo que va en «?…» sí se mantiene. Se prueba con el «#…» de verdad en la dirección de la prueba.',
   'Leer el error del enlace en un useState de un componente que se monta tras cargar el perfil: para entonces el «#…» ya no está y no se dice nada.',
   'Leerlo una vez al cargar el módulo, guardarlo y usarlo cuando la tarjeta se abre; después limpiar la dirección.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
