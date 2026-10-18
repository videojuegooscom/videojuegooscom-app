-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dos cambios en el Centro de Aprendizajes pedidos por el dueño el 2026-10-18.
--   1) REGLA PERMANENTE: nada de fusionar PR, desplegar a producción ni aplicar migraciones sin su
--      autorización expresa. Se añade la lección nueva y se anota, SIN borrar ni reescribir nada, en las
--      tres lecciones que decían lo contrario («Claude ejecuta…», «Publicar en cuanto…», «Supabase lo
--      aplica Claude»): su texto original se conserva entero y solo se le añade una línea de
--      «ACTUALIZADA» al final.
--   2) «Blue fuera del panel» ya no es cierta (hoy Blue sí aparece en Administración, pero solo para el
--      dueño). Se crea la versión actualizada «Blue: interfaz pública y Administración» y la antigua se
--      conserva con su texto original más una nota de «SUSTITUIDA», marcada como inactiva (no se borra).
-- Tipo:     2 inserciones y 4 actualizaciones de texto, todas idempotentes (por título o por marca).
--           No borra nada. Cada regla queda por debajo de los 4.000 caracteres que admite la tabla.
-- Orden:    antes de 20261018100000_aprendizajes_reorganizar_en_grupos.sql (que mete las dos lecciones
--           nuevas en sus grupos y deja fuera «Blue fuera del panel» por estar ya inactiva).
-- Vuelta atrás: supabase/rollbacks/20261018095000_aprendizajes_autorizacion_y_blue_panel_revertir.sql
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
select 'Autorización expresa del dueño antes de fusionar, desplegar o migrar',
       'general',
       1,
       'REGLA PERMANENTE del dueño (2026-10-18). Claude NO fusiona PR, NO despliega a producción, NO aplica migraciones ni hace nada destructivo sin autorización expresa del dueño para ese paso concreto. Prepara todo (rama, PR, pruebas, simulación y vuelta atrás), avisa «lista para fusionar» con lo verificado y lo no verificado, y sigue con otro trabajo seguro e independiente. Un «adelante» general o la autorización de otra tarea no vale. Sin pedir permiso sí puede leer, analizar, programar en ramas, probar en local y abrir PR. Esta regla manda sobre las lecciones «Claude ejecuta, el dueño solo da la orden», «Publicar en cuanto la vista previa esté en verde» y «Supabase lo aplica Claude» en lo que digan de fusionar, publicar o aplicar. Tras cada bloque importante se informa de: qué se ha completado, qué se ha verificado de verdad, qué falta, qué está bloqueado y por qué, y qué necesita autorización. No se toca VeoAura, TradeandoIA ni el Supervisor Central.',
       'Fusionar una PR en cuanto sus comprobaciones están en verde, o aplicar una migración porque «ya estaba revisada».',
       'Dejar la PR lista para fusionar, explicar qué está verificado y qué no, y esperar el «fusiona la #N» del dueño.',
       true
where not exists (
  select 1 from public.aprendizajes where titulo = 'Autorización expresa del dueño antes de fusionar, desplegar o migrar'
);

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

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien, activa)
select 'Blue: interfaz pública y Administración',
       'diseno',
       1,
       'Blue flotante se comporta distinto según la pantalla (comprobado en components/Campanita.tsx el 2026-10-18). INTERFAZ PÚBLICA: aparece en toda la tienda salvo en las pantallas de chat (Blue IA, Foro y chats) y en el formulario Vender, porque taparía el campo de escribir y el botón de enviar; la guía sí puede abrirse allí. En el pago no saca mensajes ni ofrece instalar la app. ADMINISTRACIÓN: Blue solo se monta para el dueño con rol admin; a nadie más. Allí no saca mensajes de la tienda; propone temas de «Lo que Blue sabe» (la respuesta la escribe siempre el dueño) y avisa de ventas de VeoAura sin confirmar, y se aparta sin tapar el panel. Sustituye a «Blue fuera del panel», que se conserva como historial.',
       'Decir que Blue no aparece en Administración, o dejar que se monte para cualquier visitante.',
       'Público: Blue en todo menos chats y Vender. Administración: Blue solo para el dueño.',
       true
where not exists (
  select 1 from public.aprendizajes where titulo = 'Blue: interfaz pública y Administración'
);

update public.aprendizajes
set regla = regla || ' SUSTITUIDA 2026-10-18 por «Blue: interfaz pública y Administración»: hoy Blue sí aparece en Administración, pero solo para el dueño. Se conserva como historial.',
    activa = false
where titulo = 'Blue fuera del panel'
  and regla not like '%SUSTITUIDA 2026-10-18%';
