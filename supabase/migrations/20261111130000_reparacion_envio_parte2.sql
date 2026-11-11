-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reparación por envío, parte 2 de 2 (dueño, 2026-11-11: «vamos adelante con la parte 2» y «déjalo activado
--            tú, la reparación por envío. La dirección del taller es la misma que aparece en las políticas de la tienda»).
--   La parte 1 es 20261111100000_reparacion_envio.sql (ya aplicada).
-- Qué hace:
--   0) Peso por servicio (el dueño no sabía qué poner en «peso del aparato embalado»: un mando no pesa como una consola).
--      services.envio_peso_kg = peso de UN aparato de ese servicio con su caja, y envio_peso_estimado (true hasta que el
--      dueño lo guarde en Administración → Servicios, en la ficha del servicio). La migración rellena, SOLO donde está
--      vacío, un peso ESTIMADO por el título (tramos de Correos: hasta 1, 2, 3, 4, 5, 10… kg): mandos, joysticks, móviles
--      y auriculares 1 kg; Switch, tabletas y Steam Deck 2 kg; portátiles 3 kg; PlayStation, Xbox y otras consolas 5 kg.
--      Los títulos que no encajan se quedan vacíos y usan el peso por defecto de los ajustes. Hoy (11-11) hay 3 servicios:
--      «Mantenimiento Playstation 5» y «Mantenimiento Playstation 4» → 5 kg, «Sustitución de joysticks» → 1 kg.
--      La etiqueta (disparador reparacion_envio_al_crear, misma función reescrita) usa el peso del servicio de la
--      solicitud y, si no tiene, reparacion_envio_ajustes.peso_aparato_kg (peso por defecto). lib/envio.ts
--      (pesoAparatoReparacion) enseña lo mismo antes de pedir.
--      ACTIVACIÓN (ordenada por el dueño el 2026-11-11): dirección del taller = la de la política de privacidad ya
--      publicada («C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza»), peso_estimado = false (el peso por defecto
--      queda solo de respaldo: los estimados se ven por servicio) y activo = true. Solo si el dueño aún no ha tocado los
--      ajustes desde el panel (updated_by vacío): aplicarla otra vez no deshace lo que él cambie después.
--   1) Cobros. El cliente paga la ETIQUETA (etiqueta_eur) y, con la reparación «listo» y el presupuesto aceptado, el
--      TOTAL (presupuesto_eur; la vuelta va incluida) con «Pagar y enviármelo». Con tarjeta (api/pago.ts?solicitud, el
--      importe sale de aquí y «pagado» lo confirma el servidor preguntando a Stripe) o por Bizum/transferencia: el cliente
--      solo AVISA («Ya lo he pagado»: etiqueta_avisada_en / pago_avisado_en, con la hora de la base de datos) y el
--      administrador marca pagado. Columnas nuevas: etiqueta_pago_modo, etiqueta_avisada_en, pago_avisado_en,
--      stripe_sesion (el último cobro abierto con tarjeta, para no abrir dos) y vuelta_seguimiento (el número de Correos
--      de la vuelta, al pasar a «enviada»). Al marcar pago_estado = 'pagado', pagado_eur lo pone la base de datos (el
--      presupuesto o, si no tiene arreglo, la vuelta) y pagado_en, la hora si no viene; un pagado ya no cambia de importe.
--   2) «Si no tiene arreglo»: diagnostico_resultado ('reparable' o 'sin_arreglo'; no toca la comprobación de etapas),
--      oferta_compra_eur (opcional, «Te lo compramos por»), vuelta_eur (lo calcula la base de datos al marcar
--      'sin_arreglo' con la MISMA tarifa y el MISMO peso que la etiqueta: calcular_envio('envio', cp, 0, etiqueta_peso_kg))
--      y la elección del cliente sin_arreglo_eleccion ('comprar' o 'devolver', una vez, con su hora).
--   3) Garantía: reparacion_envio_ajustes.garantia_meses (12 por defecto: el dueño aprobó «Ha vuelto a fallar» dentro de
--      1 año), service_requests.entregado_en (lo pone la base de datos al pasar a «entregado») y garantia_de (la
--      reparación original). Un cliente crea la solicitud de garantía él mismo; la base de datos comprueba que la
--      reparación es SUYA, está ENTREGADA y dentro de plazo (desde la entrega de la original; sin fecha de entrega, la de
--      su última etapa) y que no hay otra garantía abierta de la misma; copia el servicio, sus datos y el envío, y pone
--      presupuesto 0 (aceptado) y etiqueta 0: la garantía no cuesta nada, tampoco la etiqueta (decisión de Claude, se le
--      dice al dueño; si la quiere cobrar, se cambia aquí).
--   4) Política «Reparación por envío» (policy_pages): el paso 6 de «Cómo funciona» explica «Pagar y enviármelo» y la
--      «Garantía» explica «Garantía hasta…» y «Ha vuelto a fallar», sin cifras. Solo si esas frases siguen como las dejó
--      la parte 1 (lo que el dueño haya editado no se toca).
--   El cliente, sobre SU solicitud, sigue sin poder cambiar nada más que: aceptar el presupuesto, avisar de un pago y
--   elegir qué hacemos si no tiene arreglo (disparador reparacion_envio_cliente_cambia, misma función reescrita).
-- Conectado con: public.services, public.service_requests, public.reparacion_envio_ajustes, calcular_envio()/zona_envio()
--           (20261104210000 y 20261107120000), la parte 1; api/pago.ts (acción «crear» con «solicitud»), lib/envio.ts,
--           components/ContratarServicioModal.tsx, app/(tabs)/perfil.tsx, app/vender.tsx, app/admin/services.tsx,
--           app/admin/analytics.tsx, api/blue-ia.ts, pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (RE3).
-- Tipo:     aditiva: columnas nuevas, comprobaciones nuevas, un índice, dos funciones de disparador reescritas con el mismo
--           nombre (create or replace, con los permisos de quien llama, como en la parte 1) y dos update de datos (pesos
--           vacíos y la activación pedida). No quita ni borra nada, no da permisos ni crea reglas nuevas. Repetible.
-- Vuelta atrás (la decide y la hace el dueño): desactivarla en Administración → Servicios → «Reparación por envío»; las
--           columnas nuevas se quedan sin uso. Para volver a los disparadores de la parte 1, aplicar otra vez sus dos
--           «create or replace function» de 20261111100000_reparacion_envio.sql.
-- ============================================================================

-- 0) Peso por servicio.
alter table public.services add column if not exists envio_peso_kg numeric(6, 3);
alter table public.services add column if not exists envio_peso_estimado boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_envio_peso_check' and conrelid = 'public.services'::regclass) then
    alter table public.services add constraint services_envio_peso_check check (envio_peso_kg is null or (envio_peso_kg > 0 and envio_peso_kg <= 30));
  end if;
end $$;

update public.services s
   set envio_peso_kg = v.kg, envio_peso_estimado = true
  from (
    select id,
           case
             when title ~* '(mando|joystick|dualsense|dualshock|joy-?con|m[oó]vil|iphone|smartphone|tel[eé]fono|auricular)' then 1
             when title ~* '(switch|tablet|ipad|steam deck)' then 2
             when title ~* '(port[aá]til|laptop|macbook|ordenador)' then 3
             when title ~* '(playstation|ps[1-5]|xbox|consola|wii|gamecube)' then 5
           end as kg
      from public.services
  ) v
 where s.id = v.id and s.envio_peso_kg is null and v.kg is not null;

-- Ajustes: meses de garantía.
alter table public.reparacion_envio_ajustes add column if not exists garantia_meses smallint not null default 12;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reparacion_envio_ajustes_garantia_check' and conrelid = 'public.reparacion_envio_ajustes'::regclass) then
    alter table public.reparacion_envio_ajustes add constraint reparacion_envio_ajustes_garantia_check check (garantia_meses between 1 and 60);
  end if;
end $$;

-- Activación ordenada por el dueño (2026-11-11), solo si aún no ha tocado los ajustes desde el panel.
update public.reparacion_envio_ajustes
   set direccion_taller = coalesce(direccion_taller, 'C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza'),
       peso_estimado = false,
       activo = true,
       updated_at = now()
 where id = 1 and updated_by is null and not activo;

-- Política «Reparación por envío»: cómo se paga y la garantía documentada («Textos para clientes: al cambiar cómo se paga
-- se cambian todos»). Solo cambia las frases que siguen como las dejó la parte 1 (si el dueño ya las ha editado, no se
-- tocan) y sin cifras: el plazo de la garantía lo ve el cliente en su seguimiento.
update public.policy_pages p
   set sections = (
     select jsonb_agg(
              case
                when e ->> 'heading' = 'Cómo funciona' then
                  jsonb_set(e, '{body}', to_jsonb(replace(e ->> 'body',
                    '6. Te lo devolvemos reparado y puedes seguir cada paso en Mis seguimientos.',
                    '6. Cuando esté lista, la pagas desde Mis seguimientos con «Pagar y enviármelo» (con tarjeta, Bizum o transferencia, según lo que veas allí; la vuelta va incluida) y te la enviamos con su número de Correos. La etiqueta del principio se paga igual, desde tu seguimiento.')))
                when e ->> 'heading' = 'Garantía' and e ->> 'body' = 'La reparación tiene la garantía que figura en tu presupuesto o en tu factura.' then
                  jsonb_set(e, '{body}', to_jsonb('La reparación tiene garantía hasta la fecha que ves en Mis seguimientos («Garantía hasta…»). Si vuelve a fallar dentro de ese plazo, toca «Ha vuelto a fallar» y lo revisamos gratis, también la etiqueta de Correos.'::text))
                else e
              end
              order by i)
       from jsonb_array_elements(p.sections) with ordinality as t(e, i))
 where p.slug = 'reparacion-envio'
   and jsonb_typeof(p.sections) = 'array'
   and jsonb_array_length(p.sections) > 0
   and (p.sections::text like '%6. Te lo devolvemos reparado y puedes seguir cada paso en Mis seguimientos.%'
        or p.sections::text like '%La reparación tiene la garantía que figura en tu presupuesto o en tu factura.%');

-- 1-3) Columnas de la solicitud.
alter table public.service_requests add column if not exists etiqueta_pago_modo text;
alter table public.service_requests add column if not exists etiqueta_avisada_en timestamptz;
alter table public.service_requests add column if not exists pago_avisado_en timestamptz;
alter table public.service_requests add column if not exists stripe_sesion text;
alter table public.service_requests add column if not exists vuelta_seguimiento text;
alter table public.service_requests add column if not exists diagnostico_resultado text;
alter table public.service_requests add column if not exists oferta_compra_eur numeric(10, 2);
alter table public.service_requests add column if not exists vuelta_eur numeric(10, 2);
alter table public.service_requests add column if not exists sin_arreglo_eleccion text;
alter table public.service_requests add column if not exists sin_arreglo_eleccion_en timestamptz;
alter table public.service_requests add column if not exists entregado_en timestamptz;
-- (sin clave ajena: así el administrador puede seguir quitando una solicitud antigua; la comprueba el disparador)
alter table public.service_requests add column if not exists garantia_de uuid;

create index if not exists service_requests_garantia_de_idx on public.service_requests (garantia_de) where garantia_de is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_requests_parte2_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_parte2_check check (
      (etiqueta_pago_modo is null or etiqueta_pago_modo in ('bizum', 'transferencia', 'tarjeta', 'prueba'))
      and (stripe_sesion is null or char_length(stripe_sesion) between 10 and 255)
      and (vuelta_seguimiento is null or char_length(btrim(vuelta_seguimiento)) between 4 and 60)
      and (diagnostico_resultado is null or diagnostico_resultado in ('reparable', 'sin_arreglo'))
      and (oferta_compra_eur is null or (oferta_compra_eur >= 0 and oferta_compra_eur <= 99999))
      and (vuelta_eur is null or (vuelta_eur >= 0 and vuelta_eur <= 999))
      and (sin_arreglo_eleccion is null or sin_arreglo_eleccion in ('comprar', 'devolver')));
  end if;
end $$;

-- Al crear una solicitud (misma función que la parte 1, ampliada): lo interno nunca lo pone quien la envía; por Correos,
-- la etiqueta la calcula la base de datos con el peso del servicio (o el de los ajustes) y la tarifa de su zona; y la
-- garantía solo de una reparación suya, entregada y dentro de plazo.
create or replace function public.reparacion_envio_al_crear()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_activo boolean;
  v_peso_aparato numeric;
  v_peso_servicio numeric;
  v_meses smallint;
  v_zona text;
  v_con_tramos boolean;
  v_peso numeric;
  v_pedida public.service_requests%rowtype;
  v_orig public.service_requests%rowtype;
begin
  if not public.is_admin() then
    new.etiqueta_eur := null;
    new.etiqueta_peso_kg := null;
    new.etiqueta_path := null;
    new.etiqueta_pagada_en := null;
    new.etiqueta_pago_modo := null;
    new.etiqueta_avisada_en := null;
    new.presupuesto_eur := null;
    new.presupuesto_aceptado_en := null;
    new.recepcion_fotos := '[]'::jsonb;
    new.espera_pieza_hasta := null;
    new.pago_estado := null;
    new.pago_modo := null;
    new.pagado_eur := null;
    new.pagado_en := null;
    new.pago_avisado_en := null;
    new.stripe_sesion := null;
    new.vuelta_seguimiento := null;
    new.diagnostico_resultado := null;
    new.oferta_compra_eur := null;
    new.vuelta_eur := null;
    new.sin_arreglo_eleccion := null;
    new.sin_arreglo_eleccion_en := null;
    new.entregado_en := null;

    -- Garantía («Ha vuelto a fallar»): solo de una reparación SUYA, entregada y dentro de plazo.
    if new.garantia_de is not null then
      if new.customer_user_id is null then
        raise exception 'Inicia sesión para pedir la garantía de tu reparación.' using errcode = '42501';
      end if;
      select * into v_pedida from public.service_requests o where o.id = new.garantia_de;
      if not found or v_pedida.customer_user_id is distinct from new.customer_user_id then
        raise exception 'No encontramos esa reparación en tu cuenta.' using errcode = '42501';
      end if;
      if v_pedida.seguimiento is distinct from 'entregado' then
        raise exception 'La garantía se pide cuando la reparación ya está entregada.' using errcode = '42501';
      end if;
      -- El plazo cuenta desde la reparación original (una garantía no alarga la garantía).
      v_orig := v_pedida;
      if v_pedida.garantia_de is not null then
        select * into v_orig from public.service_requests o where o.id = v_pedida.garantia_de;
        if not found or v_orig.customer_user_id is distinct from new.customer_user_id then
          raise exception 'No encontramos esa reparación en tu cuenta.' using errcode = '42501';
        end if;
      end if;
      select a.garantia_meses into v_meses from public.reparacion_envio_ajustes a where a.id = 1;
      if coalesce(v_orig.entregado_en, v_orig.seguimiento_actualizado, v_orig.updated_at) + make_interval(months => coalesce(v_meses, 12)) < now() then
        raise exception 'La garantía de esta reparación ya ha terminado.' using errcode = '42501';
      end if;
      if exists (select 1 from public.service_requests g where g.garantia_de = v_orig.id and g.seguimiento not in ('entregado', 'cancelado')) then
        raise exception 'Ya tienes abierta la garantía de esta reparación: síguela en Mis seguimientos.' using errcode = '42501';
      end if;
      new.garantia_de := v_orig.id;
      new.service_id := v_orig.service_id;
      new.service_title := v_orig.service_title;
      new.nombre := v_orig.nombre;
      new.apellido := v_orig.apellido;
      new.metodo_contacto := v_orig.metodo_contacto;
      new.contacto := v_orig.contacto;
      new.ciudad := v_orig.ciudad;
      new.direccion := v_orig.direccion;
      new.modalidad := null;
      new.entrega_modo := coalesce(v_orig.entrega_modo, 'recogida');
      -- Gratis: presupuesto 0 ya aceptado y, por Correos, etiqueta 0 con el mismo peso.
      new.presupuesto_eur := 0;
      new.presupuesto_aceptado_en := now();
      if new.entrega_modo = 'correos' then
        new.aparatos := coalesce(v_orig.aparatos, 1);
        new.codigo_postal := v_orig.codigo_postal;
        new.condiciones_aceptadas_en := now();
        new.etiqueta_peso_kg := v_orig.etiqueta_peso_kg;
        new.etiqueta_eur := 0;
      else
        new.aparatos := null;
        new.condiciones_aceptadas_en := null;
      end if;
      return new;
    end if;
  end if;
  new.entrega_modo := coalesce(new.entrega_modo, 'recogida');

  if new.entrega_modo <> 'correos' then
    new.aparatos := null;
    new.etiqueta_eur := null;
    new.etiqueta_peso_kg := null;
    new.condiciones_aceptadas_en := null;
    return new;
  end if;

  -- Por Correos: con cuenta (para descargar la etiqueta y seguirla), activada y con tarifa para su código postal.
  if new.customer_user_id is null then
    raise exception 'Para la reparación por envío inicia sesión: así descargas la etiqueta y sigues tu reparación.' using errcode = 'P0001';
  end if;
  select a.activo, a.peso_aparato_kg into v_activo, v_peso_aparato from public.reparacion_envio_ajustes a where a.id = 1;
  if not coalesce(v_activo, false) then
    raise exception 'La reparación por envío no está disponible ahora mismo.' using errcode = 'P0001';
  end if;
  new.codigo_postal := nullif(regexp_replace(coalesce(new.codigo_postal, ''), '[^0-9]', '', 'g'), '');
  new.aparatos := coalesce(new.aparatos, 1);
  -- La hora de aceptar las condiciones la pone la base de datos (sin aceptarlas, la comprobación no la deja entrar).
  new.condiciones_aceptadas_en := case when new.condiciones_aceptadas_en is null then null else now() end;
  if new.codigo_postal is null or length(new.codigo_postal) <> 5 then
    raise exception 'Escribe tu código postal (5 cifras) para calcular la etiqueta.' using errcode = 'P0001';
  end if;
  v_zona := public.zona_envio('envio', new.codigo_postal);
  select exists (
           select 1 from public.tarifas_envio t
            where t.zona = v_zona and t.activa and t.tramos is not null and jsonb_array_length(t.tramos) > 0)
    into v_con_tramos;
  if not v_con_tramos then
    raise exception 'Aún no tenemos tarifa de Correos para ese código postal: escríbenos y lo vemos contigo.' using errcode = 'P0001';
  end if;
  -- Peso de UN aparato: el del servicio (con su caja) y, si no tiene, el peso por defecto de los ajustes.
  if new.service_id is not null then
    select s.envio_peso_kg into v_peso_servicio from public.services s where s.id = new.service_id;
  end if;
  v_peso := new.aparatos * coalesce(nullif(v_peso_servicio, 0), v_peso_aparato);
  new.etiqueta_peso_kg := v_peso;
  new.etiqueta_eur := public.calcular_envio('envio', new.codigo_postal, 0, v_peso);
  return new;
end;
$$;

-- Al cambiar una solicitud (misma función que la parte 1, ampliada). Un cliente (con su sesión, sobre la suya) solo:
-- acepta el presupuesto, avisa de que ha pagado (etiqueta o reparación/vuelta) y elige qué hacemos si no tiene arreglo;
-- las horas las pone la base de datos. El administrador y el servidor, todo, pero los importes los pone la base de datos.
create or replace function public.reparacion_envio_cliente_cambia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Es cliente si lo dice su token o el rol con el que entra (como en la parte 1; un visitante sin sesión no llega
  -- aquí: no tiene ninguna regla para cambiar solicitudes).
  v_cliente boolean :=
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
    or coalesce(current_setting('role', true), '') = 'authenticated';
  v_libres text[] := array['presupuesto_aceptado_en', 'etiqueta_avisada_en', 'pago_avisado_en', 'sin_arreglo_eleccion', 'sin_arreglo_eleccion_en', 'updated_at'];
begin
  if not v_cliente or public.is_admin() then
    if new.presupuesto_eur is distinct from old.presupuesto_eur
       and old.presupuesto_aceptado_en is not null
       and new.presupuesto_aceptado_en is not distinct from old.presupuesto_aceptado_en then
      new.presupuesto_aceptado_en := null;
    end if;
    -- Sin arreglo: la vuelta la calcula la base de datos (misma tarifa y peso que la etiqueta); nadie la escribe a mano.
    if new.diagnostico_resultado is distinct from old.diagnostico_resultado then
      if new.diagnostico_resultado = 'sin_arreglo' and new.entrega_modo = 'correos' and new.codigo_postal is not null then
        new.vuelta_eur := public.calcular_envio('envio', new.codigo_postal, 0, new.etiqueta_peso_kg);
      else
        new.vuelta_eur := null;
      end if;
      if new.diagnostico_resultado is distinct from 'sin_arreglo' then
        new.oferta_compra_eur := null;
        new.sin_arreglo_eleccion := null;
        new.sin_arreglo_eleccion_en := null;
      end if;
    else
      new.vuelta_eur := old.vuelta_eur;
    end if;
    -- Pagado (reparación o vuelta): el importe lo pone la base de datos y, una vez pagado, no cambia.
    if new.pago_estado = 'pagado' and old.pago_estado is distinct from 'pagado' then
      if new.pago_modo is null then
        raise exception 'Di cómo se ha pagado (Bizum, transferencia o tarjeta).' using errcode = '23514';
      end if;
      new.pagado_eur := case when new.diagnostico_resultado = 'sin_arreglo' then new.vuelta_eur else new.presupuesto_eur end;
      if new.pagado_eur is null then
        raise exception 'Aún no hay importe que cobrar en esta solicitud.' using errcode = '23514';
      end if;
      new.pagado_en := coalesce(new.pagado_en, now());
    elsif new.pago_estado = 'pagado' then
      new.pagado_eur := old.pagado_eur;
    elsif new.pago_estado is null then
      new.pagado_eur := null;
      new.pagado_en := null;
      new.pago_modo := null;
    end if;
    -- Etiqueta sin pagar: sin forma de pago.
    if new.etiqueta_pagada_en is null then
      new.etiqueta_pago_modo := null;
    end if;
    -- La garantía cuenta desde la entrega.
    if new.seguimiento = 'entregado' and old.seguimiento is distinct from 'entregado' then
      new.entregado_en := coalesce(new.entregado_en, now());
    end if;
    return new;
  end if;

  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Desde tu cuenta solo puedes aceptar el presupuesto, avisar de un pago o elegir qué hacemos con tu aparato.' using errcode = '42501';
  end if;

  -- Aceptar el presupuesto (como en la parte 1).
  if new.presupuesto_aceptado_en is distinct from old.presupuesto_aceptado_en then
    if old.presupuesto_aceptado_en is not null or new.presupuesto_aceptado_en is null then
      raise exception 'Ese presupuesto ya está aceptado.' using errcode = '42501';
    end if;
    if old.seguimiento <> 'presupuesto' or old.presupuesto_eur is null then
      raise exception 'Aún no hay un presupuesto que aceptar.' using errcode = '42501';
    end if;
    new.presupuesto_aceptado_en := now();
  end if;

  -- Si no tiene arreglo: «Te lo compramos» o «Devuélvemelo», una vez.
  if new.sin_arreglo_eleccion is distinct from old.sin_arreglo_eleccion then
    if old.diagnostico_resultado is distinct from 'sin_arreglo' then
      raise exception 'Tu aparato no está marcado como sin arreglo.' using errcode = '42501';
    end if;
    if old.sin_arreglo_eleccion is not null or new.sin_arreglo_eleccion is null then
      raise exception 'Ya nos has dicho qué hacemos con tu aparato: si quieres cambiarlo, escríbenos.' using errcode = '42501';
    end if;
    new.sin_arreglo_eleccion_en := now();
  else
    new.sin_arreglo_eleccion_en := old.sin_arreglo_eleccion_en;
  end if;

  -- «Ya lo he pagado» de la etiqueta: solo avisa (el pago lo marca el administrador).
  if new.etiqueta_avisada_en is distinct from old.etiqueta_avisada_en then
    if old.etiqueta_avisada_en is not null or new.etiqueta_avisada_en is null then
      raise exception 'Ya nos has avisado de ese pago.' using errcode = '42501';
    end if;
    if old.entrega_modo is distinct from 'correos' or old.etiqueta_pagada_en is not null or coalesce(old.etiqueta_eur, 0) <= 0 then
      raise exception 'Esa etiqueta no tiene nada que pagar.' using errcode = '42501';
    end if;
    new.etiqueta_avisada_en := now();
  end if;

  -- «Ya lo he pagado» de la reparación (o de la vuelta si no tiene arreglo): solo avisa.
  if new.pago_avisado_en is distinct from old.pago_avisado_en then
    if old.pago_avisado_en is not null or new.pago_avisado_en is null then
      raise exception 'Ya nos has avisado de ese pago.' using errcode = '42501';
    end if;
    if old.pago_estado = 'pagado' then
      raise exception 'Ya está pagado.' using errcode = '42501';
    end if;
    if not (
      (old.diagnostico_resultado is distinct from 'sin_arreglo' and old.seguimiento = 'listo' and old.presupuesto_aceptado_en is not null and coalesce(old.presupuesto_eur, 0) > 0)
      or (old.diagnostico_resultado = 'sin_arreglo' and new.sin_arreglo_eleccion = 'devolver' and coalesce(old.vuelta_eur, 0) > 0)
    ) then
      raise exception 'Aún no hay nada que pagar en esta reparación.' using errcode = '42501';
    end if;
    new.pago_avisado_en := now();
  end if;
  return new;
end;
$$;
