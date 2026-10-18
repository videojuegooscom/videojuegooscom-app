-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reorganiza el Centro de Aprendizajes en grupos por tema Y POR PRIORIDAD.
-- Regla del dueño (2026-10-18): la prioridad original de cada lección se mantiene. Una preferencia (P3)
--   nunca pasa a obligación (P1) por estar agrupada: cada grupo reúne solo lecciones de la MISMA
--   prioridad y su fila lleva esa prioridad. La migración lo comprueba y se para con un error si algún
--   miembro tuviera otra distinta.
-- Tipo:     NO borra nada y no pierde ninguna palabra.
--   1) Crea una fila «Grupo · …» por tema y prioridad (solo si tiene 2 o más lecciones activas). Su regla
--      es una frase de introducción más las reglas ORIGINALES copiadas tal cual desde la tabla
--      («• título: regla»), y lo mismo con los ejemplos. Nada se reescribe a mano.
--   2) Marca las lecciones sueltas agrupadas como inactivas (activa = false); siguen en la tabla.
--   Quedan SIN agrupar (siguen activas y sin cambios): «Revisión de calidad web cada dos semanas» (3.923
--   de los 4.000 caracteres que admite la regla: no cabe en un grupo), «Recomendar modelo en cada
--   respuesta» y «Fotos de noticias fieles a la noticia» (cada una es la única de su tema y prioridad).
-- Idempotente: si el grupo ya existe no se vuelve a crear, y las sueltas solo se desactivan si su grupo
--   está activo. Vuelta atrás: supabase/rollbacks/20261018100000_aprendizajes_reorganizar_revertir.sql
-- Orden: debe aplicarse DESPUÉS de 20261018090000_aprendizajes_lecciones_nuevas.sql y de las
--   migraciones 20261018095000 (autorización) y 20261018096000 (Blue pública/Administración), si el
--   dueño las autoriza: los títulos que no existan simplemente no entran. «Blue fuera del panel», si la
--   096000 la dejó inactiva, tampoco entra (se conserva como historial).
-- ============================================================================

do $$
declare
  g record;
  v_n int;
  v_otras int;
begin
  for g in
    select * from (values
      -- ---- Prioridad 1 (imprescindibles) ----
      ('Grupo · Cómo respondo al dueño', 'general', 1,
       'Cómo se responde: consultar el Centro de Aprendizajes antes de cada respuesta, formato fijo de 7 apartados, mínimo 10 recomendaciones, solo hablar de lo que existe y actuar con ambición.',
       array['Consultar el Centro de Aprendizajes antes de cada respuesta',
             'Formato de respuesta en 7 apartados',
             'Mínimo 10 recomendaciones de mejoría en cada respuesta',
             'Solo se menciona lo que existe',
             'Ambición: pensar como un cerebro más de la tienda']),
      ('Grupo · Cómo trabajo: ramas, permisos y publicación', 'general', 1,
       'Cómo se trabaja con el repositorio y el servidor: ramas desde main actualizado, comprobación de errores en toda rama, comandos simples sin ventanas de permiso y quién publica y aplica cada cosa.',
       array['Autorización expresa del dueño antes de fusionar, desplegar o migrar',
             'Claude ejecuta, el dueño solo da la orden',
             'Publicar en cuanto la vista previa esté en verde',
             'Supabase lo aplica Claude',
             'Comandos sin ventanas de permiso',
             'Ramas desde main actualizado y volver a main',
             'Comprobar errores de código en todas las ramas']),
      ('Grupo · Probar y vigilar antes de dar algo por bueno', 'codigo', 1,
       'Cómo se comprueba un cambio: probar en el navegador, formularios de punta a punta sin ensuciar datos, medir antes de culpar al móvil y medidas de pantalla con la tienda montada.',
       array['Probar en el navegador antes de publicar',
             'Probar formularios de punta a punta sin ensuciar la base de datos',
             'Medir antes de culpar al móvil',
             'Medidas de pantalla solo con la tienda montada']),
      ('Grupo · Normas técnicas del código y del servidor', 'codigo', 1,
       'Normas técnicas: carpeta api/ para el servidor, pointerEvents como propiedad, archivos nuevos solo cuando hacen falta y límites de la tabla antes de añadir texto.',
       array['Funciones del servidor en api/',
             'pointerEvents siempre como propiedad',
             'No crear archivos por crear',
             'Comprobar los límites de la tabla antes de añadir texto']),
      ('Grupo · Blue flotante: sitio, avisos y guía', 'diseno', 1,
       'Blue flotante: nunca tapa contenido, dónde se coloca, cuándo se esconde, cuántas veces avisa, cómo funciona su guía y cómo se comporta en la tienda pública y en Administración.',
       array['Blue: interfaz pública y Administración',
             'La guía de Blue navega sola y no puede desmontarse',
             'Blue nunca tapa contenido',
             'Blue se esconde al bajar el scroll y vuelve al parar',
             'Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable',
             'Los avisos y pistas de Blue salen una sola vez']),
      ('Grupo · Diseño de marca y estética', 'diseno', 1,
       'Diseño de marca: azul #1EA7E8, estilo premium y minimalista, imágenes enteras y listas de productos con el diseño de Inicio.',
       array['Azul de marca en los botones',
             'Sin burbujas ni recuadros decorativos',
             'Imágenes enteras, sin recortar',
             'Listas de productos con el diseño de Inicio']),
      ('Grupo · Diseño para el móvil y una sola mano', 'diseno', 1,
       'Diseño para el móvil: nada se sale por los lados, uso con el pulgar derecho y el formulario de Vender.',
       array['Nada se sale por los lados en el móvil',
             'Todo al alcance del pulgar derecho',
             'Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable']),
      ('Grupo · Negocio: datos reales, clientes y consentimiento', 'negocio', 1,
       'Negocio: nunca se inventan datos, el marketing lleva consentimiento aparte, la atención al cliente va al chat de la tienda y Blue pregunta pero la respuesta la escribe el dueño.',
       array['No inventar datos del negocio',
             'Marketing siempre con consentimiento aparte',
             'Atención al cliente dentro de la tienda',
             'Blue aprende de la tienda: la respuesta la escribe el dueño']),
      ('Grupo · Seguridad e integración con VeoAura', 'seguridad', 1,
       'Seguridad e integración: formularios públicos sin datos internos, integración con VeoAura sin cruzar proyectos y descripción fija en sus artículos.',
       array['Formularios públicos sin campos del taller',
             'Integraciones con VeoAura sin cruzar proyectos',
             'Descripción fija en artículos de VeoAura']),
      -- ---- Prioridad 2 (importantes) ----
      ('Grupo · Probar y vigilar (importantes)', 'codigo', 2,
       'Importantes, no imprescindibles: revisar los registros de errores y vigilar el espacio en disco.',
       array['Revisar los registros de errores',
             'Vigilar el espacio en disco del servidor']),
      ('Grupo · Normas técnicas (importantes)', 'codigo', 2,
       'Importantes, no imprescindibles: toque y arrastre separados y base de datos al día con el código.',
       array['Toque y arrastre separados',
             'Lo que usa el código tiene que existir en la base de datos']),
      ('Grupo · Blue (importantes)', 'diseno', 2,
       'Importantes, no imprescindibles: dónde viven las notificaciones de Blue.',
       array['Notificaciones dentro de Blue',
             'Blue fuera del panel']),
      ('Grupo · Diseño de marca (importantes)', 'diseno', 2,
       'Importantes, no imprescindibles: todo centrado, precios con céntimos, redes sociales una sola vez y botones principales de Inicio.',
       array['Todo centrado',
             'Precios siempre con céntimos',
             'Redes sociales una sola vez',
             'Botones principales de Inicio destacados con medida']),
      ('Grupo · Diseño para el móvil (importantes)', 'diseno', 2,
       'Importantes, no imprescindibles: pensado para una mano y formularios en rejilla.',
       array['Pensado para una mano',
             'Formularios en rejilla, no en columna']),
      ('Grupo · Textos y contenido (importantes)', 'textos', 2,
       'Importantes, no imprescindibles: promesas y garantías solo en la descripción y sin subtítulos de relleno.',
       array['Garantías y promesas solo en la descripción',
             'Sin subtítulos innecesarios']),
      -- ---- Prioridad 3 (preferencias) ----
      ('Grupo · Normas técnicas (preferencias)', 'codigo', 3,
       'Solo preferencias: archivos de ayuda fuera de app/ y nombres de variables secretas.',
       array['Archivos de ayuda fuera de app/',
             'Nombres y valores de variables secretas'])
    ) as t(titulo, categoria, prioridad, intro, miembros)
  loop
    select count(*), count(*) filter (where a.prioridad <> g.prioridad)
      into v_n, v_otras
      from public.aprendizajes a
     where a.titulo = any(g.miembros) and a.activa;

    -- Una preferencia nunca se vuelve obligación por agruparse (ni al revés).
    if v_otras > 0 then
      raise exception 'el grupo «%» mezclaría prioridades distintas: no se reorganiza nada', g.titulo;
    end if;

    if v_n >= 2 and not exists (select 1 from public.aprendizajes x where x.titulo = g.titulo) then
      insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
      select g.titulo,
             g.categoria,
             g.prioridad,
             g.intro || E'\n\n' || string_agg('• ' || a.titulo || ': ' || a.regla, E'\n' order by a.titulo),
             nullif(string_agg('• ' || a.titulo || ': ' || a.ejemplo_mal, E'\n' order by a.titulo) filter (where coalesce(a.ejemplo_mal, '') <> ''), ''),
             nullif(string_agg('• ' || a.titulo || ': ' || a.ejemplo_bien, E'\n' order by a.titulo) filter (where coalesce(a.ejemplo_bien, '') <> ''), ''),
             true
        from public.aprendizajes a
       where a.titulo = any(g.miembros) and a.activa;
    end if;

    update public.aprendizajes a
       set activa = false
     where a.titulo = any(g.miembros)
       and a.activa
       and exists (select 1 from public.aprendizajes x where x.titulo = g.titulo and x.activa);
  end loop;
end $$;
