-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 1 «Sesión estable en el iPhone»: con el reloj del iPhone desfasado, la
--            renovación del token entraba en bucle y cada renovación hacía releer la sesión a Blue, al panel y a Mi perfil).
-- Qué hace: apunta la lección «Con cada renovación del token no se hace trabajo pesado».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           lib/supabase.ts (protegerRenovacion, corregirDesfase), components/Campanita.tsx, app/_layout.tsx.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Con cada renovación del token no se hace trabajo pesado', 'codigo', 1,
   'Los oyentes de los cambios de sesión solo releen datos al entrar, salir o cambiar de cuenta (SIGNED_IN, SIGNED_OUT, USER_UPDATED), nunca con TOKEN_REFRESHED, que es la misma cuenta. La renovación va siempre por la guardia de lib/supabase.ts: corrige el reloj desfasado del dispositivo, frena más de 2 renovaciones en 10 s y ante un 429 espera sin borrar la sesión. Al probar, simular el reloj adelantado 1 h.',
   'Con cada TOKEN_REFRESHED, Blue, el panel y Mi perfil vuelven a pedir la sesión: con el reloj del iPhone adelantado, cientos de renovaciones, 429 y sesión cerrada.',
   'TOKEN_REFRESHED no relee nada; la guardia corrige la caducidad a la hora del dispositivo y frena el bucle: 1 renovación y la sesión sigue.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
