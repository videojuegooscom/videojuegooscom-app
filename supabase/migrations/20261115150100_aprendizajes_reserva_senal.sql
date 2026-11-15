-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 14 «Reservar con señal», aprobada por el dueño).
-- Qué hace: apunta la lección «Función que cobra y depende de reglas del dueño aún sin dar: apagada y vacía, con el mismo
--           candado en el servidor y en la base de datos, y el texto legal como borrador marcado que impide activarla».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115150000_reservas_senal.sql (reserva_ajustes_validar), api/pago.ts
--                (ajustesReservaActivos), app/admin/reservas.tsx y pruebas/perfiles-sql.mjs, pago-api.mjs y perfil-datos.mjs
--                (sección RESEN).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cobro que depende de reglas del dueño aún sin dar: apagado y vacío, mismo candado en servidor y base de datos, borrador legal que impide activar', 'codigo', 1,
   'Si una función cobra dinero y sus reglas (porcentajes, plazos, tipo de contrato) las tiene que dar el dueño o su gestor, se publica APAGADA y con todo VACÍO (null, nunca cifras de ejemplo). El mismo candado va en dos sitios: el disparador de la tabla de ajustes no deja activar si falta una regla, si no está marcado «Revisado por mi gestor» o si el texto aún lleva la marca de borrador; y el servidor (api/) vuelve a comprobarlo antes de enseñar o cobrar nada. Los ajustes solo los lee el administrador (RLS) y la tienda los recibe por una acción GET del servidor que solo da las reglas públicas y solo si está activa. El importe se recalcula siempre en el servidor con la base de datos. Apagar se puede siempre (aunque haya algo mal escrito); «Guardar» con algo mal escrito no guarda nada. En plpgsql, añadir a un text[] con array_append (con «|| ''texto''» falla: lo lee como un array).',
   'Precargar una escala de ejemplo (10 % / 7 días) «para que se vea», abrir la lectura de los ajustes a todo el mundo con una regla RLS abierta, fiarse del porcentaje que manda el navegador o usar v_faltan || ''la escala'' (malformed array literal).',
   'Reservar con señal: reserva_ajustes nace con activa = false y todo null; el borrador «BORRADOR · Pendiente de revisión del gestor» se precarga solo en el editor; sin reglas, el interruptor dice qué falta y no manda nada; GET /api/pago?reserva=ajustes devuelve { activa: false } y la ficha no enseña nada; la prueba pago-api comprueba que con 10 días cobra 112,50 € aunque el navegador mande 1 €.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
