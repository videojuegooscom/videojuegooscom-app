-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (el dueño: «si aparecen en la app ya tienen que estar preparadas para que las vea
--            nuestro cliente, que no ponga nada extraño, aunque estén apagadas»).
-- Qué hace: apunta la lección «Lo que puede ver el cliente nunca lleva notas internas».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115190000_reserva_texto_cliente.sql, lib/reservas.ts y api/pago.ts.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Lo que puede ver el cliente nunca lleva notas internas', 'negocio', 1,
   'Todo texto que pueda llegar al cliente (condiciones, avisos, hojas de pago, Mis pedidos) tiene que estar listo para él aunque la función esté apagada. Lo interno (notas para el gestor, huecos [A DECIDIR], «comprobar en el BOE», BORRADOR, variantes sin elegir) vive SOLO en Administración. El servidor y la base de datos comprueban que no queda ninguna marca interna antes de enseñar o activar, y Administración dice exactamente qué falta quitar. Las variables ({porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur}, {precio_eur}) se rellenan solas con los datos de cada caso, también en la copia que se guarda. Con la función apagada el cliente no ve nada de ella (salvo lo que ya contrató).',
   'La hoja de reserva enseña «La señal es el {porcentaje} % del precio» o un «[A DECIDIR POR EL DUEÑO]», o la ficha dice «Reservado con señal» con las reservas apagadas.',
   'La hoja dice «La señal es el 20 % del precio: 90,00 €», hasta el «30 de noviembre de 2026»; activar con una «NOTA PARA EL GESTOR» se rechaza y Administración lista qué quitar.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
