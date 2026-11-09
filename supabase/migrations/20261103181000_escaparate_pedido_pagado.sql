-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: aviso «pedido_pagado» en el puente de vuelta a VeoAura (dueño, 2026-11-03).
--   La lista de avisos que puede apuntar la tienda para VeoAura (escaparate_salida.evento) pasa de «pedido» y
--   «pedido_anulado» a esos dos más «pedido_pagado» (el que lleva el nombre, el correo y el teléfono del cliente
--   cuando el pedido se entrega; api/escaparate-retorno.ts).
-- Qué hace: la columna escaparate_salida.evento admite también el aviso «pedido_pagado».
-- Conectado con: public.escaparate_salida; la escribe api/escaparate-retorno.ts y se ve en app/admin/escaparate.tsx.
-- Tipo:     cambia SOLO la comprobación de qué valores admite la columna «evento»: para cambiarla hay que quitar la
--           antigua y poner la nueva (por eso lleva «drop constraint»). No borra ni cambia ninguna fila; las que hay
--           siguen valiendo. Repetible. Aplicarla solo cuando VeoAura esté preparado para recibir «pedido_pagado».
-- Vuelta atrás (solo si no hay ningún aviso «pedido_pagado» apuntado):
--   alter table public.escaparate_salida drop constraint if exists escaparate_salida_evento_check;
--   alter table public.escaparate_salida add constraint escaparate_salida_evento_check check (evento in ('pedido', 'pedido_anulado'));
-- ============================================================================

alter table public.escaparate_salida drop constraint if exists escaparate_salida_evento_check;
alter table public.escaparate_salida
  add constraint escaparate_salida_evento_check check (evento in ('pedido', 'pedido_anulado', 'pedido_pagado'));
