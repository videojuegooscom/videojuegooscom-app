-- == VIDEOJUEGOSZARAGOZA ====================================================
-- COMPROBACIONES DE SOLO LECTURA de la reorganización de lecciones (20261018100000) y de las migraciones
-- 090000, 095000 y 096000 que la acompañan. No escribe nada: son SELECT para lanzar con execute_sql.
-- La prueba REAL (ejecutando las migraciones en una base aislada) es pruebas/lecciones-sql.mjs; estas
-- consultas sirven para comprobar la base de producción ANTES y DESPUÉS de aplicar lo que el dueño autorice.
-- ============================================================================

-- ANTES de aplicar (consulta 1): colisiones. Esperado: todo 0. (Ejecutada el 2026-10-18: todo 0.)
-- La tabla NO tiene ninguna restricción única, por eso las migraciones comprueban «not exists» por título:
-- es la única defensa contra duplicados.
select (select count(*) from public.aprendizajes where titulo like 'Grupo · %') as grupos_ya_existentes,
       (select count(*) from public.aprendizajes where not activa) as lecciones_ya_inactivas,
       (select count(*) from public.aprendizajes where titulo in ('Mínimo 10 recomendaciones de mejoría en cada respuesta', 'Comprobar los límites de la tabla antes de añadir texto', 'Autorización expresa del dueño antes de fusionar, desplegar o migrar', 'Blue: interfaz pública y Administración')) as nuevas_ya_existen,
       (select count(*) from pg_constraint where conrelid = 'public.aprendizajes'::regclass and contype = 'u') as restricciones_unicas_en_la_tabla,
       (select count(*) from public.aprendizajes where length(titulo) > 140) as titulos_ya_largos;

-- DESPUÉS de aplicar las cuatro migraciones (consulta 2): recuento. Esperado según la prueba real
-- (pruebas/lecciones-sql.mjs, escenario E): activas 19 (15 grupos + 4 lecciones sin agrupar: «Fotos de noticias
-- fieles a la noticia», «Revisión de calidad web cada dos semanas», «Recomendar modelo en cada respuesta» y
-- «Notificaciones dentro de Blue»), inactivas 55, total 74.
select count(*) filter (where activa) as activas,
       count(*) filter (where not activa) as inactivas,
       count(*) as total
from public.aprendizajes;

-- (consulta 3) Las prioridades se conservan: cada grupo tiene la prioridad de TODAS las lecciones que reúne.
-- Esperado: 0 filas.
select g.titulo as grupo, g.prioridad as prioridad_grupo, o.titulo as leccion, o.prioridad as prioridad_leccion
from public.aprendizajes g
join public.aprendizajes o on o.titulo not like 'Grupo · %' and not o.activa and position(o.regla in g.regla) > 0
where g.titulo like 'Grupo · %' and g.prioridad <> o.prioridad;

-- (consulta 4) Ningún grupo pasa del límite. Esperado: 0 filas.
select titulo, length(regla) as largo_regla, length(ejemplo_mal) as largo_mal, length(ejemplo_bien) as largo_bien
from public.aprendizajes
where titulo like 'Grupo · %' and (length(regla) > 4000 or length(ejemplo_mal) > 2000 or length(ejemplo_bien) > 2000);

-- (consulta 5) No se ha perdido ninguna palabra: el texto COMPLETO de cada lección desactivada aparece dentro de
-- una fila de grupo. Esperado: perdidas = 0 (la única inactiva que no está en ningún grupo es «Blue fuera del
-- panel», desactivada a propósito por 096000 y conservada como historial).
select count(*) filter (where o.titulo <> 'Blue fuera del panel' and not exists (select 1 from public.aprendizajes g where g.titulo like 'Grupo · %' and position(o.regla in g.regla) > 0)) as perdidas,
       count(*) filter (where o.titulo = 'Blue fuera del panel') as blue_fuera_del_panel
from public.aprendizajes o
where not o.activa and o.titulo not like 'Grupo · %';
