-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-12 (auditoría de tamaños en el móvil y decisión del dueño sobre el azul: «B, pero solo
--            en los textos más pequeños»).
-- Qué hace: apunta la lección «Tamaños comunes en el móvil y azul oscuro solo en la letra pequeña».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); constants/theme.ts
--           (los tamaños y colores comunes).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Tamaños comunes en el móvil y azul oscuro solo en la letra pequeña', 'diseno', 1,
   'Los tamaños y colores salen de un solo sitio (constants/theme.ts), no escritos a mano en cada pantalla. Letra: 12 px solo para avisos legales y etiquetas, 13 px como mínimo para cualquier otro texto, 15 para el cuerpo, 17 para destacados y precios, 20/24/28 para títulos. Botones y zonas táctiles de 44 px como mínimo y 8 px entre ellos; campos con letra de 16 px y 48 px de alto. Grises de texto no más claros que rgba(11,33,56,0.72). Azul (dueño, 2026-11-12, opción B): el azul de marca #1EA7E8 sigue igual en botones, iconos, logo y fondos; SOLO el texto azul pequeño (por debajo de 17 px: precios pequeños, enlaces, categorías) usa el azul más oscuro #0A78B4 para leerse bien. Títulos y texto azul grande siguen con #1EA7E8.',
   'Un enlace «Ver factura» de 12,5 px en #1EA7E8 sobre blanco (contraste 2,7:1) y un botón de 28 px de alto.',
   'El enlace a 13 px en #0A78B4 con 44 px de zona táctil; los botones azules siguen en #1EA7E8.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
