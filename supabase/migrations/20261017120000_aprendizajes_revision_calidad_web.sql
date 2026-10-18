-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Revisión de calidad web cada dos semanas» (con la fecha de la última) y
--            corrección de una errata en la descripción SEO («tú electrónica» → «tu electrónica»).
-- Tipo:     inserta una fila si no existe y corrige un texto de una sola fila. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Revisión de calidad web cada dos semanas', 'general', 1,
   'Al menos UNA VEZ CADA DOS SEMANAS Claude revisa la tienda real con esta lista de 20 puntos y apunta aquí la fecha y lo que encontró: 1 política de privacidad, 2 términos y condiciones (sin marcas de relleno), 3 API y secretos (nada escrito en el código, .env ignorado, endpoints protegidos), 4 forzar HTTPS, 5 aviso de cookies, 6 metadescripciones y títulos por página, 7 vista previa al compartir enlaces, 8 favicon, 9 sitemap.xml y robots.txt, 10 imágenes con texto alternativo (ALT), 11 imágenes comprimidas, 12 velocidad de carga, 13 contraste de colores, 14 web en móvil (sin desbordes a 360, 390 y 414 px), 15 página 404 propia, 16 enlaces rotos, 17 formularios validados, 18 protección contra spam, 19 analítica (la tienda usa analítica propia con consentimiento, no GA4), 20 llamadas a la acción claras. Cuando pasen más de 14 días desde la última revisión, Claude lo avisa al empezar la respuesta y la hace; al terminar, actualiza la fecha de esta lección con una migración. Solo lecturas sobre la tienda real; lo que sea del dueño (datos legales, contraseñas, claves, dependencias) se le pide aparte. ÚLTIMA REVISIÓN: 2026-10-17 (primera). Hallazgos de la primera: faltaban robots.txt, sitemap.xml y 404 propia; ninguna imagen tenía ALT; las fotos se descargan a tamaño original (~30 MB en Inicio); privacidad y términos con marcas sin rellenar ([NOMBRE LEGAL], [NIF/CIF], [DIRECCIÓN FISCAL]); títulos y descripciones iguales en todas las páginas; botones y precios con azul de marca sobre blanco con contraste 2,7:1; 53 vulnerabilidades en dependencias.',
   'Dejar pasar meses sin revisar la tienda y enterarse de un fallo (como las políticas con marcas sin rellenar) por un cliente.', 'Revisar cada dos semanas con la lista, apuntar la fecha y lo encontrado, y corregir lo que se pueda en la misma revisión.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);

update public.site_settings
set seo_description = 'Compramos tu electrónica al mejor precio o la intercambiamos. Mantenimiento y reparaciones.'
where id = 1
  and seo_description = 'Compramos tú electrónica al mejor precio o la intercambiamos, Mantenimiento y Reparaciones.';
