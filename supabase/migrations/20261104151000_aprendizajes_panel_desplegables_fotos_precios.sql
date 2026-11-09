-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño, editando un servicio en el panel, pidió poder quitar una o varias fotos
--            a la vez, que «Estado» sea un desplegable que al tocarlo muestre el selector de iOS y que los precios admitan
--            decimales.
-- Qué hace: apunta la lección «Formularios del panel: selector del móvil, varias fotos a la vez y precios con céntimos».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Formularios del panel: selector del móvil, varias fotos a la vez y precios con céntimos', 'panel', 1,
   'En los formularios del panel (Productos y Servicios, y los que vengan): elegir entre opciones fijas (Estado, Condición, Categoría…) es SelectorIOS de lib/admin/products.components.tsx, una caja que al tocarla abre el selector del propio móvil (en el iPhone, la rueda de iOS; en la web es un <select> de verdad, transparente, encima de la caja), nunca una fila de botones ni una ventana inventada. Las fotos se pueden quitar de una en una o varias a la vez («Seleccionar varias», «Todas», «Quitar (N)»: useSeleccionFotos y BarraSeleccionFotos), se avisa de que se borran al guardar y hay «Deshacer» hasta entonces. Todo precio admite céntimos: teclado decimal (keyboardType decimal-pad, con coma en el iPhone), toPriceSafe (45,50 → 45.5) y columna numeric(10,2) en la base de datos (services.price_eur lo era de enteros hasta la migración 20261104150000); si la base de datos aún no los admite, se guarda redondeado y se avisa. Productos y Servicios funcionan igual en el panel. Se prueba con pruebas/perfil-datos.mjs (sección AF, con control de la versión anterior).',
   'Estado con dos botones «Borrador» y «Publicado», borrar fotos una a una con su X y un precio que solo acepta 45 (teclado sin coma).',
   'Estado: una caja «Publicado ⌄» que abre la rueda de iOS; «Seleccionar varias» → dos fotos → «Quitar (2)»; precio 45,50 guardado como 45.5.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
