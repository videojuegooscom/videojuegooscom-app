-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-12 (al contar inicios de sesión por dispositivo, la primera versión sumaba uno en cada
--            recarga porque Supabase repite el aviso SIGNED_IN al abrir la tienda o volver a la pestaña).
-- Qué hace: apunta la lección «Un inicio de sesión real se reconoce por el session_id del token, no por SIGNED_IN».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); lib/supabase.ts
--           (registrarDispositivo) y supabase/migrations/20261112120000_cliente_dispositivos.sql.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un inicio de sesión real se reconoce por el session_id del token, no por SIGNED_IN', 'codigo', 2,
   'Supabase Auth repite el aviso SIGNED_IN cada vez que se abre la tienda o se vuelve a la pestaña, así que contar inicios de sesión con ese aviso los multiplica. Un inicio de sesión nuevo se reconoce porque cambia el session_id del token de acceso (es nuevo en cada inicio y no cambia al renovar el token). Lo que se cuenta, lo suma la base de datos (+1), nunca el número que manda el navegador.',
   'Sumar un inicio de sesión cada vez que llega SIGNED_IN: cada recarga cuenta como un inicio.',
   'Guardar el último session_id visto y sumar 1 (en la base de datos) solo cuando cambia.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
