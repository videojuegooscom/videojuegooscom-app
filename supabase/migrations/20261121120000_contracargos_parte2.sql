-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: protección contra contracargos, parte 2 (dueño, 2026-11-18, aprobada; «Empieza», 2026-11-21).
-- Qué hace:
--   1) public.pedido_reclamaciones: una fila por reclamación del banco (contracargo) que avisa Stripe
--      (charge.dispute.created / updated / closed): su id de Stripe («dp_…»), el pedido al que pertenece (por la
--      referencia del pago), el estado y el motivo tal como los da Stripe, el importe, el plazo para responder, cuándo se
--      cerró y, si el dueño pulsó «Preparar pruebas», cuándo y qué pruebas se guardaron como borrador en Stripe. La
--      escribe SOLO el servidor (api/pago.ts, con su clave de servidor, que no pasa por las reglas); el administrador la
--      lee (una regla de lectura solo con sesión de administrador). Clientes y visitantes: nada.
--   2) Código de entrega en mano (solo entregas en mano y del mismo día en Zaragoza y Cuarte): pedidos.entrega_codigo
--      (4 cifras) lo pone la base de datos al crear un pedido de la tienda (petición de visitante o con sesión) y nadie
--      lo cambia después; el cliente lo ve en Mis pedidos y se lo dice a quien le entrega. pedidos.entrega_codigo_ok_en
--      solo lo pone la función confirmar_entrega_codigo (administrador, con el código correcto), que además marca el
--      pedido como «entregado»: es la prueba de que lo recibió en mano. Escribirlo a mano no vale (el disparador lo
--      deja como estaba).
-- Conectado con: api/pago.ts (avisos de reclamación de Stripe, aviso al móvil y «Preparar pruebas»), app/admin/pedidos.tsx
--           (bloque «Reclamación del banco», cifra «Reclamaciones», confirmar la entrega con el código),
--           app/(tabs)/perfil.tsx y components/ (Mis pedidos: «Código de entrega»), public.policy_pages (envíos y
--           privacidad), pruebas/perfiles-sql.mjs (CONTRA2) y pruebas/perfil-datos.mjs (CONTRA).
-- Tipo:     SOLO AÑADE (una tabla con su regla de lectura, dos columnas con su comprobación, una función normal, un
--           disparador normal y una frase en Envíos y otra en Privacidad, una sola vez). No borra filas ni columnas ni
--           cambia permisos existentes. Repetirla no cambia nada.
-- ============================================================================

-- 1) Reclamaciones del banco.
create table if not exists public.pedido_reclamaciones (
  id text primary key check (id ~ '^(dp|du)_[A-Za-z0-9]+$' and char_length(id) <= 80),
  pedido_id uuid references public.pedidos (id),
  pago_referencia text check (pago_referencia is null or char_length(pago_referencia) <= 255),
  estado text not null check (char_length(estado) between 1 and 40),
  motivo text check (motivo is null or char_length(motivo) <= 60),
  importe_eur numeric(10, 2) not null check (importe_eur >= 0),
  plazo_en timestamptz,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  cerrada_en timestamptz,
  pruebas_preparadas_en timestamptz,
  pruebas_resumen jsonb,
  modo text not null default 'real' check (modo in ('real', 'prueba'))
);
comment on table public.pedido_reclamaciones is 'Reclamaciones del banco (contracargos) que avisa Stripe; las escribe solo el servidor y las lee el administrador.';
create index if not exists pedido_reclamaciones_pedido on public.pedido_reclamaciones (pedido_id);

alter table public.pedido_reclamaciones enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_reclamaciones' and policyname = 'pedido_reclamaciones_admin_select') then
    create policy pedido_reclamaciones_admin_select on public.pedido_reclamaciones
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

-- 2) Código de entrega en mano.
alter table public.pedidos add column if not exists entrega_codigo text check (entrega_codigo is null or entrega_codigo ~ '^[0-9]{4}$');
alter table public.pedidos add column if not exists entrega_codigo_ok_en timestamptz;
comment on column public.pedidos.entrega_codigo is 'Código de 4 cifras que el cliente dice al recibir en mano (entregas en mano y del mismo día). Lo pone la base de datos.';
comment on column public.pedidos.entrega_codigo_ok_en is 'Cuándo se confirmó la entrega en mano con el código correcto (solo con confirmar_entrega_codigo).';

create or replace function public.pedidos_codigo_entrega()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rol text;
begin
  if tg_op = 'UPDATE' then
    new.entrega_codigo := old.entrega_codigo;
    if new.entrega_codigo_ok_en is distinct from old.entrega_codigo_ok_en
       and coalesce(current_setting('vz.entrega_codigo_ok', true), '') <> 'si' then
      new.entrega_codigo_ok_en := old.entrega_codigo_ok_en;
    end if;
    return new;
  end if;
  begin
    v_rol := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_rol := null;
  end;
  if v_rol in ('anon', 'authenticated') and new.id_veoaura is null and new.veoaura_venta_id is null then
    new.entrega_codigo := lpad((floor(random() * 10000))::int::text, 4, '0');
  else
    new.entrega_codigo := null;
  end if;
  new.entrega_codigo_ok_en := null;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedidos_codigo_entrega' and tgrelid = 'public.pedidos'::regclass) then
    create trigger pedidos_codigo_entrega
      before insert or update on public.pedidos
      for each row
      execute function public.pedidos_codigo_entrega();
  end if;
end $$;

-- Confirmar la entrega en mano con el código que dice el cliente: solo el administrador, solo con el código correcto y
-- solo en un pedido en mano o del mismo día sin cancelar. Devuelve 'ok', 'codigo_incorrecto' o 'no_aplica'.
create or replace function public.confirmar_entrega_codigo(p_pedido uuid, p_codigo text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if not public.is_admin() then
    raise exception 'solo_administradores' using errcode = '42501';
  end if;
  select * into v_pedido from public.pedidos where id = p_pedido;
  if not found or v_pedido.entrega_codigo is null or v_pedido.estado in ('cancelado')
     or not (v_pedido.entrega = 'recogida' or coalesce(v_pedido.zona_envio, '') in ('mano', 'local', 'local_lejos')) then
    return 'no_aplica';
  end if;
  if btrim(coalesce(p_codigo, '')) <> v_pedido.entrega_codigo then
    return 'codigo_incorrecto';
  end if;
  perform set_config('vz.entrega_codigo_ok', 'si', true);
  update public.pedidos
     set estado = 'entregado',
         entrega_codigo_ok_en = coalesce(entrega_codigo_ok_en, now())
   where id = p_pedido;
  perform set_config('vz.entrega_codigo_ok', '', true);
  return 'ok';
end;
$$;

-- 3) Envíos: el código de entrega, una sola vez (al final de la primera sección que hable de Zaragoza; si no hay, al
--    final de la última).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.ord = (
                        select coalesce(min(s2.ord) filter (where s2.sec ->> 'body' ilike '%Zaragoza%'), max(s2.ord))
                          from jsonb_array_elements(p.sections) with ordinality as s2 (sec, ord)
                      )
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' En las entregas en mano y en las del mismo día en Zaragoza y Cuarte, te damos un código de entrega de 4 cifras (lo ves en Perfil → Mis pedidos): díselo a quien te lo entregue para confirmar que lo has recibido.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios'
  and jsonb_typeof(p.sections) = 'array'
  and jsonb_array_length(p.sections) > 0
  and p.sections::text not like '%código de entrega de 4 cifras%';

-- 4) Privacidad: en «Para qué usamos tus datos», al final, una sola vez.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Si reclamas un cobro a tu banco, guardamos los datos de esa reclamación que nos da Stripe y le enviamos las pruebas de tu compra (el pedido, la entrega y lo que aceptaste al pagar) para que el banco pueda resolverla.'
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
      and s.sec ->> 'body' not like '%Si reclamas un cobro a tu banco%'
  );
