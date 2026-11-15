-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: avisos al móvil del dueño («Notificación de la app», elegido por él el 2026-11-15: «He recibido un pedido
--            nuevo con pago por la app y no me he enterado hasta que no he entrado a pedidos»).
-- Qué hace: - public.admin_avisos_suscripciones: cada móvil u ordenador del administrador que ha tocado «Activar avisos en
--             este móvil» (Administración → Pedidos). Guarda SOLO lo que pide el estándar Web Push para mandarle avisos
--             cifrados (la dirección del servicio de avisos del navegador y sus dos claves públicas), quién lo activó,
--             el nombre legible del dispositivo («iPhone · Safari»), si sigue activo, cuándo se activó o desactivó, el
--             último envío bueno y los fallos seguidos. Una fila por dirección (endpoint único).
--           - public.admin_avisos_registro: un apunte por aviso mandado (pedido pagado, pedido nuevo, servicio pagado o
--             prueba) con su título («Pedido pagado · 349,99 €»), la referencia VZ-… y a cuántos dispositivos llegó. Sin
--             nombres, correos, teléfonos ni direcciones. Lo escribe solo el servidor (api/pago.ts, clave de servidor).
--           - pedidos.aviso_admin_enviado_en / aviso_admin_tipo y service_requests.aviso_admin_sesion: marcan que el
--             aviso de ese pedido (nuevo o pagado) o de ese cobro de Stripe ya salió, para mandarlo UNA sola vez aunque
--             lleguen a la vez el aviso de Stripe y la vuelta del navegador.
--           Reglas (RLS): solo el administrador (is_admin()) lee los dispositivos y el registro; da de alta y cambia solo
--           SUS dispositivos (user_id = el suyo). Nadie los borra desde el navegador (se desactivan). Un cliente o un
--           visitante: nada. El registro no se escribe desde el navegador.
-- Conectado con: public.is_admin(); api/pago.ts (GET ?avisos=clave, «avisos_prueba», webhook de Stripe, «confirmar» y
--           «referencia»), public/sw-avisos.js (el service worker que enseña el aviso), lib/notificaciones.ts y
--           components/AvisosMovil.tsx (app/admin/pedidos.tsx y app/admin/index.tsx), pruebas/perfiles-sql.mjs,
--           pruebas/avisos-api.mjs y pruebas/perfil-datos.mjs (sección AVISOM).
-- Tipo:     aditiva (dos tablas nuevas con sus reglas y tres columnas nuevas). No borra ni cambia datos ni permisos
--           existentes. Repetirla no cambia nada.
-- ============================================================================

create table if not exists public.admin_avisos_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) between 20 and 1000),
  p256dh text not null check (char_length(p256dh) between 80 and 120),
  auth text not null check (char_length(auth) between 16 and 40),
  etiqueta text not null default 'Dispositivo' check (char_length(btrim(etiqueta)) between 1 and 60),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  activada_en timestamptz not null default now(),
  desactivada_en timestamptz,
  ultimo_envio_ok timestamptz,
  fallos integer not null default 0 check (fallos between 0 and 1000000)
);

create index if not exists admin_avisos_suscripciones_activa_idx on public.admin_avisos_suscripciones (activa, activada_en desc);

create table if not exists public.admin_avisos_registro (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  tipo text not null check (tipo in ('pedido_pagado', 'pedido_nuevo', 'servicio_pagado', 'prueba')),
  titulo text not null check (char_length(titulo) between 1 and 120),
  referencia text check (referencia is null or char_length(referencia) <= 40),
  entregados integer not null default 0 check (entregados >= 0),
  fallidos integer not null default 0 check (fallidos >= 0)
);

create index if not exists admin_avisos_registro_creado_idx on public.admin_avisos_registro (creado_en desc);

alter table public.admin_avisos_suscripciones enable row level security;
alter table public.admin_avisos_registro enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_avisos_suscripciones' and policyname = 'admin_avisos_suscripciones_select') then
    create policy admin_avisos_suscripciones_select on public.admin_avisos_suscripciones
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_avisos_suscripciones' and policyname = 'admin_avisos_suscripciones_insert_propia') then
    create policy admin_avisos_suscripciones_insert_propia on public.admin_avisos_suscripciones
      for insert to authenticated with check ((select public.is_admin()) and user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_avisos_suscripciones' and policyname = 'admin_avisos_suscripciones_update_propia') then
    create policy admin_avisos_suscripciones_update_propia on public.admin_avisos_suscripciones
      for update to authenticated
      using ((select public.is_admin()) and user_id = (select auth.uid()))
      with check ((select public.is_admin()) and user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_avisos_registro' and policyname = 'admin_avisos_registro_select') then
    create policy admin_avisos_registro_select on public.admin_avisos_registro
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

-- Un aviso por pedido (nuevo y, después, pagado) y uno por cobro de Stripe de cada reparación.
alter table public.pedidos add column if not exists aviso_admin_enviado_en timestamptz;
alter table public.pedidos add column if not exists aviso_admin_tipo text
  check (aviso_admin_tipo is null or aviso_admin_tipo in ('nuevo', 'pagado'));
alter table public.service_requests add column if not exists aviso_admin_sesion text
  check (aviso_admin_sesion is null or char_length(aviso_admin_sesion) <= 300);
