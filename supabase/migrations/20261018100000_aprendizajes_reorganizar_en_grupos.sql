-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reorganiza el Centro de Aprendizajes en 10 grupos (antes, 54 lecciones sueltas).
-- Tipo:     NO borra nada y no pierde ninguna palabra.
--   1) Crea una fila «Grupo · …» por tema. Su regla es una frase de introducción más las reglas
--      ORIGINALES copiadas tal cual desde la tabla (con su prioridad [P1] [P2] [P3] y su título), y lo
--      mismo con los ejemplos. Nada se reescribe a mano, así que no se puede perder información.
--   2) Marca las lecciones sueltas como inactivas (activa = false); siguen en la tabla.
--   La lección «Revisión de calidad web cada dos semanas» se queda como está: ya es un resumen
--   completo y, con 3.923 de los 4.000 caracteres que admite la regla, no cabe dentro de un grupo.
-- Idempotente: si el grupo ya existe no se vuelve a crear, y las sueltas solo se desactivan si su
--   grupo está activo. Vuelta atrás: supabase/rollbacks/20261018100000_aprendizajes_reorganizar_revertir.sql
-- Orden: debe aplicarse DESPUÉS de 20261018090000_aprendizajes_minimo_10_recomendaciones.sql, que
--   crea una de las lecciones del primer grupo.
-- ============================================================================

do $$
declare
  g record;
begin
  for g in
    select * from (values
      ('Grupo · Cómo respondo al dueño', 'general',
       'Cómo se responde: consultar el Centro de Aprendizajes antes de cada respuesta, formato fijo de 7 apartados, mínimo 10 recomendaciones, modelo recomendado, solo hablar de lo que existe y actuar con ambición.',
       array['Consultar el Centro de Aprendizajes antes de cada respuesta',
             'Formato de respuesta en 7 apartados',
             'Mínimo 10 recomendaciones de mejoría en cada respuesta',
             'Recomendar modelo en cada respuesta',
             'Solo se menciona lo que existe',
             'Ambición: pensar como un cerebro más de la tienda']),
      ('Grupo · Cómo trabajo: ramas, permisos y publicación', 'general',
       'Cómo se trabaja con el repositorio y el servidor: ramas desde main actualizado, comprobación de errores en toda rama, comandos simples sin ventanas de permiso y quién publica y aplica cada cosa.',
       array['Claude ejecuta, el dueño solo da la orden',
             'Publicar en cuanto la vista previa esté en verde',
             'Supabase lo aplica Claude',
             'Comandos sin ventanas de permiso',
             'Ramas desde main actualizado y volver a main',
             'Comprobar errores de código en todas las ramas']),
      ('Grupo · Probar y vigilar antes de dar algo por bueno', 'codigo',
       'Cómo se comprueba un cambio: probar en el navegador, medir antes de culpar al móvil, formularios de punta a punta sin ensuciar datos, registros de errores y espacio en disco.',
       array['Probar en el navegador antes de publicar',
             'Probar formularios de punta a punta sin ensuciar la base de datos',
             'Medir antes de culpar al móvil',
             'Medidas de pantalla solo con la tienda montada',
             'Revisar los registros de errores',
             'Vigilar el espacio en disco del servidor']),
      ('Grupo · Normas técnicas del código y del servidor', 'codigo',
       'Normas técnicas: carpeta api/ para el servidor, pointerEvents como propiedad, toque y arrastre separados, base de datos al día, archivos nuevos solo cuando hacen falta y variables secretas.',
       array['Funciones del servidor en api/',
             'pointerEvents siempre como propiedad',
             'Toque y arrastre separados',
             'Lo que usa el código tiene que existir en la base de datos',
             'No crear archivos por crear',
             'Archivos de ayuda fuera de app/',
             'Nombres y valores de variables secretas']),
      ('Grupo · Blue flotante: sitio, avisos y guía', 'diseno',
       'Blue flotante: nunca tapa contenido, dónde se coloca, cuándo se esconde, cómo y cuántas veces avisa, dónde viven las notificaciones y cómo funciona su guía.',
       array['La guía de Blue navega sola y no puede desmontarse',
             'Blue nunca tapa contenido',
             'Blue se esconde al bajar el scroll y vuelve al parar',
             'Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable',
             'Los avisos y pistas de Blue salen una sola vez',
             'Notificaciones dentro de Blue',
             'Blue fuera del panel']),
      ('Grupo · Diseño de marca y estética', 'diseno',
       'Diseño de marca: azul #1EA7E8, estilo premium y minimalista, todo centrado, imágenes enteras, precios con céntimos y listas de productos con el diseño de Inicio.',
       array['Azul de marca en los botones',
             'Sin burbujas ni recuadros decorativos',
             'Todo centrado',
             'Imágenes enteras, sin recortar',
             'Precios siempre con céntimos',
             'Redes sociales una sola vez',
             'Listas de productos con el diseño de Inicio',
             'Botones principales de Inicio destacados con medida']),
      ('Grupo · Diseño para el móvil y una sola mano', 'diseno',
       'Diseño para el móvil: nada se sale por los lados, uso con el pulgar derecho y una sola mano, formularios en rejilla y el formulario de Vender.',
       array['Nada se sale por los lados en el móvil',
             'Todo al alcance del pulgar derecho',
             'Pensado para una mano',
             'Formularios en rejilla, no en columna',
             'Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable']),
      ('Grupo · Textos y contenido', 'textos',
       'Textos y contenido: noticias con fotos fieles, promesas y garantías solo en la descripción del producto y sin subtítulos de relleno.',
       array['Fotos de noticias fieles a la noticia',
             'Garantías y promesas solo en la descripción',
             'Sin subtítulos innecesarios']),
      ('Grupo · Negocio: datos reales, clientes y consentimiento', 'negocio',
       'Negocio: nunca se inventan datos, el marketing lleva consentimiento aparte, la atención al cliente va al chat de la tienda y Blue pregunta pero la respuesta la escribe el dueño.',
       array['No inventar datos del negocio',
             'Marketing siempre con consentimiento aparte',
             'Atención al cliente dentro de la tienda',
             'Blue aprende de la tienda: la respuesta la escribe el dueño']),
      ('Grupo · Seguridad e integración con VeoAura', 'seguridad',
       'Seguridad e integración: formularios públicos sin datos internos, integración con VeoAura sin cruzar proyectos y descripción fija en sus artículos.',
       array['Formularios públicos sin campos del taller',
             'Integraciones con VeoAura sin cruzar proyectos',
             'Descripción fija en artículos de VeoAura'])
    ) as t(titulo, categoria, intro, miembros)
  loop
    if not exists (select 1 from public.aprendizajes x where x.titulo = g.titulo) then
      insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
      select g.titulo,
             g.categoria,
             min(a.prioridad),
             g.intro || E'\n\n' || string_agg('• [P' || a.prioridad::text || '] ' || a.titulo || ': ' || a.regla, E'\n' order by a.prioridad, a.titulo),
             nullif(string_agg('• ' || a.titulo || ': ' || a.ejemplo_mal, E'\n' order by a.prioridad, a.titulo) filter (where coalesce(a.ejemplo_mal, '') <> ''), ''),
             nullif(string_agg('• ' || a.titulo || ': ' || a.ejemplo_bien, E'\n' order by a.prioridad, a.titulo) filter (where coalesce(a.ejemplo_bien, '') <> ''), ''),
             true
        from public.aprendizajes a
       where a.titulo = any(g.miembros) and a.activa
      having count(*) > 0;
    end if;

    update public.aprendizajes a
       set activa = false
     where a.titulo = any(g.miembros)
       and a.activa
       and exists (select 1 from public.aprendizajes x where x.titulo = g.titulo and x.activa);
  end loop;
end $$;
