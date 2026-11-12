-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: arreglo urgente (2026-11-12). Un cliente no veía su compra en «Mis seguimientos»: la base de datos le daba
--            error 500 («stack depth limit exceeded») al leer sus pedidos, sus preferencias y al guardar la analítica.
-- Por qué:  public.is_admin() lee public.profiles con los permisos de quien llama, y la regla de lectura de profiles
--           (profiles_select_own_or_admin: «auth.uid() = id OR is_admin()») vuelve a llamar a is_admin() en cada fila
--           que no es la suya: un bucle sin fin. Al administrador no le pasa porque su propia fila de admin corta la
--           búsqueda antes; a cualquier cliente, sí, en todas las tablas cuyas reglas usan is_admin() (pedidos,
--           pedido_items, pedido_facturas, preferencias_usuario, analytics_events, service_requests…).
-- Qué hace: is_admin() pasa a leer profiles con los permisos de su dueño (security definer), como recomienda Supabase
--           para estas funciones de comprobación. Sigue haciendo lo mismo: solo mira si la fila de QUIEN LLAMA
--           (auth.uid()) tiene role = 'admin'; no devuelve datos de nadie. search_path ya está fijado (public, pg_temp).
-- Conectado con: public.is_admin() (20261014100000_seguridad_endurecer.sql), public.profiles y todas las reglas que la
--           usan; app/(tabs)/perfil.tsx («Mis seguimientos»), components/Campanita.tsx (preferencias), lib/analytics.ts.
-- Tipo:     cambio de permisos de una función (DELICADO): lo aplica el dueño en el SQL Editor. No borra nada.
-- Vuelta atrás (la decide el dueño): alter function public.is_admin() security invoker;
-- ============================================================================

alter function public.is_admin() security definer;
alter function public.is_admin() set search_path = public, pg_temp;
