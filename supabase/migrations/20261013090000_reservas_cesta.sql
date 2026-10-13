-- Reserva de 15 minutos al añadir un artículo a la cesta (unidad única de segunda mano).
-- Mientras dura, otro cliente no puede añadirlo ni comprarlo. La tabla no se lee
-- directamente: solo a través de las tres funciones de abajo (RLS sin políticas).
-- El "token" es un identificador aleatorio por dispositivo que guarda la app.

create table if not exists public.reservas_cesta (
  product_id uuid primary key references public.products(id) on delete cascade,
  token uuid not null,
  reservado_hasta timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservas_cesta enable row level security;

-- Reserva (o renueva) el producto 15 minutos para este dispositivo.
-- Devuelve la hora de fin, o null si lo tiene reservado otro cliente.
create or replace function public.reservar_producto(p_product_id uuid, p_token uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta timestamptz := now() + interval '15 minutes';
  v_fin timestamptz;
begin
  if p_product_id is null or p_token is null then
    return null;
  end if;

  insert into public.reservas_cesta as r (product_id, token, reservado_hasta)
  values (p_product_id, p_token, v_hasta)
  on conflict (product_id) do update
    set token = excluded.token,
        reservado_hasta = excluded.reservado_hasta,
        updated_at = now()
    where r.token = excluded.token or r.reservado_hasta <= now()
  returning reservado_hasta into v_fin;

  return v_fin;
end;
$$;

-- Suelta la reserva propia (al quitar el artículo de la cesta).
create or replace function public.liberar_reserva(p_product_id uuid, p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reservas_cesta
     set reservado_hasta = now(), updated_at = now()
   where product_id = p_product_id and token = p_token;
$$;

-- De una lista de productos, cuáles tiene reservados ahora otro cliente.
create or replace function public.productos_reservados(p_ids uuid[], p_token uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select product_id
    from public.reservas_cesta
   where product_id = any(p_ids)
     and reservado_hasta > now()
     and token is distinct from p_token;
$$;

revoke all on function public.reservar_producto(uuid, uuid) from public;
revoke all on function public.liberar_reserva(uuid, uuid) from public;
revoke all on function public.productos_reservados(uuid[], uuid) from public;

grant execute on function public.reservar_producto(uuid, uuid) to anon, authenticated;
grant execute on function public.liberar_reserva(uuid, uuid) to anon, authenticated;
grant execute on function public.productos_reservados(uuid[], uuid) to anon, authenticated;
