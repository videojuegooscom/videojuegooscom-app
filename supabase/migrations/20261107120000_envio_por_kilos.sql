-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: envío por kilos con las tarifas de Correos (dueño, 2026-11-07: «recuerda que Correos va por kg, mírate las
--            tarifas de envío por kg de Correos y ponlo bien»; tabla de Paq Estándar nacional que pasó el dueño).
-- Qué hace:
--   1) products.peso_kg: el peso de cada artículo CON su embalaje (lo que pesa Correos). Lo edita el dueño en
--      Administración → Productos. A los artículos que ya hay se les pone un peso estimado por su tipo (consola, mando,
--      juego, volante, televisor…) solo si aún no tienen; el dueño lo corrige donde no cuadre.
--   2) tarifas_envio.tramos: tramos por kilos de cada zona ([{hasta_kg, precio_eur}], de menor a mayor). Si una zona
--      tiene tramos, el envío es el precio del primer tramo que llega al peso del pedido (por encima del último, el del
--      último: el dueño lo ajusta en Pedidos); sin tramos, su precio fijo de siempre. «Gratis desde» sigue igual.
--   3) pedidos.peso_kg: el peso del pedido = la suma de sus artículos (un artículo sin peso cuenta 2 kg, PESO_SIN_DATO_KG
--      en lib/envio.ts). Lo apunta un disparador al guardar sus artículos y el envío se vuelve a calcular con él.
--   4) Península: los tramos de Paq Estándar nacional del dueño (hasta 1 kg 13,65 €; 2, 3, 4 y 5 kg 17,10 €; 10 kg
--      22,95 €; 15 kg 27,81 €; 20 kg 33,65 €; 25 kg 39,01 €; 30 kg 44,25 €). Baleares, Canarias, Ceuta y Melilla siguen
--      con «escríbenos» y la entrega en mano y Zaragoza siguen gratis (las hace el dueño, no Correos).
--   5) Política de envíos, «Coste de envío»: que se envía con Correos y el coste va por el peso del pedido.
-- Tipo:     AÑADE tres columnas, una función, un disparador y datos; cambia el disparador de envío de pedidos (mismo que
--           20261104210000, ahora también con el peso). No borra nada. Lleva permisos (grant de la columna «tramos» y de
--           la función nueva): la pega el dueño en Supabase → SQL Editor. Repetirla no cambia nada.
-- ============================================================================

-- 1) Peso de cada artículo (con embalaje).
alter table public.products add column if not exists peso_kg numeric(6,3);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_peso_kg_check' and conrelid = 'public.products'::regclass) then
    alter table public.products add constraint products_peso_kg_check check (peso_kg is null or (peso_kg > 0 and peso_kg <= 100));
  end if;
end $$;

-- Pesos estimados de lo que ya hay (con caja y embalaje), solo donde aún no hay peso. El primero que encaja gana.
update public.products
set peso_kg = case
    when title ilike '%smart tv%' or title ilike '%televisor%' then 20
    when title ilike '%volante%' then 7
    when title ilike '%xbox serie% x%' then 6.5
    when title ilike '%xbox serie% s%' then 3.5
    when title ilike '%playstation 5 slim%' then 5
    when title ilike '%playstation 5%' then 6.5
    when title ilike '%playstation 4%' then 5.5
    when title ilike '%gafas vr%' then 1.5
    when title ilike 'funda%' then 0.3
    when title ilike 'mando pro%' then 0.6
    when title ilike 'mando%' then 0.4
    when title ilike '%consola%switch 2%' then 2.5
    when title ilike '%consola%' then 2
    when title ilike '%videojuego%' or title ilike '%caset%' or title ilike '%case %' then 0.2
    when title ilike '%switch%' then 2
    when title ilike '%ipad%' then 1
    when title ilike '%iphone%' or title ilike '%móvil%' or title ilike '%movil%' then 0.5
    else null
  end
where peso_kg is null;

-- 2) Tramos por kilos de cada zona.
alter table public.tarifas_envio add column if not exists tramos jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_envio_tramos_check' and conrelid = 'public.tarifas_envio'::regclass) then
    alter table public.tarifas_envio add constraint tarifas_envio_tramos_check
      check (tramos is null or (jsonb_typeof(tramos) = 'array' and jsonb_array_length(tramos) <= 30));
  end if;
end $$;
grant update (tramos) on public.tarifas_envio to authenticated;

-- 3) Peso del pedido.
alter table public.pedidos add column if not exists peso_kg numeric(7,3);

-- El envío de una entrega con su peso: zona, «gratis desde» y, si la zona tiene tramos, el del peso.
create or replace function public.calcular_envio(p_entrega text, p_codigo_postal text, p_productos_eur numeric, p_peso_kg numeric)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
             when t.gratis_desde_eur is not null and coalesce(p_productos_eur, 0) >= t.gratis_desde_eur then 0
             when t.tramos is not null and jsonb_array_length(t.tramos) > 0 then coalesce(
               (select (e ->> 'precio_eur')::numeric
                  from jsonb_array_elements(t.tramos) e
                 where (e ->> 'hasta_kg')::numeric >= coalesce(p_peso_kg, 2)
                 order by (e ->> 'hasta_kg')::numeric
                 limit 1),
               (select (e ->> 'precio_eur')::numeric
                  from jsonb_array_elements(t.tramos) e
                 order by (e ->> 'hasta_kg')::numeric desc
                 limit 1))
             else t.precio_eur
           end
    from public.tarifas_envio t
    where t.zona = public.zona_envio(p_entrega, p_codigo_postal)
  ), 0)::numeric(10,2);
$$;

revoke all on function public.calcular_envio(text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.calcular_envio(text, text, numeric, numeric) to anon, authenticated;

-- El disparador de envío de pedidos, ahora con el peso (igual que el de 20261104210000 en todo lo demás).
create or replace function public.pedidos_calcular_envio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Una venta de VeoAura (api/escaparate-veoaura.ts) trae su total, lo que se cobró allí: nunca envío automático. Se lee
  -- con to_jsonb para que el disparador funcione también donde aún no exista esa columna.
  v_veoaura boolean := (to_jsonb(new) ->> 'id_veoaura') is not null;
begin
  if tg_op = 'INSERT' then
    -- La función del pedido guarda en total_eur la suma de los artículos (con los precios reales).
    new.productos_eur := coalesce(new.productos_eur, new.total_eur, 0);
    new.envio_eur := 0;
    new.envio_manual := v_veoaura;
  else
    -- Un reintento del pedido vuelve a calcular los artículos en total_eur: se toman como artículos.
    if new.total_eur is distinct from old.total_eur
       and new.envio_eur is not distinct from old.envio_eur
       and new.productos_eur is not distinct from old.productos_eur then
      new.productos_eur := new.total_eur;
    end if;
    -- El administrador pone el envío a mano: desde ahí ya no se recalcula.
    if new.envio_eur is distinct from old.envio_eur then
      new.envio_manual := true;
    end if;
  end if;

  if not new.envio_manual and not v_veoaura and (
       tg_op = 'INSERT'
       or new.entrega is distinct from old.entrega
       or new.codigo_postal is distinct from old.codigo_postal
       or new.productos_eur is distinct from old.productos_eur
       or new.peso_kg is distinct from old.peso_kg
       or (old.envio_manual and not new.envio_manual)
     ) then
    new.zona_envio := public.zona_envio(new.entrega, new.codigo_postal);
    new.envio_eur := public.calcular_envio(new.entrega, new.codigo_postal, new.productos_eur, new.peso_kg);
  end if;

  new.total_eur := coalesce(new.productos_eur, 0) + coalesce(new.envio_eur, 0);
  return new;
end;
$$;

revoke all on function public.pedidos_calcular_envio() from public, anon, authenticated;

-- Al guardar los artículos de un pedido, su peso (un artículo sin peso cuenta 2 kg). El disparador de arriba recalcula el
-- envío si cambia (y no lo toca si el administrador lo puso a mano o es una venta de VeoAura).
create or replace function public.pedido_items_peso()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.pedidos p
     set peso_kg = (
           select coalesce(sum(coalesce(pr.peso_kg, 2)), 0)
             from public.pedido_items i
             left join public.products pr on pr.id = i.product_id
            where i.pedido_id = p.id)
   where p.id = new.pedido_id;
  return null;
end;
$$;

revoke all on function public.pedido_items_peso() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedido_items_peso' and tgrelid = 'public.pedido_items'::regclass) then
    create trigger trg_pedido_items_peso
      after insert on public.pedido_items
      for each row execute function public.pedido_items_peso();
  end if;
end $$;

-- 4) Península con los tramos de Paq Estándar nacional (solo si el dueño aún no la ha tocado a mano).
update public.tarifas_envio
set tramos = '[
      {"hasta_kg": 1, "precio_eur": 13.65},
      {"hasta_kg": 2, "precio_eur": 17.10},
      {"hasta_kg": 3, "precio_eur": 17.10},
      {"hasta_kg": 4, "precio_eur": 17.10},
      {"hasta_kg": 5, "precio_eur": 17.10},
      {"hasta_kg": 10, "precio_eur": 22.95},
      {"hasta_kg": 15, "precio_eur": 27.81},
      {"hasta_kg": 20, "precio_eur": 33.65},
      {"hasta_kg": 25, "precio_eur": 39.01},
      {"hasta_kg": 30, "precio_eur": 44.25}
    ]'::jsonb,
    precio_eur = 13.65,
    updated_at = now()
where zona = 'peninsula'
  and tramos is null
  and updated_by is null;

-- 5) Política de envíos, «Coste de envío»: ahora va por el peso (solo si sigue con el texto de 20261106150000).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Coste de envío'
                  and s.sec ->> 'body' = 'El coste se calcula automáticamente al finalizar la compra, según el destino y el importe del pedido, y lo ves antes de pagar o confirmar.'
                   then jsonb_set(s.sec, '{body}', to_jsonb('Enviamos con Correos. El coste se calcula automáticamente al finalizar la compra, según el destino y el peso del pedido con su embalaje, y lo ves antes de pagar o confirmar.'::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios'
  and exists (
        select 1 from jsonb_array_elements(p.sections) as s (sec)
        where s.sec ->> 'heading' = 'Coste de envío'
          and s.sec ->> 'body' = 'El coste se calcula automáticamente al finalizar la compra, según el destino y el importe del pedido, y lo ves antes de pagar o confirmar.');
