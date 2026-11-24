-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: aviso al móvil del dueño cuando alguien envía «Quiero vender» (2026-11-24: las páginas «Compramos»
--   prometen precio en menos de 1 hora y hasta ahora el móvil solo avisaba de pedidos y servicios pagados).
-- Qué hace: añade sell_requests.aviso_admin_enviado_en: api/pago.ts (accion «venta_aviso») la rellena al mandar el
--   aviso, solo si estaba vacía y la solicitud es de los últimos 30 minutos, así cada solicitud avisa UNA sola vez
--   aunque alguien repita la llamada.
-- Conectado con: api/pago.ts (avisarVenta), components/VenderAhoraModal.tsx (lo pide al enviar),
--   components/AvisosMovil.tsx (los avisos del móvil), pruebas/perfil-datos.mjs.
-- Tipo:     aditiva: una columna nula. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar varias veces.
-- Nota:     el registro de avisos (admin_avisos_registro) aún no admite el tipo «venta_nueva»: ampliar su comprobación es
--           quitar y volver a poner un check (lo hace el dueño). Mientras, el aviso sale igual y no queda en el registro.
-- ============================================================================

alter table if exists public.sell_requests add column if not exists aviso_admin_enviado_en timestamptz;

do $$
begin
  if to_regclass('public.sell_requests') is not null then
    comment on column public.sell_requests.aviso_admin_enviado_en is 'Cuándo salió el aviso al móvil del dueño de esta solicitud de venta (una sola vez). Lo escribe api/pago.ts.';
  end if;
end;
$$;
