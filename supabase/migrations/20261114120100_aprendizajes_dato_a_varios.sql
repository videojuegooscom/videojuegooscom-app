-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 2 «Comprar en menos pasos»: la dirección de «Mi perfil» pasa de una a hasta
--            tres, Casa, Trabajo y Familiar, y el pago, Administración y la analítica ya leían la de siempre).
-- Qué hace: apunta la lección «Pasar un dato de uno a varios sin romper lo que ya lo lee».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           supabase/migrations/20261114120000_perfil_direcciones.sql, components/PerfilPublico.tsx (direccionesDeFila),
--           app/checkout.tsx, app/admin/users.tsx y app/admin/cliente/[userId].tsx.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Pasar un dato de uno a varios sin romper lo que ya lo lee', 'codigo', 2,
   'Cuando un dato del cliente pasa de uno a varios (p. ej. 1 → 3 direcciones), la lista va en una columna NUEVA (jsonb con su tope en un check) y el principal (el predeterminado) se sigue guardando en las columnas de siempre: así el pago, Administración, las pruebas y quien lea la fila antigua siguen igual. Una sola función lee la lista (direccionesDeFila) y, si la columna no existe o está vacía, construye la lista con el dato de siempre; sin la columna, la pantalla funciona como antes.',
   'Mover la dirección a una tabla o lista nueva y dejar de rellenar codigo_postal/direccion: el pago y la ficha del cliente se quedan sin dirección hasta cambiar todas las pantallas a la vez.',
   'Columna direcciones (hasta 3) + la predeterminada copiada en las columnas de siempre; direccionesDeFila la usan Mi perfil, el pago, Usuarios y la ficha; sin la migración, una dirección como antes.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
