-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. Revisando el carrusel de Instagram y TikTok, el dueño pidió que «los títulos y
--            textos tienen que ser profesionales», cambiar «Crea tu cuenta gratis en un minuto» por algo profesional
--            «que podamos ofrecerle si se registran», añadir en la pantalla del móvil un ejemplo de navegación por la app
--            y decir en la descripción que es la primera versión de la app.
-- Qué hace: añade a esa lección el tono profesional de los carruseles y las ventajas reales de la cuenta.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     amplía la lección «Somos una tienda de electrónica, y cada red con su formato». No borra nada. Repetirla no
--           cambia nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' Tono siempre profesional: titulares y textos sin coloquialismos ni exclamaciones de relleno («¡Mira…!», «¡Entérate…!») y sin «gratis» como reclamo; para animar a registrarse se ofrecen las ventajas reales de la cuenta (compra y seguimiento del pedido, seguimiento de reparaciones, avisos de lo que buscas, chat directo con el equipo), nunca descuentos ni regalos que la tienda no tenga. Cada captura del móvil lleva un ejemplo de navegación hecho de verdad en la tienda (una búsqueda real, una respuesta real de Blue IA) con el puntero de la app (huella táctil) sin tapar el texto que se toca. La app se presenta como su primera versión, en la que seguimos trabajando para que sea la mejor de artículos de electrónica de segunda mano.',
    ejemplo_mal = ejemplo_mal || ' O «Crea tu cuenta gratis en un minuto» y «¡Mira todo lo que tenemos!» en un carrusel de la tienda.',
    ejemplo_bien = ejemplo_bien || ' Y «Ventajas exclusivas de tu cuenta» con sus cuatro ventajas reales, y en cada móvil «Busca «PlayStation» y toca un artículo» con la búsqueda hecha de verdad.',
    updated_at = now()
where titulo = 'Somos una tienda de electrónica, y cada red con su formato'
  and regla not like '%Tono siempre profesional%';
