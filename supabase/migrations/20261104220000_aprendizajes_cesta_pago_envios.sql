-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-04. Con una captura de la Cesta, el dueño pidió «los iconos sin burbuja envolventes»,
--            «cambiar lo que se pueda a iconos y quitar burbujas envolventes innecesarias», que en «Finalizar compra» «el
--            scroll funcione perfectamente como cualquier otra página» con «una miniatura del artículo adquirido» y un
--            apartado de tarifas de envío para editarlas a mano «pero que siga haciéndose automáticamente».
-- Tipo:     inserta las dos lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cesta y pago: iconos sin burbuja, miniatura y un solo desplazamiento', 'diseno', 1,
   'En la tienda, cada pantalla tiene UNA sola píldora azul de marca (#1EA7E8, texto blanco): la acción principal («Ir a pagar», «Confirmar pedido»). Todo lo demás (quitar, vaciar, seguir comprando, volver, Blue, la elección de entrega) es su icono con su texto en azul o gris, sin fondo ni borde alrededor, y de 44 px o más para el dedo; quitar es solo la papelera roja. Los precios van en el azul de marca y «Gratis» en verde, como texto, nunca en una etiqueta. Cada artículo de la cesta y del pago lleva su miniatura (la foto de portada entera sobre blanco, SmartImage con ancho para que llegue la foto pequeña). Las pantallas con formulario (Finalizar compra) van en UN solo desplazamiento, como el resto de la tienda: la cabecera dentro, el botón al final del contenido (nunca fijo encima del teclado), campos a 16 px (el iPhone no amplía la página) y en la web el teclado no se cierra al desplazar. Se prueba en pruebas/perfil-datos.mjs (sección TE): sin fondos ni bordes en las acciones, colores, miniaturas y deslizar con el dedo (también empezando encima de un campo).',
   'Una cesta con «Unidad única» en una etiqueta, la papelera dentro de un círculo, «Seguir comprando» en una píldora con borde y un pago con la cabecera fija y el botón pegado abajo que no deja desplazar desde los campos.',
   'La cesta con la miniatura, el precio en azul, la papelera roja sola y «Vaciar cesta» como icono + texto; «Ir a pagar» es la única píldora; el pago se desplaza entero con el dedo y termina en «Confirmar pedido · 106,90€».'),
  ('Lo que se cobra lo calcula la base de datos, con la misma regla que la página', 'codigo', 1,
   'Todo importe que paga el cliente (artículos, envío, total) lo calcula la base de datos al guardar el pedido (el disparador trg_pedidos_envio con zona_envio y calcular_envio, migración 20261104210000), sin fiarse de lo que mande el navegador; la página (lib/envio.ts) usa LA MISMA regla solo para enseñarlo antes. Las dos se prueban con los mismos casos (pruebas/perfiles-sql.mjs y la sección TE). «A mano y automático» a la vez: el dueño cambia las tarifas en Administración → Tarifas de envío y, si un pedido necesita otro precio, lo pone en Pedidos (queda «a mano» y no se recalcula; «Volver al automático» lo devuelve a la tarifa). Lo que no es una venta de la web (ventas de VeoAura, pedidos sin código postal asignados desde el chat) no recibe envío automático. Las tarifas nuevas empiezan como estaba la tienda (0 €) y sin la migración la tienda sigue igual (gratis), sin peticiones fallidas que rompan nada.',
   'Calcular el envío en la página y mandarlo en el pedido (cualquiera podría mandar 0 €), o sumar un envío a una venta de VeoAura que ya trae su total.',
   'El pedido llega con los artículos; la base de datos le pone la zona y el envío (6,90 € a 28001) y el total; el dueño lo cambia a 3,50 € en Pedidos y queda «a mano».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
