-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018100000_aprendizajes_reorganizar_en_grupos.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más):
--   1) Vuelve a activar las 54 lecciones sueltas originales y la lección «Mínimo 10 recomendaciones…»
--      (la migración las había dejado con activa = false; sus textos nunca se tocaron).
--   2) Desactiva las 10 filas «Grupo · …» (activa = false). No se borran: la tabla no admite borrados
--      y así queda constancia de cómo estaban agrupadas.
--
-- Ojo: si después de aplicar la migración se editó el texto de una lección suelta, esa edición se
-- conserva (solo se cambia activa). Si se editó una fila «Grupo · …», esa edición queda guardada en la
-- fila inactiva y habría que pasarla a mano a la lección suelta correspondiente.
--
-- Comprobación previa (solo lectura): qué filas cambiaría.
--   select titulo, activa from public.aprendizajes order by activa, titulo;
-- ============================================================================

update public.aprendizajes
set activa = true
where not activa
  and titulo in (
    'Consultar el Centro de Aprendizajes antes de cada respuesta',
    'Formato de respuesta en 7 apartados',
    'Mínimo 10 recomendaciones de mejoría en cada respuesta',
    'Recomendar modelo en cada respuesta',
    'Solo se menciona lo que existe',
    'Ambición: pensar como un cerebro más de la tienda',
    'Claude ejecuta, el dueño solo da la orden',
    'Publicar en cuanto la vista previa esté en verde',
    'Supabase lo aplica Claude',
    'Comandos sin ventanas de permiso',
    'Ramas desde main actualizado y volver a main',
    'Comprobar errores de código en todas las ramas',
    'Probar en el navegador antes de publicar',
    'Probar formularios de punta a punta sin ensuciar la base de datos',
    'Medir antes de culpar al móvil',
    'Medidas de pantalla solo con la tienda montada',
    'Revisar los registros de errores',
    'Vigilar el espacio en disco del servidor',
    'Funciones del servidor en api/',
    'pointerEvents siempre como propiedad',
    'Toque y arrastre separados',
    'Lo que usa el código tiene que existir en la base de datos',
    'No crear archivos por crear',
    'Archivos de ayuda fuera de app/',
    'Nombres y valores de variables secretas',
    'La guía de Blue navega sola y no puede desmontarse',
    'Blue nunca tapa contenido',
    'Blue se esconde al bajar el scroll y vuelve al parar',
    'Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable',
    'Los avisos y pistas de Blue salen una sola vez',
    'Notificaciones dentro de Blue',
    'Blue fuera del panel',
    'Azul de marca en los botones',
    'Sin burbujas ni recuadros decorativos',
    'Todo centrado',
    'Imágenes enteras, sin recortar',
    'Precios siempre con céntimos',
    'Redes sociales una sola vez',
    'Listas de productos con el diseño de Inicio',
    'Botones principales de Inicio destacados con medida',
    'Nada se sale por los lados en el móvil',
    'Todo al alcance del pulgar derecho',
    'Pensado para una mano',
    'Formularios en rejilla, no en columna',
    'Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable',
    'Fotos de noticias fieles a la noticia',
    'Garantías y promesas solo en la descripción',
    'Sin subtítulos innecesarios',
    'No inventar datos del negocio',
    'Marketing siempre con consentimiento aparte',
    'Atención al cliente dentro de la tienda',
    'Blue aprende de la tienda: la respuesta la escribe el dueño',
    'Formularios públicos sin campos del taller',
    'Integraciones con VeoAura sin cruzar proyectos',
    'Descripción fija en artículos de VeoAura'
  );

update public.aprendizajes
set activa = false
where activa
  and titulo in (
    'Grupo · Cómo respondo al dueño',
    'Grupo · Cómo trabajo: ramas, permisos y publicación',
    'Grupo · Probar y vigilar antes de dar algo por bueno',
    'Grupo · Normas técnicas del código y del servidor',
    'Grupo · Blue flotante: sitio, avisos y guía',
    'Grupo · Diseño de marca y estética',
    'Grupo · Diseño para el móvil y una sola mano',
    'Grupo · Textos y contenido',
    'Grupo · Negocio: datos reales, clientes y consentimiento',
    'Grupo · Seguridad e integración con VeoAura'
  );
