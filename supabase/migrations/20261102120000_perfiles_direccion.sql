-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dirección de envío en «Mi perfil» (dueño, 2026-11-02: «Código Postal», «Dirección» y «piso y letra»,
--   profesional como en Amazon).
--   1) Cuatro columnas nuevas en perfiles_cliente, todas opcionales: codigo_postal, localidad, direccion (calle,
--      avenida… y número de portal) y piso (piso, puerta, letra). Las usa el pago para rellenar el pedido solo.
--   2) Comprobaciones: código postal de 3 a 10 caracteres (letras, números, espacio o guion; en España la tienda pide 5
--      cifras), localidad de 2 a 60 letras, dirección de 5 a 120 y piso de 1 a 40. Vacío = sin dirección.
--   3) Permisos: no cambian. Son columnas de perfiles_cliente, así que cada cliente solo ve y edita las suyas y el
--      administrador las lee (las políticas de siempre). La función del Foro (perfiles_publicos) no las devuelve.
--   4) Política de privacidad: una frase al final de «Qué datos tratamos» (se añade una vez).
-- Tipo:     SOLO AÑADE (columnas, comprobaciones y una frase). No borra filas ni columnas. Se puede aplicar varias veces.
-- ============================================================================

alter table public.perfiles_cliente add column if not exists codigo_postal text;
alter table public.perfiles_cliente add column if not exists localidad text;
alter table public.perfiles_cliente add column if not exists direccion text;
alter table public.perfiles_cliente add column if not exists piso text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_codigo_postal_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_codigo_postal_check
      check (codigo_postal is null or codigo_postal ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_localidad_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_localidad_check
      check (localidad is null or char_length(btrim(localidad)) between 2 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_direccion_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_direccion_check
      check (direccion is null or char_length(btrim(direccion)) between 5 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_piso_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_piso_check
      check (piso is null or char_length(btrim(piso)) between 1 and 40);
  end if;
end $$;

comment on column public.perfiles_cliente.direccion is 'Calle, avenida… y número de portal (opcional). Con codigo_postal, localidad y piso rellena el pago.';

-- Política de privacidad: la dirección del perfil (se añade una vez al final de «Qué datos tratamos»).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Qué datos tratamos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' En Mi perfil también puedes guardar, si quieres, tu dirección de envío (código postal, localidad, dirección y piso) para que tus pedidos se rellenen solos; solo la ves tú y la tienda.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Qué datos tratamos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%dirección de envío (código postal%');
