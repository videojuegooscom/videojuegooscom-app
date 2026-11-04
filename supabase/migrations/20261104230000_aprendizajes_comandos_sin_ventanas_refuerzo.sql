-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño mandó dos capturas del móvil con ventanas de permiso:
--            1) Claude lanzó «grep -n "function ActionButton\|…" app/(tabs)/cesta.tsx», con la ruta de la cesta sin
--               comillas (justo el ejemplo de lo que NO se hace en esta lección) y con «\|» en el patrón.
--            2) Para mirar si Vercel había publicado, lanzó «gh api repos/…/commits/<sha>/status --jq ".state, …"»: una
--               expresión con puntos, corchetes y comillas que el guardián no puede dar por lectura.
-- Tipo:     amplía la lección «Comandos sin ventanas de permiso». No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' Para buscar varias palabras a la vez, varias -e con textos sencillos (git grep -n -e "function ActionButton" -e "nativeID" -- "app/(tabs)/cesta.tsx"), nunca «\|» ni otras barras invertidas en el patrón. Antes de lanzar cualquier comando con una ruta de la app se mira la ruta: si lleva paréntesis o corchetes (app/(tabs)/…, app/admin/cliente/[userId].tsx), va entre comillas dobles desde el primer intento; si un comando falla por eso, el siguiente ya va bien, sin repetir el error. Para saber cómo va una PR o un despliegue: /usr/local/bin/vz-publicar revisar N, gh pr checks N o las herramientas de Vercel (list_deployments, también con sha o branch); nunca gh api con --jq ni otras expresiones con puntos, corchetes o comillas dentro.',
    ejemplo_mal = ejemplo_mal || ' Y el 2026-11-04: grep -n "function ActionButton\|nativeID" app/(tabs)/cesta.tsx (sin comillas y con «\|»: falló y al dueño le salió la ventana de permiso), y gh api repos/…/commits/<sha>/status --jq ".state, .total_count, [.statuses[].context]" (otra ventana).',
    ejemplo_bien = ejemplo_bien || ' Y: git grep -n -e "function ActionButton" -e "nativeID" -- "app/(tabs)/cesta.tsx"; y para el estado, gh pr checks 171 o list_deployments con el sha.',
    updated_at = now()
where titulo = 'Comandos sin ventanas de permiso'
  and regla not like '%varias -e con textos sencillos%';
