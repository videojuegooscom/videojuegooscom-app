-- sql/promote_admin.sql
-- ---------------------------------------------------------------------------
-- Qué hace: convierte en administrador ('admin') al usuario cuyo email
-- indiques. Es la única forma de crear el primer admin: al registrarse,
-- todo el mundo entra como profiles.role = 'user' (ver sql/products.sql,
-- trigger on_auth_user_created) — nadie puede subirse el rol a sí mismo
-- desde la app (las políticas RLS de profiles solo dejan escribir "role" a
-- quien YA es admin).
--
-- IMPORTANTE — esto NO es como los demás archivos de sql/: no es idempotente
-- "de fábrica" para ejecutarlo sin pensar. Un script suelto anterior hacía
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users order by created_at desc limit 1)
-- es decir, "hazme admin al usuario más reciente" — si se vuelve a ejecutar
-- más adelante, promovería a admin a quien sea que se haya registrado
-- último en ese momento (¡puede que no sea quien tú quieres!). Por eso este
-- archivo pide el email en concreto: edita la línea que dice
-- 'CAMBIA_ESTE_EMAIL@ejemplo.com' antes de ejecutar, cada vez.
--
-- Cómo aplicarlo:
-- 1) Cambia el email de la línea de abajo por el del usuario que ya se
--    haya registrado en la app y que quieres convertir en admin.
-- 2) Ejecuta SOLO ese bloque (o el archivo entero) en el SQL Editor de
--    Supabase.
-- 3) Comprueba el resultado con la consulta final.
--
-- Conectado con: sql/products.sql (tabla profiles y su columna role).
-- ---------------------------------------------------------------------------

do $$
declare
  target_email text := 'CAMBIA_ESTE_EMAIL@ejemplo.com';
  target_id uuid;
begin
  select id into target_id from auth.users where email = target_email;

  if target_id is null then
    raise exception 'No existe ningún usuario registrado con el email %', target_email;
  end if;

  update public.profiles set role = 'admin' where id = target_id;

  raise notice 'Usuario % (id %) ahora es admin.', target_email, target_id;
end $$;

-- Comprobación: quién tiene rol admin ahora mismo.
select p.id, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
order by p.created_at desc;
