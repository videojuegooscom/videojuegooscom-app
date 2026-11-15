-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (el dueño pide que Claude ponga «más o menos» el peso de cada artículo mientras él los
--            va pesando, contando su forma de embalar).
-- Qué hace: apunta la lección «Pesos estimados: con el embalaje del dueño, marcados y sin pisar nunca un peso real».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115160000_pesos_estimados.sql y app/admin/products.tsx.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Pesos estimados: con el embalaje del dueño, marcados y sin pisar nunca un peso real', 'negocio', 2,
   'Un artículo sin peso no se queda en los 2 kg por defecto: Claude le pone una estimación CON EMBALAJE = peso de fábrica del aparato y lo que lleva + el embalaje del dueño (con caja propia, 4-5 vueltas de film negro ≈ 0,1 kg; sin caja propia, una caja de cartón con burbuja, papel de periódico o cartones y cinta ≈ 0,3 kg lo pequeño, 0,8-1 kg una consola, 2,5 kg un televisor). Se marca products.peso_estimado = true (Productos dice «Peso estimado · revísalo al pesarlo») y solo se rellena donde peso_kg está vacío: nunca pisa un peso puesto por el dueño o por VeoAura. Cuando el dueño escribe el peso, deja de ser estimado. Se avisa de los que están cerca de un cambio de tramo de Correos (1, 5, 10 kg) y de los televisores, que conviene pesar y medir primero (y valorar «solo entrega en mano»).',
   'Dejar los 19 artículos sin peso contando 2 kg (una tele de 55" se cobra como un mando) o poner un peso inventado sin marcar, que luego nadie revisa.',
   'Smart TV LG 55": «Peso estimado: 18 kg · revísalo al pesarlo»; Mando PS5 con caja: 0,5 kg (13,65 € a la península en vez de 17,10 €).')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
