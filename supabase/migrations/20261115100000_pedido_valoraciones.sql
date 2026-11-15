-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Valoración tras la entrega» (dueño, 2026-11-15, mejora 11). SOLO CON CUENTA.
--   1) public.pedido_valoraciones: una valoración por pedido (nota de 1 a 5 y un comentario opcional de hasta 1000
--      caracteres). Las reseñas de servicios (resenas_servicios) son públicas y por servicio: no encajan con un pedido,
--      cuya valoración es privada (solo la ven el cliente y la tienda; no se publica en la tienda).
--   2) El disparador (normal, SIN permisos especiales: corre con los de quien valora) pone de quién es (la sesión) y la
--      hora, y solo deja valorar un pedido propio que esté «entregado». Al cambiar una fila no se puede cambiar nada
--      (ni el pedido, ni el dueño, ni la nota): la valoración es de una sola vez.
--   3) Reglas (RLS): cada cliente crea y lee SOLO las suyas; el administrador las lee todas (Pedidos, ficha del cliente y
--      Analítica). Nadie las cambia ni las borra desde el navegador. Visitantes: nada.
--   4) Privacidad: una frase en «Para qué usamos tus datos», una sola vez.
-- Qué hace: guarda la nota y el comentario que el cliente da a un pedido entregado.
-- Conectado con: public.pedidos, public.is_admin(); app/(tabs)/perfil.tsx (Mis pedidos: «Valorar compra»),
--           components/Campanita.tsx (Blue la pide una vez), components/ReviewModal.tsx (ValorarPedidoModal), app/admin/pedidos.tsx,
--           app/admin/cliente/[userId].tsx, app/admin/analytics.tsx («Valoraciones (30 días)»), pruebas/perfiles-sql.mjs y
--           pruebas/perfil-datos.mjs (sección VALOR).
-- Tipo:     SOLO AÑADE (una tabla con sus reglas, una función de disparador normal y una frase de la privacidad). No borra
--           filas ni columnas ni cambia permisos existentes. Se puede aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

create table if not exists public.pedido_valoraciones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nota smallint not null check (nota between 1 and 5),
  comentario text check (comentario is null or char_length(comentario) <= 1000),
  creado_en timestamptz not null default now()
);

create index if not exists pedido_valoraciones_usuario_idx on public.pedido_valoraciones (user_id);
create index if not exists pedido_valoraciones_fecha_idx on public.pedido_valoraciones (creado_en desc);

alter table public.pedido_valoraciones enable row level security;

create or replace function public.pedido_valoraciones_normalizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    if new.user_id is null then
      raise exception 'Inicia sesión para valorar tu pedido.' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.pedidos p
       where p.id = new.pedido_id and p.user_id = new.user_id and p.estado = 'entregado'
    ) then
      raise exception 'Solo puedes valorar tus pedidos entregados.' using errcode = 'P0001';
    end if;
    new.comentario := nullif(btrim(coalesce(new.comentario, '')), '');
    new.creado_en := now();
    return new;
  end if;
  new.id := old.id;
  new.pedido_id := old.pedido_id;
  new.user_id := old.user_id;
  new.nota := old.nota;
  new.comentario := old.comentario;
  new.creado_en := old.creado_en;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedido_valoraciones_normalizar' and tgrelid = 'public.pedido_valoraciones'::regclass) then
    create trigger pedido_valoraciones_normalizar
      before insert or update on public.pedido_valoraciones
      for each row execute function public.pedido_valoraciones_normalizar();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_valoraciones' and policyname = 'pedido_valoraciones_select') then
    create policy pedido_valoraciones_select on public.pedido_valoraciones
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_valoraciones' and policyname = 'pedido_valoraciones_insert_propio') then
    create policy pedido_valoraciones_insert_propio on public.pedido_valoraciones
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
end $$;

comment on table public.pedido_valoraciones is '«Valoración tras la entrega»: nota (1-5) y comentario opcional de cada pedido entregado. Privada: la ven el cliente y la tienda; no se publica.';

-- Privacidad: en «Para qué usamos tus datos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Si valoras un pedido, guardamos tu nota y comentario unidos a tu cuenta para mejorar el servicio; solo los ve la tienda.'
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
      and s.sec ->> 'body' not like '%Si valoras un pedido%'
  );
