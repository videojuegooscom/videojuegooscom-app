-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: pedidos idempotentes. Repetir la misma operación nunca crea un segundo pedido.
-- Problema: crear_pedido(p_datos, p_productos) no tiene ninguna defensa en el servidor: cada llamada
--           inserta un pedido nuevo. Si la respuesta se pierde (corte de red, recarga) o la misma petición
--           llega dos veces (dos pestañas, dos dispositivos, un reintento), salen dos pedidos iguales.
-- Solución: el navegador genera una clave única (UUID) por operación de compra y la manda en cada
--           intento. La función nueva crear_pedido_idempotente la usa así:
--           1) bloqueo por clave (pg_advisory_xact_lock): dos peticiones simultáneas con la misma
--              clave se ponen en fila, la segunda espera a que la primera termine;
--           2) si ya existe un pedido con esa clave, devuelve el MISMO número con repetido = true y
--              no escribe nada; si la clave la usa otra persona o con otro carrito, falla;
--           3) si no existe, lo crea, y el índice único de clave_unica es la última defensa.
-- Tipo:     aditiva. Añade 2 columnas nulas y un índice único a pedidos, y una función nueva.
--           NO cambia crear_pedido (sigue como respaldo mientras el navegador antiguo siga vivo).
--           No borra ni modifica datos (hoy pedidos está vacía). Lleva security definer y permisos
--           (anon, authenticated): la revisa y aplica el dueño.
-- Pantallas: app/checkout.tsx (genera la clave y usa la función nueva; si la función aún no existe,
--           cae a crear_pedido).
-- Vuelta atrás: supabase/rollbacks/20261018110000_pedidos_idempotencia_revertir.sql
-- Pruebas:  supabase/tests/crear_pedido_idempotente.sql (en una base de pruebas, nunca en producción).
-- ============================================================================

alter table public.pedidos add column if not exists clave_unica uuid;
alter table public.pedidos add column if not exists clave_huella text;

comment on column public.pedidos.clave_unica is 'Clave de la operación de compra (UUID del navegador): la misma clave nunca crea dos pedidos.';
comment on column public.pedidos.clave_huella is 'md5 de entrega + productos del pedido: detecta que una clave se reutiliza con otro carrito.';

-- Varios NULL no chocan entre sí: los pedidos creados sin clave (función antigua) siguen valiendo.
create unique index if not exists pedidos_clave_unica_uidx on public.pedidos (clave_unica);

-- Crea el pedido una sola vez por clave. Devuelve {"numero": n, "repetido": false|true}.
-- p_datos: {nombre, email, telefono, entrega, direccion, codigo_postal, ciudad, notas}
create or replace function public.crear_pedido_idempotente(p_clave uuid, p_datos jsonb, p_productos uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega text := coalesce(nullif(p_datos->>'entrega', ''), 'envio');
  v_uid uuid := auth.uid();
  v_huella text;
  v_prev record;
  v_id uuid;
  v_numero bigint;
  v_total numeric(10, 2);
  v_count int;
begin
  if p_clave is null then
    raise exception 'falta la clave del pedido';
  end if;
  if p_productos is null or array_length(p_productos, 1) is null or array_length(p_productos, 1) > 20 then
    raise exception 'pedido sin productos';
  end if;
  if v_entrega not in ('envio', 'recogida') then
    raise exception 'entrega no válida';
  end if;

  -- Huella del carrito: entrega + productos sin repetir y ordenados.
  select md5(v_entrega || ':' || coalesce(string_agg(x::text, ',' order by x), ''))
    into v_huella
    from (select distinct unnest(p_productos) as x) s;

  -- Pone en fila las llamadas con la misma clave hasta que termine la primera (se libera sola al
  -- acabar la transacción). Tras esperar, cada sentencia ve ya el pedido que acaba de crear la otra.
  perform pg_advisory_xact_lock(hashtextextended('crear_pedido:' || p_clave::text, 0));

  for v_vuelta in 1..2 loop
    select id, numero, user_id, clave_huella into v_prev
      from public.pedidos
     where clave_unica = p_clave;

    if found then
      -- Misma persona y mismo carrito: es un reintento. Otra persona u otro carrito: error.
      if v_prev.user_id is distinct from v_uid or v_prev.clave_huella is distinct from v_huella then
        raise exception 'la clave del pedido ya se usó con otro pedido';
      end if;
      return jsonb_build_object('numero', v_prev.numero, 'repetido', true);
    end if;

    select count(*), coalesce(sum(price_eur), 0)
      into v_count, v_total
      from public.products
     where id = any(p_productos) and status = 'PUBLISHED' and is_active;

    if v_count = 0 then
      raise exception 'productos no disponibles';
    end if;

    insert into public.pedidos (user_id, entrega, nombre, email, telefono, direccion, codigo_postal, ciudad, notas, total_eur, clave_unica, clave_huella)
    values (
      v_uid,
      v_entrega,
      btrim(p_datos->>'nombre'),
      btrim(p_datos->>'email'),
      btrim(p_datos->>'telefono'),
      nullif(btrim(p_datos->>'direccion'), ''),
      nullif(btrim(p_datos->>'codigo_postal'), ''),
      nullif(btrim(p_datos->>'ciudad'), ''),
      nullif(btrim(p_datos->>'notas'), ''),
      v_total,
      p_clave,
      v_huella
    )
    on conflict (clave_unica) do nothing
    returning id, numero into v_id, v_numero;

    if v_id is not null then
      insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur)
      select v_id, id, title, coalesce(price_eur, 0)
        from public.products
       where id = any(p_productos) and status = 'PUBLISHED' and is_active;

      return jsonb_build_object('numero', v_numero, 'repetido', false);
    end if;
    -- Conflicto inesperado (otro camino insertó esa clave): la vuelta siguiente la lee y la trata.
  end loop;

  raise exception 'no se pudo crear el pedido';
end;
$$;

revoke all on function public.crear_pedido_idempotente(uuid, jsonb, uuid[]) from public;
grant execute on function public.crear_pedido_idempotente(uuid, jsonb, uuid[]) to anon, authenticated;
