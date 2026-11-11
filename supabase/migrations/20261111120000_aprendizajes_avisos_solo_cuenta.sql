-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-11 (el dueño: «quiero que tengan la ventaja de avisos de bajadas de precio o
--            artículos nuevos añadidos solo en la app desde Blue IA»).
-- Qué hace: apunta la lección «Los avisos de Blue de bajadas y artículos nuevos son la ventaja de tener cuenta».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); la regla vive en
--           components/Campanita.tsx, api/blue-ia.ts y la tarjeta #analitica-blue-avisos-cuenta de app/admin/analytics.tsx.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los avisos de Blue de bajadas y artículos nuevos son la ventaja de tener cuenta', 'negocio', 1,
   'Los avisos de Blue IA de bajada de precio, artículos nuevos y «Avísame cuando llegue» son solo para clientes con cuenta (gratis): es la ventaja por registrarse. Sin sesión no se muestran ni se activan en el dispositivo; en su lugar Blue enseña «solo con cuenta · Crear cuenta gratis», que lleva al registro y vuelve a la pantalla. Ningún texto de la tienda ni Blue IA dice que funcionan sin cuenta, y donde se invita a registrarse se nombra esta ventaja. En Administración → Analítica se cuenta cuántas cuentas los tienen activados y cuántas se crean desde ese botón.',
   'Sin sesión, Blue: «Ha bajado de precio el mando que te gusta» (guardado solo en el móvil).',
   'Sin sesión, Blue: «Avisos de bajadas de precio y artículos nuevos · solo con cuenta» con «Crear cuenta gratis».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
