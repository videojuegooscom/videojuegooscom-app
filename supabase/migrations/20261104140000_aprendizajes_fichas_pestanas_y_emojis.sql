-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño mandó una captura de una ficha de servicio: al pasar de «Características»
--            a «Descripción» la pantalla se quedaba a medias y había que acomodarla con el dedo («tiene que ser
--            intuitivo y profesional»); y pidió que los emojis que escriba en la descripción no salgan en la tienda.
-- Qué hace: apunta la lección «Fichas: cada pestaña entera en su sitio y descripciones sin emojis».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Fichas: cada pestaña entera en su sitio y descripciones sin emojis', 'diseno', 1,
   'En la ficha de producto y de servicio (FichaProducto en app/producto/[id].tsx) cada pantalla del carrusel («Características», «Mantenimiento», «Descripción») queda SIEMPRE entera en su sitio: tras un cambio por pestaña o por el pase automático se comprueba que el deslizamiento llegó y, si no, se encaja sin animación (en el iPhone el deslizamiento animado se corta a veces); y si el dedo lo suelta entre dos pantallas, al pararse va a la más cercana. El cliente nunca tiene que acomodarla a mano. Los emojis que el dueño escriba en la descripción no salen en la tienda (sinEmojis de lib/admin/products.utils.ts: ficha, Oferta de la semana de Inicio, datos para Google y mensajes de Blue); se quedan ©, ® y ™. En el panel (Productos y Servicios) se avisa al escribirlos («se verá sin sus N emojis»). Se prueba con pruebas/perfil-datos.mjs (sección FT, con control de la versión anterior, que falla con la pantalla 165 px fuera de su sitio).',
   'Tocar «Descripción» y que quede media «Características» a la izquierda; «✅ Reparación rápida 💎 1 año de garantía» con sus emojis en la ficha.',
   '«Descripción» entera nada más tocarla; «Reparación rápida. 1 año de garantía.» sin emojis, y el aviso en el panel al escribirlos.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
