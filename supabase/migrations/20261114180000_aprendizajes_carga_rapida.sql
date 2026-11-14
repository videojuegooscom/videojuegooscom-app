-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 7 «Carga más rápida», aprobada por el dueño).
-- Qué hace: apunta la lección «Fotos que se piden solo al acercarse y una sola consulta por dato al abrir».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                components/SmartImage.tsx (FotoWeb, MARGEN_CERCA), components/Campanita.tsx (arranque tras la primera
--                pintura), lib/supabase.ts (rolDeUsuario, filaPerfilCliente) y pruebas/perfil-datos.mjs (sección RAPI).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Fotos que se piden solo al acercarse y una sola consulta por dato al abrir', 'codigo', 2,
   'En la web, toda foto de la tienda va con SmartImage: tamaño justo del optimizador de Vercel (≈ 2 × el ancho en pantalla, prop ancho), su caja con alto o proporción ya reservada (nada salta) y priority="high" SOLO en la primera foto visible de cada pantalla (oferta de Inicio, primera fila del catálogo, foto principal de la ficha). Las demás llevan loading="lazy" y decoding="async" y, donde el navegador lo permite, no se piden hasta estar a una pantalla de verse (loading="lazy" solo en Chrome baja todo lo que quede a 1.250-2.500 px, que en el móvil es la página entera). Al abrir la tienda cada dato se pide una vez: lo que necesitan varios (rol de la cuenta, fila del perfil, avisos de precio) se comparte; Blue lee lo suyo cuando la pantalla ya está pintada, y los avisos INITIAL_SESSION / SIGNED_IN de la sesión ya guardada no repiten el arranque. Se comprueba con pruebas/perfil-datos.mjs sección RAPI (tienda servida en https, consultas repetidas, CLS y fotos pedidas) y se mide con rendimiento_carga (Administración → Analítica → «Velocidad de la tienda»). La división del código por rutas (asyncRoutes) se probó y se dejó fuera hasta tener protección contra versiones mezcladas al publicar.',
   'El catálogo del móvil baja las 24 fotos al entrar aunque solo se vean 4; Inicio pide 8 consultas de Blue dos veces y todo baja 70 px cuando aparece el buscador.',
   'Catálogo a 390 px: 12 de 24 fotos al entrar (el resto al bajar), la primera fila con prioridad alta, 0 consultas repetidas y CLS 0.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
