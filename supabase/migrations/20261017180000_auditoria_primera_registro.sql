-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: apunta la PRIMERA revisión de calidad web (hecha por Claude el 2026-10-16) en el
--            registro auditorias_web y corrige la fecha escrita en la lección (decía 2026-10-17).
-- Tipo:     inserta una fila (una sola vez) y corrige un texto de una sola fila. No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = replace(regla, '2026-10-17', '2026-10-16'),
    updated_at = now()
where titulo = 'Revisión de calidad web cada dos semanas'
  and regla like '%2026-10-17%';

insert into public.auditorias_web (origen, resumen, ok, avisos, fallos, manuales, duracion_ms, cambios, resultado)
select 'manual',
  'Primera revisión, hecha por Claude con navegador y lecturas sobre la tienda real. Sin fallos; 5 avisos (los que dependen del dueño o son de mejora).',
  14, 5, 0, 1, 0,
  'Se corrigió lo que salió: robots.txt, sitemap.xml, página 404 propia, título y descripción en el HTML, títulos por página, encabezados h1, texto alternativo (ALT) en las fotos, fotos del tamaño justo (Inicio de ~30 MB a 0,8 MB), gris de textos más legible, protección anti-robots en Vender, NIF y dirección en las políticas y esta revisión automática (PR 67, 68 y 69).',
  '[
    {"n":1,"nombre":"Política de privacidad","estado":"aviso","detalle":"NIF y dirección fiscal ya puestos; falta el nombre legal o razón social del titular ([NOMBRE LEGAL / RAZÓN SOCIAL])."},
    {"n":2,"nombre":"Términos y condiciones","estado":"aviso","detalle":"NIF y dirección fiscal ya puestos; falta el nombre legal o razón social del titular."},
    {"n":3,"nombre":"API y secretos","estado":"aviso","detalle":"Sin claves en el código, .env ignorado y endpoints protegidos (clave del cron, origen y límite, firma HMAC). Pendiente: 53 vulnerabilidades en dependencias (las aprueba el dueño)."},
    {"n":4,"nombre":"Forzar HTTPS","estado":"ok","detalle":"http:// redirige a https:// (308) y HSTS activo."},
    {"n":5,"nombre":"Aviso de cookies","estado":"ok","detalle":"En la primera visita salen «Aceptar» y «Rechazar»."},
    {"n":6,"nombre":"Título y descripción en el HTML","estado":"ok","detalle":"Corregido: antes el título salía vacío; ahora el HTML lleva título, descripción y etiquetas de vista previa, y cada página pública tiene los suyos."},
    {"n":7,"nombre":"Vista previa al compartir","estado":"ok","detalle":"Las fichas de producto salen con título, precio y foto en WhatsApp y redes; la portada con título, descripción e imagen."},
    {"n":8,"nombre":"Favicon e iconos","estado":"ok","detalle":"favicon.ico, manifiesto e iconos de la app instalable responden."},
    {"n":9,"nombre":"robots.txt y sitemap.xml","estado":"ok","detalle":"Corregido: no existían. Ahora hay robots.txt y un sitemap con 32 direcciones (20 productos y 3 servicios)."},
    {"n":10,"nombre":"Imágenes con texto alternativo (ALT)","estado":"ok","detalle":"Corregido: ninguna foto lo tenía. Ahora todas lo llevan (las decorativas, vacío a propósito)."},
    {"n":11,"nombre":"Fotos comprimidas","estado":"ok","detalle":"Corregido: Inicio descargaba ~30 MB, el catálogo ~33 MB y una ficha ~12 MB. Ahora 0,83 MB, 0,36 MB y 0,15 MB (versión del tamaño justo con el optimizador de Vercel)."},
    {"n":12,"nombre":"Velocidad de carga","estado":"aviso","detalle":"La portada carga en ~1 s. Mejora posible: el código de la web pesa 2,7 MB (712 KB comprimido)."},
    {"n":13,"nombre":"Contraste de colores","estado":"manual","detalle":"Decisión del dueño (2026-10-16): el azul de marca sobre blanco (2,7:1) se deja como está. Los grises de textos secundarios se subieron a 4,7:1."},
    {"n":14,"nombre":"Web en móvil","estado":"ok","detalle":"Sin desbordes laterales a 360, 390 y 414 px en 13 páginas."},
    {"n":15,"nombre":"Página 404 propia","estado":"ok","detalle":"Corregido: salía la genérica de Vercel. Ahora es la de la tienda, con estado 404."},
    {"n":16,"nombre":"Enlaces rotos","estado":"ok","detalle":"Sin enlaces internos rotos."},
    {"n":17,"nombre":"Formularios validados","estado":"ok","detalle":"Vender y el registro validan los datos; Vender con límites de longitud y comprobaciones contra robots."},
    {"n":18,"nombre":"Protección contra spam","estado":"aviso","detalle":"Campo trampa, tiempo mínimo y límites de longitud añadidos. Pendiente: captcha o límite por IP (la inserción pública en Vender sigue abierta)."},
    {"n":19,"nombre":"Analítica","estado":"ok","detalle":"Analítica propia con consentimiento y embudo de la guía y de Vender; la tienda no usa GA4."},
    {"n":20,"nombre":"Llamadas a la acción claras","estado":"ok","detalle":"Inicio: «Ver categorías» y «Vender ahora»; ficha de producto: «Añadir a la cesta», «Comprar» y «Chat»."}
  ]'::jsonb
where not exists (
  select 1 from public.auditorias_web
  where origen = 'manual' and resumen like 'Primera revisión%'
);
