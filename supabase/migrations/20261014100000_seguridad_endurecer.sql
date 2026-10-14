-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: endurecer la seguridad (revisión del 2026-10-14)
-- Qué arregla:
--   1. Solicitudes de venta y de reparación: cualquiera puede enviarlas (es lo normal),
--      pero hasta ahora el visitante podía mandar también los campos internos del taller
--      (estado, nota del admin, etapa de la reparación). Ahora, si no es admin, esos campos
--      se fuerzan a su valor inicial.
--   2. Comentarios de noticias: nadie que no sea admin puede firmar como la tienda
--      («Admin», «VideojuegosZaragoza», «Blue», «Tienda»…).
--   3. Fotos/vídeos de «Vender»: solo se pueden subir a la carpeta de una solicitud de venta
--      real creada en las últimas 2 horas (antes se podía subir cualquier cosa a cualquier
--      ruta y llenar el almacenamiento).
--   4. Funciones internas: las funciones de disparador y las de administración ya no se
--      pueden llamar desde fuera sin sesión, y todas fijan su search_path (avisos de
--      seguridad de Supabase).
-- Tipo:     aditiva (crea funciones, disparadores y una política restrictiva; quita permisos
--           de ejecución sobrantes). No borra datos.
-- ============================================================================

-- 1. Campos internos de las solicitudes -------------------------------------------------
create or replace function public.solicitudes_campos_internos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    new.status := 'nuevo';
    new.nota_admin := null;
    if tg_table_name = 'service_requests' then
      new.seguimiento := 'solicitado';
      new.seguimiento_nota := null;
      new.seguimiento_actualizado := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_sell_requests_campos_internos
  before insert on public.sell_requests
  for each row execute function public.solicitudes_campos_internos();

create trigger trg_service_requests_campos_internos
  before insert on public.service_requests
  for each row execute function public.solicitudes_campos_internos();

-- 2. Nadie firma como la tienda en los comentarios ---------------------------------------
create or replace function public.noticias_comentarios_autor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.autor := btrim(coalesce(new.autor, ''));
  if new.autor = '' then
    new.autor := 'Cliente';
  end if;
  if not public.is_admin()
     and new.autor ~* '(admin|tienda|videojuegos ?zaragoza|soporte|blue)' then
    new.autor := 'Cliente';
  end if;
  return new;
end;
$$;

create trigger trg_noticias_comentarios_autor
  before insert on public.noticias_comentarios
  for each row execute function public.noticias_comentarios_autor();

-- 3. Subidas de «Vender» solo a una solicitud real y reciente ---------------------------
create or replace function public.solicitud_venta_reciente(p_carpeta text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.sell_requests s
     where s.id::text = p_carpeta
       and s.created_at > now() - interval '2 hours'
  );
$$;

revoke all on function public.solicitud_venta_reciente(text) from public;
grant execute on function public.solicitud_venta_reciente(text) to anon, authenticated;

create policy sell_request_media_objects_insert_valida on storage.objects
  as restrictive
  for insert to anon, authenticated
  with check (
    bucket_id <> 'sell-request-media'
    or public.solicitud_venta_reciente((storage.foldername(name))[1])
  );

-- 4. Funciones internas: sin ejecución desde fuera y con search_path fijo --------------
revoke execute on function public.chat_message_reactions_before_insert() from public, anon, authenticated;
revoke execute on function public.chat_messages_before_insert() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.product_chat_messages_after_insert() from public, anon, authenticated;
revoke execute on function public.product_chat_messages_before_insert() from public, anon, authenticated;
revoke execute on function public.purge_chat_if_both_deleted() from public, anon, authenticated;
revoke execute on function public.set_request_customer_user_id() from public, anon, authenticated;
revoke execute on function public.store_reviews_before_insert() from public, anon, authenticated;
revoke execute on function public.product_sales_before_insert() from public, anon, authenticated;
revoke execute on function public.solicitudes_campos_internos() from public, anon, authenticated;
revoke execute on function public.noticias_comentarios_autor() from public, anon, authenticated;

-- Las de administración comprueban is_admin(), pero tampoco hace falta que las vea quien no
-- tiene sesión.
revoke execute on function public.admin_users_by_ids(uuid[]) from public, anon;
revoke execute on function public.admin_list_users_with_stats() from public, anon;

alter function public.is_admin() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.set_personal_cash_state_updated_at() set search_path = public, pg_temp;
alter function public.set_sell_requests_updated_at() set search_path = public, pg_temp;
alter function public.enforce_sell_request_media_limits() set search_path = public, pg_temp;
alter function public.set_service_requests_updated_at() set search_path = public, pg_temp;
alter function public.set_customer_notes_updated_at() set search_path = public, pg_temp;
