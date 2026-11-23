-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-23.
--   En el móvil, la ficha del producto («Características», «Mantenimiento», «Descripción») se veía cortada por la mitad:
--   el fundido AparecerAlVer (2026-11-19) la envolvía sin ancho dentro de una columna centrada, y crecía hasta los 520 px
--   de sus pestañas en una pantalla de 390 (el dueño: «se buguea feo»).
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), components/DesplazamientoSuave.tsx, app/producto/[id].tsx.
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Una envoltura nueva (fundido, animación) no puede cambiar el ancho de lo que envuelve', 'diseno', 1,
   'Al envolver un apartado en una pieza nueva (AparecerAlVer, un fundido, un View de animación) dentro de una columna que centra a sus hijos (alignItems center), la envoltura toma el ancho de su contenido, no el de la pantalla: lo que antes medía «100 %» deja de caber. Toda envoltura así lleva width: "100%" (y el maxWidth que tuviera su contenido) y se comprueba en 360, 390 y 1280 que la caja no se sale de la pantalla (la prueba FT mide que la ficha con pestañas va de 0 al ancho de la ventana).',
   '<AparecerAlVer><FichaProducto … /></AparecerAlVer> en una columna centrada: en el móvil la ficha medía 520 px en 390 y cada pestaña se veía cortada.',
   '<AparecerAlVer style={{ width: "100%", maxWidth: 520 }}>…</AparecerAlVer>, con la prueba FT0 en 360, 390 y 1280.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
