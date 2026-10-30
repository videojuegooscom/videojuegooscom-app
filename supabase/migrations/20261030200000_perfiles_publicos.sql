-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: el Foro enseña el USUARIO y la FOTO de «Mi perfil» de quien escribe (función perfiles_publicos).
-- Tipo:     SOLO AÑADE una función de lectura. No toca ninguna tabla, fila, política ni función existente.
--           - Devuelve SOLO tres datos: el id, el usuario y la foto. Nunca el nombre, el país, la provincia ni la fecha de
--             nacimiento (esos siguen viéndolos solo el propio cliente y el administrador).
--           - Solo de personas que han escrito en el Foro (sus mensajes ya son públicos) y que tienen usuario.
--           - Como mucho 200 personas por consulta.
--           - La tabla perfiles_cliente sigue cerrada: la función lee por su cuenta (security definer) solo esas columnas.
-- La aplica el dueño en Supabase → SQL Editor (da permiso de ejecución a visitantes y clientes). Antes de eso, el Foro
-- sigue enseñando el nombre y la inicial como hasta ahora.
-- Se puede aplicar varias veces sin error.
-- ============================================================================

create or replace function public.perfiles_publicos(ids uuid[])
returns table (user_id uuid, usuario text, foto_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.usuario, p.foto_url
  from public.perfiles_cliente p
  where p.user_id = any (ids[1:200])
    and p.usuario is not null
    and exists (select 1 from public.chat_messages m where m.user_id = p.user_id);
$$;

comment on function public.perfiles_publicos(uuid[]) is
  'Foro: usuario y foto de «Mi perfil» de quien ha escrito en el Foro (máximo 200 ids). Nada más.';

revoke all on function public.perfiles_publicos(uuid[]) from public;
grant execute on function public.perfiles_publicos(uuid[]) to anon, authenticated;
