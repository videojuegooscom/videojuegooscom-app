-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: datos de perfil del cliente («Mi cuenta» → Perfil): nombre, nombre de usuario, país, provincia
--            y fecha de nacimiento (la edad se calcula).
-- Tipo:     SOLO AÑADE (una tabla nueva con sus reglas de acceso). No toca ninguna tabla ni función existente.
--           Cada cliente lee y edita SOLO su fila; el administrador puede leer todas (para el seguimiento en
--           Administración → Usuarios) y no puede editarlas. Nadie sin sesión ve nada.
-- Antes de usar la pantalla: el código la oculta mientras esta tabla no exista (no se rompe nada).
-- ============================================================================

create table if not exists public.perfiles_cliente (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  usuario text,
  pais text,
  provincia text,
  fecha_nacimiento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfiles_cliente_nombre_largo check (nombre is null or char_length(nombre) between 2 and 60),
  constraint perfiles_cliente_usuario_formato check (usuario is null or usuario ~ '^[A-Za-z0-9._-]{3,24}$'),
  constraint perfiles_cliente_pais_largo check (pais is null or char_length(pais) between 2 and 60),
  constraint perfiles_cliente_provincia_largo check (provincia is null or char_length(provincia) between 2 and 60),
  -- Mínimo 14 años (edad de consentimiento para tratar datos en España) y una fecha razonable.
  constraint perfiles_cliente_edad_minima check (
    fecha_nacimiento is null
    or (fecha_nacimiento >= date '1900-01-01' and fecha_nacimiento <= (current_date - interval '14 years'))
  )
);

comment on table public.perfiles_cliente is 'Datos de perfil que el cliente escribe en Mi cuenta (nombre, usuario, país, provincia y fecha de nacimiento). Cada cliente solo ve y edita la suya; el administrador las lee.';
comment on column public.perfiles_cliente.usuario is 'Nombre de usuario: 3-24 caracteres (letras, números, punto, guion y guion bajo), único sin distinguir mayúsculas.';
comment on column public.perfiles_cliente.fecha_nacimiento is 'Solo se guarda la fecha; en pantalla y en Administración se enseña la edad.';

-- Un nombre de usuario no se repite (sin distinguir mayúsculas). Varias filas sin usuario no chocan entre sí.
create unique index if not exists perfiles_cliente_usuario_uidx on public.perfiles_cliente (lower(usuario)) where usuario is not null;
-- Para filtrar y contar por provincia y por país en Administración.
create index if not exists perfiles_cliente_provincia_idx on public.perfiles_cliente (provincia);

-- updated_at se actualiza solo (la misma función que usan products, profiles, blog_posts…).
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_perfiles_cliente_updated'
       and tgrelid = 'public.perfiles_cliente'::regclass
  ) then
    create trigger trg_perfiles_cliente_updated
      before update on public.perfiles_cliente
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- Acceso: solo con sesión. Supabase da por defecto TODOS los permisos a anon y authenticated sobre una tabla nueva: se
-- retiran y se devuelven solo los necesarios. Los clientes pueden leer, crear y editar (la fila propia, por las políticas
-- de abajo) y NO borrar (la fila desaparece sola si se elimina la cuenta). Los visitantes (anon) no pueden nada.
alter table public.perfiles_cliente enable row level security;
revoke all on public.perfiles_cliente from public, anon, authenticated;
grant select, insert, update on public.perfiles_cliente to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfiles_cliente' and policyname = 'perfiles_cliente_select') then
    create policy perfiles_cliente_select on public.perfiles_cliente
      for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfiles_cliente' and policyname = 'perfiles_cliente_insert_propia') then
    create policy perfiles_cliente_insert_propia on public.perfiles_cliente
      for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfiles_cliente' and policyname = 'perfiles_cliente_update_propia') then
    create policy perfiles_cliente_update_propia on public.perfiles_cliente
      for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;
