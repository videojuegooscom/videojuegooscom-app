-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-16 (motivo de la cancelación y «Avisarme cuando haya otro»), versión sin caracteres
-- invisibles. La de 20261116100100_aprendizajes_cancelacion_aviso.sql llevaba caracteres de uso privado de Unicode y no se
-- podía aplicar copiándola; esta escribe la clase como texto (\uE000-\uF8FF) y sustituye a aquella.
--   1) El dueño pidió «Por la app, Gmail o ambas», pero la tienda no tiene envío de correos propio (Resend solo manda los
--      correos de la cuenta desde Supabase Auth): se guarda la preferencia, Administración lo dice y Blue avisa en la app.
--   2) Al escribir la prueba CANCAV se copió la limpieza de iconos de otra sección sin sus caracteres invisibles (uso
--      privado de Unicode) y quedó una clase que quitaba los guiones («5-10 días» salía «510»).
-- Qué hace: apunta las dos lecciones (si no existen).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261116100000_cancelacion_motivo_aviso.sql y pruebas/perfil-datos.mjs (CANCAV).
-- Tipo:     inserta las lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un canal de aviso que la tienda aún no tiene se guarda, se dice en Administración y se avisa por el que sí hay', 'negocio', 2,
   'Antes de ofrecer al cliente un canal (correo, SMS, WhatsApp) se busca en el código si la tienda puede mandarlo (api/, lib/: resend, sendgrid, smtp, nodemailer…). Si no puede, no se inventa un proveedor ni claves: la preferencia del cliente se guarda igual, Administración dice «Correo pendiente de activar en la tienda» (en el detalle y en los recuentos) y, mientras tanto, se le avisa por el canal que sí funciona (Blue en la app), para no dejarle sin aviso.',
   'El cliente elige «Por correo», no hay envío de correos y nunca se entera de que ha llegado otra consola.',
   'Se guarda «correo»; Pedidos y Analítica dicen «Correo pendiente de activar en la tienda (de momento Blue le avisa en la app)» y Blue le avisa en la app.'),
  ('En las pruebas, los iconos se quitan con la clase de uso privado escrita como \uE000-\uF8FF, nunca copiando caracteres invisibles', 'codigo', 2,
   'Ionicons pinta sus iconos con caracteres de uso privado de Unicode, invisibles al leer el código. Al limpiar el texto de una prueba se escribe la clase con escapes ([\uE000-\uF8FF]) en vez de copiar la de otra sección: al copiarla se pierden los caracteres y queda una clase que quita otras letras (guiones), con resultados falsos.',
   'Una clase copiada de otra sección que se ha quedado en [-] (sin sus caracteres): «5-10 días hábiles» se lee «510 días hábiles» y la prueba falla o, peor, pasa por casualidad.',
   'texto.replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim()')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
