-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «pointerEvents siempre como propiedad»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('pointerEvents siempre como propiedad', 'codigo', 1,
   'En la web, react-native-web descarta pointerEvents «box-none» y «box-only» cuando van dentro de un estilo en línea (style={{ … }}): la capa se queda con todos los toques. Siempre se pone como propiedad (<View pointerEvents="box-none">). Una capa que ocupa toda la pantalla con el valor mal puesto congela la tienda entera.',
   'Capa fija de pantalla completa con style={{ pointerEvents: "box-none" }}: al aparecer Blue nada responde.', '<View pointerEvents="box-none" style={{ position: "fixed", … }}>: los toques pasan a la tienda.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
