-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: historial de Blue IA en la ficha del cliente (dueño, 2026-11-18: «en la ficha del cliente también me
--            gustaría saber si ya ha mantenido conversación con Blue y qué ha hablado con él»).
-- Qué hace:
--   1) Deja que el administrador (is_admin()) LEA las conversaciones y los mensajes de Blue IA de los clientes. Solo
--      leer: no puede escribir ni cambiar nada. Cada cliente sigue viendo solo las suyas (las reglas de antes no cambian).
--   2) La política de privacidad lo dice: añade una frase al final de «Qué datos tratamos», una sola vez.
-- Conectado con: public.blue_ia_conversaciones, public.blue_ia_mensajes (migración 20261013170000_historial_blue_ia.sql),
--   public.is_admin(), app/admin/cliente/[userId].tsx (BlueIACliente), public.policy_pages (slug «privacidad»).
-- Tipo: PERMISOS (regla nueva de lectura para el administrador): la aplica el dueño. Aditiva: no borra nada y
--   repetirla no cambia nada.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blue_ia_conversaciones' and policyname = 'blue_ia_conv_select_admin') then
    create policy blue_ia_conv_select_admin on public.blue_ia_conversaciones
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'blue_ia_mensajes' and policyname = 'blue_ia_msg_select_admin') then
    create policy blue_ia_msg_select_admin on public.blue_ia_mensajes
      for select to authenticated using ((select public.is_admin()));
  end if;
end $$;

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Qué datos tratamos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Si hablas con Blue IA con la sesión iniciada, guardamos esa conversación para que puedas retomarla; el equipo de la tienda también puede consultarla, solo para atenderte mejor (por ejemplo, si después nos escribes por el chat). Sin sesión iniciada no se guarda.'
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
    where s.sec ->> 'heading' = 'Qué datos tratamos'
      and s.sec ->> 'body' not like '%conversación con Blue IA%'
      and s.sec ->> 'body' not like '%Si hablas con Blue IA%'
  );
