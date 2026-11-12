-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-12 (un cliente no veía su compra: is_admin() entraba en bucle con la regla de profiles).
-- Qué hace: apunta la lección «Probar las reglas como cliente, no solo como administrador».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           supabase/migrations/20261112100000_is_admin_sin_bucle.sql.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Probar las reglas como cliente, no solo como administrador', 'seguridad', 1,
   'Una función que usan las reglas (como is_admin()) no puede leer una tabla cuya regla vuelve a llamarla: entra en bucle («stack depth limit exceeded», error 500) y solo lo sufren los clientes, porque al administrador su propia fila le corta la búsqueda. Estas funciones de comprobación van con security definer y search_path fijo (las aplica el dueño). Y cuando un cliente dice que no ve algo que en la base de datos sí está, lo primero es mirar en los registros (edge_logs) qué respuesta recibió su app: un 500 apunta a las reglas, no a los datos.',
   'Mirar solo que el pedido está en la base de datos y concluir que el problema es del móvil del cliente.',
   'Buscar en edge_logs las peticiones del cliente, ver el 500 y en postgres_logs «stack depth limit exceeded»: el bucle de is_admin() con la regla de profiles.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
