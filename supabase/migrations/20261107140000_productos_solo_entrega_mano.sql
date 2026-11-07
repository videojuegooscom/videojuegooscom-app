-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: artículos que solo se entregan en mano (dueño, 2026-11-07: «pon que las TV que no contengan su caja
--            original de embalaje no se podrá realizar envíos»).
-- Qué hace:
--   1) products.solo_entrega_mano (por defecto false): el artículo no se envía, solo se entrega en mano en Zaragoza o
--      Cuarte de Huerva. Lo marca el dueño en Administración → Productos («Solo entrega en mano»). Los televisores que hay
--      ahora y no dicen «caja original» en el título ni en la descripción se marcan (solo si aún no lo están).
--   2) La base de datos no deja guardar un pedido de la web (con clave de la compra) a domicilio con uno de esos
--      artículos, ni cambiar a domicilio un pedido que ya lo lleva. Los pedidos que crea el dueño desde el chat o que llegan
--      de VeoAura no se tocan. La página ya lo impide antes (app/checkout.tsx); esto es la defensa del servidor.
--   3) Política de envíos, «Embalaje»: que los televisores sin su caja original no se envían.
-- Tipo:     AÑADE una columna, dos funciones y dos disparadores, y cambia datos. No borra nada. Sin permisos nuevos (la
--           columna queda bajo los de products). Repetirla no cambia nada.
-- ============================================================================

-- 1) La marca y los televisores sin caja original.
alter table public.products add column if not exists solo_entrega_mano boolean not null default false;

update public.products
set solo_entrega_mano = true
where not solo_entrega_mano
  and (title ~* '\m(tv|smart tv|televisor|televisión|television)\M')
  and lower(title || ' ' || coalesce(description, '')) not like '%caja original%';

-- 2) Defensa del servidor: un pedido de la web a domicilio no puede llevar un artículo que solo se entrega en mano.
create or replace function public.pedido_items_solo_mano()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_titulo text;
begin
  select pr.title into v_titulo
    from public.products pr
    join public.pedidos p on p.id = new.pedido_id
   where pr.id = new.product_id
     and pr.solo_entrega_mano
     and p.entrega = 'envio'
     and (to_jsonb(p) ->> 'clave_unica') is not null;
  if found then
    raise exception 'El artículo «%» solo se entrega en mano: sin su caja original no se puede enviar', v_titulo
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.pedido_items_solo_mano() from public, anon, authenticated;

create or replace function public.pedidos_solo_mano()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_titulo text;
begin
  if new.entrega = 'envio' and old.entrega is distinct from 'envio' and (to_jsonb(new) ->> 'clave_unica') is not null then
    select pr.title into v_titulo
      from public.pedido_items i
      join public.products pr on pr.id = i.product_id
     where i.pedido_id = new.id
       and pr.solo_entrega_mano
     limit 1;
    if found then
      raise exception 'El artículo «%» solo se entrega en mano: sin su caja original no se puede enviar', v_titulo
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.pedidos_solo_mano() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedido_items_solo_mano' and tgrelid = 'public.pedido_items'::regclass) then
    create trigger trg_pedido_items_solo_mano
      before insert on public.pedido_items
      for each row execute function public.pedido_items_solo_mano();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedidos_solo_mano' and tgrelid = 'public.pedidos'::regclass) then
    create trigger trg_pedidos_solo_mano
      before update of entrega on public.pedidos
      for each row execute function public.pedidos_solo_mano();
  end if;
end $$;

-- 3) Política de envíos, «Embalaje» (una sola vez).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Embalaje'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Los televisores que no conservan su caja original no se envían: se entregan solo en mano, en Zaragoza o en Cuarte de Huerva.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Embalaje')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%caja original%');
