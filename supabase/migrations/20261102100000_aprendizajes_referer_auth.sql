-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: corrige una lección del 2026-11-01 (captura del dueño del 2026-11-02, Supabase → URL Configuration).
--   La lección «Enlaces por correo…» decía que si en los registros de Auth el «referer» sale con la Site URL, «la tienda
--   no está entre las direcciones permitidas». No es así: Supabase compara la página desde la que se hizo la petición
--   (p. ej. la portada) con la lista y, si esa no está, escribe la Site URL. La lista tenía /reset-password (el enlace de
--   la contraseña sí volvía a la tienda) y Claude dedujo mal que no. Se corrige la frase y se pide mirar la lista.
-- Qué hace: corrige el texto de esa lección del Centro de Aprendizajes.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     pone al día, por su título, la regla de esa lección. No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = 'Recuperar la contraseña, confirmar la cuenta o cambiar el correo funcionan solo si, además del código, en Supabase → Authentication están bien la Site URL (la de la tienda), las Redirect URLs (la tienda y sus rutas, p. ej. /reset-password), el envío de correos (SMTP propio: el de Supabase es solo para pruebas) y las plantillas. Eso no está en el repositorio: el código se prueba en el navegador con Supabase simulado y la configuración la confirma el dueño con una captura del panel. Los registros de Auth solo dan pistas: si «referer» sale con la Site URL, la página desde la que se hizo esa petición no está en la lista, pero otras de la tienda (como /reset-password) sí pueden estarlo; no se da por roto un enlace sin ver la lista. Con el flujo PKCE el enlace solo sirve en el mismo navegador donde se pidió: para que sirva en cualquiera, la plantilla debe llevar el token_hash y la página llamar a verifyOtp.',
    ejemplo_mal = 'Decir «funciona» porque el código llama a resetPasswordForEmail y la página /reset-password existe, sin mirar adónde lleva el enlace del correo ni si el correo llega. O, al revés, decir que el enlace lleva a localhost solo porque el «referer» de los registros sale con la Site URL (la lista sí tenía /reset-password).',
    updated_at = now()
where titulo = 'Enlaces por correo: probar el código y comprobar la configuración de Supabase Auth'
  and regla like '%la tienda no está entre las direcciones permitidas%';
