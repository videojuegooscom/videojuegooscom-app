-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Perfil público» del cliente (Mi cuenta), TODO EN UNA: nombre, nombre de usuario, país, provincia, fecha de
--            nacimiento (la edad se calcula) y foto (opcional), y el almacén de las fotos de perfil.
-- Sustituye a 20261022100000_perfiles_cliente.sql (que nunca se llegó a aplicar): esta incluye lo mismo y además la foto.
-- Si aquella ya estuviera aplicada, esta solo añade lo que falta. Se puede aplicar varias veces sin error.
-- Tipo:     SOLO AÑADE (una tabla nueva con sus reglas de acceso, una columna, un almacén de fotos y sus reglas). No toca
--           ninguna tabla, fila ni función existente.
--           - Cada cliente lee y edita SOLO su fila; el administrador puede leer todas (Administración → Usuarios) y no puede
--             editarlas. Nadie sin sesión ve nada.
--           - Fotos de perfil: almacén público «avatares» (como mucho 2 MB, solo JPG, PNG o WEBP). Cada cliente solo puede subir
--             fotos dentro de su propia carpeta (<su id>/…).
-- La aplica el dueño en Supabase → SQL Editor (cambia permisos). Antes de eso, el código esconde el perfil y no exige nada.
-- ============================================================================

create table if not exists public.perfiles_cliente (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  usuario text,
  pais text,
  provincia text,
  fecha_nacimiento date,
  foto_url text,
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

-- Si la tabla ya existía (de la migración anterior), se le añade la foto.
alter table public.perfiles_cliente add column if not exists foto_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'perfiles_cliente_foto_url'
       and conrelid = 'public.perfiles_cliente'::regclass
  ) then
    alter table public.perfiles_cliente
      add constraint perfiles_cliente_foto_url
      check (foto_url is null or (char_length(foto_url) <= 500 and foto_url ~ '^https://'));
  end if;
end $$;

comment on table public.perfiles_cliente is 'Perfil público que el cliente rellena en Mi cuenta (nombre, usuario, país, provincia, fecha de nacimiento y foto opcional). Cada cliente solo ve y edita el suyo; el administrador los lee.';
comment on column public.perfiles_cliente.usuario is 'Nombre de usuario: 3-24 caracteres (letras, números, punto, guion y guion bajo), único sin distinguir mayúsculas.';
comment on column public.perfiles_cliente.fecha_nacimiento is 'Solo se guarda la fecha; en pantalla y en Administración se enseña la edad.';
comment on column public.perfiles_cliente.foto_url is 'Foto de perfil (opcional): dirección pública de la foto en el almacén «avatares».';

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

-- Almacén de las fotos de perfil: público para verlas; como mucho 2 MB y solo fotos (la tienda las reduce antes de subir).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada cliente solo sube fotos a SU carpeta (avatares/<su id>/…). Nombre único por foto: no hace falta reemplazar ni borrar.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatares_subir_propia') then
    create policy avatares_subir_propia on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;
