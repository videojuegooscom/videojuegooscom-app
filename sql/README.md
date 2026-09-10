# Carpeta `sql/` — qué es esto y cómo funciona Supabase aquí

## Qué cambió hoy

Antes había **18 archivos sueltos**, cada uno con el nombre de una sola cosa
(`product_likes.sql`, `product_views.sql`, `sell_requests.sql`...). Todos
esos archivos documentaban cambios que **ya se ejecutaron una vez, a mano,
en el editor SQL de Supabase**, en algún momento del pasado — no eran una
lista de cosas pendientes, sino un cuaderno de "esto es lo que hice".

Se han **agrupado en 6 archivos**, por tema, sin tocar ni una línea del SQL
original (solo se reorganizó y se le puso una cabecera explicando qué trae
cada uno):

| Archivo nuevo | Qué trae | Venía de |
|---|---|---|
| `01-catalogo-productos.sql` | Productos, categorías, fotos/vídeos, referencia, "me gusta", visitas | products, product_media, product_reference, product_likes, product_views, home_categories_seed |
| `02-servicios.sql` | Servicios (reparación/limpieza), sus fotos y las solicitudes de contratación | services, service_media, service_requests |
| `03-ventas-y-cotizaciones.sql` | Solicitudes de "Vender ahora", sus fotos, y ventas registradas | sell_requests, sell_request_media, product_sales |
| `04-chat-y-resenas.sql` | Chat privado por producto y reseñas de la tienda | product_chats, store_reviews |
| `05-usuarios-y-administracion.sql` | Ascender a alguien a admin, buscar usuarios por id, caja personal | promote_admin, admin_users_by_ids, personal_cash_state |
| `06-inventario.sql` | Control interno de existencias | inventory_items |

Los 18 archivos originales se han retirado (movidos a borrar) porque todo su
contenido sigue ahí, dentro de estos 6, palabra por palabra — no se perdió
nada, solo se ordenó.

**Importante:** todo lo de estos 6 archivos ya está funcionando en
producción. No hay que ejecutar nada de aquí de nuevo — es solo el "manual"
de qué hay en la base de datos y por qué.

## Cómo funciona Supabase en este proyecto (para que lo tengas claro)

Supabase es, en el fondo, una base de datos Postgres (el motor de bases de
datos) con varias cosas ya montadas encima para no tener que programarlas
tú: el inicio de sesión de usuarios (Auth), el almacenamiento de fotos/vídeos
(Storage) y una forma de que la app hable directamente con la base de datos
desde el móvil/navegador sin pasar por un servidor propio.

Tres piezas que vas a ver mencionadas todo el rato en los comentarios del
código:

- **Tablas**: donde vive cada dato — `products` son los productos,
  `profiles` es quién es cada usuario y si es admin, etc.
- **RLS (Row Level Security)**: el "guardia de seguridad" de cada tabla.
  Decide, fila por fila, quién puede leer/crear/editar/borrar qué. Por
  ejemplo: cualquiera puede LEER los productos publicados, pero solo el
  admin puede editarlos o borrarlos. Esto es lo que hace que la app sea
  segura aunque hable directamente con la base de datos.
  - Ver: [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- **Funciones**: trozos de lógica que viven en la base de datos, como
  `is_admin()` (¿esta persona es administrador?) o
  `increment_product_view()` (suma 1 a las visitas de un producto). Se
  llaman desde la app con `supabase.rpc("nombre_funcion", {...})`.

## Dos formas distintas de cambiar la base de datos (y por qué había líos)

1. **A mano, en el editor SQL de Supabase** (lo que se hizo hasta ahora, de
   ahí estos 18 archivos): funciona, pero Supabase no se entera de que ese
   cambio pasó — no queda ningún registro oficial, solo lo que tú
   apuntaste en tu propio archivo.
2. **Con "migraciones"** (lo que estoy usando yo desde hoy, a través de la
   conexión directa con tu proyecto): cada cambio que hago queda grabado
   automáticamente en el propio historial de Supabase, con fecha, nombre y
   el SQL exacto que se ejecutó — se puede consultar en cualquier momento
   sin depender de ningún archivo local. Ahora mismo tu proyecto ya tiene
   6 de estos cambios registrados así (Noticias Flash, Políticas y Blog,
   Analítica de visitas, y el listado de usuarios del panel de admin).

**A partir de ahora**, todo lo que yo cambie en tu base de datos queda
registrado solo en Supabase, sin que hagan falta más archivos sueltos en
esta carpeta — así que no deberías ver crecer de nuevo esta carpeta con un
archivo por cada cosita. Si algún día quieres un resumen legible de todos
los cambios recientes, solo pídemelo y te lo saco del historial real.
