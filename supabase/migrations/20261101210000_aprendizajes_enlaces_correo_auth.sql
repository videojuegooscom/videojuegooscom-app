-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-01.
--   El dueño preguntó si «¿Olvidaste tu contraseña?» funciona perfectamente. El código de la tienda se puede probar
--   con Supabase simulado, pero que el correo llegue y que su enlace vuelva a la tienda depende de la configuración de
--   Authentication en Supabase, que no está en el repositorio ni se lee desde aquí.
-- Qué hace: añade esa lección al Centro de Aprendizajes (la consulta Claude antes de cada respuesta).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Enlaces por correo: probar el código y comprobar la configuración de Supabase Auth', 'codigo', 2,
   'Recuperar la contraseña, confirmar la cuenta o cambiar el correo funcionan solo si, además del código, en Supabase → Authentication están bien la Site URL (la de la tienda), las Redirect URLs (la tienda y sus rutas, p. ej. /reset-password), el envío de correos (SMTP propio: el de Supabase es solo para pruebas) y las plantillas. Eso no está en el repositorio: el código se prueba en el navegador con Supabase simulado y la configuración se comprueba en los registros de Auth (si «referer» sale con la Site URL en vez de la dirección de la tienda, la tienda no está entre las direcciones permitidas) o la confirma el dueño en el panel. Con el flujo PKCE el enlace solo sirve en el mismo navegador donde se pidió: para que sirva en cualquiera, la plantilla debe llevar el token_hash y la página llamar a verifyOtp.',
   'Decir «funciona» porque el código llama a resetPasswordForEmail y la página /reset-password existe, sin mirar adónde lleva el enlace del correo ni si el correo llega.',
   'Probar el recorrido con Supabase simulado (pedir, abrir el enlace en el mismo navegador y en otro, guardar) y mirar los registros de Auth; lo que no se pueda ver, pedírselo al dueño con los pasos exactos del panel.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
