-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la hora de cada paso del pedido y el número de envío (dueño, 2026-11-14, mejora 5 «Seguimiento del pedido»).
--   1) public.pedido_estados: una fila cada vez que cambia el estado de un pedido (pedido, estado nuevo y la hora del reloj
--      de la base de datos). Con ella «Mis pedidos» y Administración → Pedidos enseñan la fecha y la hora de cada paso
--      (Confirmado, Preparando, Enviado, Entregado o Cancelado). Lo anterior a esta migración no tiene hora: se enseña sin
--      fecha, nunca inventada (el «Pedido recibido» usa pedidos.created_at y el «Pagado», pedidos.pagado_en).
--   2) La escribe un disparador normal (SIN permisos especiales: corre con los de quien cambia el pedido) después de
--      cambiar pedidos.estado: el administrador desde Pedidos o desde la ficha del cliente, y el puente de VeoAura con su
--      clave de servidor. Si por lo que sea no pudiera apuntarla, el cambio de estado sigue adelante (nunca lo bloquea).
--   3) Reglas (RLS): el cliente lee SOLO los pasos de sus pedidos; el administrador los lee todos y es el único que puede
--      añadir uno (lo hace el disparador). Nadie los cambia ni los borra desde el navegador. Visitantes: nada.
--   4) pedidos.envio_seguimiento (opcional): el número de envío de Correos o el enlace del transportista que escribe el
--      administrador en Pedidos; el cliente ve «Seguir el envío». Como mucho 300 caracteres.
--   5) Privacidad: ya cubre «tu historial de pedidos»; no hace falta otra frase.
-- Qué hace: guarda la hora de cada cambio de estado de los pedidos y el número de envío.
-- Conectado con: public.pedidos, public.is_admin(); app/(tabs)/perfil.tsx (Mis pedidos), app/admin/pedidos.tsx,
--           app/admin/cliente/[userId].tsx, api/escaparate-veoaura.ts (cambia el estado), lib/envio.ts (pasosDelPedido,
--           enlaceSeguimientoEnvio), pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (sección SEGP).
-- Tipo:     SOLO AÑADE (una tabla con sus reglas, una función de disparador normal y una columna). No borra filas ni
--           columnas ni cambia permisos existentes. Se puede aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

create table if not exists public.pedido_estados (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  estado text not null check (estado in ('pendiente', 'confirmado', 'preparado', 'enviado', 'entregado', 'cancelado')),
  creado_en timestamptz not null default now()
);

create index if not exists pedido_estados_pedido_idx on public.pedido_estados (pedido_id, creado_en);

alter table public.pedido_estados enable row level security;

alter table public.pedidos add column if not exists envio_seguimiento text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_envio_seguimiento_largo') then
    alter table public.pedidos add constraint pedidos_envio_seguimiento_largo
      check (envio_seguimiento is null or char_length(btrim(envio_seguimiento)) between 4 and 300);
  end if;
end $$;

-- Apunta el paso con la hora de la base de datos. Corre con los permisos de quien cambia el pedido (sin security definer).
create or replace function public.pedido_estados_apuntar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.pedido_estados (pedido_id, estado, creado_en) values (new.id, new.estado, now());
  exception when others then
    -- Sin poder apuntarlo, el cambio de estado sigue adelante (se enseñará sin hora).
    null;
  end;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedido_estados_apuntar' and tgrelid = 'public.pedidos'::regclass) then
    create trigger pedido_estados_apuntar
      after update of estado on public.pedidos
      for each row
      when (old.estado is distinct from new.estado)
      execute function public.pedido_estados_apuntar();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_estados' and policyname = 'pedido_estados_select') then
    create policy pedido_estados_select on public.pedido_estados
      for select to authenticated using (
        (select public.is_admin())
        or exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_estados' and policyname = 'pedido_estados_insert_admin') then
    create policy pedido_estados_insert_admin on public.pedido_estados
      for insert to authenticated with check ((select public.is_admin()));
  end if;
end $$;

comment on table public.pedido_estados is 'Hora de cada cambio de estado de un pedido (la apunta el disparador pedido_estados_apuntar). El cliente lee los de sus pedidos y el administrador todos.';
comment on column public.pedidos.envio_seguimiento is 'Número de envío de Correos o enlace del transportista (lo escribe el administrador; el cliente ve «Seguir el envío»).';
