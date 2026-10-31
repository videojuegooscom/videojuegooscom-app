-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-10-31.
--   1) El dueño pegó la migración de los números de seguimiento y dijo «no sé qué significa la migración que dices».
--   2) Al probar «Asignar seguimiento» en Administración → Chat salió que en 14 pantallas del panel el título de la
--      cabecera tapaba el botón de volver (en el móvil solo respondían sus bordes).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Al pedir que pegue una migración, decir en palabras sencillas qué es y qué activa', 'textos', 2,
   'El dueño no es técnico: cada vez que se le pide pegar una migración se le dice en una frase qué es (un archivo con instrucciones que prepara la base de datos para una función nueva: columnas, tablas o reglas de quién puede ver qué), qué activa en la tienda cuando la pega (lo que hasta entonces está escondido) y por qué la pega él y no Claude (toca permisos, y esa es su regla de seguridad). Nada de «migración 20261031170000» sin explicar.',
   '«Pega la migración 20261031170000_seguimiento_codigos.sql y di Hecho».',
   '«Pega este archivo en Supabase: prepara la base de datos para guardar los números de seguimiento; al pegarlo aparece el campo en Mis seguimientos. La pegas tú porque toca permisos».'),
  ('Un botón con posición absoluta no puede quedar debajo de lo que va después', 'codigo', 2,
   'En react-native-web todas las vistas tienen position: relative, así que un hermano que va DESPUÉS en el código (por ejemplo, el título centrado de una cabecera con paddingHorizontal) se pinta encima de un botón con position: absolute que va antes y se queda sus toques, aunque el texto no lo tape. El botón lleva zIndex: 1 (o va después). Se comprueba con document.elementFromPoint en el centro del botón: tiene que devolver el propio botón (pruebas/perfil-datos.mjs, sección Q, lo mira en todas las pantallas del panel).',
   'Cabecera con el botón «Volver» absoluto a la izquierda y después una View de título a todo el ancho: en el móvil «Volver» no respondía.',
   'El mismo botón con zIndex: 1: elementFromPoint en su centro devuelve el botón y el toque llega.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
