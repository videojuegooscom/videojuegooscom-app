-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-14 (mejora 5 «Seguimiento del pedido y avisos de precio»).
-- Qué hace: apunta dos lecciones: «La hora de cada paso la pone la base de datos, sin security definer» y «Un aviso de
--           Blue “una vez por cambio” se guarda al ENSEÑARSE, no al ponerse en cola».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           supabase/migrations/20261114160000_pedidos_historial.sql y components/Campanita.tsx (DICHOS_KEY).
-- Tipo:     inserta las lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La hora de cada paso la pone la base de datos, sin security definer', 'codigo', 2,
   'Para guardar cuándo cambia algo (el estado de un pedido) se usa un disparador AFTER UPDATE normal, sin security definer: corre con los permisos de quien cambia (el administrador con su regla de insertar, el puente con su clave de servidor) y pone now(). Así lo pega Claude sin que el guardián lo bloquee, y vale para el panel, la ficha del cliente y el puente a la vez. El insert va dentro de begin … exception when others then null: si no pudiera apuntarlo, el cambio de estado sigue. Lo anterior a la migración se enseña SIN fecha, nunca con una inventada (ni updated_at, que cambia por cualquier cosa).',
   'Insertar el paso desde cada pantalla (se olvida el puente) o con un disparador security definer que tiene que pegar el dueño; o enseñar updated_at como «fecha de envío».',
   'Disparador normal pedido_estados_apuntar con when (old.estado is distinct from new.estado), regla de insertar solo para is_admin(), y en pantalla «Enviado · 11 nov, 17:40» o «Enviado» sin fecha si no se guardó.'),
  ('Un aviso de Blue «una vez por cambio» se guarda al enseñarse, no al ponerse en cola', 'codigo', 2,
   'Los mensajes de Blue esperan turno (15 s al entrar, 15 s entre uno y otro) y la cola se vacía al cambiar de pantalla. Si «ya dicho» se guarda en el móvil al ponerlo en cola, el aviso puede perderse sin que nadie lo vea. Se guarda (y se mide como mostrado) cuando el bocadillo sale de verdad; en memoria basta para no ponerlo dos veces en la cola. Si además hay estado en la cuenta (precio ya avisado), se apunta en ese mismo momento para que tampoco se repita en otro dispositivo.',
   'Guardar la clave en AsyncStorage al llamar a decir(): el cliente cambia de pantalla antes de los 15 s y nunca ve que su pedido está enviado.',
   'decir() solo en memoria; el efecto del bocadillo visible guarda la clave (DICHOS_KEY), marca precio_avisado y mide pedido_aviso_estado_mostrado / aviso_precio_mostrado.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
