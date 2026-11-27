-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-27.
--   apply_migration del MCP de Supabase se quedó colgado dos veces sin mostrar ninguna ventana en el iPhone
--   (Remote Control), y el dueño pidió el mismo intermediario SQL que VeoAura («vz-sql»), con el MCP de
--   Supabase apagado.
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes); infraestructura/base-datos/INSTALAR.md.
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La base de datos solo por vz-sql; si una herramienta se cuelga, no repetirla', 'seguridad', 1,
   'Con vz-sql instalado, Supabase se lee con «/usr/local/bin/vz-sql consultar --sql» y las migraciones se aplican con «vz-sql plan» y «vz-sql aplicar --archivo supabase/migrations/…», ya publicadas en main y con el OK expreso del dueño. El MCP de Supabase se apaga en cuanto vz-sql esté comprobado; hasta entonces solo se usa para leer. Si una herramienta se queda colgada, primero se comprueba en modo lectura si hizo algo (por ejemplo, si la migración quedó registrada) y se diagnostica; no se vuelve a lanzar la misma. Lo que vz-sql marca como ACCIÓN MANUAL lo aplica el dueño en el SQL Editor; no se busca otra vía.',
   'Volver a lanzar apply_migration después de que se quedara colgado, sin mirar antes si la migración se había aplicado.',
   'Comprobar con una consulta de solo lectura que la migración no está registrada, explicar el bloqueo y aplicarla con vz-sql aplicar en cuanto esté instalado.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
