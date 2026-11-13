-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: avisar a VeoAura de los productos creados a mano en la tienda (dueño, 2026-11-13).
-- Qué hace: crea la tabla public.escaparate_salida_productos, con una fila por producto de la tienda sin id_veoaura que
--   hay que dar de alta en el Stock de VeoAura (evento «producto_tienda» del puente de vuelta). Guarda el estado del aviso
--   (pendiente, enviando, enviado, error, descartado), los intentos y una «huella» de lo que se envió, para volver a avisar si
--   el título, el precio, las fotos… cambian antes de que VeoAura lo acepte. Cuando VeoAura responde con su id, la tienda lo
--   guarda en products.id_veoaura (ya existente) y esa fila queda «enviado». Solo datos del producto: nada de clientes.
--   Se usa una tabla aparte porque escaparate_salida exige un pedido (pedido_id) y su lista de eventos no admite uno nuevo
--   sin cambiar su comprobación, y esa no se toca.
-- Conectado con: api/escaparate-retorno.ts (la escribe con la clave de servidor), app/admin/products.tsx y
--   app/admin/escaparate.tsx (la leen los administradores), docs/puente-tienda-productos-a-veoaura.md (contrato).
-- Tipo:     aditiva (tabla nueva con RLS: solo el administrador la lee; la clave de servidor escribe). No toca nada existente.
--           El código funciona antes y después de aplicarla (sin ella, los productos aún no se avisan). Repetible.
-- Vuelta atrás: no hace falta; si se quisiera, bastaría con dejar de usarla.
-- ============================================================================

create table if not exists public.escaparate_salida_productos (
  producto_id uuid primary key,
  id_mensaje uuid not null default gen_random_uuid(),
  huella text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'descartado')),
  intentos integer not null default 0,
  ultimo_intento timestamptz,
  enviado_en timestamptz,
  detalle text check (detalle is null or char_length(detalle) <= 300),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists escaparate_salida_productos_estado_idx on public.escaparate_salida_productos (estado, creado_en);

alter table public.escaparate_salida_productos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'escaparate_salida_productos' and policyname = 'escaparate_salida_productos_admin_select'
  ) then
    create policy escaparate_salida_productos_admin_select on public.escaparate_salida_productos
      for select to authenticated using ((select public.is_admin()));
  end if;
end
$$;
