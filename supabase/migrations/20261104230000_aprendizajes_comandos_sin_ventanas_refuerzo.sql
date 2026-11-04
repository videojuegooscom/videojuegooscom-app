-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño mandó una captura del móvil con una ventana de permiso: Claude había lanzado
--            «grep -n "function ActionButton\|…" app/(tabs)/cesta.tsx», con la ruta de la cesta sin comillas (justo el
--            ejemplo de lo que NO se hace en esta lección) y con «\|» en el patrón.
-- Tipo:     amplía la lección «Comandos sin ventanas de permiso». No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' Para buscar varias palabras a la vez, varias -e con textos sencillos (git grep -n -e "function ActionButton" -e "nativeID" -- "app/(tabs)/cesta.tsx"), nunca «\|» ni otras barras invertidas en el patrón. Antes de lanzar cualquier comando con una ruta de la app se mira la ruta: si lleva paréntesis o corchetes (app/(tabs)/…, app/admin/cliente/[userId].tsx), va entre comillas dobles desde el primer intento; si un comando falla por eso, el siguiente ya va bien, sin repetir el error.',
    ejemplo_mal = ejemplo_mal || ' Y el 2026-11-04: grep -n "function ActionButton\|nativeID" app/(tabs)/cesta.tsx (sin comillas y con «\|»: falló y al dueño le salió la ventana de permiso).',
    ejemplo_bien = ejemplo_bien || ' Y: git grep -n -e "function ActionButton" -e "nativeID" -- "app/(tabs)/cesta.tsx".',
    updated_at = now()
where titulo = 'Comandos sin ventanas de permiso'
  and regla not like '%varias -e con textos sencillos%';
