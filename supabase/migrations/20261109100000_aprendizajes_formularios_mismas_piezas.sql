-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-09 (el dueño: «comprueba que siga nuestro diseño de página, compárala con otras
--            páginas»; la página nueva «Contratar servicio» tenía su propio estilo de campos, distinto de «Vender ahora»).
-- Qué hace: apunta la lección «Formularios de la tienda con las mismas piezas que "Vender ahora"».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Formularios de la tienda con las mismas piezas que «Vender ahora»', 'diseno', 1,
   'Todo formulario de la tienda (Vender ahora, Contratar servicio y los que vengan) usa las piezas de components/VenderAhoraModal.tsx: FieldLabel (etiqueta centrada en negrita), FieldInput (recuadro con el texto centrado que al completarse se suaviza y lleva su check verde) y SelectField (el desplegable «Elegir ⌄»), dentro de IsMobileContext; en rejilla de dos (lo corto de dos en dos, lo largo a lo ancho), las etiquetas como preguntas («¿Cómo prefieres que te contactemos?») y el título con las medidas de «Vender mi artículo». Nunca un estilo de campos propio. Antes de dar por buena una página nueva se compara en la web real con las páginas hermanas.',
   'Una página de formulario nueva con etiquetas a la izquierda, campos uno debajo de otro y fichas sueltas para elegir.',
   'Reutilizar FieldLabel, FieldInput y SelectField de «Vender ahora», en rejilla, y compararla con «Vender» en la web real.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
