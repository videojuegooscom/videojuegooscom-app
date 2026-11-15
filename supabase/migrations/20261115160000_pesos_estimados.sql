-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: pesos estimados de los artículos publicados que no tenían peso (dueño, 2026-11-15: «mientras yo voy poco a
--            poco actualizando los pesos quiero que tú automáticamente pongas más o menos el peso de cada uno»).
-- Qué hace: 1) products.peso_estimado (por defecto false): el peso lo puso Claude como estimación y el dueño aún no lo ha
--              revisado. Administración → Productos enseña «Peso estimado: … · revísalo al pesarlo» y, cuando el dueño
--              escribe el peso al editar, deja de ser estimado.
--           2) Pone un peso CON EMBALAJE a los 19 artículos publicados sin peso, SOLO si siguen sin peso (nunca pisa uno
--              puesto por el dueño o por VeoAura). Cálculo: peso de fábrica del aparato y sus accesorios + el embalaje del
--              dueño: con caja propia, 4-5 vueltas de film (~0,1 kg); sin caja propia, una caja de cartón con burbuja,
--              papel o cartones y cinta (~0,3 kg los pequeños, ~0,8-1 kg las consolas, ~2,5 kg los televisores). Las
--              cifras de fábrica son aproximadas (de memoria del modelo, sin buscador en el servidor): por eso quedan
--              marcadas como estimadas. Sin peso, la tienda contaba 2 kg para todos.
-- Conectado con: public.products (peso_kg), public.calcular_envio (tramos de Correos), app/admin/products.tsx,
--           lib/admin/products.types.ts.
-- Tipo:     añade una columna y rellena pesos vacíos. No borra nada ni cambia pesos que ya existan. Repetirla no cambia nada.
-- ============================================================================

alter table public.products add column if not exists peso_estimado boolean not null default false;

comment on column public.products.peso_estimado is 'El peso lo puso Claude como estimación (fábrica + embalaje del dueño) y el dueño aún no lo ha revisado; al escribir el peso en Productos pasa a false.';

update public.products p
set peso_kg = v.peso, peso_estimado = true
from (values
  ('040c7f04-3b68-4b56-b762-f89f9c9a1176'::uuid, 4.700), -- PlayStation 5 Pro 2TB nueva: en su caja (~4,6 kg) + film
  ('ea9d1013-24ed-4f5e-9630-c439b36ada21'::uuid, 18.000), -- Smart TV LG 55" 55UN80006LA: ~15,5 kg con peana + caja y protección
  ('7cd56a3e-b85c-418a-8a21-29854113abe1'::uuid, 0.500), -- iPhone 13: ~0,17 kg + caja pequeña con burbuja
  ('04b04189-20d4-4152-8292-fcbc13e39e97'::uuid, 0.600), -- Google Pixel sin caja con cargador: ~0,3 kg + caja pequeña
  ('4e4e5012-f01f-4f9c-bfc5-c59dc61b1e9b'::uuid, 1.800), -- Switch OLED Mario: consola, dock y cargador ~1 kg + caja
  ('dd576456-d3e0-4d43-b8a9-0f02205d2719'::uuid, 12.000), -- Smart TV Panasonic 49" TX-49DS500ES: ~9,5 kg + caja y protección
  ('c2b1db89-b672-4d83-b1c5-4dd2d1611149'::uuid, 0.800), -- Beats Studio 3 negros: ~0,26 kg + caja con burbuja
  ('16af252f-d0fb-4d11-b9e3-1a8e082ea573'::uuid, 1.200), -- PS5 Portal en su caja (~1,1 kg) + film
  ('c5ea9e7a-99a8-47e1-8d3b-4684f161f337'::uuid, 4.400), -- PS4 azul + mando + juego + cables: ~3,4 kg + caja
  ('0b42cabc-1a2c-4431-815b-0361c6918869'::uuid, 1.200), -- Beats Studio 3 rojos con funda y 2 cables: ~0,7 kg + caja
  ('91e8bd0f-b6cd-41b9-9c14-8fad559ba498'::uuid, 4.500), -- Xbox One S 1TB + cables + mando: ~3,5 kg + caja
  ('b34ccac4-929c-40ad-b2b6-e83c26b134db'::uuid, 1.700), -- Switch en su caja con dock y cargador (~1,6 kg) + film
  ('4d188363-add4-44d2-bb1b-5cdddbd96598'::uuid, 0.500), -- Almacenamiento 2 TB PlayStation: ~0,2 kg + caja pequeña
  ('70553642-0da1-487b-8b4c-097955487e29'::uuid, 0.500), -- Adaptador para volante de Xbox: ~0,2 kg + caja pequeña
  ('e6caa223-e6fd-4150-b7fb-ad14b85c36bd'::uuid, 0.200), -- Tarjeta SD 512 GB: sobre o caja mínima
  ('f5379ef9-6c98-4de7-a346-348b987e1ea3'::uuid, 0.500), -- Mando PS5 en su caja (~0,45 kg) + film
  ('ecc8177d-3148-4505-a745-e9e93b6b1eba'::uuid, 0.300), -- Joy-Con: ~0,05 kg + caja pequeña
  ('b05906e6-dc0b-4a43-a068-1cec150cb03b'::uuid, 0.500), -- Cascos Nintendo Switch en su caja + film
  ('7fe36fe9-a532-4117-8f28-6cf9a4ed4aca'::uuid, 0.300)  -- Juego PS4: ~0,1 kg + caja pequeña
) as v(id, peso)
where p.id = v.id
  and p.peso_kg is null;
