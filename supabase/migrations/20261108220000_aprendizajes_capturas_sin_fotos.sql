-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-08 (el dueño corrige: «¿no era que no podías ver imágenes para optimizar las llamadas
--            a Supabase?»). Claude había capturado la web real (portadas, ficha de servicio, fichas de producto) con
--            scripts propios que dejaban pasar las fotos de los productos y servicios.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Capturas de la web real también sin fotos de Supabase', 'codigo', 1,
   'La regla «Las pruebas nunca descargan fotos reales de Supabase» vale también para los scripts sueltos con los que Claude mira la web real (capturas de portadas, fichas, ventanas): toda petición a /storage/v1/object, /storage/v1/render y /_vercel/image se responde con una imagen falsa de 1 × 1, igual que lanzarNavegador(ok) de pruebas/sin-fotos-reales.mjs. Solo pasan las fotos que se están revisando y que sirve la propia web desde Vercel (las portadas de public/categorias/, que no gastan cuota de Supabase). Si para revisar algo hace falta ver una foto concreta de Supabase, se pide UNA vez y por el optimizador, nunca la original a cada captura.',
   'Capturar la ficha de un servicio o Inicio con chromium.launch() y dejar que bajen todas las fotos de productos y servicios en cada captura.',
   'Capturar con las fotos de Supabase cambiadas por una imagen de 1 × 1 y dejar pasar solo /categorias/ cuando se revisan portadas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
