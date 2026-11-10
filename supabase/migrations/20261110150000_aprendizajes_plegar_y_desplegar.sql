-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-10 (el dueño: «al darle a "¿Te hemos dado un número de seguimiento?" se queda así y
--            ya no se puede volver a cerrar»; el campo se abría pero no tenía forma de plegarse).
-- Qué hace: apunta la lección «Todo lo que se despliega se puede volver a plegar».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Todo lo que se despliega se puede volver a plegar', 'diseno', 1,
   'Cualquier cosa que el cliente abre con un toque (un campo plegado, un apartado, un desplegable, una ayuda) se vuelve a cerrar en el mismo sitio y con el mismo gesto: el enlace que la abrió sigue a la vista con un icono de cerrar (X) o de plegar, de 44 px o más, y al cerrarla se borra lo que quedó a medias (avisos de error). La prueba de cada elemento plegable comprueba las dos cosas: que se abre y que se vuelve a cerrar.',
   '«¿Te hemos dado un número de seguimiento?» abre el campo y desaparece: el cliente ya no puede plegarlo.',
   'Abierto, el enlace sigue arriba con su X («seguimiento-anadir-cerrar») y la prueba FA6 lo abre y lo vuelve a cerrar.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
