-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Centro de Aprendizajes
-- Qué hace: crea la tabla "aprendizajes", donde el administrador guarda cada corrección
--           que le hace a Claude (reglas de diseño, textos, negocio, código…). Claude las
--           consulta (solo lectura, por MCP) antes de cualquier cambio que se le pida.
-- Acceso:   solo el administrador puede leer y escribir (RLS con is_admin()). Los clientes
--           no ven nada. Claude lee con su conexión de solo lectura de Supabase.
-- Tipo:     aditiva (solo CREATE). No borra ni modifica datos existentes.
-- Pantalla: app/admin/aprendizajes.tsx
-- ============================================================================

create table if not exists public.aprendizajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Frase corta para reconocerla en la lista.
  titulo text not null check (char_length(btrim(titulo)) between 3 and 140),
  -- Área a la que aplica.
  categoria text not null default 'general'
    check (categoria in ('general', 'diseno', 'textos', 'negocio', 'codigo', 'seguridad', 'seo', 'panel')),
  -- Lo que Claude debe hacer (o no hacer) a partir de ahora.
  regla text not null check (char_length(btrim(regla)) between 3 and 4000),
  -- Opcional: cómo estaba mal y cómo debe quedar.
  ejemplo_mal text check (ejemplo_mal is null or char_length(ejemplo_mal) <= 2000),
  ejemplo_bien text check (ejemplo_bien is null or char_length(ejemplo_bien) <= 2000),
  -- 1 = imprescindible, 2 = importante, 3 = preferencia.
  prioridad smallint not null default 2 check (prioridad between 1 and 3),
  -- Desactivar en lugar de borrar: se conserva el historial.
  activa boolean not null default true
);

comment on table public.aprendizajes is
  'Centro de Aprendizajes: correcciones del administrador que Claude consulta antes de cada cambio. Solo admin.';

create index if not exists aprendizajes_activa_prioridad_idx
  on public.aprendizajes (activa, prioridad, categoria);

alter table public.aprendizajes enable row level security;

create policy aprendizajes_admin_select on public.aprendizajes
  for select to authenticated using ((select public.is_admin()));
create policy aprendizajes_admin_insert on public.aprendizajes
  for insert to authenticated with check ((select public.is_admin()));
create policy aprendizajes_admin_update on public.aprendizajes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Sin política de DELETE: no se borran, se desactivan (activa = false).

create or replace function public.set_aprendizajes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_aprendizajes_updated_at
  before update on public.aprendizajes
  for each row execute function public.set_aprendizajes_updated_at();
