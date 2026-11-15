-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 14 «Reservar con señal»), con el título acortado. La migración
--            20261115150100_aprendizajes_reserva_senal.sql no se pudo aplicar: su título pasaba de 140 caracteres
--            (aprendizajes_titulo_check). Esta apunta la misma lección con un título más corto (y lo deja dicho en la regla:
--            los títulos de las lecciones, 140 caracteres como mucho).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115150000_reservas_senal.sql, api/pago.ts y app/admin/reservas.tsx.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cobro con reglas del dueño aún sin dar: apagado, vacío y con candado en servidor y base de datos', 'codigo', 1,
   'Si una función cobra dinero y sus reglas (porcentajes, plazos, tipo de contrato) las tiene que dar el dueño o su gestor, se publica APAGADA y con todo VACÍO (null, nunca cifras de ejemplo). El mismo candado va en dos sitios: el disparador de la tabla de ajustes no deja activar si falta una regla, si no está marcado «Revisado por mi gestor» o si el texto aún lleva la marca de borrador; y el servidor (api/) vuelve a comprobarlo antes de enseñar o cobrar nada. Los ajustes solo los lee el administrador (RLS) y la tienda los recibe por una acción GET del servidor que solo da las reglas públicas y solo si está activa. El importe se recalcula siempre en el servidor con la base de datos. Apagar se puede siempre; «Guardar» con algo mal escrito no guarda nada. En plpgsql, añadir a un text[] con array_append. Los títulos de las lecciones, como mucho 140 caracteres (aprendizajes_titulo_check).',
   'Precargar una escala de ejemplo (10 % / 7 días) «para que se vea», abrir la lectura de los ajustes a todo el mundo, fiarse del porcentaje que manda el navegador, o una lección con un título de 150 caracteres que no se puede aplicar.',
   'Reservar con señal: reserva_ajustes nace con activa = false y todo null; sin reglas, el interruptor dice qué falta; GET /api/pago?reserva=ajustes devuelve { activa: false } y la ficha no enseña nada; con 10 días cobra 112,50 € aunque el navegador mande 1 €.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
