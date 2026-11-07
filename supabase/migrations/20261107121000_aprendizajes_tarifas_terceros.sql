-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-07 (el dueño corrige: «recuerda que Correos va por kg, mírate las tarifas de envío por
--            kg de Correos y ponlo bien»). Claude había puesto un precio fijo estimado (6,90 €) sin la tabla de Correos.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Precios de terceros (Correos y otros): los del dueño y con su forma de cobrar, nunca estimados', 'negocio', 1,
   'Los precios que ponen otras empresas (Correos, Stripe, Klarna…) no se estiman ni se ponen de memoria: Claude no puede consultar internet desde el servidor (la política de seguridad lo prohíbe), así que se piden al dueño (captura o tabla) y se ponen exactos. Y se respeta CÓMO cobran: Correos cobra por kilos y por zona (Paq Estándar nacional: tramos hasta 1, 2, 3, 4, 5, 10, 15, 20, 25 y 30 kg), así que el envío va por el peso del pedido con embalaje (products.peso_kg, tramos en tarifas_envio, migración 20261107120000_envio_por_kilos), no un precio fijo por pedido. Los pesos que no da el dueño se estiman por tipo de artículo, se dicen como estimados y él los corrige en Administración → Productos. Si un dato falta, se dice claro qué falta y por qué, en vez de rellenarlo.',
   'Poner 6,90 € fijos a la península «como referencia de Correos» sin su tabla y sin tener en cuenta el peso.',
   'Pedir la tabla de Correos al dueño, montar los tramos por kilos con sus precios exactos, el peso en cada artículo y el cálculo en la cesta, el pago y la base de datos, con su parte en Administración.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
