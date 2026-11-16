-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: motivo de la cancelación y «Avisarme cuando haya otro» (dueño, 2026-11-16: «que cuando se cancele un pedido a
--            un cliente, el cliente pueda ver un motivo "El artículo ya no se encuentra disponible" y un botón de encendido
--            "Avisarme cuando haya otro" y un desplegable "Por la app, Gmail o ambas"»).
-- Qué hace:
--   1) public.pedidos: cancelacion_motivo (el texto que ve el cliente, como mucho 200 letras; lo pone el administrador al
--      cancelar en Administración → Pedidos) y cancelado_en (la hora de la cancelación, la pone la base de datos con un
--      disparador normal al pasar el pedido a «cancelado»). El cliente solo los lee (RLS de pedidos de siempre).
--   2) public.avisos_reposicion: una fila por cliente y pedido cancelado por «El artículo ya no se encuentra disponible»,
--      con lo que se busca (texto: el modelo del artículo, p. ej. «Xbox Series S»), el artículo cancelado, el canal
--      ('app' | 'correo' | 'ambas'), si está activo, desde cuándo (activado_en) y cuándo se le avisó (avisado_en). Blue
--      (components/Campanita.tsx) avisa en la app cuando entra un artículo parecido. El correo aún no se manda (la tienda
--      no tiene envío de correos propio): la preferencia se guarda igual y Administración lo dice.
--   3) El disparador (sin permisos especiales, con los de quien llama) pone de quién es (la sesión) y las horas; solo deja
--      crearla para un pedido PROPIO cancelado por ese motivo y, al cambiarla, solo el canal, si está activa y cuándo se
--      avisó (encenderla de nuevo la vuelve a armar desde ese momento).
--   4) Reglas (RLS): cada cliente crea, lee y cambia SOLO sus filas (se apaga, no se borra); el administrador las lee todas
--      (detalle del pedido y recuentos de Analítica). Visitantes: nada.
--   5) Privacidad: una frase en «Para qué usamos tus datos», una sola vez.
-- Conectado con: public.pedidos, public.products, public.is_admin(); app/admin/pedidos.tsx (motivo al cancelar, aviso en el
--           detalle y recuento), app/(tabs)/perfil.tsx (Mis pedidos: tarjeta de cancelación, interruptor y canal),
--           lib/interaccion.ts (leer y guardar), components/Campanita.tsx (Blue avisa), app/admin/analytics.tsx,
--           pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (sección CANCAV).
-- Tipo:     SOLO AÑADE (dos columnas con su comprobación, una tabla con sus reglas, dos funciones de disparador normales y
--           una frase de la privacidad). No borra filas ni columnas ni cambia permisos existentes. Repetirla no cambia nada.
-- ============================================================================

-- 1) Motivo y hora de la cancelación.
alter table public.pedidos add column if not exists cancelacion_motivo text
  check (cancelacion_motivo is null or char_length(btrim(cancelacion_motivo)) between 2 and 200);
alter table public.pedidos add column if not exists cancelado_en timestamptz;

comment on column public.pedidos.cancelacion_motivo is 'Motivo de la cancelación que ve el cliente en Mis pedidos (lo elige el administrador al cancelar; como mucho 200 letras).';
comment on column public.pedidos.cancelado_en is 'Cuándo se canceló el pedido (lo pone la base de datos al pasar a «cancelado»).';

create or replace function public.pedidos_apuntar_cancelacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    new.cancelado_en := now();
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedidos_apuntar_cancelacion' and tgrelid = 'public.pedidos'::regclass) then
    create trigger pedidos_apuntar_cancelacion
      before update of estado on public.pedidos
      for each row
      when (old.estado is distinct from new.estado)
      execute function public.pedidos_apuntar_cancelacion();
  end if;
end $$;

-- 2) «Avisarme cuando haya otro».
create table if not exists public.avisos_reposicion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 2 and 60),
  canal text not null default 'app' check (canal in ('app', 'correo', 'ambas')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  activado_en timestamptz not null default now(),
  avisado_en timestamptz,
  unique (user_id, pedido_id)
);

create index if not exists avisos_reposicion_activos_idx on public.avisos_reposicion (user_id) where activo;

alter table public.avisos_reposicion enable row level security;

create or replace function public.avisos_reposicion_normalizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    if new.user_id is null then
      raise exception 'Inicia sesión para activar el aviso.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.pedidos p
       where p.id = new.pedido_id
         and p.user_id = new.user_id
         and p.estado = 'cancelado'
         and p.cancelacion_motivo = 'El artículo ya no se encuentra disponible'
    ) then
      raise exception 'Este pedido no tiene aviso de reposición.' using errcode = 'P0001';
    end if;
    new.texto := btrim(new.texto);
    new.activo := true;
    new.creado_en := now();
    new.activado_en := now();
    new.avisado_en := null;
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.pedido_id := old.pedido_id;
  new.product_id := old.product_id;
  new.texto := old.texto;
  new.creado_en := old.creado_en;
  if new.activo and not old.activo then
    -- Encendido otra vez: avisa de lo que entre desde ahora.
    new.activado_en := now();
    new.avisado_en := null;
  else
    new.activado_en := old.activado_en;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'avisos_reposicion_normalizar' and tgrelid = 'public.avisos_reposicion'::regclass) then
    create trigger avisos_reposicion_normalizar
      before insert or update on public.avisos_reposicion
      for each row execute function public.avisos_reposicion_normalizar();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_reposicion' and policyname = 'avisos_reposicion_select') then
    create policy avisos_reposicion_select on public.avisos_reposicion
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_reposicion' and policyname = 'avisos_reposicion_insert_propio') then
    create policy avisos_reposicion_insert_propio on public.avisos_reposicion
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_reposicion' and policyname = 'avisos_reposicion_update_propio') then
    create policy avisos_reposicion_update_propio on public.avisos_reposicion
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

comment on table public.avisos_reposicion is '«Avisarme cuando haya otro»: tras cancelar un pedido porque el artículo ya no está disponible, el cliente pide que le avisen cuando entre otro parecido (en la app, por correo o las dos). Se apaga, no se borra.';

-- 5) Privacidad: en «Para qué usamos tus datos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Si un pedido se cancela porque el artículo ya no está disponible y activas «Avisarme cuando haya otro», guardamos ese artículo y cómo quieres que te avisemos (en la app, por correo o las dos) unidos a tu cuenta para avisarte cuando llegue otro parecido; puedes apagarlo cuando quieras en Mis pedidos y solo lo ves tú y la tienda.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1 from jsonb_array_elements(p.sections) as s (sec)
    where s.sec ->> 'heading' = 'Para qué usamos tus datos'
      and s.sec ->> 'body' not like '%Avisarme cuando haya otro%'
  );
