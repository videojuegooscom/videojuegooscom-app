-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Blue flotante solo en Inicio, en las fichas y en el panel, y fijo arriba a la derecha (petición del dueño,
--            2026-11-04: «que Blue flotante únicamente aparezca en Inicio y en la página de Producto y Servicio y que
--            esté fijo en la esquina superior, donde no estorbe»; esquina: arriba a la derecha; en el panel, se queda).
--            Añade la lección nueva y pone al día las que hablaban de dónde va Blue (arrastrarlo, apartarse, «nunca en
--            la mitad de abajo de la ficha»…), que quedan sustituidas.
-- Qué hace: apunta la lección de Blue fijo arriba a la derecha y pone al día (o desactiva) las que decían otra cosa.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta una lección si no existe y actualiza el texto de otras (por título); una que ya no aplica se
--           desactiva (activa = false). No borra nada; repetirla deja lo mismo.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue: solo en Inicio, las fichas y el panel, fijo arriba a la derecha', 'diseno', 1,
   'Desde el 2026-11-04 (petición del dueño) Blue flotante SOLO sale en Inicio, en las fichas de producto y de servicio y, para el dueño, en el panel de administración (pantallaConBlue en components/Campanita.tsx); en el resto (Catálogo, Servicios, Cesta, Perfil, Foro, Blue IA, Vender, Blog, políticas, pago…) no se ve ni dice nada, salvo que la guía pase por allí. Va FIJO arriba a la derecha, a 6 px del borde y de 52 px: en las fichas y en el panel, dentro de la cabecera (a la altura de la flecha de volver); en Inicio, justo debajo del buscador y, en el móvil, si ahí está Instagram junto al logo, justo debajo de Instagram. Ya no se arrastra ni se aparta buscando hueco: si al desplazar la página queda un botón debajo de su sitio (o la lista de resultados del buscador), se esconde sin moverse hasta que quede libre. Sus mensajes salen debajo de él, pegados a su borde derecho (a su izquierda tapaban la cabecera de las fichas, con «Volver atrás»), nunca encima del buscador, y se cierran con la X. Sustituye a las reglas antiguas de posición (sitio inicial abajo a la izquierda, arrastrarlo, «se queda donde lo deja», «nunca en la mitad de abajo de la ficha», apartarse). Se prueba con pruebas/perfil-datos.mjs (secciones BF y BU, con su control) y pruebas/blue-regresion.mjs.',
   'Blue en el Catálogo o en la Cesta, arrastrado a media pantalla o saltando de un lado a otro para apartarse de lo que tiene debajo.',
   'Blue quieto arriba a la derecha en Inicio y en las fichas; al bajar la página, si pasa un botón por debajo, se esconde y vuelve a verse al quedar libre.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);

-- Dónde aparece Blue en la tienda.
update public.aprendizajes
set regla = replace(replace(regla,
      'INTERFAZ PÚBLICA: aparece en toda la tienda salvo en las pantallas de chat (Blue IA, Foro y chats) y en el formulario Vender, porque taparía el campo de escribir y el botón de enviar; la guía sí puede abrirse allí.',
      'INTERFAZ PÚBLICA: desde el 2026-11-04 solo aparece en Inicio y en las fichas de producto y de servicio; en el resto no se ve (nunca en las pantallas de chat ni en Vender, donde taparía el campo de escribir y el botón de enviar), aunque la guía sí puede pasar por todas.'),
      'Se aparta sin tapar el panel.',
      'Va fijo arriba a la derecha y se esconde si tiene un botón debajo.'),
    updated_at = now()
where titulo = 'Blue: interfaz pública y Administración'
  and regla like '%aparece en toda la tienda%';

-- Los mensajes siguen igual; lo de «se queda donde lo deja la persona» ya no existe (no se arrastra).
update public.aprendizajes
set titulo = 'Blue habla a los 15 s y cada 15 s',
    regla = 'Los mensajes que Blue dice por su cuenta pasan por una cola (decir, components/Campanita.tsx): el primero, como pronto a los 15 s de entrar en la pantalla, para que se pueda leer lo que hay, y entre uno y el siguiente al menos 15 s; al cambiar de pantalla la cola se vacía y en una pantalla sin Blue no se dice nada (el mensaje no se gasta). Dónde va Blue: lección «Blue: solo en Inicio, las fichas y el panel, fijo arriba a la derecha».',
    updated_at = now()
where titulo = 'Blue habla a los 15 s y cada 15 s, y se queda donde lo deja la persona'
  and not exists (select 1 from public.aprendizajes a where a.titulo = 'Blue habla a los 15 s y cada 15 s');

-- Ya no aplica: Blue va fijo arriba, en la cabecera de la ficha.
update public.aprendizajes
set activa = false,
    updated_at = now()
where titulo = 'Blue nunca en la mitad de abajo de la ficha de producto'
  and activa;

-- Se queda lo de los mensajes y la tienda instalable; la posición pasa a la lección nueva.
update public.aprendizajes
set titulo = 'Blue: mensajes en tarjeta alargada y tienda instalable',
    regla = 'Los mensajes de Blue son una tarjeta alargada de pocas líneas (un solo párrafo: «Blue · mensaje · acción ›»), nunca una tarjeta gorda. La tienda es instalable (public/manifest.json + iconos del logo): Blue ofrece instalarla en Android con el diálogo del navegador y en iPhone con los pasos «Añadir a pantalla de inicio»; solo se ofrece si se puede y no está ya instalada. Dónde va Blue: lección «Blue: solo en Inicio, las fichas y el panel, fijo arriba a la derecha».',
    updated_at = now()
where titulo = 'Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable'
  and not exists (select 1 from public.aprendizajes a where a.titulo = 'Blue: mensajes en tarjeta alargada y tienda instalable');

-- No tapar: ahora sin moverse (se esconde).
update public.aprendizajes
set regla = 'Blue flotante nunca se queda encima de un botón, un enlace o un campo: va fijo arriba a la derecha (no se aparta ni busca hueco) y, si al desplazar la página queda algo que se toca debajo de su sitio, se esconde hasta que quede libre. Sus mensajes salen debajo de él (nunca encima de la cabecera con «Volver atrás» ni del buscador), en cristal transparente que se lee bien; al tocarlos llevan a lo que dicen y se cierran con la X.',
    updated_at = now()
where titulo = 'Blue nunca tapa contenido'
  and regla like '%busca un hueco libre%';

-- Las guías rápidas se eligen desde donde está Blue.
update public.aprendizajes
set regla = replace(regla,
      'Blue y su panel NO se ven en Vender, el Foro, Blue IA ni los chats (taparían los campos de escribir).',
      'Blue y su panel solo se ven en Inicio y en las fichas de producto y de servicio (dueño, 2026-11-04); nunca en Vender, el Foro, Blue IA ni los chats (taparían los campos de escribir).'),
    updated_at = now()
where titulo = 'La ayuda por pantalla vive en el panel de Blue'
  and regla like '%NO se ven en Vender, el Foro, Blue IA ni los chats (taparían%';

update public.aprendizajes
set regla = replace(regla, '(Blue se aparta como siempre)', '(Blue va fijo arriba a la derecha y se esconde si tiene un botón debajo)'),
    updated_at = now()
where titulo = 'Blue aprende de la tienda: la respuesta la escribe el dueño'
  and regla like '%(Blue se aparta como siempre)%';

update public.aprendizajes
set regla = replace(regla, 'Blue no baja a la mitad de abajo en ninguna de las dos.', 'En las dos, Blue va fijo arriba a la derecha, en la cabecera.'),
    updated_at = now()
where titulo = 'Ficha de servicio con el mismo formato que la de producto'
  and regla like '%Blue no baja a la mitad de abajo en ninguna de las dos.%';

update public.aprendizajes
set regla = replace(regla, 'vuelve a aparecer cuando lleva unos 450 ms sin moverse;', 'vuelve a aparecer cuando lleva unos 450 ms sin moverse (si no tiene un botón debajo de su sitio);'),
    updated_at = now()
where titulo = 'Blue se esconde al bajar el scroll y vuelve al parar'
  and regla like '%unos 450 ms sin moverse;%';
