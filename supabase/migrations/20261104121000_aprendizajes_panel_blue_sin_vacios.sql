-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño pidió quitar de «Noticias y avisos» de Blue el apartado de avisos cuando
--            no hay ninguno («Estás al día: no tienes avisos nuevos»), que «Activa los avisos de noticias» funcione de
--            verdad y quitar por completo la Noticia Flash «Te compramos tu electrónica hoy mismo».
-- Qué hace: apunta la lección «Panel de Blue: sin apartados vacíos y lo que se ofrece se hace con un toque».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Panel de Blue: sin apartados vacíos y lo que se ofrece se hace con un toque', 'diseno', 1,
   'En «Noticias y avisos» de Blue (components/Campanita.tsx) un apartado sin nada no sale: ni «Avisos» con «Estás al día: no tienes avisos nuevos» ni «Noticias» con «No hay noticias ahora mismo». Lo que el panel ofrece se hace ahí mismo con un toque y lo confirma: «Activa los avisos de noticias» los activa en la cuenta (preferencias_usuario) y en el dispositivo, igual que la campana de Noticias Gaming, y dice «Avisos de noticias activados»; si la cuenta no lo guarda, lo dice y no se da por activado. Nunca una fila que solo manda a otra pantalla a buscar el botón. Las Noticias Flash se quitan desactivándolas (Administración → Noticias Flash o migración con is_active = false), nunca borrándolas, y ningún texto de la tienda las repite como texto de reserva. Se prueba con pruebas/perfil-datos.mjs (sección NA, con control) y pruebas/blue-panel.mjs.',
   '«AVISOS · Estás al día: no tienes avisos nuevos» y «Activa los avisos de noticias» que solo lleva a Noticias Gaming para que la persona busque la campana.',
   'Sin avisos, el panel empieza por lo que hay; un toque en «Activa los avisos de noticias» y sale «Avisos de noticias activados · Ver noticias».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
