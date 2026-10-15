-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: número de WhatsApp en la política de envíos
-- Qué hace: la política de envíos mostraba a los clientes «[NÚMERO DE WHATSAPP]» sin rellenar.
--           Pone el número que indica el dueño (627 748 741) y la opción de escribir
--           directamente desde el chat de la tienda.
-- Tipo:     actualiza el texto de una política. No borra nada. Si ya está cambiado, no hace nada.
-- ============================================================================

update public.policy_pages
set sections = replace(
      replace(sections::text, '[NÚMERO DE WHATSAPP]', '627 748 741'),
      'o desde tu Perfil en la app',
      'o escríbenos directamente desde el chat de la tienda'
    )::jsonb
where slug = 'envios'
  and sections::text like '%[NÚMERO DE WHATSAPP]%';
