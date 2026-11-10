-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: facturas de VeoAura en «Mis pedidos» (dueño, 2026-11-10: factura descargable desde «Mis pedidos»; las
--            facturas las emite VeoAura.com y la tienda NO numera ni emite facturas propias).
-- Qué hace: public.pedido_facturas guarda, por pedido, la factura que VeoAura manda por el puente firmado (evento
--           «factura» de api/escaparate-veoaura.ts): su número, fecha, total y dónde está su PDF (pdf_path, null
--           mientras el PDF se descarga o si no se pudo descargar). Un mismo id_veoaura nunca se duplica (factura
--           rectificada o reenviada = la misma fila puesta al día).
--           Lectura con RLS: el cliente SOLO las facturas de sus pedidos y el administrador todas. Sin reglas de
--           insertar, cambiar ni borrar: solo escribe el servidor (con su clave, que no pasa por estas reglas).
--           Almacén PRIVADO «facturas» (5 MB, solo PDF) sin reglas de lectura: el navegador nunca lo lee directamente;
--           la descarga va por api/factura.ts, que comprueba la sesión y da un enlace firmado de 60 s.
-- Conectado con: public.pedidos (pedido_id), public.is_admin(); api/escaparate-veoaura.ts (escribe la fila y sube el
--           PDF), api/factura.ts (enlace de descarga), app/(tabs)/perfil.tsx («Mis pedidos»), app/admin/pedidos.tsx
--           (número de factura, «Descargar» y filtro), pruebas/perfiles-sql.mjs.
-- Tipo:     aditiva (una tabla nueva, sus dos reglas de lectura y un almacén nuevo). No borra ni cambia datos ni
--           permisos existentes. Repetirla no cambia nada.
-- ============================================================================

create table if not exists public.pedido_facturas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  id_veoaura uuid unique not null,
  numero_factura text check (numero_factura is null or char_length(numero_factura) <= 40),
  fecha date,
  total_eur numeric(10, 2) check (total_eur is null or total_eur >= 0),
  pdf_path text check (pdf_path is null or char_length(pdf_path) <= 200),
  recibida_en timestamptz not null default now(),
  actualizada_en timestamptz
);

create index if not exists pedido_facturas_pedido_idx on public.pedido_facturas (pedido_id);

alter table public.pedido_facturas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_facturas' and policyname = 'pedido_facturas_cliente_select') then
    create policy pedido_facturas_cliente_select on public.pedido_facturas
      for select to authenticated using (
        exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pedido_facturas' and policyname = 'pedido_facturas_admin_select') then
    create policy pedido_facturas_admin_select on public.pedido_facturas
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

-- Almacén PRIVADO de los PDF de las facturas (<pedido_id>/<id_veoaura>.pdf): como mucho 5 MB y solo PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
