-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: tope diario del historial de Blue IA por persona (revisión de seguridad de Blue IA, 2026-11-03).
-- Qué hace: como mucho 300 mensajes y 40 conversaciones nuevas al día por persona en el historial de Blue IA (lo que
--           la app guarda al hablar con Blue IA con la sesión iniciada). Una conversación normal no se acerca (Blue IA
--           contesta como mucho 120 preguntas por hora a una persona); así nadie puede llenar la base de datos
--           guardando mensajes sin parar. Si se llega al tope, Blue IA sigue contestando: solo deja de guardarse ese día.
-- Cómo:     un disparador antes de cada inserción cuenta lo del último día de ESA persona (lo ve por su propia
--           política, así que no necesita más permisos) y dos índices para contarlo rápido.
-- Tipo:     aditiva (función, disparadores e índices). No toca permisos, políticas ni datos. Repetible.
-- ============================================================================

create index if not exists blue_ia_mensajes_user_idx on public.blue_ia_mensajes (user_id, created_at desc);
create index if not exists blue_ia_conversaciones_user_creada_idx on public.blue_ia_conversaciones (user_id, created_at desc);

create or replace function public.blue_ia_limite_diario()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'blue_ia_mensajes' then
    if (select count(*) from public.blue_ia_mensajes
         where user_id = new.user_id and created_at > now() - interval '1 day') >= 300 then
      raise exception 'Has llegado al máximo de mensajes guardados hoy en Blue IA. Mañana se vuelven a guardar.' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.blue_ia_conversaciones
          where user_id = new.user_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Has llegado al máximo de conversaciones nuevas de hoy en Blue IA. Mañana puedes empezar más.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'blue_ia_mensajes_limite_diario' and tgrelid = 'public.blue_ia_mensajes'::regclass) then
    create trigger blue_ia_mensajes_limite_diario
      before insert on public.blue_ia_mensajes
      for each row execute function public.blue_ia_limite_diario();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'blue_ia_conversaciones_limite_diario' and tgrelid = 'public.blue_ia_conversaciones'::regclass) then
    create trigger blue_ia_conversaciones_limite_diario
      before insert on public.blue_ia_conversaciones
      for each row execute function public.blue_ia_limite_diario();
  end if;
end $$;
