-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reparación por envío (dueño, 2026-11-11: «Reparación por envío» para los clientes del resto de España).
--   Parte 1 de 2. La parte 2 (otra PR) hará el pago «Pagar y enviármelo», «Te lo compramos» y la garantía documentada:
--   aquí ya quedan sus columnas de pago (vacías y sin uso).
-- Qué hace:
--   1) service_requests: cómo nos llega el aparato (entrega_modo: «recogida» como hasta hoy o «correos»), cuántos
--      aparatos (1-10), su código postal, la etiqueta de Correos (precio, peso, PDF y cuándo se pagó), cuándo aceptó las
--      condiciones, el presupuesto (precio y cuándo lo aceptó el cliente), las fotos de recepción (hasta 3, rutas del
--      almacén privado), hasta cuándo se espera una pieza y las columnas de pago para la parte 2.
--   2) Etapas del seguimiento: a las de siempre (solicitado, recibido, diagnostico, reparando, listo, entregado,
--      cancelado) se añaden «etiqueta» (Etiqueta lista), «en_camino», «presupuesto», «esperando_pieza» y «enviada»
--      (Enviada de vuelta). Para cambiar la lista de valores permitidos hay que quitar la comprobación antigua y poner la
--      nueva (por eso lleva «drop constraint»); no borra ni cambia ninguna fila: las que hay siguen valiendo.
--   3) El precio de la etiqueta lo pone la BASE DE DATOS al crear la solicitud (disparador trg_service_requests_envio,
--      como trg_service_requests_modalidad), nunca el navegador: peso = aparatos × peso por aparato (con embalaje) de
--      reparacion_envio_ajustes, y precio = calcular_envio('envio', código postal, 0, peso), la MISMA tarifa por kilos y
--      zona de Correos de tarifas_envio (migración 20261107120000). Si la zona no tiene tramos de Correos (Zaragoza,
--      islas, Ceuta y Melilla hoy) o la reparación por envío está desactivada, la solicitud por Correos no se guarda.
--      El peso por aparato empieza en 2 kg ESTIMADO (peso_estimado = true): el dueño lo corrige con el real en
--      Administración → Servicios → «Reparación por envío» y, hasta entonces, no se puede activar.
--   4) public.reparacion_envio_ajustes (una sola fila): si está activa, a dónde se envía (dirección del taller), peso por
--      aparato, días de custodia, Bizum, IBAN y titular (para pagar en la parte 2) y plazo en horas (72 por defecto). Los
--      rellena el dueño (nada inventado: empiezan vacíos y desactivada). La leen los clientes CON SESIÓN (para saber a
--      dónde enviar y, en la parte 2, cómo pagar); un visitante sin sesión no la lee; solo el administrador la cambia.
--      No se activa sin dirección del taller ni con el peso aún estimado.
--   5) El cliente, sobre SU solicitud, solo puede aceptar el presupuesto (presupuesto_aceptado_en, que pone la base de
--      datos con su hora) cuando la etapa es «presupuesto» y hay precio; cualquier otra columna, no (disparador
--      trg_service_requests_cliente y una regla de cambio solo para sus propias filas). Si el administrador cambia el
--      precio de un presupuesto ya aceptado, la aceptación se borra y el cliente lo vuelve a aceptar.
--   6) Almacén PRIVADO «reparaciones» (10 MB; PDF, JPG, PNG y WebP) para las etiquetas y las fotos de recepción. Solo el
--      administrador sube, cambia, borra y lee (reglas con is_admin(), como «product-media»). El cliente NO lo lee
--      directamente: descarga por api/factura.ts?solicitud=…, que comprueba la sesión y da un enlace firmado de 60 s.
--   7) Política «Reparación por envío» (policy_pages, slug reparacion-envio): cómo funciona, embalaje, plazos, garantía,
--      vuelta y custodia, sin cifras inventadas (el plazo y los días los pone el dueño en los ajustes y se ven en el
--      seguimiento; la garantía, la de tu presupuesto o factura). Solo se crea si aún no existe.
-- Conectado con: public.service_requests (columnas y disparadores nuevos), public.reparacion_envio_ajustes,
--           public.tarifas_envio / zona_envio() / calcular_envio() (20261104210000 y 20261107120000), public.is_admin(),
--           storage.buckets / storage.objects («reparaciones»), public.policy_pages; components/ContratarServicioModal.tsx,
--           lib/envio.ts, app/(tabs)/perfil.tsx («Mis seguimientos»), components/Campanita.tsx (avisos de
--           etapa), app/admin/services.tsx, app/admin/analytics.tsx, api/factura.ts, api/blue-ia.ts,
--           app/politicas/[slug].tsx, pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (sección RE2).
-- Tipo:     aditiva: columnas nuevas, una tabla de una fila, dos funciones de disparador SIN security definer y sus
--           disparadores, dos reglas de tabla (lectura con sesión y cambio solo para sus propias filas), cuatro reglas de
--           almacén para el administrador, un almacén y una política. SIN grant, SIN security definer, SIN anon, SIN
--           «using (true)». Solo quita y vuelve a poner la comprobación de etapas (ver 2). No borra filas. Repetible.
-- Vuelta atrás (la decide y la hace el dueño): drop trigger trg_service_requests_envio y trg_service_requests_cliente on
--           public.service_requests y drop policy service_requests_update_cliente_presupuesto: todo vuelve a funcionar
--           como hoy (las columnas nuevas se quedan sin uso). Etapas antiguas, solo si ninguna fila usa las nuevas:
--   alter table public.service_requests drop constraint if exists service_requests_seguimiento_check;
--   alter table public.service_requests add constraint service_requests_seguimiento_check check (seguimiento in
--     ('solicitado', 'recibido', 'diagnostico', 'reparando', 'listo', 'entregado', 'cancelado'));
-- ============================================================================

-- 1) Columnas de la solicitud.
alter table public.service_requests add column if not exists entrega_modo text not null default 'recogida';
alter table public.service_requests add column if not exists aparatos smallint;
alter table public.service_requests add column if not exists codigo_postal text;
alter table public.service_requests add column if not exists etiqueta_eur numeric(10, 2);
alter table public.service_requests add column if not exists etiqueta_peso_kg numeric(7, 3);
alter table public.service_requests add column if not exists etiqueta_path text;
alter table public.service_requests add column if not exists etiqueta_pagada_en timestamptz;
alter table public.service_requests add column if not exists condiciones_aceptadas_en timestamptz;
alter table public.service_requests add column if not exists presupuesto_eur numeric(10, 2);
alter table public.service_requests add column if not exists presupuesto_aceptado_en timestamptz;
alter table public.service_requests add column if not exists recepcion_fotos jsonb not null default '[]'::jsonb;
alter table public.service_requests add column if not exists espera_pieza_hasta date;
-- Pago (parte 2: «Pagar y enviármelo»). Vacías hasta entonces.
alter table public.service_requests add column if not exists pago_estado text;
alter table public.service_requests add column if not exists pago_modo text;
alter table public.service_requests add column if not exists pagado_eur numeric(10, 2);
alter table public.service_requests add column if not exists pagado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_requests_entrega_modo_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_entrega_modo_check check (entrega_modo in ('recogida', 'correos'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_aparatos_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_aparatos_check check (aparatos is null or aparatos between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_codigo_postal_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_codigo_postal_check check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_etiqueta_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_etiqueta_check check (
      (etiqueta_eur is null or (etiqueta_eur >= 0 and etiqueta_eur <= 999))
      and (etiqueta_peso_kg is null or (etiqueta_peso_kg > 0 and etiqueta_peso_kg <= 300))
      and (etiqueta_path is null or char_length(etiqueta_path) between 1 and 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_presupuesto_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_presupuesto_check check (presupuesto_eur is null or (presupuesto_eur >= 0 and presupuesto_eur <= 99999));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_recepcion_fotos_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_recepcion_fotos_check check (jsonb_typeof(recepcion_fotos) = 'array' and jsonb_array_length(recepcion_fotos) <= 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_pago_check' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_pago_check check (
      (pago_estado is null or pago_estado in ('pendiente', 'pagado', 'devuelto'))
      and (pago_modo is null or pago_modo in ('bizum', 'transferencia', 'tarjeta', 'prueba'))
      and (pagado_eur is null or (pagado_eur >= 0 and pagado_eur <= 99999)));
  end if;
  -- Por Correos: con cuántos aparatos y con las condiciones aceptadas (lo de recogida, como siempre).
  if not exists (select 1 from pg_constraint where conname = 'service_requests_correos_completa' and conrelid = 'public.service_requests'::regclass) then
    alter table public.service_requests add constraint service_requests_correos_completa check (
      entrega_modo <> 'correos' or (aparatos is not null and codigo_postal is not null and condiciones_aceptadas_en is not null));
  end if;
end $$;

-- 2) Etapas del seguimiento (las de siempre y las de envío). Quitar y poner: ver la cabecera.
alter table public.service_requests drop constraint if exists service_requests_seguimiento_check;
alter table public.service_requests add constraint service_requests_seguimiento_check check (seguimiento in (
  'solicitado', 'etiqueta', 'en_camino', 'recibido', 'diagnostico', 'presupuesto', 'esperando_pieza', 'reparando',
  'listo', 'enviada', 'entregado', 'cancelado'));

-- 4) Ajustes (una sola fila, id = 1). Antes que los disparadores, que la leen.
create table if not exists public.reparacion_envio_ajustes (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default false,
  -- A dónde envía el cliente su aparato (la escribe el dueño).
  direccion_taller text check (direccion_taller is null or char_length(btrim(direccion_taller)) between 10 and 300),
  -- Peso de UN aparato con su embalaje, para la etiqueta. 2 kg ESTIMADO al empezar: lo corrige el dueño con el real.
  peso_aparato_kg numeric(6, 3) not null default 2 check (peso_aparato_kg > 0 and peso_aparato_kg <= 30),
  peso_estimado boolean not null default true,
  -- Días que guardamos un aparato ya terminado o sin arreglo mientras el cliente decide (lo pone el dueño; vacío = sin decir).
  dias_custodia smallint check (dias_custodia is null or dias_custodia between 1 and 365),
  bizum text check (bizum is null or char_length(btrim(bizum)) between 3 and 30),
  iban text check (iban is null or char_length(btrim(iban)) between 15 and 42),
  titular text check (titular is null or char_length(btrim(titular)) between 2 and 120),
  -- Plazo de la reparación desde que llega (si no hay que pedir piezas).
  plazo_horas smallint not null default 72 check (plazo_horas between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint reparacion_envio_ajustes_activar check (not activo or (direccion_taller is not null and not peso_estimado))
);

comment on table public.reparacion_envio_ajustes is 'Reparación por envío (Administración → Servicios): si está activa, dirección del taller, peso por aparato, custodia, datos de pago y plazo. La leen los clientes con sesión; solo la cambia el administrador.';

insert into public.reparacion_envio_ajustes (id) values (1) on conflict (id) do nothing;

alter table public.reparacion_envio_ajustes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparacion_envio_ajustes' and policyname = 'reparacion_envio_ajustes_leer_con_sesion') then
    create policy reparacion_envio_ajustes_leer_con_sesion on public.reparacion_envio_ajustes
      for select to authenticated using ((select auth.uid()) is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reparacion_envio_ajustes' and policyname = 'reparacion_envio_ajustes_admin') then
    create policy reparacion_envio_ajustes_admin on public.reparacion_envio_ajustes
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- 3) Al crear una solicitud: lo interno nunca lo pone quien la envía y, por Correos, la etiqueta la calcula la base de
--    datos con la tarifa de su zona.
create or replace function public.reparacion_envio_al_crear()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_activo boolean;
  v_peso_aparato numeric;
  v_zona text;
  v_con_tramos boolean;
  v_peso numeric;
begin
  if not public.is_admin() then
    new.etiqueta_eur := null;
    new.etiqueta_peso_kg := null;
    new.etiqueta_path := null;
    new.etiqueta_pagada_en := null;
    new.presupuesto_eur := null;
    new.presupuesto_aceptado_en := null;
    new.recepcion_fotos := '[]'::jsonb;
    new.espera_pieza_hasta := null;
    new.pago_estado := null;
    new.pago_modo := null;
    new.pagado_eur := null;
    new.pagado_en := null;
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
  v_peso := new.aparatos * v_peso_aparato;
  new.etiqueta_peso_kg := v_peso;
  new.etiqueta_eur := public.calcular_envio('envio', new.codigo_postal, 0, v_peso);
  return new;
end;
$$;

-- 5) Al cambiar una solicitud: un cliente (con su sesión, sobre la suya) solo acepta el presupuesto; el administrador y el
--    servidor, todo (si el administrador cambia el precio de un presupuesto aceptado, hay que volver a aceptarlo).
create or replace function public.reparacion_envio_cliente_cambia()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Es cliente si lo dice su token o el rol con el que entra (igual que seguimiento_campos_protegidos).
  v_cliente boolean :=
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated')
    or coalesce(current_setting('role', true), '') in ('anon', 'authenticated');
begin
  if not v_cliente or public.is_admin() then
    if new.presupuesto_eur is distinct from old.presupuesto_eur
       and old.presupuesto_aceptado_en is not null
       and new.presupuesto_aceptado_en is not distinct from old.presupuesto_aceptado_en then
      new.presupuesto_aceptado_en := null;
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'presupuesto_aceptado_en' - 'updated_at') is distinct from (to_jsonb(old) - 'presupuesto_aceptado_en' - 'updated_at') then
    raise exception 'Desde tu cuenta solo puedes aceptar el presupuesto de tu reparación.' using errcode = '42501';
  end if;
  if new.presupuesto_aceptado_en is not distinct from old.presupuesto_aceptado_en then
    return new;
  end if;
  if old.presupuesto_aceptado_en is not null or new.presupuesto_aceptado_en is null then
    raise exception 'Ese presupuesto ya está aceptado.' using errcode = '42501';
  end if;
  if old.seguimiento <> 'presupuesto' or old.presupuesto_eur is null then
    raise exception 'Aún no hay un presupuesto que aceptar.' using errcode = '42501';
  end if;
  new.presupuesto_aceptado_en := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_service_requests_envio' and tgrelid = 'public.service_requests'::regclass) then
    -- (después de trg_service_requests_customer_user_id, que pone la cuenta: los disparadores van por orden alfabético)
    create trigger trg_service_requests_envio
      before insert on public.service_requests
      for each row execute function public.reparacion_envio_al_crear();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_service_requests_cliente' and tgrelid = 'public.service_requests'::regclass) then
    create trigger trg_service_requests_cliente
      before update on public.service_requests
      for each row execute function public.reparacion_envio_cliente_cambia();
  end if;
  -- El cliente puede cambiar SUS solicitudes (y el disparador de arriba solo le deja aceptar el presupuesto).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_requests' and policyname = 'service_requests_update_cliente_presupuesto') then
    create policy service_requests_update_cliente_presupuesto on public.service_requests
      for update to authenticated
      using (customer_user_id = (select auth.uid()))
      with check (customer_user_id = (select auth.uid()));
  end if;
end $$;

-- 6) Almacén privado de etiquetas y fotos de recepción (<solicitud>/etiqueta-….pdf, <solicitud>/recepcion-….jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reparaciones', 'reparaciones', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'reparaciones_admin_subir') then
    create policy reparaciones_admin_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'reparaciones' and (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'reparaciones_admin_cambiar') then
    create policy reparaciones_admin_cambiar on storage.objects for update to authenticated
      using (bucket_id = 'reparaciones' and (select public.is_admin())) with check (bucket_id = 'reparaciones' and (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'reparaciones_admin_borrar') then
    create policy reparaciones_admin_borrar on storage.objects for delete to authenticated
      using (bucket_id = 'reparaciones' and (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'reparaciones_admin_leer') then
    create policy reparaciones_admin_leer on storage.objects for select to authenticated
      using (bucket_id = 'reparaciones' and (select public.is_admin()));
  end if;
end $$;

-- 7) Política «Reparación por envío» (solo si aún no existe; después la edita el dueño en Administración → Políticas).
insert into public.policy_pages (slug, title, intro, sections, is_active, sort_order)
select
  'reparacion-envio',
  'Reparación por envío',
  'Si no estás en Zaragoza o Cuarte de Huerva, puedes mandarnos tu consola, mando, móvil o portátil por Correos desde cualquier punto de la España peninsular y te lo devolvemos reparado.',
  '[
    {"heading": "Cómo funciona", "body": "1. Pide la reparación desde «Contratar servicio ahora» en la ficha del servicio, eligiendo «Envío por Correos», con tu sesión iniciada. 2. Te preparamos la etiqueta de Correos: su coste lo ves antes de enviar la solicitud y depende de tu código postal y del peso. 3. Descarga la etiqueta en Perfil → Mis seguimientos, embala el aparato y llévalo a Correos. 4. Te avisamos cuando llegue, te enseñamos las fotos de cómo lo recibimos y lo diagnosticamos. 5. Te mandamos el presupuesto y solo reparamos cuando lo aceptas desde Mis seguimientos. 6. Te lo devolvemos reparado y puedes seguir cada paso en Mis seguimientos."},
    {"heading": "Cómo embalarlo", "body": "Quita discos, tarjetas, fundas y accesorios que no hagan falta para la reparación. Si puedes, apaga y desvincula la cuenta del aparato. Envuélvelo en plástico de burbujas o papel y mételo en una caja rígida, sin que se mueva al agitarla (rellena los huecos). Cierra bien la caja con cinta y pega la etiqueta de Correos en una cara lisa. Dentro, una nota con tu nombre y tu número de seguimiento VZ-."},
    {"heading": "Plazos", "body": "La reparación se hace en el plazo que te indicamos en tu seguimiento, contado desde que el aparato llega a nuestro taller, si no hay que pedir piezas. Si hace falta una pieza, te avisamos en Mis seguimientos con la fecha aproximada de llegada."},
    {"heading": "Garantía", "body": "La reparación tiene la garantía que figura en tu presupuesto o en tu factura."},
    {"heading": "La vuelta", "body": "El envío de vuelta a tu casa va incluido en el precio de la reparación. Solo pagas aparte la etiqueta para mandárnoslo."},
    {"heading": "Si no tiene arreglo", "body": "Si tras el diagnóstico tu aparato no tiene arreglo, te ofrecemos comprártelo o devolvértelo pagando solo el envío de vuelta."},
    {"heading": "Custodia", "body": "Cuando tu aparato esté listo, o si no tiene arreglo, lo guardamos durante el plazo que te indicamos en tu seguimiento mientras decides qué hacer."},
    {"heading": "Dudas", "body": "Escríbenos desde Blue IA o el chat de la tienda y lo vemos contigo."}
  ]'::jsonb,
  true,
  35
where not exists (select 1 from public.policy_pages where slug = 'reparacion-envio');
