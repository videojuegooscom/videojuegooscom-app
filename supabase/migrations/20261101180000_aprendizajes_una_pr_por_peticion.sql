-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-01 (la decide el dueño).
--   Siete cambios de un mismo mensaje se hicieron en 3 PR (Cesta, reseñas y categorías): Vercel construye de una en
--   una (unos 4-5 minutos cada vista previa y cada publicación) y, como las tres tocaban el mismo archivo de pruebas,
--   hubo que juntarlas con main dos veces. El dueño preguntó por qué no se agrupan y eligió una PR por petición, con un
--   commit por bloque.
-- Qué hace: añade una lección al Centro de Aprendizajes y pone al día otra.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     inserta la lección nueva si no existe y pone al día, por su título, la de «Antes de editar, estructurar el
--           trabajo» (20261101160000), que decía «una PR por bloque». No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Una PR por petición, con un commit por bloque', 'general', 1,
   'Todo lo que el dueño pide en un mismo mensaje va en UNA sola PR, con un commit por bloque (p. ej. «Cesta», «Reseñas», «Categorías»), cada uno probado antes de seguir con el siguiente. Así hay una sola espera de Vercel (que construye de una en una) y ningún choque entre PR en los archivos compartidos (pruebas/perfil-datos.mjs). Para deshacer un bloque se abre una PR que revierte solo su commit (git revert). Se separa en otra PR solo lo que deba esperar (p. ej. algo que necesita una autorización que aún no hay) o lo urgente que no puede esperar al resto.',
   'Tres PR para un mismo mensaje: tres vistas previas y tres publicaciones en cola, y juntar dos veces con main por las secciones del archivo de pruebas.',
   'Una PR «Cesta, reseñas y categorías» con tres commits; si las reseñas fallan, una PR que revierte ese commit.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);

update public.aprendizajes
set regla = 'Cuando el dueño pide varias cosas, antes de tocar un archivo: localizar dónde está cada pieza, averiguar la causa de lo que «no funciona» (a veces es una migración sin aplicar, no el código), agrupar en bloques (un commit por bloque, todos en una sola PR: ver «Una PR por petición, con un commit por bloque»), ordenarlos de lo pequeño a lo grande y decidir qué se prueba en cada uno. Se le enseña el plan en pocas líneas, se pide de una vez lo que necesite su autorización y se sigue sin esperar.',
    ejemplo_bien = 'Plan de 4 líneas (bloques, orden, qué hace falta autorizar), la autorización pedida al principio y una PR con un commit por bloque.',
    updated_at = now()
where titulo = 'Antes de editar, estructurar el trabajo'
  and regla like '%una PR por bloque%';
