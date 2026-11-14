-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: hasta 3 direcciones de envío en «Mi perfil» (dueño, 2026-11-14, mejora 2 «Comprar en menos pasos»).
--   1) Una columna nueva en perfiles_cliente: direcciones (jsonb, opcional). Es una lista de como mucho 3 direcciones,
--      cada una con su etiqueta (casa, trabajo o familiar, sin repetir), codigo_postal, localidad, direccion, piso y si es
--      la predeterminada. La rellena el cliente en Mi perfil o, al comprar, con «Guardar en mi perfil»; el pago
--      (app/checkout.tsx) ofrece elegir una con un toque.
--   2) Las columnas de siempre (codigo_postal, localidad, direccion y piso) siguen siendo la dirección PREDETERMINADA: la
--      pantalla las mantiene iguales a la marcada como predeterminada, así nada de lo que ya las lee cambia.
--   3) Comprobación: vacío (null) o una lista (array) de 0 a 3 elementos, todos objetos, y como mucho 3.000 caracteres en
--      total (el detalle de cada campo lo valida la pantalla con las mismas reglas de la dirección de siempre).
--   4) Reglas de acceso: no cambian. Es una columna de perfiles_cliente, así que valen las de siempre: cada cliente ve y
--      cambia SOLO su fila y el administrador las lee todas. La función del Foro (perfiles_publicos) no la devuelve.
--   5) Privacidad: ya dice que en Mi perfil se puede guardar la dirección de envío (20261102120000_perfiles_direccion.sql);
--      no hace falta otra frase: son las mismas direcciones, hasta tres.
-- Qué hace: añade la lista de direcciones (opcional, hasta 3) al perfil del cliente.
-- Conectado con: public.perfiles_cliente; components/PerfilPublico.tsx (Mi perfil), app/checkout.tsx (Finalizar compra),
--           app/admin/users.tsx (Usuarios), app/admin/cliente/[userId].tsx (ficha), pruebas/perfiles-sql.mjs y
--           pruebas/perfil-datos.mjs (sección CR).
-- Tipo:     SOLO AÑADE (una columna y una comprobación). No borra filas ni columnas ni cambia permisos. Se puede aplicar
--           varias veces: repetirla no cambia nada.
-- ============================================================================

alter table public.perfiles_cliente add column if not exists direcciones jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_cliente_direcciones_check') then
    alter table public.perfiles_cliente add constraint perfiles_cliente_direcciones_check
      check (
        direcciones is null
        or (
          jsonb_typeof(direcciones) = 'array'
          and jsonb_array_length(direcciones) <= 3
          and octet_length(direcciones::text) <= 3000
          and not jsonb_path_exists(direcciones, '$[*] ? (@.type() != "object")')
        )
      );
  end if;
end $$;

comment on column public.perfiles_cliente.direcciones is 'Hasta 3 direcciones de envío (etiqueta casa/trabajo/familiar, codigo_postal, localidad, direccion, piso, predeterminada). La predeterminada se copia también en codigo_postal, localidad, direccion y piso.';
