-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: descripción fija en los artículos que llegan de VeoAura
-- Qué hace: pone el texto del dueño a los artículos ya recibidos de VeoAura que solo tenían
--           la descripción automática («Estado: …»). Los nuevos ya llegan con él desde
--           api/escaparate-veoaura.ts.
-- Tipo:     actualiza la descripción de esos artículos. No borra nada.
-- ============================================================================

update public.products
set description = E'Estado Funcional : 10 / 10\n\n1 Año de GARANTÍA.\n\n¡Probado y testeado antes de entregarlo o enviarlo!\n\nLimpieza realizada para un estado impecable.\n\nEnvíos y Entregas Rápidas.'
where id_veoaura is not null
  and description like 'Estado: %';
