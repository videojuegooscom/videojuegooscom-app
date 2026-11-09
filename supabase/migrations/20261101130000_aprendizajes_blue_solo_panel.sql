-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la lección «Blue: interfaz pública y Administración» se completa (petición del dueño, 2026-11-01): dentro
--            del Panel de control, Blue solo habla de lo del panel, también en su ventana y en su número rojo.
-- Qué hace: reescribe el texto de esa lección del Centro de Aprendizajes.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     actualiza el texto de una sola fila (por título). No borra nada; repetirla deja el mismo texto.
-- ============================================================================

update public.aprendizajes
set regla = 'Blue flotante se comporta distinto según la pantalla (components/Campanita.tsx). INTERFAZ PÚBLICA: aparece en toda la tienda salvo en las pantallas de chat (Blue IA, Foro y chats) y en el formulario Vender, porque taparía el campo de escribir y el botón de enviar; la guía sí puede abrirse allí. En el pago no saca mensajes ni ofrece instalar la app. ADMINISTRACIÓN: Blue solo se monta para el dueño con rol admin; a nadie más. Allí solo habla de lo del panel (petición del dueño, 2026-11-01): sus mensajes son los del panel (pedidos y reparaciones olvidados, temas de «Lo que Blue sabe», cuya respuesta escribe siempre el dueño); su número rojo y su pestaña «Avisos del panel» solo cuentan clientes que han escrito, ventas de VeoAura sin confirmar y olvidados, nunca los avisos de la tienda (Foro, noticias, artículos nuevos, favoritos, reservas) ni «Mis avisos»; y su Asistente ofrece ir al panel, «Lo que Blue sabe» y volver a la tienda, sin guías, «Vender» ni instalar. Se aparta sin tapar el panel.',
    ejemplo_mal = 'Dentro del Panel de control, el número rojo de Blue suma «Hay novedades en el Foro» y su ventana enseña las noticias, «Mis avisos» y las guías de la tienda.',
    ejemplo_bien = 'Dentro del panel, «Avisos del panel»: «2 clientes te han escrito» y «1 pedido lleva más de 48 h sin cambios»; al volver a la tienda, Blue vuelve a enseñar sus avisos de siempre.',
    updated_at = now()
where titulo = 'Blue: interfaz pública y Administración';
