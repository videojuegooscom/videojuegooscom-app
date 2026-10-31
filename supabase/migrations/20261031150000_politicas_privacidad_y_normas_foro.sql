-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: políticas (dueño, 2026-10-31: «sí, actualizar las políticas» y «crea unas normas del Foro cortas»).
--   1) Política de privacidad: cinco apartados al día con lo que de verdad hace la tienda:
--      - Mi perfil es obligatorio (la foto, opcional) y pide al menos 14 años; el usuario y la foto se ven en el Foro,
--        en los comentarios de las noticias y en las reseñas;
--      - el registro de moderación del Foro (qué eliminó o silenció un administrador, a quién y cuándo);
--      - con quién se comparten los datos: transporte y los proveedores técnicos que se usan de verdad (Supabase,
--        Vercel y OpenAI para Blue IA). Antes decía «proveedor de pagos (Supabase/Stripe u otro que uses)», y la tienda
--        no tiene pasarela de pago. A VeoAura no se le manda ningún dato del cliente (api/escaparate-retorno.ts).
--      Se cambia SOLO el texto de esos cinco apartados, buscándolos por su título; los demás («Responsable del
--      tratamiento», «Cookies y analítica propia», «Tus derechos»…) se quedan como estén.
--   2) Normas del Foro: página nueva /politicas/normas-foro (la enlaza el aviso de silencio del Foro). Se edita en
--      Administración → Políticas, como las demás. El mismo texto está en app/politicas/[slug].tsx por si la base de
--      datos falla.
-- Tipo:     solo cambia texto de policy_pages y añade una fila. No borra nada. Se puede aplicar varias veces: si ya
--           está al día no toca nada, y la página de normas solo se crea si no existe (si el dueño la edita, se respeta).
-- ============================================================================

-- 1) Política de privacidad.
with nuevos (heading, body) as (
  values
    ('Qué datos tratamos',
     'Datos de contacto (nombre, email, teléfono, dirección de envío), datos de tu cuenta, los datos de Mi perfil (nombre, nombre de usuario, país, provincia y fecha de nacimiento, y una foto si decides añadirla; de la fecha de nacimiento solo mostramos tu edad), tu historial de pedidos, de solicitudes de venta y de reparaciones y mantenimientos, lo que escribes en el Foro, en los comentarios de las noticias y en las reseñas de la tienda, y los mensajes que nos envías por el chat de la app o por WhatsApp.'),
    ('Para qué usamos tus datos',
     'Para gestionar tu pedido, tu reparación o tu solicitud de venta, comunicarnos contigo sobre su estado, ofrecerte soporte y mejorar nuestros productos y servicios. No usamos tus datos para fines distintos a estos. Tu nombre de usuario y tu foto, si la añades, se ven junto a lo que escribes en el Foro, en los comentarios de las noticias y en las reseñas de la tienda. De forma interna, los datos de tu perfil nos ayudan a conocer mejor a nuestros clientes por edad, provincia y país. Para cuidar el Foro, cuando un administrador elimina un mensaje o un comentario o silencia a alguien (lo explican las Normas del Foro), guardamos un registro interno de qué se hizo, a quién y cuándo, que solo ve la tienda.'),
    ('Base legal',
     'Tratamos tus datos porque son necesarios para ejecutar el contrato de compraventa o el servicio que nos pides, por tu consentimiento cuando nos contactas voluntariamente, o por nuestro interés legítimo en mejorar el servicio y en que el Foro sea un sitio seguro y respetuoso. Los datos de Mi perfil (salvo la foto, que es opcional) son necesarios para usar tu cuenta en la tienda y puedes cambiarlos en Mi cuenta cuando quieras. Para crear tu perfil debes tener al menos 14 años.'),
    ('Con quién compartimos tus datos',
     'Solo compartimos los datos estrictamente necesarios con empresas de transporte (para entregar tu pedido) y con los proveedores técnicos que hacen funcionar la tienda: Supabase (base de datos, cuentas y fotos), Vercel (alojamiento de la web) y OpenAI (procesa los mensajes que escribes a Blue IA para poder responderte). Cada uno trata los datos según sus propias condiciones de privacidad. No vendemos tus datos a terceros.'),
    ('Cuánto tiempo conservamos tus datos',
     'Conservamos tus datos mientras mantengas una cuenta activa y, tras cerrarla, durante el plazo legalmente exigido para cumplir obligaciones fiscales y contables. Los datos de tu perfil se conservan mientras tengas la cuenta y se borran con ella. El registro de moderación del Foro se guarda como historial interno; si borras tu cuenta, deja de estar vinculado a ti.')
)
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case when n.body is null then s.sec else jsonb_set(s.sec, '{body}', to_jsonb(n.body)) end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
      left join nuevos n on n.heading = s.sec ->> 'heading'
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1
    from jsonb_array_elements(p.sections) as s (sec)
    join nuevos n on n.heading = s.sec ->> 'heading'
    where s.sec ->> 'body' is distinct from n.body
  );

-- 2) Normas del Foro.
insert into public.policy_pages (slug, title, intro, sections, is_active, sort_order)
select
  'normas-foro',
  'Normas del Foro',
  'El Foro es el sitio para hablar de videojuegos y consolas con otros clientes de la tienda. Estas normas valen para el Foro y para los comentarios de las noticias. Son pocas y sencillas.',
  jsonb_build_array(
    jsonb_build_object('heading', 'Respeto ante todo',
      'body', 'Nada de insultos, amenazas, acoso ni mensajes que ataquen a alguien por quién es. Se puede no estar de acuerdo sin faltar a nadie.'),
    jsonb_build_object('heading', 'Sin spam ni publicidad',
      'body', 'No publiques anuncios, enlaces repetidos ni promociones de otras tiendas o servicios. Si quieres vendernos tu consola, usa «Vender» en la tienda.'),
    jsonb_build_object('heading', 'Tus datos, a salvo',
      'body', 'No compartas teléfonos, direcciones, correos ni otros datos personales, tuyos o de otras personas. Para hablar de un pedido o de una reparación, escríbenos desde «Hablar con Blue IA o el equipo».'),
    jsonb_build_object('heading', 'Contenido apropiado',
      'body', 'Nada de contenido sexual, violento u ofensivo, ni nada ilegal, como piratería o cuentas robadas.'),
    jsonb_build_object('heading', 'Si no se cumplen',
      'body', 'Un administrador puede eliminar mensajes y comentarios y, si hace falta, silenciar a una persona durante unos días (1, 3 o 7): mientras dure no podrá escribir en el Foro ni comentar noticias, aunque sí seguir usando la tienda con normalidad. Si crees que ha sido un error, escríbenos desde «Hablar con Blue IA o el equipo».')
  ),
  true,
  40
where not exists (select 1 from public.policy_pages where slug = 'normas-foro');
