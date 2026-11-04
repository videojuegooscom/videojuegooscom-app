-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. Al revisar el carrusel de Instagram y TikTok, el dueño pidió quitar «gamer» y
--            poner «electrónica»: «que tenemos consolas, accesorios, móviles y portátiles, y que compramos y realizamos
--            reparaciones y mantenimientos en dispositivos electrónicos», y que esté «adaptado y bien encuadrado» para
--            Instagram y TikTok.
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Somos una tienda de electrónica, y cada red con su formato', 'diseno', 1,
   'En textos de promoción, redes sociales y anuncios la tienda se presenta como «tienda de electrónica en Zaragoza», nunca «tienda gamer»: tenemos consolas, accesorios, móviles y portátiles, y compramos y realizamos reparaciones y mantenimientos en dispositivos electrónicos (consolas, mandos, móviles, portátiles y PC). Los nombres reales de las secciones se respetan. Lo que se promete existe de verdad en la tienda: se comprueba en el código o se usan las palabras del dueño. Las imágenes para redes se hacen con capturas reales de la tienda (tamaño iPhone, fotos por el optimizador de Vercel), las dos mascotas e iconos de la app (sin emojis), y cada red con su formato: Instagram 1080 × 1350 (4:5), con aire a los lados para que la primera se vea entera en la cuadrícula del perfil; TikTok y Stories 1080 × 1920 (9:16), con todo lo importante dentro de la zona libre (fuera de los 200 px de arriba, los 480 px de abajo y los 140 px de la derecha). Antes de entregarlas se revisan con guías de esas zonas y comprobando que ningún texto se salga de su columna.',
   'Una lámina «Tu tienda gamer en Zaragoza» en 4:5 subida tal cual a TikTok, con el texto debajo de los botones de me gusta y compartir.',
   '«Tu tienda de electrónica en Zaragoza» en dos versiones: 4:5 para Instagram y 9:16 para TikTok con el texto dentro de la zona libre, revisadas con sus guías.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
