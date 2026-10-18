-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «me gusta» y visitas dejan de poder inflarse (o desinflarse) llamando a la base de datos.
-- Problema: adjust_product_like(product_id, ±1), increment_product_view(product_id) e
--           increment_service_view(service_id) son SECURITY DEFINER y las puede ejecutar cualquiera, sin sesión
--           y sin límite: un script puede subir o bajar el «me gusta» de cualquier producto y sus visitas tantas
--           veces como quiera. Esas cifras alimentan decisiones (qué rebajar en VeoAura, qué enseñar).
--           En producción no existen tablas de «me gusta» ni de visitas: solo los contadores like_count y
--           view_count de products/services (la «vez que ya diste me gusta» solo vive en el navegador).
-- Solución: 1) Los «me gusta» se apuntan UNO POR PERSONA Y PRODUCTO (usuario con sesión o visitante anónimo
--              con su identificador) en producto_apoyos, y el contador solo cambia cuando cambia ese apunte.
--           2) Las tres funciones antiguas dejan de ser ejecutables por anon y authenticated, y se crean
--              funciones nuevas SOLO para service_role (sumar_vista_producto, sumar_vista_servicio y
--              fijar_apoyo). El navegador pasa por api/interaccion.ts, que pone los límites (un solo
--              «cuenta» por visitante y producto cada hora, y tope de peticiones por IP) con la función de
--              límite compartido de 20261018120000_limite_peticiones.sql.
-- Tipo:     1 tabla y 3 funciones nuevas, y 3 permisos quitados a funciones existentes (no se cambia ni se
--           borra ningún dato ni código de las funciones antiguas). Lleva security definer y permisos
--           (revoke/grant): la revisa y aplica el dueño.
-- Orden:    después de 20261018120000_limite_peticiones.sql (la usa api/interaccion.ts, no esta migración).
-- Despliegue: el navegador nuevo cae a las funciones antiguas si el endpoint no responde; tras aplicar esta
--           migración esa vía queda cerrada. Un navegador antiguo (pestaña abierta) dejará de poder contar
--           visitas y dar «me gusta» hasta recargar, sin errores visibles.
-- Vuelta atrás: supabase/rollbacks/20261018130000_visitas_y_apoyos_protegidos_revertir.sql
-- Pruebas:  pruebas/interaccion-sql.mjs y pruebas/interaccion-api.mjs (SQL real en una base aislada).
-- ============================================================================

create table if not exists public.producto_apoyos (
  producto_id uuid not null references public.products(id) on delete cascade,
  -- «usuario:<uuid>» (con sesión) o «visitante:<identificador del navegador>» (sin ella).
  persona text not null check (char_length(persona) between 10 and 100),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, persona)
);

alter table public.producto_apoyos enable row level security;
-- Sin políticas: nadie la toca desde el navegador. Se quitan además los permisos por defecto de Supabase.
revoke all on table public.producto_apoyos from anon, authenticated;

-- Pone el «me gusta» de UNA persona en un producto (p_activo = true: lo da; false: lo quita) y devuelve el
-- like_count resultante. El contador solo cambia si cambia el apunte de esa persona: repetir la misma
-- acción mil veces suma una vez. Dos peticiones simultáneas de la misma persona se ponen en fila.
create or replace function public.fijar_apoyo(p_producto uuid, p_persona text, p_activo boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes boolean;
  v_delta integer := 0;
  v_total integer;
begin
  if p_producto is null or p_persona is null or p_activo is null or char_length(p_persona) not between 10 and 100 then
    raise exception 'apoyo no válido';
  end if;

  if not exists (select 1 from public.products where id = p_producto) then
    raise exception 'producto no encontrado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('apoyo:' || p_producto::text || ':' || p_persona, 0));

  select activo into v_antes from public.producto_apoyos where producto_id = p_producto and persona = p_persona;
  if not found then
    if p_activo then
      insert into public.producto_apoyos (producto_id, persona, activo) values (p_producto, p_persona, true);
      v_delta := 1;
    end if;
  elsif v_antes is distinct from p_activo then
    update public.producto_apoyos set activo = p_activo, actualizado_en = now() where producto_id = p_producto and persona = p_persona;
    v_delta := case when p_activo then 1 else -1 end;
  end if;

  update public.products set like_count = greatest(0, like_count + v_delta) where id = p_producto returning like_count into v_total;
  if not found then
    raise exception 'producto no encontrado';
  end if;
  return v_total;
end;
$$;

-- Suman 1 a las visitas. La defensa (un solo «cuenta» por visitante y página cada hora) está en
-- api/interaccion.ts; estas funciones ya no las puede llamar el navegador directamente.
create or replace function public.sumar_vista_producto(p_producto uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.products set view_count = view_count + 1 where id = p_producto returning view_count into v_total;
  return v_total;
end;
$$;

create or replace function public.sumar_vista_servicio(p_servicio uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.services set view_count = view_count + 1 where id = p_servicio returning view_count into v_total;
  return v_total;
end;
$$;

revoke all on function public.fijar_apoyo(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.sumar_vista_producto(uuid) from public, anon, authenticated;
revoke all on function public.sumar_vista_servicio(uuid) from public, anon, authenticated;
grant execute on function public.fijar_apoyo(uuid, text, boolean) to service_role;
grant execute on function public.sumar_vista_producto(uuid) to service_role;
grant execute on function public.sumar_vista_servicio(uuid) to service_role;

-- Cierra la puerta antigua: el navegador ya no puede subir ni bajar contadores directamente. OJO: en
-- producción estas tres funciones tienen además el permiso de «todos» (PUBLIC: «=X/postgres» en su lista de
-- permisos), que da acceso a anon aunque se le quite el suyo; por eso se quita también a PUBLIC. service_role
-- y el dueño (postgres) conservan el suyo.
revoke execute on function public.adjust_product_like(uuid, integer) from public, anon, authenticated;
revoke execute on function public.increment_product_view(uuid) from public, anon, authenticated;
revoke execute on function public.increment_service_view(uuid) from public, anon, authenticated;
