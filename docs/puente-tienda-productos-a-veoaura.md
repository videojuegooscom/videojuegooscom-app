# Puente tienda → VeoAura: evento «producto_tienda» (productos creados a mano en la tienda)

**Qué es:** el contrato del evento nuevo del puente de vuelta (tienda → VeoAura) para los productos que el dueño crea a mano en Administración → Productos de la tienda (sin `id_veoaura`). VeoAura los da de alta en su Stock y devuelve su id, para que `vendido` y `retirar` funcionen después con él. Está escrito para pegárselo tal cual a la sesión de VeoAura.
**Conectado con:** `api/escaparate-retorno.ts` (el emisor), `api/escaparate-veoaura.ts` (recibe `vendido`/`retirar` con ese id), la migración `supabase/migrations/20261113130000_escaparate_salida_productos.sql` (tabla `escaparate_salida_productos`), `app/admin/products.tsx` y `app/admin/escaparate.tsx` (el estado se ve en Administración) y `pruebas/escaparate-retorno.mjs` (secciones L a R).

Decisión del dueño (2026-11-13): cuando se crea un producto a mano en la tienda, se avisa a VeoAura para que lo dé de alta en su Stock, y la tienda guarda el id que devuelva.

## Envío

Igual que los otros avisos del puente de vuelta (`pedido`, `pedido_anulado`, `estadisticas`):

- `POST` a la dirección HTTPS del receptor de VeoAura del puente de vuelta (la misma de siempre, `VEOAURA_RETORNO_URL`; la tienda no sigue redirecciones).
- Cabeceras `X-Tienda-Fecha` (segundos Unix), `X-Tienda-Nonce` (32 hex, de un solo uso) y `X-Tienda-Firma` = `sha256=` + HMAC-SHA256 en hex de `fecha.nonce.cuerpo`, con el secreto del puente de vuelta de siempre (`VEOAURA_RETORNO_SECRETO`, distinto del de ida). La firma se calcula sobre el texto exacto que se envía.
- Tiempo máximo de espera de la tienda: 8 segundos por envío.

## Cuerpo

```json
{
  "version": 1,
  "evento": "producto_tienda",
  "id_mensaje": "uuid de este aviso",
  "producto": {
    "id_tienda": "uuid del producto en la tienda",
    "titulo": "Mando PS5 DualSense",
    "descripcion": "Como nuevo, con caja.",
    "precio": 49.5,
    "moneda": "EUR",
    "estado": "PUBLISHED",
    "condicion": "GOOD",
    "categoria": "Mandos",
    "fotos": ["https://…/storage/v1/object/public/product-media/…/1.jpg"],
    "creado_en": "2026-11-13T09:00:00.000Z"
  },
  "enviado_en": "2026-11-13T09:02:10.000Z"
}
```

- `id_tienda`: el id del producto en la tienda (uuid). Es la clave de idempotencia del producto: un mismo `id_tienda` es siempre el mismo artículo.
- `titulo` (hasta 200 caracteres) y `descripcion` (hasta 5000, puede venir vacía): texto sin espacios sobrantes.
- `precio`: número con hasta 2 decimales, en euros (`moneda` siempre `"EUR"`); puede ser `null` si el producto no tiene precio válido.
- `estado`: el estado de la ficha en la tienda: `DRAFT`, `REVIEW` o `PUBLISHED`. `condicion`: `NEW`, `LIKE_NEW`, `GOOD`, `FAIR` o `PARTS` (nuevo, como nuevo, bueno, aceptable, para piezas).
- `categoria`: el nombre de la categoría en la tienda (texto) o `null`.
- `fotos`: hasta 15 direcciones públicas HTTPS de las fotos, en el orden de la tienda (sin vídeos). Puede venir vacía. Las fotos se suben a la tienda después de crear la ficha: por eso la tienda espera un minuto a que el producto deje de cambiar antes de enviarlo.
- `id_mensaje`: identifica ESTE aviso. Si el producto cambia (título, precio, fotos…) antes de que VeoAura lo acepte, llega otro aviso con el mismo `id_tienda` y un `id_mensaje` nuevo. Un reintento del mismo aviso lleva el mismo `id_mensaje`.

**Nunca** lleva datos de clientes ni de pedidos: solo datos del producto.

## Respuesta esperada

HTTP 200 con:

```json
{ "ok": true, "id_veoaura": "uuid del artículo en el Stock de VeoAura" }
```

- `id_veoaura` tiene que ser un uuid (la tienda lo guarda en `products.id_veoaura`, que es único).
- Cualquier otra cosa cuenta como «no aceptado» y se reintenta: HTTP distinto de 200, `ok` distinto de `true`, falta `id_veoaura` o no es un uuid, redirección, o no responder a tiempo. Mientras VeoAura no entienda el evento (por ejemplo `400`/`404`, `{ "ok": false, "error": "evento desconocido" }`), el aviso queda pendiente en la tienda y no se rompe nada más; en cuanto VeoAura lo acepte, se recoge solo en el siguiente reintento.

## Idempotencia

- Por `id_tienda`: si VeoAura ya dio de alta ese producto, tiene que devolver el MISMO `id_veoaura` (no crear un artículo nuevo) y, si el aviso trae datos actualizados, ponerlos al día.
- Por `id_mensaje`: el mismo aviso reintentado se puede procesar una sola vez o repetir sin efecto; la respuesta es la misma.

## Reintentos

- Si no hay respuesta válida, la tienda reintenta con un mínimo de 1 minuto entre intentos, hasta 12 intentos seguidos y, después, uno cada 6 horas (y con el cron diario) mientras siga sin aceptarse.
- Los reintentos salen cuando el dueño guarda un producto, abre Administración → Escaparate o corre el cron diario de la tienda.

## Qué hace la tienda

- Solo avisa de los productos creados a mano **desde el 2026-11-13** y que **no tienen** `id_veoaura`. El catálogo anterior no se envía, y un producto que llegó de VeoAura (`publicar`) nunca se le devuelve.
- Al recibir `{ ok: true, id_veoaura }`, guarda ese id en el producto, **sin pisar** uno que ya tuviera. Si el uuid ya lo tiene otro producto de la tienda (índice único), no lo guarda y el aviso queda como error visible en Administración.
- Desde ese momento el producto ya tiene `id_veoaura`: no se vuelve a avisar y entra en las estadísticas diarias, y VeoAura puede mandar `vendido` y `retirar` (`api/escaparate-veoaura.ts`) con ese id y la tienda lo encontrará.
- En Administración, cada producto creado a mano muestra «Enviado a VeoAura · pendiente» o «Enviado a VeoAura · en VeoAura ✓» (Productos), y Escaparate lista esos avisos con su estado.

## Privacidad

Solo viajan datos del producto (título, descripción, precio, estado, condición, categoría, fotos y fecha). No hay ningún dato personal.
