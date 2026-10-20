-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: actualiza la lección «Notificaciones dentro de Blue» (el panel ahora tiene
--            2 pestañas) y apunta el botón único «Hablar con Blue IA o el equipo».
-- Tipo:     actualiza el texto de una sola fila (por título), una única vez, e inserta una
--           lección nueva solo si no existe. No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = 'No hay campanita aparte: las notificaciones viven en el asistente flotante Blue. Su panel tiene DOS pestañas: «Asistente» y «Noticias y avisos». «Noticias y avisos» junta en una sola lista los avisos (mensajes nuevos, novedades del Foro, ofertas), las noticias y «Mis avisos» (artículos nuevos y «Avísame cuando llegue»), todo con la misma fila de icono; el contador rojo de la pestaña suma los avisos y las noticias. Se prueba con pruebas/blue-panel.mjs.',
    ejemplo_mal = 'Una pestaña «Notificaciones» y otra «Noticias» con filas distintas, o una campanita aparte.',
    ejemplo_bien = 'Panel de Blue con «Asistente» y «Noticias y avisos», con las mismas filas de icono.',
    updated_at = now()
where titulo = 'Notificaciones dentro de Blue'
  and regla not like '%Noticias y avisos%';

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un solo botón para hablar: «Hablar con Blue IA o el equipo»', 'diseno', 1,
   'En el panel de Blue hay UN solo botón para contactar con la tienda: «Hablar con Blue IA o el equipo». Lleva a Blue IA, que responde primero y, si el cliente quiere, pasa al equipo con «Hablar con el equipo» (que necesita sesión). No se ponen dos botones distintos para lo mismo. Los textos que explican cómo escribir al equipo (Foro vacío, chats del panel de administración) apuntan a «Hablar con el equipo» en Blue IA o a «Chatear con nosotros» en el catálogo, nunca a un botón «Chat» de la ficha del producto que ya no existe.',
   'Dos botones, «Hablar con Blue IA» y «Hablar con nuestro equipo», que hacen casi lo mismo, o un texto que manda a «Chat» en la ficha del producto.', 'Un único botón que abre Blue IA, y textos que nombran los botones que existen de verdad.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
