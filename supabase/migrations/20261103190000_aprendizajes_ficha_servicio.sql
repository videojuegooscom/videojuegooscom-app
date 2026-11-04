-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-03.
--   El dueño pidió que la ficha de un servicio (/servicio/…) tenga el mismo formato que la de producto. Las dos
--   fichas son una misma cosa para el cliente: lo que cambie en una se refleja en la otra. (Al día con la #157: las
--   dudas del servicio van por Blue IA y el chat de la tienda, ya no por WhatsApp.)
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Ficha de servicio con el mismo formato que la de producto', 'diseno', 1,
   'La ficha de un servicio (app/servicio/[id].tsx) sigue el formato de la de producto (app/producto/[id].tsx): título como h1 y subtítulo; galería con la posición («1 / 3»), flechas en el ordenador, deslizar con el dedo, miniaturas y foto en grande con zoom al tocarla; visitas; precio; el botón principal («Contratar servicio ahora», como «Comprar ya»); «Preguntar por este servicio» como «Preguntar por este producto» (abre Blue IA con el servicio y, desde ahí, el chat de la tienda; nunca WhatsApp); la ficha con pestañas «Características» y «Descripción», que es el mismo componente (FichaProducto, exportado desde la ficha de producto); y «Volver atrás» al final, sin el «Volver» flotante. Sin bloques que la de producto no tenga (confianza genérica, botones repetidos). Blue no baja a la mitad de abajo en ninguna de las dos. Un cambio en una ficha se lleva a la otra en la misma PR y se prueba con pruebas/perfil-datos.mjs (sección FS, que compara los botones de las dos).',
   'Una ficha de servicio con bloques «Contrata con tranquilidad», dos botones de WhatsApp y la información apilada en el centro, distinta de la de producto.',
   'Misma galería, mismos botones y la misma ficha con pestañas que en producto; solo cambia lo propio del servicio («Contratar servicio ahora»).')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
