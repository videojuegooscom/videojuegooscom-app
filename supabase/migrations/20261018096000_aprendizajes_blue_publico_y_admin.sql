-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Blue fuera del panel» ya no es cierta (hoy Blue sí aparece en Administración, pero solo para
--            el dueño). Se crea la versión actualizada «Blue: interfaz pública y Administración» y la
--            antigua se conserva con su texto original más una nota de «SUSTITUIDA», marcada como inactiva
--            (no se borra: queda como historial).
-- Tipo:     1 inserción y 1 actualización, idempotentes (por título o por marca). No borra nada.
-- Fuente:   components/Campanita.tsx (comprobado el 2026-10-18): Blue no se monta en chats ni en Vender;
--           en /admin solo se monta para el rol admin.
-- Límites:  cada regla queda por debajo de los 4.000 caracteres que admite aprendizajes_regla_check.
-- Independiente: no depende de ninguna otra migración. Va separada de la documentación (CLAUDE.md) y de la
--           regla de autorización para poder aprobarse por separado.
-- Vuelta atrás: supabase/rollbacks/20261018096000_aprendizajes_blue_publico_y_admin_revertir.sql
-- ============================================================================

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
