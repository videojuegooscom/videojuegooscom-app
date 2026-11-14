-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 9 «Vistos recientemente en Inicio», aprobada por el dueño).
-- Qué hace: apunta la lección «Secciones personales de Inicio con datos del dispositivo: solo con datos suficientes,
--           debajo de la primera sección y sin mover la oferta».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                components/CategoryProductsShelf.tsx (VistosRecientemente, registrarVisto), app/(tabs)/index.tsx
--                y pruebas/perfil-datos.mjs (sección VISTOS).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Secciones personales de Inicio con datos del dispositivo: solo con datos suficientes y sin mover la oferta', 'diseno', 2,
   'Lo que Inicio enseña a partir de lo que la persona ha hecho en su dispositivo (vistos recientemente y lo que venga) se guarda solo en el dispositivo (AsyncStorage con try/catch, sin cuenta), con tope y sin repetidos, y sale SOLO cuando hay datos suficientes (vistos: 3 o más a la venta): con menos, ni la sección ni su separador. Lo retirado o vendido se quita solo (se cruza con el índice ligero de la búsqueda, que ya tiene solo lo publicado). Va debajo de la primera sección («Recién llegado»), nunca encima de la oferta, y no se enseña si repite justo lo del estante de al lado. Cada producto se puede quitar (44 px) y hay «Borrar historial». La analítica lleva solo ids y cuántos. Se prueba que la posición de la oferta y de «Recién llegado» es la misma con y sin la sección (pruebas/perfil-datos.mjs, sección VISTOS).',
   'Un «Vistos recientemente» encima de la oferta, con 1 producto o con lo que ya está retirado: empuja la primera pantalla y parece vacío o roto.',
   'Con 3 o más vistos a la venta, el estante aparece tras «Recién llegado», con «Quitar» y «Borrar historial»; la oferta queda en el mismo sitio (384 px a 390 de ancho, con y sin él).')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
