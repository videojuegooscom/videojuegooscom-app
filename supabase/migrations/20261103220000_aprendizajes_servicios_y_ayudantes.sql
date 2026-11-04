-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: tres lecciones del 2026-11-03.
--   1) El dueño pidió para los servicios lo mismo que tienen los productos: «me gusta», chat de la tienda (sin
--      WhatsApp), la misma tarjeta en las listas y reseñas. Los servicios son parte de la tienda igual que los productos.
--   2) Las reseñas de servicios se unen a una solicitud entregada del cliente: así no hay reseñas falsas.
--   3) Dos ayudantes (subagentes) lanzaron comandos encadenados con tuberías y al dueño le saltaron dos peticiones de
--      permiso en el móvil: los ayudantes siguen las mismas normas que Claude.
-- Tipo:     inserta las lecciones si no existen. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Productos y servicios, las mismas funciones', 'negocio', 1,
   'Los servicios son parte de la tienda igual que los productos: lo que tiene la ficha de producto lo tiene la de servicio (galería con zoom, «me gusta», «Preguntar por…» que abre Blue IA y desde ahí el chat de la tienda, la ficha con pestañas, «Volver atrás»), las listas usan la misma tarjeta (TarjetaProducto en components/CategoryProductsShelf.tsx) y la pestaña «Me gusta» de Perfil junta productos y servicios. Nada de WhatsApp para preguntar: el chat de la tienda. Cuando se añade algo a uno, se valora en la misma PR si toca también al otro.',
   'Un «me gusta» solo para productos, un botón de WhatsApp en la ficha de servicio y tarjetas distintas en Servicios.',
   'Corazón en las dos fichas, «Preguntar por este servicio» abre Blue IA y la lista de Servicios con la tarjeta del Catálogo.'),
  ('Reseñas de servicios: solo de una solicitud propia entregada', 'seguridad', 1,
   'Una reseña de servicio va unida a una solicitud (store_reviews.service_request_id) y la base de datos solo la acepta si es del cliente que la escribe y está «entregado», una sola vez; el servicio y su nombre los copia la base de datos de la solicitud, nunca del navegador (disparador store_reviews_before_insert, migración 20261103210000). Se pide en «Mis seguimientos» («Valorar el servicio») y en el aviso de Blue al entregarlo; la ficha del servicio enseña la media y las opiniones; Administración ve la de cada solicitud. Se prueba con PostgreSQL aislado (pruebas/perfiles-sql.mjs, sección 24, con control) y con el navegador (sección RS).',
   'Dejar que la ficha del servicio mande service_id al publicar la reseña, o pedirla antes de entregar.',
   'El navegador manda solo service_request_id; la base de datos comprueba dueño y etapa y pone el servicio.'),
  ('Los ayudantes siguen las mismas normas: un comando simple por llamada', 'general', 1,
   'Al encargar trabajo a ayudantes (subagentes), el encargo dice expresamente las normas del servidor: un comando simple por llamada, sin tuberías (|), sin «;», sin «&&», sin bucles «for» ni «xargs», leer con Read/Grep/Glob y no ejecutar SQL ni salir a la red si no hace falta. Un comando compuesto le hace saltar al dueño una petición de permiso en el móvil. Si un ayudante se para (por ejemplo por el límite de uso), Claude sigue con comandos simples y le explica al dueño que puede denegar esas peticiones.',
   'Mandar a un ayudante «busca X» sin más y que lance «for f in …; do grep … | head; done».',
   'El encargo dice: «solo Read, Grep y Glob; nada de tuberías, bucles ni comandos encadenados».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
