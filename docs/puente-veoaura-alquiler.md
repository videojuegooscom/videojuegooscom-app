# Puente VeoAura ↔ VideojuegosZaragoza: alquiler de artículos («En Escaparate para Alquilar»)

**Qué es:** el contrato del alquiler de artículos entre VeoAura y la tienda, escrito para pegárselo tal cual a la sesión de VeoAura. Tiene dos partes: el botón nuevo de VeoAura que manda un artículo a la tienda **para alquilar** (puente de ida) y los avisos que la tienda manda a VeoAura de cada movimiento del alquiler (puente de vuelta), para que VeoAura lleve la contabilidad (coste, facturas y rentabilidad).
**Conectado con:** `api/escaparate-veoaura.ts` (receptor de ida, se ampliará en la fase 3), `api/escaparate-retorno.ts` (emisor de vuelta, fase 3), la migración `supabase/migrations/20261117100000_alquiler_base.sql` (fase 1: `products.modo`, `alquiler_unidades`, `alquileres`, `alquiler_ajustes` y la categoría «Alquílalo ahora»), `lib/alquiler.ts` (precios, recargo y compra tras el alquiler) y `app/admin/alquileres.tsx` (Administración → Alquileres). Sigue el formato de `docs/puente-tienda-productos-a-veoaura.md` y `docs/puente-veoaura-ventas-en-mano.md`.

Decisiones del dueño (2026-11-17):

- Categoría propia en la tienda: **«Alquílalo ahora»**. Solo Zaragoza.
- Cada artículo de VeoAura es **una unidad física** y tiene **una ficha** en la tienda.
- Planes de **1, 2, 3 y 4 meses**, IVA incluido. El precio es un porcentaje del precio de venta que fija el dueño en Administración (con una PS5 de 550 €: 54,90 €, 99 €, 139 € y 179 €); el dueño también puede poner los precios a mano en cada artículo.
- **Fianza** fija (150 €, configurable) **sin IVA**, que se devuelve al recoger y revisar el artículo; se descuentan los daños o la pérdida con su motivo.
- **Recargo por retraso** de 3 € por día, con 1 día de cortesía y como máximo el importe de la fianza.
- **«Alquílalo y, si te gusta, cómpralo»:** lo pagado en alquiler se descuenta del precio de venta y el cliente paga 50 € más (configurable). Ejemplo: 550 − 139 + 50 = 461 €.
- Cada unidad se alquila como mucho unos 3 meses en total y después se vende como revisada; en el plan de 4 meses la unidad se cambia por otra revisada en el mes 3, sin coste para el cliente.
- **La tienda no emite facturas.** VeoAura emite la factura de cada cobro (alquiler, recargo, descuento de fianza y compra tras el alquiler) y la manda a la tienda con el evento `factura` que ya existe.

Estado: **fase 1** (la tienda tiene la base de datos y Administración, APAGADO: el cliente no ve nada). El receptor de `publicar` con `destino: "alquiler"` y los avisos de vuelta se programan en la **fase 3**; hasta entonces VeoAura puede preparar su parte con este documento, pero no debe enviar todavía `destino: "alquiler"` (la tienda de hoy lo ignoraría y publicaría el artículo **a la venta**).

## 1. Puente de ida: botón «En Escaparate para Alquilar»

En VeoAura, junto al botón de siempre «En Escaparate» (que publica el artículo a la venta), un botón nuevo **«En Escaparate para Alquilar»**. Manda el **mismo evento `publicar`** de siempre, con el mismo sobre firmado, y dos campos nuevos dentro de `producto`.

### Envío

Igual que los demás eventos del puente de ida (`publicar`, `vendido`, `retirar`, `seguimiento`, `factura`, `venta_tienda`):

- `POST https://videojuegoszaragoza.com/api/escaparate-veoaura` (sin `www`: la tienda no sigue redirecciones).
- Cuerpo JSON de 100 KB como máximo.
- Cabeceras `X-Veoaura-Fecha` (segundos Unix, 10 cifras), `X-Veoaura-Nonce` (32 hex, de un solo uso) y `X-Veoaura-Firma` = `sha256=` + HMAC-SHA256 en hex de `fecha.nonce.cuerpo`, con el mismo secreto del puente de ida de siempre. La firma se calcula sobre el texto exacto que se envía.
- La fecha tiene que estar a 5 minutos o menos de la hora de la tienda, y un nonce no se puede repetir en 10 minutos.

### Cuerpo

```json
{
  "version": 1,
  "evento": "publicar",
  "id_veoaura": "5a1e7c3b-2d4f-4b6a-8c9d-0e1f2a3b4c5d",
  "producto": {
    "titulo": "PlayStation 5 Slim Con Lector",
    "categoria": "Consolas",
    "modelo": "CFI-2016",
    "estado": "Como nuevo",
    "accesorios": ["Mando DualSense", "Cable HDMI", "Cable de corriente"],
    "precio": 550,
    "moneda": "EUR",
    "fotos": ["https://…enlace temporal 1…", "https://…enlace temporal 2…"],
    "caracteristicas": [{ "etiqueta": "Almacenamiento", "valor": "1 TB" }],
    "mantenimiento": null,
    "destino": "alquiler",
    "coste_eur": 310
  }
}
```

| Campo | Obligatorio | Formato |
|---|---|---|
| `producto.destino` | no | `"venta"` (lo de siempre, también si falta) o `"alquiler"` (botón nuevo). Cualquier otro valor se rechaza con `400 destino no válido`. |
| `producto.precio` | sí | El **precio de venta** de la unidad, en euros con IVA (como siempre). Con `destino: "alquiler"` es la base de los precios de alquiler y de la compra tras el alquiler. |
| `producto.coste_eur` | no | Lo que le costó la unidad al dueño, en euros (número ≥ 0). **Solo lo ve Administración** (se guarda aparte, nunca en la ficha pública). Sirve para no ofrecer nunca la compra tras el alquiler por debajo del coste. Si falta, la tienda no lo pone a cero: deja el que tuviera. |

El resto de campos (`titulo`, `fotos`, `caracteristicas`, `mantenimiento`…) son exactamente los de siempre, con las mismas reglas.

### Qué hace la tienda al recibirlo (fase 3)

1. Comprueba la firma y los campos (las 11 comprobaciones de siempre) y responde **después** de guardar: `200 { "ok": true, "id_tienda": "<uuid>", "destino": "alquiler" }`.
2. Crea o pone al día la ficha por `id_veoaura`, como siempre, pero con `modo = alquiler` y en la categoría **«Alquílalo ahora»** (no en la de su consola). La ficha **no** se puede comprar como una venta normal: solo alquilar (y comprar tras el alquiler).
3. Guarda `coste_eur` en una tabla aparte que solo lee el administrador.
4. Calcula los precios de los cuatro planes con los porcentajes del dueño (o usa los que el dueño haya puesto a mano en ese artículo).
5. Mientras el alquiler esté **apagado** en Administración, la categoría está oculta y ningún cliente ve la ficha.
6. **Cambiar de destino:** un `publicar` del mismo `id_veoaura` con `destino: "venta"` lo pasa a la venta normal (por ejemplo, cuando la unidad ya ha cumplido sus meses de alquiler y se vende como revisada). La tienda **no** lo deja cambiar si hay un alquiler en curso de esa unidad: responde `409 { "ok": false, "error": "unidad alquilada" }` y VeoAura lo reintenta cuando se devuelva.
7. `vendido` y `retirar` funcionan igual que hoy. `retirar` de una unidad alquilada solo la oculta para nuevos alquileres; el alquiler en curso sigue.

### Respuestas

- `200 { "ok": true, "id_tienda": "…", "destino": "alquiler" | "venta" }`: guardado.
- `400 { "ok": false, "error": "…" }`: algún campo falta o no vale (por ejemplo «destino no válido» o «coste no válido»). No reintentar sin corregirlo.
- `401`: firma, fecha o nonce no válidos (o nonce repetido). Reintentar con fecha y nonce nuevos.
- `409 { "ok": false, "error": "unidad alquilada" }`: se pide pasar a venta una unidad con un alquiler en curso. Reintentar después.
- `503`: la tienda aún no tiene activado el alquiler en el receptor. Reintentar más tarde.

## 2. Puente de vuelta: avisos de la tienda a VeoAura

Cada movimiento del alquiler se avisa a VeoAura para que lleve la contabilidad (coste, facturas y rentabilidad de cada unidad) y emita las facturas.

### Envío

Igual que los otros avisos del puente de vuelta (`pedido`, `pedido_anulado`, `estadisticas`, `producto_tienda`):

- `POST` a la dirección HTTPS del receptor de VeoAura del puente de vuelta (la misma de siempre, `VEOAURA_RETORNO_URL`; la tienda no sigue redirecciones).
- Cabeceras `X-Tienda-Fecha` (segundos Unix), `X-Tienda-Nonce` (32 hex, de un solo uso) y `X-Tienda-Firma` = `sha256=` + HMAC-SHA256 en hex de `fecha.nonce.cuerpo`, con el secreto del puente de vuelta de siempre (`VEOAURA_RETORNO_SECRETO`, distinto del de ida). La firma se calcula sobre el texto exacto que se envía.
- Tiempo máximo de espera de la tienda: 8 segundos por envío.

### Cuerpo común

Todos los avisos del alquiler tienen la misma forma; solo cambia `evento` y el bloque `movimiento`:

```json
{
  "version": 1,
  "evento": "alquiler",
  "id_mensaje": "uuid de este aviso",
  "alquiler": {
    "id_alquiler": "uuid del alquiler en la tienda",
    "id_veoaura": "uuid del artículo (la unidad) en VeoAura",
    "titulo": "PlayStation 5 Slim Con Lector",
    "plan_meses": 3,
    "precio_venta_eur": 550,
    "precio_plan_eur": 139,
    "fianza_eur": 150,
    "cliente": { "correo": "cliente@example.com", "nombre": "Ana" }
  },
  "movimiento": { "tipo": "alquilada", "…": "…" },
  "enviado_en": "2026-12-01T10:00:00.000Z"
}
```

- `id_mensaje`: identifica ESTE aviso. Un reintento del mismo aviso lleva el mismo `id_mensaje`; VeoAura no debe apuntar dos veces el mismo movimiento.
- `alquiler.id_alquiler`: el mismo en todos los avisos de un alquiler. `id_veoaura`: la unidad (si hubo cambio de unidad en el mes 3, el movimiento `devuelta` dice cuál se devolvió).
- `cliente`: el correo y el nombre, **solo** para que VeoAura emita la factura a nombre del cliente (como en `venta_tienda`). No se mandan el teléfono ni la dirección.
- Importes en euros con dos decimales como mucho. El alquiler, el recargo y la compra llevan **IVA incluido**; la fianza **no** lleva IVA.

### Los siete movimientos

#### `alquilada`: el cliente ha reservado y aceptado el contrato

```json
"movimiento": {
  "tipo": "alquilada",
  "fecha": "2026-12-01T10:00:00.000Z",
  "inicio": "2026-12-02",
  "fin_previsto": "2027-03-02",
  "contrato_hash": "64 hex: huella SHA-256 del contrato aceptado"
}
```

VeoAura marca la unidad como alquilada (deja de estar disponible para la venta). No hay cobro todavía: no hay factura.

#### `alquiler_cobrado`: cobro del alquiler (del plan entero o de un mes)

```json
"movimiento": {
  "tipo": "alquiler_cobrado",
  "fecha": "2026-12-02T09:30:00.000Z",
  "importe_eur": 139,
  "concepto": "Alquiler de 3 meses",
  "forma_pago": "tarjeta",
  "referencia": "pi_… o «efectivo»",
  "pagado_acumulado_eur": 139
}
```

`forma_pago`: `tarjeta`, `bizum`, `efectivo` o `transferencia`. VeoAura **emite la factura** de este importe (IVA incluido) y la manda a la tienda con el evento `factura` de siempre, en vez de `numero_pedido` con `id_alquiler` (ver «Facturas» abajo). `pagado_acumulado_eur` es lo pagado de alquiler hasta ahora (sirve para la compra tras el alquiler).

#### `fianza_cobrada`

```json
"movimiento": { "tipo": "fianza_cobrada", "fecha": "2026-12-02T09:30:00.000Z", "importe_eur": 150, "forma_pago": "efectivo", "referencia": "efectivo" }
```

Sin IVA y **sin factura**: es una garantía, no un ingreso. VeoAura la apunta como dinero del cliente pendiente de devolver.

#### `devuelta`: el artículo vuelve a la tienda

```json
"movimiento": {
  "tipo": "devuelta",
  "fecha": "2027-03-04T18:00:00.000Z",
  "id_veoaura_devuelta": "uuid de la unidad que se devuelve",
  "dias_retraso": 2,
  "recargo_eur": 3,
  "cambio_de_unidad": false
}
```

- `recargo_eur`: el recargo por retraso (3 € por día tras 1 día de cortesía, tope la fianza), **IVA incluido**. Si es mayor que 0, VeoAura emite su factura como un cobro más (con `factura` e `id_alquiler`). Normalmente se descuenta de la fianza.
- `cambio_de_unidad: true` cuando es el cambio del mes 3 del plan de 4 meses: la unidad devuelta vuelve a VeoAura y el alquiler sigue con otra unidad; el aviso trae además `"id_veoaura_nueva": "uuid de la unidad entregada"`. Sin cobro ni factura.
- Después de `devuelta`, la unidad queda en revisión en VeoAura; cuando cumple sus meses de alquiler (unos 3), VeoAura la puede volver a publicar **a la venta** con `destino: "venta"`.

#### `fianza_devuelta`

```json
"movimiento": { "tipo": "fianza_devuelta", "fecha": "2027-03-05T12:00:00.000Z", "importe_eur": 147, "forma_pago": "bizum", "referencia": "bizum" }
```

Lo que se devuelve al cliente (la fianza menos el recargo o los descuentos, si los hubo). Sin factura.

#### `fianza_descontada`: daños o pérdida

```json
"movimiento": {
  "tipo": "fianza_descontada",
  "fecha": "2027-03-05T12:00:00.000Z",
  "importe_eur": 25,
  "motivo": "Falta el cable HDMI original"
}
```

`motivo` (≤ 500, obligatorio) es el mismo que se le explica al cliente. VeoAura apunta el importe como ingreso por indemnización y **decide con su gestor** si lleva factura y con qué IVA (ver el contrato, apartado 10). Si lleva factura, la manda con `factura` e `id_alquiler`.

#### `compra_tras_alquiler`: el cliente se queda el artículo

```json
"movimiento": {
  "tipo": "compra_tras_alquiler",
  "fecha": "2027-02-15T11:00:00.000Z",
  "precio_venta_eur": 550,
  "pagado_alquiler_eur": 139,
  "plus_eur": 50,
  "importe_eur": 461,
  "forma_pago": "tarjeta",
  "referencia": "pi_…"
}
```

`importe_eur` = `precio_venta_eur` − `pagado_alquiler_eur` + `plus_eur` (aquí 550 − 139 + 50 = 461 €). En total el dueño recibe el precio de venta más el plus (139 + 461 = 600 €). La unidad queda **vendida** en VeoAura (como con `vendido`). VeoAura **emite la factura** de los 461 € (IVA incluido; si la unidad va por REBU, lo decide VeoAura con su gestor) y la manda con `factura` e `id_alquiler`. La tienda nunca ofrece la compra por debajo del `coste_eur` de la unidad.

### Respuesta esperada

HTTP 200 con `{ "ok": true }`. Cualquier otra cosa cuenta como «no aceptado» y se reintenta (HTTP distinto de 200, `ok` distinto de `true`, redirección o no responder a tiempo). Mientras VeoAura no entienda el evento (`400`/`404`, `{ "ok": false, "error": "evento desconocido" }`), el aviso queda pendiente en la tienda y no se rompe nada más.

### Idempotencia y reintentos

- Por `id_mensaje`: el mismo aviso reintentado se procesa una sola vez (o se repite sin efecto) y la respuesta es la misma.
- La tienda reintenta con un mínimo de 1 minuto entre intentos, hasta 12 intentos seguidos y, después, uno cada 6 horas (y con el cron diario) mientras siga sin aceptarse. Los avisos de un mismo alquiler salen **en orden** (no se manda `fianza_devuelta` antes que `devuelta`).

## 3. Facturas

La tienda **no** numera ni emite facturas. Para cada cobro con factura (`alquiler_cobrado`, el `recargo_eur` de `devuelta`, `fianza_descontada` si el gestor dice que la lleva y `compra_tras_alquiler`), VeoAura emite la factura y la manda con el evento `factura` que ya existe, pero en vez de `numero_pedido` con `id_alquiler`:

```json
{ "version": 1, "evento": "factura", "id_veoaura": "<uuid de la factura en VeoAura>",
  "factura": { "id_alquiler": "<uuid del alquiler en la tienda>", "numero_factura": "F-2026-0101", "fecha": "2026-12-02", "total_eur": 139, "pdf_url": "https://…" } }
```

Mismas reglas que hoy: PDF de 5 MB como máximo, enlace https válido al menos 10 minutos y sin redirecciones; reenviar la misma factura (mismo `id_veoaura`) la pone al día sin duplicarla. El cliente la descarga en su cuenta («Mis alquileres», fase 2) y el administrador en Administración → Alquileres. Respuesta `200 { "ok": true, "id_tienda": "…", "id_alquiler": "…" }`; `404` si la tienda no tiene ese alquiler.

## 4. Privacidad

Solo viajan los datos del artículo, los importes y, en los avisos de vuelta, el correo y el nombre del cliente para la factura. Antes de activar el alquiler, la política de privacidad de la tienda dirá que los datos del alquiler se comparten con VeoAura para emitir las facturas (se cambia en la fase 2, con el alquiler aún apagado).
