-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-14 (mejora 4 «Ficha de confianza»: insignias de revisión y garantía, entrega estimada
--            y visor de fotos en la ficha del producto).
-- Qué hace: apunta las lecciones «Revisión y garantía en la ficha: solo si el dueño las marca en ese producto» y «Fechas
--           de entrega con el día de Madrid, sin domingos y probadas con el reloj fijado».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); app/producto/[id].tsx
--           (InsigniasConfianza, EntregaEstimadaFicha), lib/envio.ts (entregaEstimada, hoyEnMadrid), app/admin/products.tsx
--           y pruebas/perfil-datos.mjs (sección FCONF). Matiza la lección «Garantías y promesas solo en la descripción».
-- Tipo:     inserta las lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Revisión y garantía en la ficha: solo si el dueño las marca en ese producto', 'textos', 2,
   'Matiza «Garantías y promesas solo en la descripción»: desde el 2026-11-14 (mejora 4, aprobada por el dueño) la ficha del producto puede enseñar «Revisado por nuestro equipo» y «Garantía de N meses», pero SOLO cuando el dueño lo marca en ese producto (Administración → Productos; products.revisado y garantia_meses). Nunca líneas fijas para todos ni una garantía por defecto: sin marcar, no sale nada. La entrega estimada usa los plazos del negocio que ya dicen el pago y «Quiénes somos» (Zaragoza y Cuarte el mismo día; resto de España sale en 1-2 días laborables y llega en 72 h), siempre como «Entrega estimada», sin hora de corte inventada y sin fecha para Baleares, Canarias, Ceuta y Melilla.',
   'Tres iconos fijos bajo el precio («Garantía 1 año», «Revisado», «Envío 24 h») en todos los productos.',
   '<InsigniasConfianza revisado={p.revisado} garantiaMeses={p.garantiaMeses} /> que no pinta nada si el dueño no lo ha marcado; «Llega entre el lunes y el martes» con «Entrega estimada si lo pides hoy».'),
  ('Fechas de entrega con el día de Madrid, sin domingos y probadas con el reloj fijado', 'codigo', 2,
   'Un «Llega hoy / mañana, lunes / entre el jueves y el viernes» se calcula con la fecha de Europe/Madrid (Intl.DateTimeFormat con timeZone), no con la del navegador, y contando días laborables sin domingos. Se prueba con el reloj de Playwright fijado (ctx.clock.install) y el navegador en otra zona (timezoneId «UTC»): un sábado a las 23:30 UTC ya es domingo en Madrid. Para leer un dato desde la prueba, en react-native-web se usa dataSet={{ tipo }} (sale como data-tipo); un «data-tipo» escrito como prop se pierde.',
   'new Date().getDay() del navegador: a las 00:30 del domingo en Madrid, un iPhone con la hora de otro país decía «Llega hoy».',
   'hoyEnMadrid() + diasHastaLaborable() en lib/envio.ts; la sección FCONF lo comprueba un viernes (lunes y martes) y un domingo de Madrid que aún es sábado en UTC.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
