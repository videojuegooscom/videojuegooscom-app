-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño pidió que el saludo y los mensajes de Blue se cierren solos (en Inicio el
--            saludo pisaba un momento «838 reseñas») y que el aviso de una noticia nueva abra directamente esa noticia y
--            no la lista.
-- Qué hace: apunta la lección «Los mensajes de Blue se cierran solos y cada aviso lleva a lo suyo».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los mensajes de Blue se cierran solos y cada aviso lleva a lo suyo', 'diseno', 1,
   'Nada de Blue se queda tapando la página: el saludo «¡Hola! Soy Blue» se va a los 2,8 s (SALUDO_MS) y cada mensaje se cierra solo a los 12 s a la vista (MENSAJE_VISIBLE_MS en components/Campanita.tsx), sin contar el tiempo en que Blue está escondido o con su panel abierto; la X lo cierra antes. La analítica propia cuenta cómo acaba cada mensaje (tocado, cerrado con la X, se cierra solo) y Administración → Analítica lo enseña en la tarjeta «Blue flotante». Cada aviso lleva directamente a lo que dice, nunca a una lista para buscarlo: el de una noticia nueva enseña su título («Noticia nueva: …») y abre esa noticia (/chat-global?noticia=<id>; con varias, la más reciente). Se prueba con pruebas/perfil-datos.mjs (sección MC, con control de la versión anterior).',
   'Un mensaje de Blue que se queda encima del logo hasta que alguien toca la X, y «Hay 2 noticias nuevas» que abre la lista de Noticias Gaming.',
   'El mensaje se ve 12 s y se va solo; «Noticia nueva: Nueva consola anunciada esta mañana · Y 1 más» abre esa noticia ya desplegada.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
