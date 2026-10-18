-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: tres lecciones aprendidas el 2026-10-18 (Centro de Aprendizajes).
--   1) «Una prueba debe fallar sin la corrección»: las pruebas de concurrencia y de seguridad se comprueban
--      con un control (la versión anterior o sin la defensa) que debe FALLAR.
--   2) «Quitar permisos de una función: revisar también PUBLIC»: revoke from anon no cierra una función
--      que tiene el permiso de «todos» (=X/postgres).
--   3) «npm audit no equivale a «llega al navegador»»: clasificar las vulnerabilidades por exposición real.
--   4) «Probar los ciclos y las condiciones reales, no solo el camino feliz»: aplicar-deshacer-aplicar, todos
--      los órdenes, pruebas de navegador bajo carga y respuestas simuladas con el formato real.
-- Tipo:     4 inserciones, cada una una sola vez (por título), o reactivación si ya existe inactiva con
--           exactamente el mismo texto. No borra ni modifica nada más.
-- Límites:  cada regla queda muy por debajo de los 4.000 caracteres que admite aprendizajes_regla_check.
-- Vuelta atrás: supabase/rollbacks/20261018097000_aprendizajes_pruebas_y_permisos_revertir.sql
-- ============================================================================

-- Si una lección ya existe pero está inactiva con exactamente este texto (porque antes se aplicó la vuelta
-- atrás), se vuelve a activar: así «aplicar, deshacer, aplicar» termina igual que «aplicar». Si alguien la
-- editó, no se toca.
with nueva (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien) as (
  values
    (
       'Una prueba debe fallar sin la corrección',
       'codigo',
       1,
       'Antes de dar una prueba por buena se comprueba que FALLA sin la corrección: un control con la versión anterior o quitando el bloqueo, el permiso o el límite que se prueba. Una prueba que pasa igual con y sin la corrección no vale. Una prueba de concurrencia necesita simultaneidad REAL: lanzar procesos uno tras otro no se solapa (el 2026-10-18 «20 peticiones en paralelo» pasaban sin los bloqueos); se usa una «puerta» (bloqueo) que libera todas las sesiones a la vez. Una prueba que no llega a medir nada no pasa: se cuenta lo medido (páginas medidas, filas comprobadas) y falla si es 0. Un fallo de la prueba (falso positivo) se arregla en la prueba, no se rodea.',
       'Dar por bueno un «todo OK» de una prueba que también habría pasado sin la corrección, o que midió 0 casos.',
       'Pasar la prueba contra la versión anterior (debe fallar) y contra la nueva (debe pasar), y mostrar ambos resultados.'
    ),
    (
       'Quitar permisos de una función: revisar también PUBLIC',
       'seguridad',
       1,
       'En Supabase una función SECURITY DEFINER cuya lista de permisos (proacl) incluye «=X/postgres» la puede ejecutar TODO el mundo (PUBLIC), también anon: «revoke … from anon, authenticated» NO la cierra. Se hace «revoke … from public, anon, authenticated», se concede solo a service_role y se comprueba con has_function_privilege para anon, authenticated y service_role, y con el proacl. Esto lo cazó una prueba real el 2026-10-18: adjust_product_like, increment_product_view e increment_service_view estaban abiertas a cualquiera por PUBLIC. En un rollback se restituye el estado EXACTO anterior, incluido PUBLIC.',
       'Quitar el permiso a anon y authenticated y dar la función por cerrada sin mirar PUBLIC.',
       'Mirar el proacl en producción, quitar también a PUBLIC y probar con has_function_privilege que anon y authenticated reciben «permission denied».'
    ),
    (
       'Probar los ciclos y las condiciones reales, no solo el camino feliz',
       'codigo',
       1,
       'Una migración de datos se prueba con «aplicar, deshacer, aplicar» (debe terminar igual que «aplicar»: el 2026-10-18 una inserción «si no existe por título» dejaba inactivas las lecciones nuevas tras la vuelta atrás y el Centro perdía una regla), en TODOS los órdenes posibles y dentro de transacciones que se deshacen (así se descubren las restricciones de orden reales). Una prueba de navegador espera a que la página hidrate (lo escrito antes se pierde) y se prueba también con otra prueba de navegador a la vez, porque con la CPU justa fallan las que dependen de tiempos. Las respuestas simuladas imitan el formato REAL (PostgREST devuelve un texto entre comillas, no el texto sin más) y, si la prueba no encuentra un fallo, se comprueba que de verdad podía encontrarlo.',
       'Dar una migración por idempotente por haberla aplicado dos veces seguidas, o una prueba de navegador por estable porque pasó una vez sola.',
       'Probar aplicar, deshacer y aplicar otra vez, las 120 ordenaciones y la prueba de navegador bajo carga, y arreglar la prueba si falla por tiempos.'
    ),
    (
       'npm audit no equivale a «llega al navegador»',
       'seguridad',
       2,
       'Las vulnerabilidades de «npm audit» se clasifican por exposición real: ¿el código llega al navegador (se busca en el bundle de dist), lo importa alguna función de api/, o solo se ejecuta al compilar o en desarrollo? «npm audit --omit=dev» cuenta Expo y React Native como producción aunque son herramientas de construcción. Un «fixAvailable» que apunta a expo@44.0.6 es una BAJADA que rompe el proyecto: nunca «npm audit fix --force». Las dependencias las actualiza y fusiona el dueño; se prepara el plan por lotes (primero lockfile) y se prueba cada lote.',
       'Entrar en pánico con «53 vulnerabilidades» o ejecutar npm audit fix --force.',
       'Clasificar cada paquete (navegador, servidor, solo compilación), arreglar primero lo explotable y probar cada lote.'
    )
), alta as (
  insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
  select n.titulo, n.categoria, n.prioridad, n.regla, n.ejemplo_mal, n.ejemplo_bien, true
    from nueva n
   where not exists (select 1 from public.aprendizajes a where a.titulo = n.titulo)
  returning id
)
update public.aprendizajes a
   set activa = true
  from nueva n
 where a.titulo = n.titulo and not a.activa and a.regla = n.regla;
