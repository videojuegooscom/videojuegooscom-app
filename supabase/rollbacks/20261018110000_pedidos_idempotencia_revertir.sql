-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018110000_pedidos_idempotencia.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más):
--   1) Restaura el cuerpo ORIGINAL de crear_pedido (copia exacta de 20261013120000_pedidos.sql), con la
--      misma firma y los mismos permisos.
--   2) Quita el permiso de ejecutar crear_pedido_idempotente a anon y authenticated: la función nueva queda
--      apagada al instante. El navegador, si recibe «permission denied» o «function not found», cae a
--      crear_pedido, así que la tienda sigue aceptando pedidos, sin idempotencia, como antes.
--
-- Qué NO hace, a propósito: no elimina las columnas clave_unica y clave_huella, los índices ni la función
-- nueva. Son inofensivos (columnas nulas, índices y una función sin permisos) y conservan las claves de los
-- pedidos que ya se hayan hecho. Si el dueño quiere limpiarlos del todo, es una decisión aparte y manual.
--
-- Comprobación previa (solo lectura): quién puede ejecutar la función nueva ahora.
--   select proacl::text from pg_proc where proname = 'crear_pedido_idempotente';
-- Comprobación posterior: la lista ya no debe incluir anon ni authenticated.
-- ============================================================================

create or replace function public.crear_pedido(p_datos jsonb, p_productos uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega text := coalesce(nullif(p_datos->>'entrega', ''), 'envio');
  v_id uuid;
  v_numero bigint;
  v_total numeric(10, 2);
  v_count int;
begin
  if p_productos is null or array_length(p_productos, 1) is null or array_length(p_productos, 1) > 20 then
    raise exception 'pedido sin productos';
  end if;
  if v_entrega not in ('envio', 'recogida') then
    raise exception 'entrega no válida';
  end if;

  select count(*), coalesce(sum(price_eur), 0)
    into v_count, v_total
    from public.products
   where id = any(p_productos) and status = 'PUBLISHED' and is_active;

  if v_count = 0 then
    raise exception 'productos no disponibles';
  end if;

  insert into public.pedidos (user_id, entrega, nombre, email, telefono, direccion, codigo_postal, ciudad, notas, total_eur)
  values (
    auth.uid(),
    v_entrega,
    btrim(p_datos->>'nombre'),
    btrim(p_datos->>'email'),
    btrim(p_datos->>'telefono'),
    nullif(btrim(p_datos->>'direccion'), ''),
    nullif(btrim(p_datos->>'codigo_postal'), ''),
    nullif(btrim(p_datos->>'ciudad'), ''),
    nullif(btrim(p_datos->>'notas'), ''),
    v_total
  )
  returning id, numero into v_id, v_numero;

  insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur)
  select v_id, id, title, coalesce(price_eur, 0)
    from public.products
   where id = any(p_productos) and status = 'PUBLISHED' and is_active;

  return v_numero;
end;
$$;

revoke execute on function public.crear_pedido_idempotente(uuid, jsonb, uuid[]) from anon, authenticated;
