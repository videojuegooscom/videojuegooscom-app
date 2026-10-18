-- == VIDEOJUEGOSZARAGOZA ====================================================
-- SIMULACIÓN DE SOLO LECTURA de 20261018100000_aprendizajes_reorganizar_en_grupos.sql
-- No escribe nada: son consultas SELECT que calculan, con los datos reales de la tabla, cómo
-- quedaría cada fila «Grupo · …» y la comparan con las restricciones de aprendizajes:
--   regla  1 a 4.000 caracteres   ejemplo_mal / ejemplo_bien hasta 2.000   titulo 3 a 140
--   prioridad 1 a 3               categoria en (general, diseno, textos, negocio, codigo, seguridad, seo, panel)
-- Se puede lanzar cuando se quiera con execute_sql. Las 2 lecciones nuevas de
-- 20261018090000_aprendizajes_lecciones_nuevas.sql todavía no están en la tabla: su aportación va como
-- cifras fijas en la consulta 1, medidas con el texto exacto del archivo: «Mínimo 10…» aporta 571
-- (regla), 139 (ejemplo_mal) y 168 (ejemplo_bien) al grupo 1; «Comprobar los límites…» aporta 521, 140
-- y 144 al grupo 4 (cada cifra incluye «• [P1] » o «• », el título y «: »; el +1 es el salto de línea).
-- Resultado esperado: consulta 1 con margen_regla >= 0 en las 10 filas y grupo 0 = 1 fila
-- (la lección de revisión web, que no entra en ningún grupo); consulta 2 con todo en 0 / true.
-- ============================================================================

-- Consulta 1: largo final de cada grupo = introducción + 2 saltos de línea + reglas existentes
-- + aportación de las lecciones nuevas (cifras fijas: grupo 1 suma 'Mínimo 10…', grupo 4 suma 'Comprobar los límites…').
select s.grupo,
       s.existentes,
       s.prioridad_minima,
       s.largo_reglas + 2 + case s.grupo
         when 1 then length('Cómo se responde: consultar el Centro de Aprendizajes antes de cada respuesta, formato fijo de 7 apartados, mínimo 10 recomendaciones, modelo recomendado, solo hablar de lo que existe y actuar con ambición.') + 1 + 571
         when 2 then length('Cómo se trabaja con el repositorio y el servidor: ramas desde main actualizado, comprobación de errores en toda rama, comandos simples sin ventanas de permiso y quién publica y aplica cada cosa.')
         when 3 then length('Cómo se comprueba un cambio: probar en el navegador, medir antes de culpar al móvil, formularios de punta a punta sin ensuciar datos, registros de errores y espacio en disco.')
         when 4 then length('Normas técnicas: carpeta api/ para el servidor, pointerEvents como propiedad, toque y arrastre separados, base de datos al día, archivos nuevos solo cuando hacen falta y variables secretas.') + 1 + 521
         when 5 then length('Blue flotante: nunca tapa contenido, dónde se coloca, cuándo se esconde, cómo y cuántas veces avisa, dónde viven las notificaciones y cómo funciona su guía.')
         when 6 then length('Diseño de marca: azul #1EA7E8, estilo premium y minimalista, todo centrado, imágenes enteras, precios con céntimos y listas de productos con el diseño de Inicio.')
         when 7 then length('Diseño para el móvil: nada se sale por los lados, uso con el pulgar derecho y una sola mano, formularios en rejilla y el formulario de Vender.')
         when 8 then length('Textos y contenido: noticias con fotos fieles, promesas y garantías solo en la descripción del producto y sin subtítulos de relleno.')
         when 9 then length('Negocio: nunca se inventan datos, el marketing lleva consentimiento aparte, la atención al cliente va al chat de la tienda y Blue pregunta pero la respuesta la escribe el dueño.')
         when 10 then length('Seguridad e integración: formularios públicos sin datos internos, integración con VeoAura sin cruzar proyectos y descripción fija en sus artículos.')
         else 0 end as largo_regla_final,
       4000 - (s.largo_reglas + 2 + case s.grupo
         when 1 then length('Cómo se responde: consultar el Centro de Aprendizajes antes de cada respuesta, formato fijo de 7 apartados, mínimo 10 recomendaciones, modelo recomendado, solo hablar de lo que existe y actuar con ambición.') + 1 + 571
         when 2 then length('Cómo se trabaja con el repositorio y el servidor: ramas desde main actualizado, comprobación de errores en toda rama, comandos simples sin ventanas de permiso y quién publica y aplica cada cosa.')
         when 3 then length('Cómo se comprueba un cambio: probar en el navegador, medir antes de culpar al móvil, formularios de punta a punta sin ensuciar datos, registros de errores y espacio en disco.')
         when 4 then length('Normas técnicas: carpeta api/ para el servidor, pointerEvents como propiedad, toque y arrastre separados, base de datos al día, archivos nuevos solo cuando hacen falta y variables secretas.') + 1 + 521
         when 5 then length('Blue flotante: nunca tapa contenido, dónde se coloca, cuándo se esconde, cómo y cuántas veces avisa, dónde viven las notificaciones y cómo funciona su guía.')
         when 6 then length('Diseño de marca: azul #1EA7E8, estilo premium y minimalista, todo centrado, imágenes enteras, precios con céntimos y listas de productos con el diseño de Inicio.')
         when 7 then length('Diseño para el móvil: nada se sale por los lados, uso con el pulgar derecho y una sola mano, formularios en rejilla y el formulario de Vender.')
         when 8 then length('Textos y contenido: noticias con fotos fieles, promesas y garantías solo en la descripción del producto y sin subtítulos de relleno.')
         when 9 then length('Negocio: nunca se inventan datos, el marketing lleva consentimiento aparte, la atención al cliente va al chat de la tienda y Blue pregunta pero la respuesta la escribe el dueño.')
         when 10 then length('Seguridad e integración: formularios públicos sin datos internos, integración con VeoAura sin cruzar proyectos y descripción fija en sus artículos.')
         else 0 end) as margen_regla,
       s.largo_mal + case s.grupo when 1 then 1 + 139 when 4 then 1 + 140 else 0 end as largo_mal_final,
       s.largo_bien + case s.grupo when 1 then 1 + 168 when 4 then 1 + 144 else 0 end as largo_bien_final
from (
  select case
           when titulo = any(array['Consultar el Centro de Aprendizajes antes de cada respuesta','Formato de respuesta en 7 apartados','Recomendar modelo en cada respuesta','Solo se menciona lo que existe','Ambición: pensar como un cerebro más de la tienda']) then 1
           when titulo = any(array['Claude ejecuta, el dueño solo da la orden','Publicar en cuanto la vista previa esté en verde','Supabase lo aplica Claude','Comandos sin ventanas de permiso','Ramas desde main actualizado y volver a main','Comprobar errores de código en todas las ramas']) then 2
           when titulo = any(array['Probar en el navegador antes de publicar','Probar formularios de punta a punta sin ensuciar la base de datos','Medir antes de culpar al móvil','Medidas de pantalla solo con la tienda montada','Revisar los registros de errores','Vigilar el espacio en disco del servidor']) then 3
           when titulo = any(array['Funciones del servidor en api/','pointerEvents siempre como propiedad','Toque y arrastre separados','Lo que usa el código tiene que existir en la base de datos','No crear archivos por crear','Archivos de ayuda fuera de app/','Nombres y valores de variables secretas']) then 4
           when titulo = any(array['La guía de Blue navega sola y no puede desmontarse','Blue nunca tapa contenido','Blue se esconde al bajar el scroll y vuelve al parar','Blue: nunca abajo a la derecha, tarjeta alargada y tienda instalable','Los avisos y pistas de Blue salen una sola vez','Notificaciones dentro de Blue','Blue fuera del panel']) then 5
           when titulo = any(array['Azul de marca en los botones','Sin burbujas ni recuadros decorativos','Todo centrado','Imágenes enteras, sin recortar','Precios siempre con céntimos','Redes sociales una sola vez','Listas de productos con el diseño de Inicio','Botones principales de Inicio destacados con medida']) then 6
           when titulo = any(array['Nada se sale por los lados en el móvil','Todo al alcance del pulgar derecho','Pensado para una mano','Formularios en rejilla, no en columna','Vender: contacto por Gmail o chat, brillo Siri y scroll al desplegable']) then 7
           when titulo = any(array['Fotos de noticias fieles a la noticia','Garantías y promesas solo en la descripción','Sin subtítulos innecesarios']) then 8
           when titulo = any(array['No inventar datos del negocio','Marketing siempre con consentimiento aparte','Atención al cliente dentro de la tienda','Blue aprende de la tienda: la respuesta la escribe el dueño']) then 9
           when titulo = any(array['Formularios públicos sin campos del taller','Integraciones con VeoAura sin cruzar proyectos','Descripción fija en artículos de VeoAura']) then 10
           else 0 end as grupo,
         count(*) as existentes,
         min(prioridad) as prioridad_minima,
         length(string_agg('• [P' || prioridad::text || '] ' || titulo || ': ' || regla, E'\n' order by prioridad, titulo)) as largo_reglas,
         length(string_agg('• ' || titulo || ': ' || ejemplo_mal, E'\n' order by prioridad, titulo) filter (where coalesce(ejemplo_mal, '') <> '')) as largo_mal,
         length(string_agg('• ' || titulo || ': ' || ejemplo_bien, E'\n' order by prioridad, titulo) filter (where coalesce(ejemplo_bien, '') <> '')) as largo_bien
    from public.aprendizajes
   where activa
   group by 1
) s
order by s.grupo;

-- Consulta 2: colisiones ANTES de aplicar. Todo debe dar 0. (Ejecutada el 2026-10-18: todo 0.)
-- Los 10 títulos de grupo miden como mucho 56 caracteres (límite 140) y empiezan por «Grupo · », así que no
-- pueden coincidir con ninguna lección suelta. La tabla NO tiene ninguna restricción única, por eso la
-- migración comprueba «not exists» por título: es la única defensa contra duplicados.
select (select count(*) from public.aprendizajes where titulo like 'Grupo · %') as grupos_ya_existentes,
       (select count(*) from public.aprendizajes where not activa) as lecciones_ya_inactivas,
       (select count(*) from public.aprendizajes where titulo in ('Mínimo 10 recomendaciones de mejoría en cada respuesta', 'Comprobar los límites de la tabla antes de añadir texto', 'Autorización expresa del dueño antes de fusionar, desplegar o migrar', 'Blue: interfaz pública y Administración')) as nuevas_ya_existen,
       (select count(*) from pg_constraint where conrelid = 'public.aprendizajes'::regclass and contype = 'u') as restricciones_unicas_en_la_tabla,
       (select count(*) from public.aprendizajes where length(titulo) > 140) as titulos_ya_largos;

-- Proyección con las 2 lecciones de 20261018095000 (todavía no creadas): medidas con Node sobre el texto
-- exacto de ese archivo (notas de 182, 195 y 219 caracteres que se añaden a tres lecciones del grupo 2,
-- lección «Autorización…» de 962 caracteres de regla, lección «Blue: interfaz…» de 714, y «Blue fuera del
-- panel» que sale del grupo 5 por quedar inactiva):
--   grupo 2:  1.927 (consulta 1) + 182 + 195 + 219 + 1 + 1.039 = 3.563  -> margen 437
--   grupo 5:  3.175 (consulta 1) - 137 + 1 + 762 = 3.801               -> margen 199
-- El grupo 5 queda a 199 caracteres del límite: la próxima lección de Blue ya exige un grupo nuevo.
-- Prioridades: todos los grupos salen con prioridad 1 (la mínima de sus miembros); la prioridad original
-- de cada regla se conserva escrita en su línea ([P1], [P2] o [P3]). Si el dueño prefiere que las
-- preferencias [P3] no suban a prioridad 1, la alternativa es un grupo aparte por tema para P2/P3.

-- ============================================================================
-- COMPROBACIONES POSTERIORES (solo lectura): ejecutar DESPUÉS de aplicar las tres migraciones.
-- ============================================================================

-- A) Recuento. Esperado con las 3 migraciones aplicadas: activas 11 (10 grupos + la lección de revisión web),
--    inactivas 58 (54 originales sin la de revisión + 4 nuevas ya agrupadas), total 69.
select count(*) filter (where activa) as activas,
       count(*) filter (where not activa) as inactivas,
       count(*) as total
from public.aprendizajes;

-- B) Ninguna regla de grupo pasa del límite. Esperado: 0 filas.
select titulo, length(regla) as largo_regla, length(ejemplo_mal) as largo_mal, length(ejemplo_bien) as largo_bien
from public.aprendizajes
where titulo like 'Grupo · %' and (length(regla) > 4000 or length(ejemplo_mal) > 2000 or length(ejemplo_bien) > 2000);

-- C) No se ha perdido ninguna palabra: el texto COMPLETO de cada lección desactivada aparece dentro de una
--    fila de grupo. Esperado con las 3 migraciones: encontradas_en_un_grupo = 57 y sueltas_inactivas = 1
--    (la única que no está en ningún grupo es «Blue fuera del panel», desactivada a propósito por
--    20261018095000 y conservada como historial). Cualquier otra cifra significa texto perdido.
select count(*) filter (where exists (select 1 from public.aprendizajes g where g.titulo like 'Grupo · %' and position(o.regla in g.regla) > 0)) as encontradas_en_un_grupo,
       count(*) filter (where not exists (select 1 from public.aprendizajes g where g.titulo like 'Grupo · %' and position(o.regla in g.regla) > 0)) as sueltas_inactivas
from public.aprendizajes o
where not o.activa and o.titulo not like 'Grupo · %';
