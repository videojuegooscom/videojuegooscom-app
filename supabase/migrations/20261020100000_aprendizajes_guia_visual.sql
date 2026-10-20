-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones «La guía de Blue enseña haciendo» y «scrollTo en react-native-web»
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La guía de Blue enseña haciendo, con poco texto', 'diseno', 1,
   'Cada paso de la guía de Blue se ENSEÑA en vez de explicarse con letras: una mano (👆) toca lo que hay que tocar, la guía hace la acción ella sola (cambiar de sección, pulsar «Vender ahora» y abrir el formulario, desplazarlo, salir con la flecha, escribir ejemplos en el buscador con letras de brillo Siri) y un recuadro enmarca lo señalado (las pestañas de Perfil, la barra de abajo, los resultados del buscador). La tarjeta mide SIEMPRE lo mismo y «Siguiente» queda siempre en el mismo sitio, a la altura del pulgar derecho (hacia el 80 % de la pantalla): lo señalado se desplaza hacia arriba para que la tarjeta no lo tape. Solo se enseña lo que existe. Se prueba entera con pruebas/guia-blue.mjs y se miran las capturas.',
   'Una frase larga por paso y «Siguiente» que cambia de sitio según el contenido.', 'Mano que toca, acción hecha por la guía, recuadro sobre lo señalado y una frase corta.'),
  ('scrollTo de un ScrollView en la web ignora «top»', 'codigo', 2,
   'En la web, react-native-web cambia el scrollTo del elemento de cada ScrollView por uno que espera { y, animated } e ignora { top, behavior }: la llamada no hace nada y tampoco avisa. Para desplazar un elemento desde código de la web (Element.prototype.scrollTo o scrollBy) se usa el método del navegador, como la función desplazarDom de components/Campanita.tsx, y se comprueba midiendo scrollTop en el navegador de pruebas.',
   'document.getElementById("vender-scroll").scrollTo({ top: 360, behavior: "smooth" }) y el formulario se queda en 0 px.', 'Element.prototype.scrollTo.call(el, { top: 360, behavior: "smooth" }) y scrollTop llega a 235 px.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
