-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: REGLA PERMANENTE del dueño (2026-10-18): nada de fusionar PR, desplegar a producción ni
--            aplicar migraciones sin su autorización expresa.
-- Tipo:     1 inserción (o reactivación si está inactiva con el mismo texto) y 3 actualizaciones de texto,
--           idempotentes (por título o por marca). No borra nada:
--           la lección nueva se añade y, SIN reescribir nada, se anota una línea «ACTUALIZADA» al final de
--           las tres lecciones que decían lo contrario («Claude ejecuta, el dueño solo da la orden»,
--           «Publicar en cuanto la vista previa esté en verde» y «Supabase lo aplica Claude»): su texto
--           original queda entero.
-- Límites:  cada regla queda por debajo de los 4.000 caracteres que admite aprendizajes_regla_check.
-- Independiente: no depende de ninguna otra migración. Va separada de la documentación (CLAUDE.md) y de
--           la lección de Blue para poder aprobarse por separado.
-- Vuelta atrás: supabase/rollbacks/20261018095000_aprendizajes_autorizacion_expresa_revertir.sql
-- ============================================================================

-- Si la lección ya existe pero está inactiva con exactamente este texto (porque antes se aplicó la vuelta
-- atrás), se vuelve a activar: así «aplicar, deshacer, aplicar» termina igual que «aplicar». Si alguien
-- editó el texto, no se toca.
with nueva (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien) as (
  values (
       'Autorización expresa del dueño antes de fusionar, desplegar o migrar',
       'general',
       1,
       'REGLA PERMANENTE del dueño (2026-10-18). Claude NO fusiona PR, NO despliega a producción, NO aplica migraciones ni hace nada destructivo sin autorización expresa del dueño para ese paso concreto. Prepara todo (rama, PR, pruebas, simulación y vuelta atrás), avisa «lista para fusionar» con lo verificado y lo no verificado, y sigue con otro trabajo seguro e independiente. Un «adelante» general o la autorización de otra tarea no vale. Sin pedir permiso sí puede leer, analizar, programar en ramas, probar en local y abrir PR. Esta regla manda sobre las lecciones «Claude ejecuta, el dueño solo da la orden», «Publicar en cuanto la vista previa esté en verde» y «Supabase lo aplica Claude» en lo que digan de fusionar, publicar o aplicar. Tras cada bloque importante se informa de: qué se ha completado, qué se ha verificado de verdad, qué falta, qué está bloqueado y por qué, y qué necesita autorización. No se toca VeoAura, TradeandoIA ni el Supervisor Central.',
       'Fusionar una PR en cuanto sus comprobaciones están en verde, o aplicar una migración porque «ya estaba revisada».',
       'Dejar la PR lista para fusionar, explicar qué está verificado y qué no, y esperar el «fusiona la #N» del dueño.'
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

update public.aprendizajes
set regla = regla || ' ACTUALIZADA 2026-10-18: publicar y aplicar migraciones ya NO se hacen sin autorización expresa del dueño; ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar».'
where titulo = 'Claude ejecuta, el dueño solo da la orden'
  and regla not like '%ACTUALIZADA 2026-10-18%';

update public.aprendizajes
set regla = regla || ' ACTUALIZADA 2026-10-18: el verde ya no basta para publicar; hace falta la autorización expresa del dueño para esa PR (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).'
where titulo = 'Publicar en cuanto la vista previa esté en verde'
  and regla not like '%ACTUALIZADA 2026-10-18%';

update public.aprendizajes
set regla = regla || ' ACTUALIZADA 2026-10-18: Claude prepara la migración, la vuelta atrás y la simulación, pero solo la aplica con autorización expresa del dueño (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).'
where titulo = 'Supabase lo aplica Claude'
  and regla not like '%ACTUALIZADA 2026-10-18%';
