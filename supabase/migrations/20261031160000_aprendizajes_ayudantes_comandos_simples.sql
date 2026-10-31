-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-10-31 — un ayudante (subagente) lanzado por Claude usó un comando compuesto (for, sed,
--            grep y tuberías) y al dueño le saltó «¿Permitir que Claude ejecute este comando?» en la pantalla.
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los ayudantes siguen las mismas reglas de comandos', 'codigo', 1,
   'Cada ayudante (subagente) que lanza Claude puede sacarle ventanas de permiso al dueño igual que Claude. Por eso su encargo lleva SIEMPRE, por escrito, las reglas de comandos: leer con la herramienta Read (con offset y limit), buscar con un único «git grep -n» por llamada, nada de for, tuberías (|), ;, &&, sed, cut ni redirecciones, nada fuera del proyecto y ningún archivo de secretos. Si aun así un ayudante se salta la regla, Claude le corrige al momento con SendMessage y le dice al dueño que deniegue esa ventana.',
   'Encargar a un ayudante «investiga el puente de VeoAura» sin las reglas: lanza «for f in …; do sed … | grep -v …; done» y el dueño recibe una ventana de permiso.',
   'El encargo dice: «Solo Read y un git grep simple por llamada; nada de tuberías, bucles ni sed; nada fuera del repositorio».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
