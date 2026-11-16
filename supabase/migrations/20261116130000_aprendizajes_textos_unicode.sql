-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-16 escritas sin ninguna barra invertida ni carácter invisible, para que se puedan
-- aplicar copiando el archivo tal cual (las de 20261116110000_aprendizajes_cancelacion_aviso_bis.sql escribían los
-- escapes de Unicode con su barra invertida, y al copiarlos el texto se puede estropear).
--   1) Un canal de aviso que la tienda aún no tiene (el correo de «Avisarme cuando haya otro»): se guarda la preferencia,
--      Administración lo dice y se avisa por el canal que sí hay (Blue en la app). Mismo título que la de 20261116110000:
--      si aquella ya está aplicada, esta no la repite.
--   2) En las pruebas, los iconos de Ionicons (caracteres del rango de uso privado de Unicode, de E000 a F8FF) se quitan
--      con la clase escrita con escapes, nunca copiando los caracteres invisibles (título nuevo, más corto, sin barras).
--   3) El fallo del pedido 8 (PS5 Pro, 2026-11-16): el «vendido» que devuelve VeoAura justo después de recibir el aviso del
--      pedido es la misma venta, no una doble venta (api/pago.ts y pruebas/pago-api.mjs, casos V9 y V10).
-- Qué hace: apunta las tres lecciones (si no existen).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261116110000_aprendizajes_cancelacion_aviso_bis.sql, api/pago.ts y
--                pruebas/perfil-datos.mjs (CANCAV y PANRED3).
-- Tipo:     inserta las lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un canal de aviso que la tienda aún no tiene se guarda, se dice en Administración y se avisa por el que sí hay', 'negocio', 2,
   'Antes de ofrecer al cliente un canal (correo, SMS, WhatsApp) se busca en el código si la tienda puede mandarlo (api/, lib/: resend, sendgrid, smtp, nodemailer…). Si no puede, no se inventa un proveedor ni claves: la preferencia del cliente se guarda igual, Administración dice «Correo pendiente de activar en la tienda» (en el detalle y en los recuentos) y, mientras tanto, se le avisa por el canal que sí funciona (Blue en la app), para no dejarle sin aviso.',
   'El cliente elige «Por correo», no hay envío de correos y nunca se entera de que ha llegado otra consola.',
   'Se guarda «correo»; Pedidos y Analítica dicen «Correo pendiente de activar en la tienda (de momento Blue le avisa en la app)» y Blue le avisa en la app.'),
  ('En las pruebas, los iconos se quitan con la clase del rango privado E000-F8FF escrita con escapes, nunca copiando caracteres invisibles', 'codigo', 2,
   'Ionicons pinta sus iconos con caracteres del rango de uso privado de Unicode (de E000 a F8FF), que no se ven al leer el código. Al limpiar el texto de una prueba, la clase se escribe con los escapes de Unicode: corchete, barra invertida, u, E000, guion, barra invertida, u, F8FF y corchete. Nunca se copia la clase de otra sección: al copiarla se pierden los caracteres invisibles y queda una clase que quita otras letras (los guiones), con resultados falsos. En los archivos SQL de lecciones, esos escapes se describen con palabras, sin escribir la barra invertida.',
   'Una clase copiada de otra sección que se ha quedado en «corchete, guion, corchete» (sin sus caracteres): «5-10 días hábiles» se lee «510 días hábiles» y la prueba falla o, peor, pasa por casualidad.',
   'La limpieza de PANRED2 y PANRED3 en pruebas/perfil-datos.mjs: la clase del rango de E000 a F8FF escrita con sus escapes de Unicode, luego los espacios seguidos a uno solo y trim().'),
  ('Lo que VeoAura marca como vendido después de hacer el pedido es la misma venta, no una doble venta', 'negocio', 1,
   'Al hacer un pedido, la tienda avisa a VeoAura; VeoAura lo da por vendido en su Stock y devuelve «vendido» unos segundos después, así que el artículo queda vendido (sin pedido apuntado) ANTES de que llegue el cobro de Stripe. Eso es esta misma venta. Doble venta solo es: vendido antes de que existiera el pedido (comparando vendido_en con pedidos.created_at) o pagado antes por otro pedido sin cancelar. Lo vendido después y sin pedido se le apunta a este pedido (vendido_pedido_id) y se deja pagar. Se prueba con el reloj: un caso vendido segundos después de crear el pedido (sin doble venta) y otro vendido antes (con doble venta), con su control.',
   'Fallo del 2026-11-16, pedido 8 (PS5 Pro): llega el cobro, el artículo ya tiene vendido_en por el aviso de VeoAura y la tienda marca doble_venta_en y pide devolver un pago bueno.',
   'apartarArticulos y articuloYaVendido de api/pago.ts miran la hora del pedido; pruebas/pago-api.mjs V9 (vendido 5 s después: sin doble venta y con su vendido_pedido_id) y V10 (vendido antes: doble venta).')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
