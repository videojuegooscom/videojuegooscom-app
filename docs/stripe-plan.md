# Plan de integración de Stripe (solo modo prueba)

Estado: **plan, nada construido ni conectado**. Redactado el 2026-10-18. No se conecta ningún pago real y
ninguna clave pasa por el chat: las pone el dueño directamente en Vercel.

## 0. Cómo es hoy el pago (leído del código y de la base de datos, no supuesto)

- «Comprar ya» y la cesta llevan a `/checkout` (`app/checkout.tsx`). Ahí se llama a la función
  `crear_pedido(p_datos, p_productos)` de Supabase, que guarda el pedido con **estado `pendiente`** y calcula el
  total con los precios reales de la base de datos (no con los del navegador). No hay ningún cobro: el equipo sigue
  la compra por el chat.
- `crear_pedido` ignora en silencio los artículos que ya no están publicados (solo falla si no queda ninguno), así
  que el total puede ser menor que el de la cesta.
- **No hay protección contra pedidos duplicados en el servidor**: la pantalla bloquea el botón mientras envía, pero
  si el navegador reintenta tras un corte de red se pueden crear dos pedidos iguales.
- Las reservas de la cesta duran 15 minutos (`reservas_cesta`, `reservar_producto`, `liberar_reserva`).
- Las funciones de `api/` usan `@supabase/supabase-js` con la clave de servidor `SUPABASE_CLAVE_SERVIDOR`, firma
  HMAC con Web Crypto (sin dependencias nuevas) y responden sin caché. El puente de VeoAura es el modelo a copiar.
- Lección del Centro de Aprendizajes: las variables con claves llevan **nombres en español** (el guardián confunde
  `SERVICE_ROLE` con una clave) y valores sin ñ ni tildes.

## 1. Diseño

**Stripe Checkout alojado** (el cliente paga en una página de stripe.com y vuelve a la tienda). Es lo más
seguro y barato de mantener: los datos de tarjeta nunca tocan nuestro servidor ni nuestra web (alcance PCI mínimo).
No se usa ninguna librería nueva: se llama a la API de Stripe con `fetch` desde `api/`.

Flujo:

1. En `/checkout`, si hay sesión, el cliente rellena sus datos y pulsa «Pagar». Sin sesión: se le lleva a iniciar
   sesión o registrarse y vuelve (ya está hecho con `videojuegoszaragoza:volver_tras_acceso`).
2. `POST /api/stripe-sesion` (nueva) comprueba el token de Supabase del cliente, crea el pedido pendiente con
   `crear_pedido`, reserva los artículos y crea la sesión de Checkout con **los importes y títulos sacados de
   `pedido_items`**, nunca del navegador. Devuelve la dirección de Stripe y la tienda redirige.
3. La página de Stripe muestra, por artículo, título, descripción y fotos (Checkout admite hasta 8 imágenes por
   línea con `product_data.images`, direcciones https públicas; las nuestras salen del bucket `product-media`) y el
   logo y colores de marca configurados en el panel de Stripe (azul #1EA7E8). **A comprobar en modo prueba** cómo
   enseña Stripe varias fotos.
4. `POST /api/stripe-webhook` (nueva) recibe de Stripe el resultado y es la **única fuente de verdad** del pago. La
   página de «gracias» solo muestra el estado leído de nuestra base de datos, nunca confía en el redireccionamiento.

### Seguro por defecto: interruptor y modo prueba solo para administradores

Variable `PAGOS_STRIPE_MODO` = `desactivado` (por defecto) | `prueba` | `real`.

- `desactivado`: todo igual que hoy. El botón de Stripe no existe y la función responde 503.
- `prueba`: solo los administradores ven «Pagar con Stripe (prueba)». Los clientes siguen con el pedido actual.
- `real`: lo activa el dueño tras revisar la lista final (apartado 6). **No se pasa a `real` en este plan.**

## 2. Webhook de confirmación de pago

- Dirección: `https://videojuegoszaragoza.com/api/stripe-webhook` (**sin www**: Stripe no sigue redirecciones).
- Se necesita el cuerpo **sin procesar** para verificar la firma. En Vercel se desactiva el analizador de cuerpo de esa
  función (`export const config = { api: { bodyParser: false } }`). **A comprobar en la vista previa.**
- Verificación: cabecera `Stripe-Signature` (`t=…,v1=…`), HMAC-SHA256 de `t.cuerpo` con el secreto del webhook
  (Web Crypto, comparación en tiempo constante) y ventana de 300 s. Si no cuadra: 400 y nada se guarda.
- Eventos que se tratan: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. El resto se ignora con 200.
- Responde 200 solo después de guardar; si falla, 500 y Stripe reintenta (hasta 3 días).

## 3. Pagos fallidos

- Tarjeta rechazada: Stripe deja al cliente en su página para probar otra tarjeta. No hace falta código nuestro.
- Pago asíncrono fallido o sesión caducada: el webhook marca `estado_pago = 'fallido'` o `'caducado'`, libera la
  reserva de los artículos (`liberar_reserva`) y el pedido queda `pendiente` sin cobrar. El cliente ve en «Mis
  pedidos» «Pago no completado» con un botón «Reintentar» que crea una sesión nueva (misma idempotencia, apartado 4).
- Stripe exige que una sesión dure como mínimo 30 minutos, y hoy la reserva es de 15. La reserva de los pedidos
  pagados con Stripe pasará a 30 minutos (`expires_at` de la sesión) y se libera al caducar.
- Si el pago llega pero el artículo ya se vendió por otra vía (VeoAura en tienda física, otro cliente), el webhook
  **reembolsa automáticamente** y avisa al equipo por el chat. Cada artículo es una unidad única.

## 4. Prevención de pedidos duplicados

Cuatro capas, de menor a mayor garantía:

1. Botón bloqueado mientras envía (ya existe).
2. `Idempotency-Key` en la llamada a Stripe = identificador del pedido: reintentar no crea otra sesión.
3. Restricción `unique` en `pedidos.stripe_session_id`: dos sesiones no pueden apuntar al mismo pedido y un pedido
   no puede tener dos sesiones activas (se reutiliza la abierta).
4. Tabla `stripe_eventos` con el identificador del evento como clave primaria: si Stripe reenvía el mismo evento
   (lo hace), el segundo intento ve que ya se procesó y responde 200 sin tocar nada. Marcar el pedido pagado y
   registrar el evento va en **una sola función SQL** (una transacción).

La clave de pedido del cliente ya está **preparada en la PR #77** (`crear_pedido_idempotente`: un reintento devuelve el
pedido existente en lugar de crear otro; sin aplicar, pendiente de la autorización del dueño). Stripe reutilizará esa
misma clave como `Idempotency-Key`. Por eso las capas 2 y 3 se apoyan en esa PR y no hace falta rehacerlas.

## 5. Protección de datos de los clientes

- Nunca se guardan datos de tarjeta, solo `stripe_session_id`, `stripe_payment_intent` y el estado.
- Seguridad a nivel de fila: se mantienen las políticas actuales (el cliente solo ve sus pedidos; el administrador
  ve todos). `stripe_eventos` no tiene ninguna política: solo la lee y escribe el servidor con la clave de servidor.
- El webhook y la creación de sesión usan `SUPABASE_CLAVE_SERVIDOR` solo en `api/`; nunca llega al navegador.
- No se registran cuerpos de petición ni cabeceras en los logs de Vercel, solo identificador de evento y resultado.
- Para crear la sesión se verifica el token del cliente en el servidor: nadie puede pagar pedidos de otro usuario.
- Textos legales: privacidad debe nombrar a Stripe como encargado del pago. **Lo redacta o aprueba el dueño** (no se
  inventan datos legales). Pendiente también el correo de contacto de protección de datos.

## 6. Configuración segura en Vercel (la hace el dueño; Claude no ve los valores)

Nombres propuestos (en español, valores sin ñ ni tildes):

| Variable | Qué es | Entornos |
|---|---|---|
| `STRIPE_CLAVE_SECRETA` | Clave secreta de Stripe (`sk_test_…` en pruebas) | Preview y Development; **Production vacía** hasta el paso a real |
| `STRIPE_SECRETO_WEBHOOK` | Secreto de firma del webhook (`whsec_…`) | Igual |
| `PAGOS_STRIPE_MODO` | `desactivado`, `prueba` o `real` | Production: `desactivado` hasta que el dueño diga |

- Marcar las dos primeras como **Sensitive** en Vercel (no se pueden volver a leer).
- Claves de prueba y claves reales son distintas; no se mezclan. Nada de claves en el código ni en `.env` del repo.
- Pegarlas por Vercel o por Termius; **nunca en el chat**. Si una se pegó por error en algún sitio, se regenera en Stripe.
- Probar webhooks: el panel de Stripe permite apuntar un endpoint de prueba al dominio real mientras
  `PAGOS_STRIPE_MODO=prueba` limita el uso a administradores. Las vistas previas de Vercel pueden estar protegidas
  por Vercel (no lo he comprobado) y entonces Stripe no llegaría a ellas.

## 7. Cambios de base de datos (aditivos; los aplica el dueño porque llevan permisos)

- `pedidos`: `estado_pago` (`sin_pagar` por defecto, `pagado`, `fallido`, `caducado`, `reembolsado`),
  `stripe_session_id` (único), `stripe_payment_intent`, `pagado_en`, `clave_unica` (único, opcional).
- `stripe_eventos` (id del evento, tipo, recibido_en, resultado) con seguridad a nivel de fila y **sin políticas**.
- Funciones: `confirmar_pago_pedido(...)` y `marcar_pago_fallido(...)` de tipo `security definer` que solo ejecuta
  el rol de servicio, y la ampliación de `crear_pedido`. Por llevar `security definer` y permisos, **las revisa y
  aplica el dueño** (regla del guardián).
- Nada de esto se aplica hasta que el dueño lo autorice.

## 8. Pruebas en modo prueba (matriz mínima, con tarjetas de prueba de Stripe)

| Caso | Tarjeta de prueba | Resultado esperado |
|---|---|---|
| Pago correcto | 4242 4242 4242 4242 | Pedido `pagado`, artículo vendido, cesta vacía |
| Tarjeta rechazada | 4000 0000 0000 0002 | Pedido sigue pendiente, sin cobro, se puede reintentar |
| Fondos insuficientes | 4000 0000 0000 9995 | Igual que el anterior |
| Autenticación 3D Secure | 4000 0027 6000 3184 | Pide confirmación y, al aceptar, `pagado` |
| Sesión abandonada | (cerrar la pestaña) | A los 30 min: `caducado` y reserva liberada |
| Evento repetido | reenviar el mismo desde el panel de Stripe | Segundo envío responde 200 sin duplicar nada |
| Firma falsa | `curl` con firma inventada a mi propia dirección | 400 y nada guardado |
| Doble clic / reintento | pulsar «Pagar» dos veces | Un solo pedido y una sola sesión |
| Artículo vendido a la vez | pagar un artículo ya vendido | Reembolso automático y aviso al equipo |
| Cliente sin sesión | abrir «Comprar ya» | Lleva a iniciar sesión y vuelve |

## 9. Lo que decide el dueño (no se inventa ninguno)

1. Crear la cuenta de Stripe y activar el modo prueba.
2. Métodos de pago que quiere ofrecer (tarjeta, Apple Pay, Google Pay…; depende de lo que Stripe ofrezca a su cuenta).
3. Gastos de envío y cómo cobrarlos (hoy el total de `crear_pedido` suma solo los precios de los artículos).
4. IVA y facturación de artículos de segunda mano.
5. Política de devoluciones y plazo de reembolso (aparece en privacidad/términos).
6. Si quiere que el paso a `real` sea manual (recomendado) tras probar una compra de 1 € de verdad.

## 10. Orden de trabajo propuesto

1. Dueño: puntos 1 y 6 del apartado 9 y variables en Vercel (Preview y Development).
2. Claude: migración aditiva + vuelta atrás → el dueño la revisa y aplica.
3. Claude: `api/stripe-sesion.ts`, `api/stripe-webhook.ts`, botón en `/checkout`, pantalla «gracias» y «Mis pedidos»,
   todo detrás de `PAGOS_STRIPE_MODO`.
4. Claude: matriz del apartado 8 con el navegador de pruebas y la API de Stripe en modo prueba.
5. Dueño: prueba a mano con su tarjeta de prueba, y decide el paso a real.

Vuelta atrás: poner `PAGOS_STRIPE_MODO=desactivado` apaga todo al instante sin tocar código; la migración es aditiva.
