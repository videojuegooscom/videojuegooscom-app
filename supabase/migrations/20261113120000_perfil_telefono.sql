-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: teléfono opcional en «Mi perfil» (dueño, 2026-11-13, mejora 1).
--   1) Una columna nueva en perfiles_cliente: telefono (texto, opcional). La rellena el cliente en Mi perfil o, al comprar,
--      con «Guardar en mi perfil»; el pago (app/checkout.tsx) lo pone ya escrito en el pedido.
--   2) Comprobación de formato razonable: solo dígitos, espacios y un «+» al principio, de 6 a 20 caracteres y al menos 6
--      dígitos. Vacío = sin teléfono (la pantalla guarda «sin dato» como null).
--   3) Reglas de acceso: no cambian. Es una columna de perfiles_cliente, así que valen las de siempre: cada cliente ve y
--      cambia SOLO su fila y el administrador las lee todas. La función del Foro (perfiles_publicos) no la devuelve.
--   4) Política de privacidad: una frase al final de «Qué datos tratamos» (se añade una vez): el teléfono es opcional, solo
--      sirve para avisarte de tus pedidos o reparaciones y rellenarlo al comprar, no se usa para publicidad y no se llama
--      para la atención al cliente (la atención es por mensaje).
-- Qué hace: añade el teléfono (opcional) al perfil del cliente y una frase a la privacidad.
-- Conectado con: public.perfiles_cliente y public.policy_pages; components/PerfilPublico.tsx (Mi perfil),
--           app/checkout.tsx (Finalizar compra), app/admin/cliente/[userId].tsx (ficha), app/admin/users.tsx (Usuarios),
--           app/admin/analytics.tsx (Analítica), pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (sección TEL).
-- Tipo:     SOLO AÑADE (una columna, una comprobación y una frase). No borra filas ni columnas ni cambia permisos. Se puede
--           aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

alter table public.perfiles_cliente add column if not exists telefono text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_telefono_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_telefono_check
      check (
        telefono is null
        or (
          char_length(telefono) between 6 and 20
          and telefono ~ '^[+]?[0-9][0-9 ]*$'
          and char_length(regexp_replace(telefono, '[^0-9]', '', 'g')) >= 6
        )
      );
  end if;
end $$;

comment on column public.perfiles_cliente.telefono is 'Teléfono (opcional) para avisar de pedidos y reparaciones y rellenar el pago. No se usa para publicidad ni para llamar.';

-- Privacidad: en «Qué datos tratamos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Qué datos tratamos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' En Mi perfil también puedes guardar, si quieres, tu teléfono. Es opcional y solo lo usamos para avisarte de tus pedidos o reparaciones y para rellenarlo solo cuando compras; no lo usamos para publicidad ni te llamamos para la atención al cliente (la atención es por mensaje). Solo lo ves tú y la tienda.'
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
      and s.sec ->> 'body' not like '%también puedes guardar, si quieres, tu teléfono%'
  );
