-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: corrige dos lecciones que chocaban con otras (repaso del Centro de Aprendizajes, 2026-11-04; el dueño:
--            «corrige las 2 lecciones que se contradicen»).
--   1) «Supabase lo aplica Claude» (2026-10-14) decía que Claude aplica las migraciones fusionadas sin preguntar,
--      aunque cambien permisos. Desde entonces la regla del dueño (CLAUDE.md) es otra: cada migración se aplica solo con
--      su OK expreso, de una en una, y los permisos delicados los aplica él. La lección pasa a decir eso.
--   2) «La guía de Blue enseña haciendo, con poco texto» hablaba de «una mano (👆)», y «En la guía de Blue siempre
--      iconos, nunca emojis» prohíbe ese emoji (el puntero es la huella táctil de components/Campanita.tsx). Se cambia
--      solo esa parte; el resto de la lección se queda igual.
-- Qué hace: corrige el texto de esas dos lecciones para que no se contradigan con otras.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     actualiza esas dos filas. No borra nada. Repetirla no cambia nada (cada cambio busca el texto antiguo).
-- ============================================================================

-- 1) Supabase: Claude aplica, pero siempre con el OK del dueño.
update public.aprendizajes
set titulo = 'Supabase: Claude aplica las migraciones, siempre con el OK expreso del dueño',
    regla = 'Los cambios de la base de datos van como SQL aditivo en supabase/migrations dentro de una rama con su PR. Fusionada la PR, Claude explica en sencillo cada migración pendiente (qué hace, si borra algo, qué pasa sin ella) y espera el OK expreso del dueño; con él, hace git fetch origin main y la aplica con apply_migration, de una en una, con el nombre del archivo sin la fecha y su contenido EXACTO (el guardián lo compara con origin/main), y comprueba cada una en la base de datos. Nunca DELETE, DROP ni TRUNCATE. Los permisos delicados (grant, security definer, anon, using (true)), los roles, auth.*, vault, cron y lo destructivo los aplica el dueño en el SQL Editor: se le dan en un bloque listo para copiar (ver «Configurar Supabase desde el móvil»). Lo que Claude puede aplicar con el OK no se le pide pegarlo al dueño.',
    ejemplo_mal = 'Aplicar una migración recién fusionada sin que el dueño la haya autorizado, aplicar un security definer que le tocaba a él, o pedirle que pegue desde el móvil una migración que Claude podía aplicar con su OK.',
    ejemplo_bien = 'Explicar las 5 migraciones pendientes, esperar «OK aplica las 5», aplicarlas en orden con el contenido de main y comprobar cada una (columna numeric(10,2), noticia apagada, lecciones activas).',
    updated_at = now()
where titulo = 'Supabase lo aplica Claude';

-- 2) Guía de Blue: el puntero es el icono de la huella táctil, nunca el emoji de la mano.
update public.aprendizajes
set regla = replace(regla, 'una mano (👆) toca lo que hay que tocar', 'el puntero de la app (la huella táctil blanca en un círculo azul de marca, nunca un emoji de mano) toca lo que hay que tocar'),
    ejemplo_bien = replace(ejemplo_bien, 'Mano que toca', 'Puntero de huella táctil que toca'),
    updated_at = now()
where titulo = 'La guía de Blue enseña haciendo, con poco texto'
  and (regla like '%una mano (👆)%' or ejemplo_bien like '%Mano que toca%');
