# Puente VeoAura → VideojuegosZaragoza: evento «venta_tienda» (ventas en mano)

**Qué es:** el contrato del evento nuevo del puente de ida (VeoAura → tienda) para las ventas en mano que se registran en VeoAura. Está escrito para pegárselo tal cual a la sesión de VeoAura.
**Conectado con:** `api/escaparate-veoaura.ts` (el receptor), `api/factura.ts` (une la compra a la cuenta al entrar el cliente), `api/escaparate-retorno.ts` (no la devuelve), la migración `supabase/migrations/20261111170000_ventas_tienda_veoaura.sql` y las pruebas `pruebas/escaparate-fotos.mjs` (sección VT) y `pruebas/escaparate-retorno.mjs` (sección K).

Decisión del dueño (2026-11-11, opción A): las ventas en mano se registran en VeoAura, que hace la factura (REBU). VeoAura manda cada venta a la tienda con el correo del cliente. La tienda la une a la cuenta que tenga ese correo y el cliente ve la compra y su factura en «Mis pedidos». Si aún no hay ninguna cuenta con ese correo, la venta se guarda y se une sola cuando el cliente se registra o entra con ese correo.

## Envío

Igual que los otros eventos del puente de ida (`publicar`, `vendido`, `retirar`, `seguimiento`, `factura`):

- `POST https://videojuegoszaragoza.com/api/escaparate-veoaura` (sin `www`: la tienda no sigue redirecciones).
- Cuerpo JSON de 100 KB como máximo.
- Cabeceras `X-Veoaura-Fecha` (segundos Unix, 10 cifras), `X-Veoaura-Nonce` (32 hex, de un solo uso) y `X-Veoaura-Firma` = `sha256=` + HMAC-SHA256 en hex de `fecha.nonce.cuerpo`, con el mismo secreto del puente de ida de siempre. La firma se calcula sobre el texto exacto que se envía.
- La fecha tiene que estar a 5 minutos o menos de la hora de la tienda, y un nonce no se puede repetir en 10 minutos.

## Cuerpo

```json
{
  "version": 1,
  "evento": "venta_tienda",
  "id_veoaura": "0f6c2a8e-3b1d-4c55-9e0a-7d2b1c4e9f10",
  "venta": {
    "id_venta": "0f6c2a8e-3b1d-4c55-9e0a-7d2b1c4e9f10",
    "fecha": "2026-11-11",
    "total_eur": 254.9,
    "forma_pago": "bizum",
    "lineas": [
      { "id_veoaura": "5a1e7c3b-2d4f-4b6a-8c9d-0e1f2a3b4c5d", "titulo": "PlayStation 5 Slim", "precio_eur": 229.9, "cantidad": 1 },
      { "titulo": "Funda protectora", "precio_eur": 12.5, "cantidad": 2 }
    ],
    "cliente": { "correo": "cliente@example.com", "nombre": "Ana" },
    "factura": {
      "id_veoaura": "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      "numero_factura": "F-2026-0042",
      "fecha": "2026-11-11",
      "total_eur": 254.9,
      "pdf_url": "https://…enlace temporal al PDF…"
    }
  }
}
```

| Campo | Obligatorio | Formato |
|---|---|---|
| `id_veoaura` | sí | uuid de la venta en VeoAura (lo piden todos los eventos). |
| `venta.id_venta` | no | Id único de la venta, hasta 64 letras, cifras o `. _ : -`. Si falta, se usa `id_veoaura`. Es la clave para no duplicar: conviene que sea el mismo uuid. |
| `venta.fecha` | sí | `AAAA-MM-DD` o fecha y hora ISO 8601 (con zona). Una fecha que exista, desde 2020 y no más de un día en el futuro. |
| `venta.total_eur` | sí | Número ≥ 0, en euros, IVA incluido: lo que se cobró. Tiene que ser **exactamente** (al céntimo) la suma de `precio_eur × cantidad` de las líneas. Un descuento va ya restado en el precio de la línea. |
| `venta.forma_pago` | sí | `efectivo`, `tarjeta`, `bizum`, `transferencia` u `otro`. |
| `venta.lineas` | sí | De 1 a 50. Cada una: `titulo` (≤ 200, obligatorio), `precio_eur` (número ≥ 0, por unidad, obligatorio), `cantidad` (entero 1-99, por defecto 1) y `id_veoaura` (opcional, uuid del artículo en VeoAura). |
| `venta.cliente.correo` | sí | El correo del cliente (≤ 160). Es lo único con lo que la tienda une la compra a su cuenta. |
| `venta.cliente.nombre` | no | ≤ 120. Se enseña al administrador; sin él, «Cliente». |
| `venta.factura` | no | La factura de la venta, con los mismos campos que el evento `factura` (`numero_factura` ≤ 40, `fecha` `AAAA-MM-DD`, `total_eur` ≥ 0, `pdf_url` https, PDF de 5 MB como máximo, enlace válido al menos 10 minutos y sin redirecciones) más `id_veoaura` (uuid de la factura en VeoAura). |

No se manda ni se guarda el teléfono, la dirección ni ningún otro dato del cliente. Los campos desconocidos se ignoran.

## Factura enviada después

Si la factura se emite más tarde, se manda con el evento `factura` de siempre, pero en vez de `numero_pedido` con `id_venta`:

```json
{ "version": 1, "evento": "factura", "id_veoaura": "<uuid de la factura>",
  "factura": { "id_venta": "<el id_venta de la venta>", "numero_factura": "F-2026-0042", "fecha": "2026-11-11", "total_eur": 254.9, "pdf_url": "https://…" } }
```

Respuesta `200 { "ok": true, "id_tienda": "<id de la factura>", "id_venta": "…" }`; `404` si la tienda aún no tiene esa venta (mandar antes la venta). Reenviar la misma factura (mismo `id_veoaura`) la pone al día sin duplicarla (factura rectificada).

## Respuestas

- `200 { "ok": true, "id_tienda": "<id del pedido en la tienda>", "codigo_seguimiento": "VZ-XXXX-XXXX", "repetida": false, "factura": "<id de la factura o null>" }`: guardada. `codigo_seguimiento` es la referencia que ve el cliente en «Mis pedidos» (se puede imprimir en el tique si se quiere).
- `200` con `"repetida": true`: esa venta (mismo `id_venta`) ya estaba; no se ha duplicado. Si trae factura, se pone al día.
- `400 { "ok": false, "error": "…" }`: algún campo falta o no vale (por ejemplo «el total no es la suma de las líneas», «correo del cliente no válido», «forma de pago no válida»). No reintentar sin corregirlo.
- `401`: firma, fecha o nonce no válidos (o nonce repetido). Reintentar con fecha y nonce nuevos.
- `413`: cuerpo de más de 100 KB.
- `503`: la tienda aún no tiene activadas las ventas en mano (o el receptor está sin configurar). Reintentar más tarde.
- `500`: error al guardar. Reintentar.

## Reintentos e idempotencia

- La clave es `id_venta`: reenviar la misma venta las veces que haga falta nunca la duplica. Si un envío se cortó a medias, el reenvío completa las líneas que faltaran.
- Reintentar ante `401` (con fecha y nonce nuevos), `5xx` o si no hay respuesta en 8 segundos. Por ejemplo a los 1, 5 y 30 minutos y después cada hora, hasta 12 intentos. Ante `400`, no.
- Cada intento lleva su propio nonce y su propia fecha.

## Qué hace la tienda

1. Comprueba la firma y los campos, y responde **después** de guardar.
2. Guarda la venta como un pedido más de la tienda: `origen = tienda_fisica`, ya **pagado y entregado**, con su referencia `VZ-XXXX-XXXX` (la pone la base de datos), su forma de pago y una línea por artículo («2 × Funda protectora» con su importe si hay varias unidades). Sin envío: el total es lo cobrado.
3. Si una línea trae el `id_veoaura` de un artículo que está publicado en la tienda, lo marca **vendido** (igual que el evento `vendido`).
4. Justo después de responder: si existe una cuenta con ese correo (igual, sin distinguir mayúsculas, y con el correo **confirmado**), la venta pasa a esa cuenta. Si no, queda «pendiente» y se une sola cuando el cliente entra en «Mis pedidos» con una cuenta con ese correo confirmado.
5. Si viene la factura, guarda la fila y baja el PDF a un almacén privado (si el PDF falla, queda «PDF pendiente» hasta que se reenvíe la factura).
6. El cliente la ve en «Mis pedidos» como «Compra en tienda VZ-… · total · fecha», con «Pagado con …», «Entregado» y «Descargar factura». El administrador la ve en Pedidos con la etiqueta «En tienda» y si está unida a una cuenta o pendiente de que se registre ese correo; Analítica cuenta las ventas en tienda frente a las online (sin datos personales).
7. **No la devuelve a VeoAura:** el puente de vuelta (`pedido`, `pedido_pagado`) no manda nada de estas ventas, porque vienen de VeoAura.
8. Apunta cada mensaje en su registro sin datos personales (ni correo ni nombre): solo el id de la venta, la referencia, cuántas líneas, la forma de pago y si se ha unido a una cuenta.

## Privacidad

La política de privacidad de la tienda dice: «Si nos compras en persona y nos das tu correo, nuestro programa de gestión (VeoAura) nos envía esa compra y su factura para que las veas en «Mis pedidos» de tu cuenta; tu correo solo se usa para unirla a tu cuenta.» Por eso VeoAura solo debe mandar las ventas de clientes que han dado su correo para esto.
