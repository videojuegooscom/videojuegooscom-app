-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reseñas de los servicios terminados (dueño, 2026-11-03: «Pidamos reseñas de los servicios terminados y
--            enseñémoslas en la ficha»).
-- Qué hace: las reseñas siguen siendo de la tienda (store_reviews, las de Inicio), pero una reseña puede ir unida a
--           UNA solicitud de servicio del cliente (service_request_id). Entonces:
--           - Solo la puede escribir el dueño de esa solicitud y solo cuando ya está «entregado» (la etapa la pone la
--             tienda; el cliente no puede cambiarla).
--           - Una sola reseña por solicitud (índice único).
--           - El servicio (service_id) y su nombre (service_title) los copia la base de datos de la solicitud, nunca
--             del navegador: así nadie pone una reseña en la ficha de un servicio que no ha contratado.
--           - Una reseña sin solicitud (las de Inicio) no puede llevar servicio.
--           La ficha del servicio (app/servicio/[id].tsx) enseña las suyas; «Mis seguimientos» pide la valoración.
-- Tipo:     3 columnas y 2 índices nuevos, y la función del disparador de las reseñas se sustituye por la misma con
--           esta comprobación añadida. No cambia ni borra ningún dato. Lleva security definer: la revisa y aplica el
--           dueño.
-- Vuelta atrás: volver a ejecutar la función de sql/store_reviews.sql (líneas 75-112); las columnas se quedan sin uso.
-- ============================================================================

alter table public.store_reviews add column if not exists service_request_id uuid references public.service_requests (id) on delete set null;
alter table public.store_reviews add column if not exists service_id uuid references public.services (id) on delete set null;
alter table public.store_reviews add column if not exists service_title text;

-- Una sola reseña por solicitud de servicio.
create unique index if not exists store_reviews_service_request_unica on public.store_reviews (service_request_id) where service_request_id is not null;
-- Las reseñas de cada servicio, de la más nueva a la más antigua (ficha del servicio).
create index if not exists store_reviews_service_id_idx on public.store_reviews (service_id, created_at desc) where service_id is not null;

create or replace function public.store_reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_username text;
  v_full_name text;
  v_email text;
  v_servicio uuid;
  v_titulo text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para dejar una reseña.';
  end if;

  new.user_id := auth.uid();

  select raw_user_meta_data, email
    into v_meta, v_email
    from auth.users
    where id = auth.uid();

  v_username := nullif(trim(coalesce(v_meta ->> 'username', '')), '');
  v_full_name := nullif(trim(coalesce(v_meta ->> 'full_name', '')), '');

  new.username := coalesce(v_username, split_part(coalesce(v_email, ''), '@', 1), 'usuario');
  new.display_name := coalesce(v_full_name, new.username);

  new.comment := trim(coalesce(new.comment, ''));

  if new.rating is null or new.rating < 1 or new.rating > 5 then
    raise exception 'La valoración debe ser de 1 a 5 estrellas.';
  end if;

  -- Reseña de un servicio: solo de una solicitud propia ya entregada; el servicio lo pone la solicitud.
  if new.service_request_id is not null then
    select sr.service_id, sr.service_title
      into v_servicio, v_titulo
      from public.service_requests sr
      where sr.id = new.service_request_id
        and sr.customer_user_id = auth.uid()
        and sr.seguimiento = 'entregado';
    if not found then
      raise exception 'Solo puedes valorar un servicio tuyo que ya te hayamos entregado.';
    end if;
    new.service_id := v_servicio;
    new.service_title := v_titulo;
  else
    new.service_id := null;
    new.service_title := null;
  end if;

  return new;
end;
$$;

-- Como en 20261014100000_seguridad_endurecer.sql: la función solo la usa el disparador.
revoke execute on function public.store_reviews_before_insert() from public, anon, authenticated;
