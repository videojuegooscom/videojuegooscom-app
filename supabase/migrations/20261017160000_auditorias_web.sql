-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: registro de las revisiones de calidad web automáticas (tabla auditorias_web)
-- Tipo:     SOLO AÑADE una tabla nueva con su política. No toca nada existente.
-- Para qué: api/auditoria-web.ts (la lanza el cron de Vercel los días 1 y 15) revisa la tienda
--           real y guarda aquí cuándo lo hizo, qué puntos miró, qué encontró y qué cambió
--           (nada: solo lee). El panel de administración lo enseña en «Revisiones».
-- Acceso:   solo el administrador puede leer; escribe únicamente el servidor (clave de servidor,
--           que se salta la RLS). No hay política de escritura para nadie más.
-- ============================================================================

create table if not exists public.auditorias_web (
  id           uuid primary key default gen_random_uuid(),
  ejecutada_en timestamptz not null default now(),
  origen       text not null default 'automatica' check (origen in ('automatica', 'manual')),
  resumen      text not null default '',
  ok           integer not null default 0,
  avisos       integer not null default 0,
  fallos       integer not null default 0,
  manuales     integer not null default 0,
  duracion_ms  integer not null default 0,
  cambios      text not null default 'Ninguno: la revisión automática solo lee la tienda.',
  resultado    jsonb not null default '[]'::jsonb
);

alter table public.auditorias_web enable row level security;

create policy auditorias_web_select_admin on public.auditorias_web
  for select using (public.is_admin());
