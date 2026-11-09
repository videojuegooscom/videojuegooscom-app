-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «me gusta» en los servicios (dueño, 2026-11-03), igual que en los productos.
-- Qué hace: 1) services.like_count, el contador que enseña la ficha del servicio (empieza en 0).
--           2) servicio_apoyos: UN «me gusta» por persona y servicio (usuario con sesión, «usuario:<uuid>», o
--              visitante anónimo, «visitante:<identificador>»), como producto_apoyos para los productos
--              (20261018130000_visitas_y_apoyos_protegidos.sql). El contador solo cambia cuando cambia ese apunte.
--           3) fijar_apoyo_servicio(servicio, persona, activo): la única forma de cambiarlo, SOLO para service_role.
--              El navegador pasa por api/interaccion.ts, que pone los límites (como con los productos) y es quien
--              lee los «me gusta» de cada cliente para su pestaña «Me gusta» de Perfil.
-- Conectado con: public.services.like_count, public.servicio_apoyos y fijar_apoyo_servicio(); los usan api/interaccion.ts
--           (también para «Me gusta» de Perfil), app/servicio/[id].tsx y app/admin/services.tsx.
-- Tipo:     1 columna, 1 tabla y 1 función nuevas. No cambia ni borra ningún dato. Lleva security definer y
--           permisos (revoke/grant): la revisa y aplica el dueño.
-- Orden:    después de 20261018130000_visitas_y_apoyos_protegidos.sql (mismo patrón; no depende de ella).
-- Despliegue: sin esta migración la ficha del servicio no enseña el corazón y nada se rompe.
-- Vuelta atrás: quitar el permiso de la función (revoke execute … from service_role) deja los «me gusta» de
--           servicios sin efecto; los datos se quedan.
-- ============================================================================

alter table public.services add column if not exists like_count integer not null default 0;

create table if not exists public.servicio_apoyos (
  servicio_id uuid not null references public.services(id) on delete cascade,
  -- «usuario:<uuid>» (con sesión) o «visitante:<identificador del navegador>» (sin ella).
  persona text not null check (char_length(persona) between 10 and 100),
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (servicio_id, persona)
);

alter table public.servicio_apoyos enable row level security;
-- Sin políticas: nadie la toca desde el navegador. Se quitan además los permisos por defecto de Supabase.
revoke all on table public.servicio_apoyos from anon, authenticated;

-- Pone el «me gusta» de UNA persona en un servicio (p_activo = true: lo da; false: lo quita) y devuelve el
-- like_count resultante. Repetir la misma acción mil veces suma una vez; dos peticiones simultáneas de la
-- misma persona se ponen en fila.
create or replace function public.fijar_apoyo_servicio(p_servicio uuid, p_persona text, p_activo boolean)
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
  if p_servicio is null or p_persona is null or p_activo is null or char_length(p_persona) not between 10 and 100 then
    raise exception 'apoyo no válido';
  end if;

  if not exists (select 1 from public.services where id = p_servicio) then
    raise exception 'servicio no encontrado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('apoyo-servicio:' || p_servicio::text || ':' || p_persona, 0));

  select activo into v_antes from public.servicio_apoyos where servicio_id = p_servicio and persona = p_persona;
  if not found then
    if p_activo then
      insert into public.servicio_apoyos (servicio_id, persona, activo) values (p_servicio, p_persona, true);
      v_delta := 1;
    end if;
  elsif v_antes is distinct from p_activo then
    update public.servicio_apoyos set activo = p_activo, actualizado_en = now() where servicio_id = p_servicio and persona = p_persona;
    v_delta := case when p_activo then 1 else -1 end;
  end if;

  update public.services set like_count = greatest(0, like_count + v_delta) where id = p_servicio returning like_count into v_total;
  if not found then
    raise exception 'servicio no encontrado';
  end if;
  return v_total;
end;
$$;

revoke all on function public.fijar_apoyo_servicio(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fijar_apoyo_servicio(uuid, text, boolean) to service_role;
