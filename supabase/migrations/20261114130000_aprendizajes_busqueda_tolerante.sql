-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-14 (mejora 3 «Filtros y búsqueda»: la búsqueda pasa de ilike a una búsqueda
--            tolerante en la tienda, y la barra de precio salía de 69 px dentro del panel de filtros).
-- Qué hace: apunta las lecciones «Buscar productos con un índice ligero en la tienda, no con ilike» y «Lo que tiene que
--           ocupar todo el ancho no va dentro de un contenedor centrado».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           components/Barramagic.tsx (cargarIndiceBusqueda, buscarProductos), app/catalogo.tsx,
--           components/CatalogFilters.tsx (BarraPrecio, ChipRow «lleno») y pruebas/perfil-datos.mjs (sección FBU).
-- Tipo:     inserta las lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Buscar productos con un índice ligero en la tienda, no con ilike', 'codigo', 2,
   'Para que la búsqueda entienda sinónimos («play 5» = «ps5»), plurales y errores de escritura, los productos se buscan en la tienda: se pide UNA vez (5 min en memoria, compartido por el buscador de Inicio y el catálogo) un índice con solo id, título, descripción, precio, estado y categoría, SIN fotos, y después solo las filas de la página que se enseña. Así se cuida la cuota de salida de Supabase. Si el índice no carga, se busca como antes (ilike) para no dejar al cliente sin resultados. Los sinónimos van en una tabla del código (GRUPOS_SINONIMOS) y se aplican igual al texto buscado y a los productos.',
   'title.ilike.%play 5% → 0 resultados aunque haya una «PlayStation 5»; o descargar products con images y todas sus fotos para buscar.',
   'cargarIndiceBusqueda() + buscarProductos() (components/Barramagic.tsx); el catálogo pide luego .in(id, 24 ids); «¿Querías decir…?» con la palabra más parecida que SÍ tiene productos.'),
  ('Lo que tiene que ocupar todo el ancho no va dentro de un contenedor centrado', 'diseno', 2,
   'En React Native Web, un hijo con width: 100% dentro de un View con alignItems: center (o de una fila que se ajusta a su contenido) se queda con el ancho de su contenido: la barra de precio del panel de filtros medía 69 px y los tiradores no se podían arrastrar. Barras, deslizadores y campos que deben llenar el ancho van en un contenedor con alignItems: stretch (ChipRow con «lleno») y se comprueba su ancho en las capturas a 360, 390 y 1280 px y con una prueba que mida la barra.',
   'ChipRow centrado con <BarraPrecio style={{ width: "100%" }} /> dentro: barra de 69 px.',
   '<ChipRow lleno>: alignItems stretch; la sección FBU mide que la barra y sus tiradores caben y que se arrastran con el dedo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
