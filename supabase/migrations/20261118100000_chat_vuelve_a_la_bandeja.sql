-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: una conversación borrada de la bandeja vuelve a aparecer cuando la otra parte escribe (dueño, 2026-11-18:
-- «me sale que hay mensajes disponibles en administración y cuando entro no hay nada por leer»).
-- Qué pasaba: delete_chat_for_me pone admin_deleted_at (o customer_deleted_at) y la lista de Administración → Chats oculta
--   esas conversaciones, pero un mensaje nuevo del cliente no lo deshacía. get_unread_chat_count sí lo contaba: el Panel de
--   control decía «1 chat sin leer» y en Chats no salía nada (y el administrador nunca veía lo que escribió el cliente).
-- Qué hace: en product_chat_messages_after_insert, además de lo de siempre, un mensaje del cliente devuelve la conversación
--   a la bandeja del administrador (admin_deleted_at = null) y uno de la tienda a la del cliente (customer_deleted_at = null).
--   El resto de la función queda igual.
-- Conectado con: public.product_chats, public.product_chat_messages, delete_chat_for_me, get_unread_chat_count,
--   app/admin/chats.tsx y components/ConversacionProducto.tsx.
-- Tipo:     reemplaza una función SECURITY DEFINER (la aplica el dueño). No borra datos.
-- ============================================================================

create or replace function public.product_chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.product_chats
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 140),
        last_sender_role = new.sender_role,
        -- Si la otra parte la había borrado de su bandeja, vuelve a aparecerle con el mensaje nuevo.
        admin_deleted_at = case when new.sender_role = 'customer' then null else admin_deleted_at end,
        customer_deleted_at = case when new.sender_role = 'admin' then null else customer_deleted_at end
    where id = new.chat_id;
  return new;
end;
$function$;
