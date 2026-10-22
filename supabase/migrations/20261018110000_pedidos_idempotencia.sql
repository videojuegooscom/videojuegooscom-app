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
--      carrito (otros productos), falla. Si con la misma clave llegan datos de entrega o contacto distintos
--      (la respuesta se perdió y el cliente corrigió el teléfono o la dirección, o cambió envío↔recogida),
--      se corrigen los datos del pedido mientras siga PENDIENTE (la clave solo la tiene ese navegador): ni se
--      duplica ni se devuelve un pedido con datos viejos.
--   2) MISMA COMPRA. Aunque la clave sea distinta (o no exista), si la misma persona (usuario con sesión, o
--      correo si no la tiene) ya tiene un pedido PENDIENTE con los mismos productos de los últimos 10
--      minutos: con los MISMOS datos de entrega y contacto, se devuelve ese pedido (cada artículo es una
--      unidad única, así que es un duplicado); con datos distintos y sesión, se corrigen los datos de ese
--      pedido; con datos distintos y SIN sesión se trata como otro pedido con sus propios datos (el correo
--      por sí solo no identifica a la persona) y el anterior no se toca.
--   La respuesta lleva además «actualizado» (true si se corrigieron los datos). Un pedido que la tienda ya
--   tramitó (no pendiente) nunca se cambia desde aquí.
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
comment on column public.pedidos.clave_huella is 'md5 de los productos del pedido: detecta que una clave se reutiliza con otro carrito y la misma compra repetida.';

-- Varios NULL no chocan entre sí: los pedidos creados antes de esta migración (sin clave) siguen valiendo.
create unique index if not exists pedidos_clave_unica_uidx on public.pedidos (clave_unica);
-- Para buscar rápido la «misma compra» reciente de una persona.
create index if not exists pedidos_huella_idx on public.pedidos (clave_huella, created_at desc);

-- Crea el pedido una sola vez por clave y por compra. Devuelve {"numero": n, "repetido": false|true,
-- "actualizado": false|true} («actualizado» = true: era un pedido ya existente y se corrigieron sus datos).
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
  -- Datos de entrega y contacto, normalizados igual que se guardan (para comparar y para guardar).
  v_nombre text := btrim(p_datos->>'nombre');
  v_email_dato text := btrim(p_datos->>'email');
  v_telefono text := btrim(p_datos->>'telefono');
  v_direccion text := nullif(btrim(p_datos->>'direccion'), '');
  v_codigo_postal text := nullif(btrim(p_datos->>'codigo_postal'), '');
  v_ciudad text := nullif(btrim(p_datos->>'ciudad'), '');
  v_notas text := nullif(btrim(p_datos->>'notas'), '');
  v_huella text;
  v_prev record;
  v_id uuid;
  v_numero bigint;
  v_total numeric(10, 2);
  v_count int;
  v_cambiadas int := 0;
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

  -- Huella del carrito: los productos sin repetir y ordenados. La entrega NO entra: pasar de envío a
  -- recogida (o al revés) es corregir el mismo pedido, no hacer otro.
  select md5(coalesce(string_agg(x::text, ',' order by x), ''))
    into v_huella
    from (select distinct unnest(p_productos) as x) s;

  -- Pone en fila las llamadas simultáneas (se liberan solas al acabar la transacción). Siempre en este
  -- orden: primero la compra (persona + carrito), después la clave. Tras esperar, cada sentencia ve ya
  -- el pedido que acaba de crear la otra.
  perform pg_advisory_xact_lock(hashtextextended('compra:' || coalesce(v_uid::text, v_email) || ':' || v_huella, 0));
  perform pg_advisory_xact_lock(hashtextextended('clave:' || p_clave::text, 0));

  for v_vuelta in 1..2 loop
    -- 1) La misma clave: es un reintento si es la misma persona y los mismos productos.
    select id, numero, user_id, clave_huella, estado,
           (entrega = v_entrega and nombre is not distinct from v_nombre and lower(email) = v_email
            and telefono is not distinct from v_telefono and direccion is not distinct from v_direccion
            and codigo_postal is not distinct from v_codigo_postal and ciudad is not distinct from v_ciudad
            and notas is not distinct from v_notas) as iguales
      into v_prev
      from public.pedidos
     where clave_unica = p_clave;

    if found then
      if v_prev.user_id is distinct from v_uid or v_prev.clave_huella is distinct from v_huella then
        raise exception 'la clave del pedido ya se usó con otro pedido';
      end if;
      -- Reintento con datos corregidos (la respuesta se perdió y el cliente cambió el teléfono, la dirección o
      -- envío↔recogida): la clave solo la tiene ese navegador, así que se corrige el pedido mientras la tienda
      -- no lo haya tramitado. Con los mismos datos (reintento real) no se toca nada.
      if not v_prev.iguales and v_prev.estado = 'pendiente' then
        update public.pedidos
           set entrega = v_entrega, nombre = v_nombre, email = v_email_dato, telefono = v_telefono,
               direccion = v_direccion, codigo_postal = v_codigo_postal, ciudad = v_ciudad, notas = v_notas
         where id = v_prev.id and estado = 'pendiente';
        get diagnostics v_cambiadas = row_count;
      end if;
      return jsonb_build_object('numero', v_prev.numero, 'repetido', true, 'actualizado', v_cambiadas > 0);
    end if;

    -- 2) La misma compra con otra clave: mismos productos, misma persona, pedido pendiente de hace menos de
    --    10 min. 2a) Con los MISMOS datos de entrega y contacto es un duplicado: se devuelve ese pedido.
    select id, numero into v_prev
      from public.pedidos
     where clave_huella = v_huella
       and estado = 'pendiente'
       and created_at > now() - interval '10 minutes'
       and ((v_uid is not null and user_id = v_uid)
            or (v_uid is null and user_id is null and v_email <> '' and lower(email) = v_email))
       and entrega = v_entrega and nombre is not distinct from v_nombre and lower(email) = v_email
       and telefono is not distinct from v_telefono and direccion is not distinct from v_direccion
       and codigo_postal is not distinct from v_codigo_postal and ciudad is not distinct from v_ciudad
       and notas is not distinct from v_notas
     order by created_at
     limit 1;

    if found then
      return jsonb_build_object('numero', v_prev.numero, 'repetido', true, 'actualizado', false);
    end if;

    -- 2b) Con datos distintos y SESIÓN: la misma persona corrige su pedido, así que se corrigen sus datos en
    --     vez de crear otro. SIN sesión, datos distintos se tratan como otro pedido (el correo por sí solo no
    --     identifica a la persona): se crea abajo con sus propios datos y el anterior no se toca.
    if v_uid is not null then
      select id, numero into v_prev
        from public.pedidos
       where clave_huella = v_huella
         and estado = 'pendiente'
         and created_at > now() - interval '10 minutes'
         and user_id = v_uid
       order by created_at
       limit 1
         for update;

      if found then
        update public.pedidos
           set entrega = v_entrega, nombre = v_nombre, email = v_email_dato, telefono = v_telefono,
               direccion = v_direccion, codigo_postal = v_codigo_postal, ciudad = v_ciudad, notas = v_notas
         where id = v_prev.id and estado = 'pendiente';
        get diagnostics v_cambiadas = row_count;
        if v_cambiadas > 0 then
          return jsonb_build_object('numero', v_prev.numero, 'repetido', true, 'actualizado', true);
        end if;
      end if;
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
      v_nombre,
      v_email_dato,
      v_telefono,
      v_direccion,
      v_codigo_postal,
      v_ciudad,
      v_notas,
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

      return jsonb_build_object('numero', v_numero, 'repetido', false, 'actualizado', false);
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
