-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la lección «Redes sociales una sola vez» cambia (petición del dueño, 2026-11-01): las redes siguen en el
--            pie de página y, además, TikTok e Instagram salen junto al logo de Inicio con sus seguidores.
-- Tipo:     actualiza el texto de una sola fila (por título), una única vez. No borra nada.
-- ============================================================================

update public.aprendizajes
set titulo = 'Redes sociales: en el pie y, TikTok e Instagram, junto al logo de Inicio',
    regla = 'Las redes sociales salen en el pie de página. Además, solo en Inicio y a los lados del logo: TikTok a la izquierda e Instagram a la derecha, con su icono, sus seguidores y, al tocarlas, su perfil. El número lo escribe el dueño en Administración → Redes sociales (nunca se inventa; sin número dice «Síguenos»). Ninguna otra pantalla repite un bloque de «Nuestras redes sociales».',
    ejemplo_mal = 'Un bloque «Síguenos» con todos los iconos en Inicio y otro en Perfil, además del pie; o un número de seguidores calculado a ojo.',
    ejemplo_bien = 'Pie con todas las redes y, junto al logo de Inicio, «TikTok 1.234 seguidores» a la izquierda e «Instagram 12,5 mil seguidores» a la derecha, con el número que escribió el dueño.',
    updated_at = now()
where titulo = 'Redes sociales una sola vez';
