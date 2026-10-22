-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018100000_aprendizajes_reorganizar_en_grupos.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más):
--   1) Vuelve a activar las lecciones sueltas que la migración dejó con activa = false (sus textos y
--      prioridades nunca se tocaron). «Blue fuera del panel» es un caso especial (ver más abajo).
--   2) Desactiva todas las filas «Grupo · …» (activa = false). No se borran: la tabla no admite borrados y
--      así queda constancia de cómo estaban agrupadas.
--
-- Ojo: si después de aplicar la migración se editó el texto de una lección suelta, esa edición se conserva
-- (solo se cambia activa). Si se editó una fila «Grupo · …», esa edición queda guardada en la fila inactiva
-- y habría que pasarla a mano a la lección suelta correspondiente.
--
-- Comprobación previa (solo lectura): qué filas cambiaría.
--   select titulo, prioridad, activa from public.aprendizajes order by activa, prioridad, titulo;
-- ============================================================================

update public.aprendizajes
set activa = true
where not activa
  and titulo in (
    'Consultar el Centro de Aprendizajes antes de cada respuesta',
    'Formato de respuesta en 7 apartados',
    'Mínimo 10 recomendaciones de mejoría en cada respuesta',
    'Solo se menciona lo que existe',
    'Ambición: pensar como un cerebro más de la tienda',
    'Autorización expresa del dueño antes de fusionar, desplegar o migrar',
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
    'No crear archivos por crear',
    'Comprobar los límites de la tabla antes de añadir texto',
    'Toque y arrastre separados',
    'Lo que usa el código tiene que existir en la base de datos',
    'Archivos de ayuda fuera de app/',
    'Nombres y valores de variables secretas',
    'Blue: interfaz pública y Administración',
    'La guía de Blue navega sola y no puede desmontarse',
    'Blue nunca tapa contenido',
    'Blue se esconde al bajar el scroll y vuelve al parar',
    'Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable',
    'Los avisos y pistas de Blue salen una sola vez',
    'Notificaciones dentro de Blue',
    'Azul de marca en los botones',
    'Sin burbujas ni recuadros decorativos',
    'Imágenes enteras, sin recortar',
    'Listas de productos con el diseño de Inicio',
    'Todo centrado',
    'Precios siempre con céntimos',
    'Redes sociales una sola vez',
    'Botones principales de Inicio destacados con medida',
    'Nada se sale por los lados en el móvil',
    'Todo al alcance del pulgar derecho',
    'Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable',
    'Pensado para una mano',
    'Formularios en rejilla, no en columna',
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

-- «Blue fuera del panel» solo se reactiva si la reorganización fue quien la desactivó. Si la desactivó
-- 20261018096000 (porque la sustituye «Blue: interfaz pública y Administración»), su texto lleva la nota
-- «SUSTITUIDA 2026-10-18» y se queda inactiva: esa la reactiva el rollback de 096000.
update public.aprendizajes
set activa = true
where not activa
  and titulo = 'Blue fuera del panel'
  and regla not like '%SUSTITUIDA 2026-10-18%';

update public.aprendizajes
set activa = false
where activa
  and titulo like 'Grupo · %';
