-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos lecciones (Blue y el scroll; formulario de Vender: contacto, brillo y scroll).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue se esconde al bajar el scroll y vuelve al parar', 'diseno', 1,
   'En toda la app, Blue flotante (con su mensaje, que va pegado a él) desaparece mientras la pantalla baja y vuelve a aparecer cuando lleva unos 450 ms sin moverse; al subir o estar arriba del todo se ve. Solo se queda quieto con su panel abierto o durante el saludo inicial: un mensaje a la vista NO impide esconderlo. Se prueba con el navegador midiendo la opacidad de Blue antes, durante y después del scroll.',
   'Dejar a Blue fijo mientras se baja porque tiene un mensaje a la vista.', 'Esconderlo al bajar con todo y mensaje, y traerlo de vuelta con la pantalla parada.'),
  ('Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable', 'diseno', 1,
   'En el formulario «Vender mi artículo» el contacto solo ofrece «Gmail» y «Chat de la tienda». El chat no pide ningún dato y necesita sesión (sin ella se avisa y se puede elegir Gmail); en la base de datos se guarda metodo_contacto = null y contacto = «Chat de la tienda» (su restricción no admite un valor «chat»). Al elegir el chat sale «Activar notificaciones» solo si aún no están activadas: si lo están no sale nada; si están bloqueadas se explica cómo activarlas; en iPhone se pide instalar antes la tienda. Son avisos del navegador (lib/notificaciones.ts): llegan con la tienda abierta o en segundo plano, no con ella cerrada; para eso haría falta un servidor de notificaciones push. Al desplegar cualquier desplegable, sus opciones se iluminan unos 3 s con un borde de colores tipo Siri (SiriGlow, solo web, respeta «reducir movimiento») y el scroll se adapta para dejar el desplegable centrado y a la vista.',
   'Ofrecer WhatsApp o redes sociales como contacto, prometer notificaciones con la tienda cerrada o dejar un desplegable abierto fuera de pantalla.', 'Gmail y chat, aviso de notificaciones solo si falta activarlas, brillo al desplegar y scroll automático, todo comprobado con el navegador.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
