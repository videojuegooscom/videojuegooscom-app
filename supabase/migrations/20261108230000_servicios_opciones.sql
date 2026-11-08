-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: opciones de cada servicio (dueño, 2026-11-08: «quiero un desplegable con opciones iOS donde el cliente
--            pueda elegir si prefiere Básica o Completa, y poder añadir más opciones o subir y bajar los precios desde
--            Administración en su ficha de servicio, por individual»).
-- Qué hace:
--   - services.modalidades: las opciones del servicio, en orden, como [{"nombre": "Básica", "precio_eur": 45}, …]
--     (de 0 a 12). Las escribe el administrador en Administración → Servicios; [] = el servicio no tiene opciones.
--   - service_requests.modalidad y modalidad_precio_eur: la opción que eligió el cliente y su precio en ese momento.
--     El precio lo pone la base de datos (disparador trg_service_requests_modalidad) leyendo la opción del servicio:
--     nunca se fía del navegador; si la opción no existe en ese servicio, la solicitud se guarda sin opción.
-- Tipo:     aditiva (columnas nuevas con valor por defecto, una función de disparador sin permisos especiales y su
--           disparador). No borra nada. Repetirla no cambia nada.
-- ============================================================================

alter table public.services add column if not exists modalidades jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_modalidades_forma') then
    alter table public.services add constraint services_modalidades_forma
      check (jsonb_typeof(modalidades) = 'array' and jsonb_array_length(modalidades) <= 12);
  end if;
end $$;

alter table public.service_requests add column if not exists modalidad text;
alter table public.service_requests add column if not exists modalidad_precio_eur numeric(10, 2);

-- La opción elegida y su precio, desde el propio servicio (la lectura de services respeta sus reglas: un cliente solo
-- ve los servicios publicados y activos).
create or replace function public.solicitud_servicio_modalidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_precio numeric;
begin
  new.modalidad := nullif(btrim(coalesce(new.modalidad, '')), '');
  new.modalidad_precio_eur := null;
  if new.modalidad is null or new.service_id is null then
    new.modalidad := null;
    return new;
  end if;
  select round((m ->> 'precio_eur')::numeric, 2)
    into v_precio
    from public.services s
    cross join lateral jsonb_array_elements(s.modalidades) m
   where s.id = new.service_id
     and m ->> 'nombre' = new.modalidad
   limit 1;
  if v_precio is null then
    new.modalidad := null;
  else
    new.modalidad_precio_eur := v_precio;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_service_requests_modalidad') then
    create trigger trg_service_requests_modalidad
      before insert on public.service_requests
      for each row execute function public.solicitud_servicio_modalidad();
  end if;
end $$;
