-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Reservas con señal» listas para el cliente (dueño, 2026-11-15: «si aparecen en la app ya tienen que estar
-- preparadas para que las vea nuestro cliente, que no ponga nada extraño, aunque estén apagadas»).
--   Rehace public.reserva_ajustes_validar() (create or replace) manteniendo TODO lo que ya hacía (escala de 1 a 12 tramos,
--   días enteros crecientes 1-365, porcentaje entero 1-70, días máximos dentro de la escala, y no activar sin todas las
--   reglas, sin «Revisado por mi gestor» o con la marca «Pendiente de revisión del gestor»). Además NO deja activar si el
--   texto de las condiciones o «Qué pasa al vencer» aún tienen notas internas del borrador: «[A DECIDIR», «NOTA PARA EL
--   GESTOR», «PUNTO A REVISAR», «comprobar en el BOE», «BORRADOR», las dos «VARIANTE A» y «VARIANTE B» a la vez, o una marca
--   {…} que no sea {porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur} o {precio_eur} (esas cinco se rellenan solas con
--   los datos de cada reserva). El mensaje dice qué falta, en una lista, como ya hacía con las reglas.
-- Qué hace: impide activar las reservas con señal mientras el texto que verá el cliente tenga notas internas.
-- Conectado con: lib/reservas.ts (notasInternasReserva, rellenarCondicionesReserva), api/pago.ts (la misma comprobación
--           antes de dar los ajustes públicos y de crear una reserva), app/admin/reservas.tsx (lista de lo que falta),
--           pruebas/perfiles-sql.mjs, pruebas/pago-api.mjs y pruebas/perfil-datos.mjs (sección RESEN).
-- Tipo:     SOLO CAMBIA una función de disparador normal (sin permisos especiales). No borra filas ni columnas ni cambia
--           permisos. Se puede aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

create or replace function public.reserva_ajustes_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_prev integer := 0;
  v_dias numeric;
  v_pct numeric;
  v_faltan text[] := '{}';
  v_campo text;
  v_texto text;
  v_notas text[];
  v_marca text;
begin
  new.id := 1;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  new.al_vencer := nullif(btrim(coalesce(new.al_vencer, '')), '');
  new.texto_condiciones := nullif(btrim(coalesce(new.texto_condiciones, '')), '');
  if new.escala is not null and new.escala = '[]'::jsonb then
    new.escala := null;
  end if;

  -- La escala: lista de 1 a 12 tramos {hasta_dias, porcentaje}, días enteros crecientes (1-365) y porcentaje entero 1-70.
  if new.escala is not null then
    if jsonb_typeof(new.escala) <> 'array' or jsonb_array_length(new.escala) > 12 then
      raise exception 'La escala tiene que ser una lista de 1 a 12 tramos.' using errcode = 'P0001';
    end if;
    for v_item in select value from jsonb_array_elements(new.escala) loop
      if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'hasta_dias') <> 'number' or jsonb_typeof(v_item -> 'porcentaje') <> 'number' then
        raise exception 'Cada tramo de la escala necesita días y porcentaje.' using errcode = 'P0001';
      end if;
      v_dias := (v_item ->> 'hasta_dias')::numeric;
      v_pct := (v_item ->> 'porcentaje')::numeric;
      if v_dias <> trunc(v_dias) or v_dias < 1 or v_dias > 365 or v_dias <= v_prev then
        raise exception 'Los días de la escala tienen que ser enteros, de 1 a 365 y crecientes.' using errcode = 'P0001';
      end if;
      if v_pct <> trunc(v_pct) or v_pct < 1 or v_pct > 70 then
        raise exception 'El porcentaje de cada tramo tiene que ser un entero del 1 al 70.' using errcode = 'P0001';
      end if;
      v_prev := v_dias::integer;
    end loop;
    if new.dias_max is not null and new.dias_max > v_prev then
      raise exception 'Los días máximos no pueden pasar del último tramo de la escala.' using errcode = 'P0001';
    end if;
  end if;

  -- Activar solo con todas las reglas, el texto revisado por el gestor y sin notas internas en lo que verá el cliente.
  if new.activa then
    if new.escala is null then v_faltan := array_append(v_faltan, 'la escala'); end if;
    if new.dias_max is null then v_faltan := array_append(v_faltan, 'los días máximos'); end if;
    if new.tipo_arras is null then v_faltan := array_append(v_faltan, 'el tipo de arras'); end if;
    if new.al_vencer is null then v_faltan := array_append(v_faltan, 'qué pasa al vencer'); end if;
    if new.texto_condiciones is null then v_faltan := array_append(v_faltan, 'el texto de las condiciones'); end if;
    if not new.condiciones_revisadas then v_faltan := array_append(v_faltan, 'la revisión del gestor'); end if;
    if new.texto_condiciones ilike '%pendiente de revisión del gestor%' then v_faltan := array_append(v_faltan, 'quitar la marca de borrador del texto'); end if;

    foreach v_campo in array array['condiciones', 'al_vencer'] loop
      v_texto := case when v_campo = 'condiciones' then coalesce(new.texto_condiciones, '') else coalesce(new.al_vencer, '') end;
      v_notas := '{}';
      if strpos(upper(v_texto), '[A DECIDIR') > 0 then v_notas := array_append(v_notas, 'los huecos «[A DECIDIR…]»'); end if;
      if strpos(upper(v_texto), 'NOTA PARA EL GESTOR') > 0 then v_notas := array_append(v_notas, 'la «NOTA PARA EL GESTOR»'); end if;
      if strpos(upper(v_texto), 'PUNTO A REVISAR') > 0 then v_notas := array_append(v_notas, 'el «PUNTO A REVISAR»'); end if;
      if strpos(upper(v_texto), 'COMPROBAR EN EL BOE') > 0 then v_notas := array_append(v_notas, 'las notas «comprobar en el BOE»'); end if;
      if strpos(upper(v_texto), 'BORRADOR') > 0 then v_notas := array_append(v_notas, 'la palabra «BORRADOR»'); end if;
      if v_texto ~* '\mvariante\s+a\M' and v_texto ~* '\mvariante\s+b\M' then
        v_notas := array_append(v_notas, 'una de las dos variantes (dejar solo la VARIANTE A o la B)');
      end if;
      for v_marca in select distinct m[1] from regexp_matches(v_texto, '\{([^{}]*)\}', 'g') as m loop
        if v_marca not in ('porcentaje', 'dias', 'fecha_vencimiento', 'senal_eur', 'precio_eur') then
          v_notas := array_append(v_notas, format('la marca «{%s}» (solo se rellenan solas {porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur} y {precio_eur})', v_marca));
        end if;
      end loop;
      if array_length(v_notas, 1) > 0 then
        v_faltan := array_append(
          v_faltan,
          case when v_campo = 'condiciones' then 'quitar del texto de las condiciones ' else 'quitar de «Qué pasa al vencer» ' end || array_to_string(v_notas, ', ')
        );
      end if;
    end loop;

    if array_length(v_faltan, 1) > 0 then
      raise exception 'Para activar las reservas con señal falta: %.', array_to_string(v_faltan, ', ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
