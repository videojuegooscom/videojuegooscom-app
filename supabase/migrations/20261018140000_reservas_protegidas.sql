-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: las reservas de la cesta dejan de poder acaparse desde el navegador.
-- Problema: reservar_producto(p_product_id, p_token) la podía ejecutar cualquiera (anon) sin límite, con un
--           token inventado por petición. Con solo 21 productos publicados (comprobado el 2026-10-18), un
--           script que renueva la reserva cada 14 minutos deja TODA la tienda «en la cesta de otro cliente»:
--           nadie más puede añadir nada. Los tokens son gratis, así que limitar por token no sirve.
-- Qué hace:
--   1) reservas_cesta.persona (columna nueva, opcional): quién reserva («usuario:<id>» si hay sesión o
--      «ip:<cubo>» si no; un cubo es un hash de la IP y el día, nunca la IP).
--   2) reservar_producto_limitado(producto, token, persona, máx. activas): igual que reservar_producto, pero
--      una persona no puede tener más de p_max_activas reservas vivas a la vez (si ya tiene esa, la renueva
--      sin gastar cupo; si no, lanza «demasiadas reservas activas»). Serializa por persona con un bloqueo
--      de asesoramiento para que 20 peticiones a la vez no se pasen del cupo. SOLO service_role.
--   3) reservar_producto (la antigua) deja de poder ejecutarse por PUBLIC, anon y authenticated: ahora se
--      reserva por api/interaccion.ts, que pone el límite por IP y el cupo por persona.
--   liberar_reserva y productos_reservados NO cambian (no se pueden usar para acaparar nada).
-- Tipo:     aditiva (columna e índice nuevos, función nueva) + REVOCA un permiso. Cambia permisos de una
--           función SECURITY DEFINER: la revisa y aplica el dueño. No borra ni modifica filas.
-- Orden:    primero fusionar y desplegar el código (api/interaccion.ts y lib/reservas.ts, que mientras
--           tanto usan la función antigua si el endpoint falla) y después aplicar esta migración.
-- Vuelta atrás: supabase/rollbacks/20261018140000_reservas_protegidas_revertir.sql
-- ============================================================================

alter table public.reservas_cesta add column if not exists persona text;
create index if not exists reservas_cesta_persona_idx on public.reservas_cesta (persona) where persona is not null;

create or replace function public.reservar_producto_limitado(p_product_id uuid, p_token uuid, p_persona text, p_max_activas integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hasta timestamptz := now() + interval '15 minutes';
  v_fin timestamptz;
  v_activas integer;
begin
  if p_product_id is null or p_token is null or p_persona is null or length(p_persona) = 0 or p_max_activas is null or p_max_activas < 1 then
    return null;
  end if;

  -- Una persona a la vez: sin esto, 20 peticiones simultáneas contarían todas «0 activas» y se pasarían del cupo.
  perform pg_advisory_xact_lock(hashtextextended('reserva:' || p_persona, 0));

  -- Las reservas vivas de esta persona, sin contar la de este producto (renovarla no gasta cupo).
  select count(*) into v_activas
    from public.reservas_cesta
   where persona = p_persona and reservado_hasta > now() and product_id <> p_product_id;
  if v_activas >= p_max_activas then
    raise exception 'demasiadas reservas activas' using errcode = 'P0001';
  end if;

  insert into public.reservas_cesta as r (product_id, token, reservado_hasta, persona)
  values (p_product_id, p_token, v_hasta, p_persona)
  on conflict (product_id) do update
    set token = excluded.token,
        reservado_hasta = excluded.reservado_hasta,
        persona = excluded.persona,
        updated_at = now()
    where r.token = excluded.token or r.reservado_hasta <= now()
  returning reservado_hasta into v_fin;

  return v_fin;
end;
$$;

revoke all on function public.reservar_producto_limitado(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reservar_producto_limitado(uuid, uuid, text, integer) to service_role;

-- La función antigua ya no la puede ejecutar el navegador (ni PUBLIC): se reserva por el endpoint.
revoke execute on function public.reservar_producto(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservar_producto(uuid, uuid) to service_role;
