-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: anota en la lección de la revisión de calidad web qué se corrigió en la primera
--            revisión (2026-10-17) y qué queda pendiente del dueño.
-- Tipo:     actualiza el texto de una sola fila (por título), una única vez. No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' CORREGIDO EN LA PRIMERA REVISIÓN: robots.txt, sitemap.xml (api/sitemap.ts), 404 propia (public/404.html), título y descripción en el HTML, títulos por página, un h1 por página, texto alternativo (ALT) en las fotos, miniaturas optimizadas con el optimizador de Vercel (SmartImage: prop ancho, vuelve a la original si falla; solo en https), gris de textos secundarios a 0,62 (contraste 4,7:1) y protección anti-robots en Vender (campo trampa, mínimo 4 s y límites de longitud en la base de datos). PENDIENTE DEL DUEÑO: datos legales de privacidad y términos ([NOMBRE LEGAL], [NIF/CIF], [DIRECCIÓN FISCAL]); decidir el contraste del azul de marca sobre blanco (2,7:1, regla «azul #1EA7E8 nunca más oscuro»); dependencias con 53 vulnerabilidades; si se añade GA4 (hoy hay analítica propia); un captcha o límite por IP para el formulario de Vender (la política de inserción pública sigue abierta). A comprobar en la próxima revisión: peso real de las fotos en Inicio y Catálogo (antes ~30 MB), LCP y que sitemap.xml siga listando los productos publicados.',
    updated_at = now()
where titulo = 'Revisión de calidad web cada dos semanas'
  and regla not like '%CORREGIDO EN LA PRIMERA REVISIÓN%';
