-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección sobre el repositorio público (nada de detalles de fallos sin arreglar en GitHub).
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('El repositorio de GitHub es público: nada de detalles de fallos sin arreglar', 'seguridad', 1,
   'El repositorio de la tienda en GitHub es PÚBLICO: commits, pull requests, comentarios, migraciones y pruebas los puede leer cualquiera. Nunca se publica allí el detalle de un fallo de seguridad que aún no esté arreglado Y aplicado en producción (qué función es ejecutable por PUBLIC, qué cupo o límite falta, cómo se duplicaría un pedido, la estructura o los permisos reales de producción, recuentos de datos reales). Los títulos, cuerpos y comentarios de las PR de seguridad son neutros y cortos («validar el cuerpo antes de consumir cupo») y el análisis completo se entrega solo al dueño en el chat. Antes de subir nada se mira que no lleve claves ni datos personales, y nunca se usa «git add .» ni «-A» (el repo tiene directorios locales sin seguimiento, como .claude/).',
   'Describir en una PR pública cómo se salta un límite o qué está desprotegido hoy, mientras la corrección sigue sin aplicar.', 'Un título corto y neutro en la PR y, en el chat con el dueño, el detalle de qué está expuesto y cómo cerrarlo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
