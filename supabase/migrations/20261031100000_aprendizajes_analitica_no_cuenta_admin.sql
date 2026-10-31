-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección aprendida el 2026-10-31 — la analítica propia no registra nada del administrador, así que lo que
--            hace él (moderar el Foro, cambiar etapas…) no se puede contar con trackEvent.
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La analítica propia no cuenta al administrador', 'codigo', 1,
   'lib/analytics.ts no registra NADA mientras navega una cuenta de administrador (a propósito: sus pruebas no deben mezclarse con los clientes). Por eso lo que hace el administrador (eliminar mensajes, silenciar, cambiar etapas, crear fichas) nunca se mide con trackEvent: se cuenta con datos de la base de datos (filas, columnas como oculto o updated_at, o una tabla de registro). trackEvent solo sirve para medir lo que hacen los clientes, y solo de quien aceptó la analítica. Antes de enseñar un contador en Administración se comprueba de dónde salen sus datos y que de verdad pueden llegar.',
   '«Mensajes eliminados (30 días)» contado con un trackEvent que se dispara al borrar el administrador: siempre sale 0.',
   'Los comentarios eliminados contados por oculto = true en noticias_comentarios, y la moderación de mensajes con una tabla de registro.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
