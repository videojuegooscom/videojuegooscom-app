-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos lecciones del 2026-11-03.
--   1) El dueño pidió en Administración → Servicios: foto en grande con zoom, «+» flotante para crear, los contadores
--      en una fila, deslizar el dedo para cambiar de pestaña (en bucle), sin burbujas alrededor y el buscador a la misma
--      altura que en las demás pantallas. Es la forma de todas las pantallas del panel.
--   2) Claude le dijo que las visitas de los servicios «no se contaban» y sí se contaban por la vía de respaldo: antes de
--      decir que algo no funciona hay que mirar la vía de respaldo y los datos reales.
-- Qué hace: añade esas lecciones al Centro de Aprendizajes (las consulta Claude antes de cada respuesta).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     inserta las lecciones si no existen. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Pantallas del panel: buscador arriba, contadores en fila, «+» flotante y pestañas deslizables', 'panel', 1,
   'Las pantallas del panel de administración siguen el mismo patrón (Productos y Servicios): el buscador arriba de todo, con el mismo alto en todas; los contadores en UNA fila (cuatro también en el móvil, con el icono encima del nombre); crear algo nuevo es el «+» flotante abajo a la derecha (BotonFlotante), no un botón grande; las listas sin recuadros alrededor (filas separadas por una línea fina); las pestañas con subrayado (PestanasPanel) y, deslizando el dedo sobre el contenido, se pasa a la siguiente o a la anterior en bucle (useGestoPestanas); y al tocar una foto se abre en grande con zoom (ImageLightbox). Se prueba en el móvil y en el ordenador con el navegador.',
   'Un botón «+ Nuevo servicio» de lado a lado, cuatro contadores en dos filas y cada servicio dentro de una tarjeta.',
   'Buscador arriba, cuatro contadores en una fila, filas sin tarjeta, «+» abajo a la derecha y pestañas que se cambian con el dedo.'),
  ('Antes de decir que algo no funciona, mirar la vía de respaldo y los datos reales', 'general', 1,
   'Un error en los registros no siempre significa que la función esté rota para los clientes: muchas partes de la tienda tienen una vía de respaldo (por ejemplo, las visitas y los «me gusta» caen a las funciones antiguas si la nueva falla). Antes de decirle al dueño que algo «no funciona», se lee el código de la vía de respaldo y se comprueban los datos reales (cifras que siguen subiendo, filas nuevas). Si ya se dijo algo que no era verdad, se corrige en la respuesta siguiente sin esperar a que pregunte.',
   'Decir «las visitas de los servicios no se cuentan desde el 22 de octubre» al ver un error en los registros, cuando sí se contaban por la vía antigua.',
   'Ver el error, leer lib/interaccion.ts, comprobar que las visitas siguen subiendo y decir: «se cuentan por la vía antigua; el error solo sale en el registro».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
