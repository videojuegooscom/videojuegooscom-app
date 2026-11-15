-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 13 «Cambio de consola», aprobada por el dueño).
-- Qué hace: apunta la lección «Marcar el origen de una solicitud sin columnas nuevas: marca reconocible delante del texto,
--           dentro del tope de longitud, y Administración la enseña como etiqueta y la filtra».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                components/VenderAhoraModal.tsx (marcaCambioCesta, leerMarcaCambioCesta), app/(tabs)/cesta.tsx
--                (LineaCambioConsola), app/admin/cotizaciones.tsx (#cotizaciones-filtro-cesta) y pruebas/perfil-datos.mjs
--                (sección CAMBC).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Origen de una solicitud sin migración: marca delante del texto guardado, dentro del tope, y etiqueta y filtro en Administración', 'codigo', 2,
   'Para saber de dónde viene una solicitud (p. ej. «Cambio desde la cesta · para comprar: …» en sell_requests) sin columnas nuevas, el formulario pone una marca fija y reconocible ([Cambio desde la cesta · para comprar: …]) DELANTE del texto que ya se guarda (motivo o problema), al enviar y fuera del campo (la persona no la puede borrar), quitando corchetes del dato y recortando el total al tope de la base de datos (sell_requests_longitudes_check: 600). Una sola función la escribe y otra la lee (marcaCambioCesta / leerMarcaCambioCesta, exportadas juntas); Administración la enseña como etiqueta, la quita del texto y la filtra con su recuento. La analítica solo lleva el origen, nunca el texto. Las promesas de valor van sin cifras: «Te damos un precio orientativo y lo confirmamos nosotros tras revisarla».',
   'Añadir una columna «origen» con su migración pendiente del dueño, o meter la marca en el campo editable (se borra) y sin recortar (el insert falla al pasar de 600 caracteres).',
   'Desde la cesta con una PS5 Slim, Vender se abre con «Cambio desde la cesta · para comprar: Playstation 5 Slim Con Lector»; la fila guarda «[Cambio desde la cesta · para comprar: …] Quiero cambiarlo…» y Cotizaciones la enseña con su etiqueta azul y el filtro «Cambio desde la cesta (1)».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
