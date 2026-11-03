-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Resend en la política de privacidad (2026-11-03).
--   Desde hoy los correos de la cuenta (recuperar la contraseña y los demás de Supabase Auth) los envía Resend, con el
--   dominio de la tienda (no-responder@videojuegoszaragoza.com). La política tiene que nombrarlo entre los proveedores
--   técnicos: se añade una frase al final de «Con quién compartimos tus datos» (una sola vez).
-- Tipo:     solo cambia el texto de la política de privacidad. No borra nada. Se puede aplicar varias veces.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Los correos de tu cuenta (por ejemplo, el de recuperar la contraseña) los envía Resend en nombre de la tienda, desde no-responder@videojuegoszaragoza.com; para ello recibe tu correo electrónico y el contenido de ese mensaje.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%Resend%');
