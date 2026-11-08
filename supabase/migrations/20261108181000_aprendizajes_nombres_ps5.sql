-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-08 (el dueño corrige: «no llames a la Fat de esa manera, llámala PlayStation 5 Blu Ray»;
--            antes: «quiero que sean de verdad las PlayStation 5» al ver portadas dibujadas).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Modelos con su nombre comercial y portadas solo con fotos reales', 'textos', 1,
   'De cara al cliente, los modelos se llaman por su nombre comercial, como en los productos de la tienda: «PlayStation 5 Blu-Ray» (nunca «Fat», que es jerga), «PlayStation 5 Slim», «PlayStation 5 Pro». Las portadas de categorías van siempre con fotos reales del producto, nunca con dibujos; si falta una foto se le pide al dueño. Al recortar una foto de fondo blanco: silueta suavizada y recortada a la resolución final con borde antialias, bordes rectos donde el objeto es recto, sin halo alrededor de la silueta ni restos de sombra, y revisada ampliada antes de publicar.',
   'Portada con «PLAYSTATION 5 Fat», o consolas dibujadas, o recortes con dientes y halo.',
   'Portada con «PLAYSTATION 5 Blu-Ray» sobre la foto real, recortada limpia y revisada ampliada.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
