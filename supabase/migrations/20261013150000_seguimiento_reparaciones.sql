-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: seguimiento de reparaciones
-- Qué hace: añade a cada solicitud de servicio (service_requests) la etapa en la que
--           está la reparación, para que el cliente la vea en Perfil → Seguimientos y
--           el admin la cambie desde el panel. No toca la columna "status" (gestión
--           interna de la solicitud: nuevo/revisado/contactado/descartado).
-- Acceso:   el de siempre de service_requests (el cliente ve las suyas, el admin todo).
-- Tipo:     aditiva (solo ADD COLUMN). No borra ni modifica datos existentes.
-- ============================================================================

alter table public.service_requests
  add column if not exists seguimiento text not null default 'solicitado'
    check (seguimiento in ('solicitado', 'recibido', 'diagnostico', 'reparando', 'listo', 'entregado', 'cancelado')),
  add column if not exists seguimiento_nota text
    check (seguimiento_nota is null or char_length(seguimiento_nota) <= 500),
  add column if not exists seguimiento_actualizado timestamptz not null default now();
