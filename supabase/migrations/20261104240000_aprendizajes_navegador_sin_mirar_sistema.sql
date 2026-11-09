-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño mandó otra captura del móvil con una ventana de permiso: para comprobar la
--            tienda real con un navegador, Claude lanzó «ls /opt/pw-browsers» (una carpeta del sistema, fuera del
--            proyecto) en vez de usar directamente lo que ya tienen las pruebas.
-- Qué hace: añade a esa lección que el navegador se abre siempre con lanzarNavegador, sin mirar el sistema.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     amplía la lección «Nada de Bash fuera del proyecto: cada comando así es una ventana en el móvil del dueño».
--           No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' Tampoco para buscar programas o navegadores: para abrir Chromium se usa SIEMPRE lanzarNavegador de pruebas/sin-fotos-reales.mjs (ya sabe dónde está, pone las fotos falsas y salta la bienvenida); un guion de comprobación de un solo uso va en la carpeta temporal de Claude e importa ese archivo por su ruta completa. Si un dato del sistema hace falta de verdad, se pregunta al dueño, nunca se mira con Bash.',
    ejemplo_mal = ejemplo_mal || ' Y el 2026-11-04: «ls /opt/pw-browsers» para ver dónde estaba el navegador antes de comprobar la tienda real (otra ventana en el móvil).',
    ejemplo_bien = ejemplo_bien || ' Y para comprobar la tienda real: un guion en la carpeta temporal con import { lanzarNavegador } from "/home/videojuegoszaragoza/apps/videojuegooscom-app/pruebas/sin-fotos-reales.mjs".',
    updated_at = now()
where titulo = 'Nada de Bash fuera del proyecto: cada comando así es una ventana en el móvil del dueño'
  and regla not like '%se usa SIEMPRE lanzarNavegador%';
