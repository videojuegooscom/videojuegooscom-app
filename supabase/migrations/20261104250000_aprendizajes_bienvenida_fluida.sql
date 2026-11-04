-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. El dueño pidió que la carga de los 3 s de la bienvenida sea «más intuitiva y no
--            haya tirones», con «la barra de cargando fluida» y «el efecto Siri en los bordes, nuestro diseño». La barra
--            avanzaba a saltos de 0,1 s con un reloj de JavaScript (12 pasos por segundo, y se paraba mientras arrancaba
--            la tienda) y, al poder tocarse, react-native-web cambiaba el <div> por un <button> y volvía a crear todo lo
--            de dentro (la barra empezaba de cero).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Bienvenida y cargas sin tirones: animaciones con CSS, nunca con un reloj de JavaScript', 'codigo', 1,
   'Todo lo que se mueve mientras la tienda arranca o carga (la bienvenida, barras de progreso, el marco Siri de los bordes, mascotas de carga) se anima con CSS de transform y opacity, que el navegador mueve por su cuenta aunque el JavaScript vaya ocupado; nunca con setInterval/setState ni con Animated de React Native en la web (va con el hilo principal y da saltos). La animación vive ya en el HTML estático (la clase y su <style>), así que empieza en el primer pintado y la tienda reutiliza esos elementos al arrancar. Una barra que se llena: dos capas que se desplazan en sentidos contrarios (los colores no se estiran) y, si hace falta saber cuándo se llena, se lee su animación (getAnimations) en vez de llevar otro reloj. En react-native-web, un Pressable que envuelve animaciones no cambia de accessibilityRole (con «button» cambia el <div> por un <button> y vuelve a crear todo lo de dentro: las animaciones empiezan de cero). El marco Siri de la bienvenida usa la misma paleta y máscara que «Pensando» (components/lineapensadoraefectosiri.tsx). Con «reducir movimiento», sin giros ni flotar; la barra sí se llena. Se prueba con pruebas/perfil-datos.mjs (sección BV): pasos distintos por segundo (60, no 12), solo transform/opacity, sigue con el JavaScript ocupado y no vuelve a empezar.',
   'Una barra con width en % actualizada cada 100 ms con setInterval y un fundido con Animated en la web: a saltos y parada mientras arranca la tienda; y accessibilityRole="button" puesto solo cuando ya se puede tocar.',
   'Una barra con clase CSS y @keyframes de transform en el HTML estático (61 pasos por segundo), el marco Siri girando con CSS en los bordes, el fundido de salida con transition de opacity y el Pressable siempre con el mismo elemento.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
