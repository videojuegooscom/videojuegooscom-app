-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Noticias Gaming
-- Qué hace: guarda las noticias de gaming y electrónica que recopila y resume la función
--           del servidor api/noticias-gaming.ts (fuentes públicas + resumen con IA), para
--           mostrarlas en Foro → Noticias Gaming.
-- Acceso:   cualquiera puede LEER las publicadas (son noticias públicas). Escribir solo lo
--           hace el servidor con su clave de servicio (sin políticas de escritura).
-- Tipo:     aditiva (solo CREATE).
-- ============================================================================

create table if not exists public.noticias_gaming (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  publicada_en timestamptz,
  url text not null unique,
  fuente text not null,
  titulo text not null check (char_length(titulo) <= 300),
  imagen_url text,
  categoria text not null default 'Gaming'
    check (categoria in ('Consolas', 'Videojuegos', 'PC gaming', 'Móviles y tablets', 'Accesorios', 'Ofertas', 'Gaming')),
  resumen text not null check (char_length(resumen) <= 2000),
  puntos_clave jsonb not null default '[]'::jsonb,
  datos jsonb not null default '[]'::jsonb,
  por_que_importa text check (por_que_importa is null or char_length(por_que_importa) <= 1500),
  afecta_a text check (afecta_a is null or char_length(afecta_a) <= 200),
  publicada boolean not null default true
);

create index if not exists noticias_gaming_fecha_idx on public.noticias_gaming (publicada, publicada_en desc nulls last, created_at desc);

-- Control interno: cuándo se actualizó por última vez (para no llamar a la IA de más).
create table if not exists public.noticias_gaming_control (
  clave text primary key,
  valor timestamptz not null default now()
);

alter table public.noticias_gaming enable row level security;
alter table public.noticias_gaming_control enable row level security;

create policy noticias_gaming_lectura on public.noticias_gaming
  for select to anon, authenticated using (publicada);
