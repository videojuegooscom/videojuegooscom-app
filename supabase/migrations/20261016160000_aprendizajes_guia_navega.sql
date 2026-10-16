-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «La guía de Blue navega sola y no puede desmontarse»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La guía de Blue navega sola y no puede desmontarse', 'codigo', 1,
   'Cada paso de la guía de Blue indica su pantalla (ruta) y la guía cambia sola de sección; en Inicio señala «Ver categorías», las categorías y «Vender ahora» (testID en los botones). Campanita devuelve null o un aviso en las pantallas de chat y en el Foro: esas salidas anticipadas deben respetar guiaAbierta, o la guía se desmonta a mitad del recorrido y vuelve al paso 1. Al cambiar la guía se recorre entera con el navegador de pruebas, pantalla a pantalla.',
   'Añadir pasos que cambian de pestaña sin comprobar que la guía sigue montada en el Foro y en Blue IA.', 'Recorrer los 14 pasos en el navegador y ver en cada captura que la ruta cambia y la tarjeta sigue ahí.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
