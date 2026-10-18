-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: pedidos idempotentes. Repetir la misma operación nunca crea un segundo pedido.
-- Problema: crear_pedido(p_datos, p_productos) no tiene ninguna defensa en el servidor: cada llamada
--           inserta un pedido nuevo. Si la respuesta se pierde (corte de red, recarga) o la misma petición
--           llega dos veces (dos pestañas, dos dispositivos, un reintento), salen dos pedidos iguales. Y
--           mientras la función antigua siga abierta a anon y authenticated, cualquiera (o un navegador
--           antiguo) puede saltarse cualquier defensa que se ponga solo en la nueva.
-- Solución: DOS defensas en la misma función, y la antigua pasa por ella.
--   1) CLAVE DE OPERACIÓN. El navegador genera un UUID por compra y lo manda en cada intento. Con la misma
--      clave se devuelve el MISMO pedido (repetido = true); si la clave la usa otra persona o con otro
--      carrito, falla.
--   2) MISMA COMPRA. Aunque la clave sea distinta (o no exista), si la misma persona (usuario con sesión, o
--      correo si no la tiene) ya tiene un pedido PENDIENTE con el mismo carrito (mismos productos y
--      misma entrega) de los últimos 10 minutos, se devuelve ese pedido. Cada artículo es una unidad
--      única, así que dos pedidos idénticos seguidos son siempre un duplicado.
--   Dos bloqueos de asesoramiento (pg_advisory_xact_lock) ponen en fila las peticiones simultáneas: primero
--   el de la compra (persona + carrito) y después el de la clave, siempre en ese orden (sin bloqueos
--   cruzados). Y el índice único sobre clave_unica es la última defensa.
--   La función antigua crear_pedido mantiene su firma, su tipo de retorno y sus permisos, pero ahora llama a
--   la nueva con una clave aleatoria: así ya no puede saltarse la defensa de «misma compra».
-- Tipo:     aditiva en el esquema (2 columnas nulas, un índice único y una función nueva) y UNA función
--           existente reemplazada (crear_pedido, que sigue devolviendo el número de pedido). No borra ni
--           modifica datos (hoy pedidos está vacía). Lleva security definer y permisos (anon,
--           authenticated): la revisa y aplica el dueño.
-- Pantallas: app/checkout.tsx (genera la clave y usa la función nueva; si la función aún no existe, cae a
--           crear_pedido, que ya es idempotente por «misma compra»).
-- Vuelta atrás: supabase/rollbacks/20261018110000_pedidos_idempotencia_revertir.sql (restaura el cuerpo
--           original de crear_pedido y apaga la función nueva).
-- Pruebas:  pruebas/pedidos-sql.mjs (SQL real con peticiones concurrentes en una base aislada, nunca en
--           producción; incluye una «prueba de las pruebas» que quita los bloqueos y comprueba que fallan).
-- ============================================================================

alter table public.pedidos add column if not exists clave_unica uuid;
alter table public.pedidos add column if not exists clave_huella text;

comment on column public.pedidos.clave_unica is 'Clave de la operación de compra (UUID del navegador): la misma clave nunca crea dos pedidos.';
comment on column public.pedidos.clave_huella is 'md5 de entrega + productos del pedido: detecta que una clave se reutiliza con otro carrito y la misma compra repetida.';

-- Varios NULL no chocan entre sí: los pedidos creados antes de esta migración (sin clave) siguen valiendo.
create unique index if not exists pedidos_clave_unica_uidx on public.pedidos (clave_unica);
-- Para buscar rápido la «misma compra» reciente de una persona.
create index if not exists pedidos_huella_idx on public.pedidos (clave_huella, created_at desc);

-- Crea el pedido una sola vez por clave y por compra. Devuelve {"numero": n, "repetido": false|true}.
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
  v_email text := lower(btrim(coalesce(p_datos->>'email', '')));
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

  -- Pone en fila las llamadas simultáneas (se liberan solas al acabar la transacción). Siempre en este
  -- orden: primero la compra (persona + carrito), después la clave. Tras esperar, cada sentencia ve ya
  -- el pedido que acaba de crear la otra.
  perform pg_advisory_xact_lock(hashtextextended('compra:' || coalesce(v_uid::text, v_email) || ':' || v_huella, 0));
  perform pg_advisory_xact_lock(hashtextextended('clave:' || p_clave::text, 0));

  for v_vuelta in 1..2 loop
    -- 1) La misma clave: es un reintento si es la misma persona y el mismo carrito.
    select id, numero, user_id, clave_huella into v_prev
      from public.pedidos
     where clave_unica = p_clave;

    if found then
      if v_prev.user_id is distinct from v_uid or v_prev.clave_huella is distinct from v_huella then
        raise exception 'la clave del pedido ya se usó con otro pedido';
      end if;
      return jsonb_build_object('numero', v_prev.numero, 'repetido', true);
    end if;

    -- 2) La misma compra con otra clave: mismo carrito, misma persona, pedido pendiente de hace menos de 10 min.
    select id, numero into v_prev
      from public.pedidos
     where clave_huella = v_huella
       and estado = 'pendiente'
       and created_at > now() - interval '10 minutes'
       and ((v_uid is not null and user_id = v_uid)
            or (v_uid is null and user_id is null and v_email <> '' and lower(email) = v_email))
     order by created_at
     limit 1;

    if found then
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

-- La función antigua conserva su firma, su retorno (el número de pedido) y sus permisos, pero ya no puede
-- duplicar: pasa por la nueva con una clave aleatoria, así que se aplica la defensa de «misma compra».
create or replace function public.crear_pedido(p_datos jsonb, p_productos uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  return (public.crear_pedido_idempotente(gen_random_uuid(), p_datos, p_productos) ->> 'numero')::bigint;
end;
$$;
