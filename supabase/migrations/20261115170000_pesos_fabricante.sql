-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: pesos estimados corregidos con datos de fabricante (dueño, 2026-11-15, tras activar la búsqueda web solo en
--            sitios de fiar). Corrige 6 de los 19 pesos estimados de 20261115160000_pesos_estimados.sql con el peso oficial
--            del aparato + el embalaje del dueño (caja propia + film ≈ 0,1 kg; sin caja: cartón con protección ≈ 0,3 kg lo
--            pequeño, ≈ 0,9 kg una consola, ≈ 2,5 kg un televisor). Siguen marcados como ESTIMADOS (peso_estimado = true)
--            y SOLO se tocan si siguen estimados: nunca pisa un peso que haya escrito el dueño.
-- Fuentes:   LG 55UN80006LA 16 kg sin peana (lg.com/uk); Panasonic TX-49DS500 13,5 kg sin peana (panasonic.com/uk);
--            PS5 Pro, caja de venta 4,95 kg (ficha de tienda); Beats Studio3 260 g; Xbox One S 2,9 kg; Switch OLED con dock.
-- Cambian de tramo de Correos: PS5 Pro (4,7 → 5,05 kg: de «hasta 5 kg» a «hasta 10 kg») y Panasonic 49" (12 → 16 kg).
-- Conectado con: public.products (peso_kg, peso_estimado), public.calcular_envio, app/admin/products.tsx.
-- Tipo:     cambia pesos estimados (6 filas). No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.products p
set peso_kg = v.peso
from (values
  ('040c7f04-3b68-4b56-b762-f89f9c9a1176'::uuid, 5.050), -- PS5 Pro 2TB en su caja (4,95 kg) + film
  ('ea9d1013-24ed-4f5e-9630-c439b36ada21'::uuid, 18.500), -- LG 55" (16 kg) + caja y protección
  ('dd576456-d3e0-4d43-b8a9-0f02205d2719'::uuid, 16.000), -- Panasonic 49" (13,5 kg) + caja y protección
  ('4e4e5012-f01f-4f9c-bfc5-c59dc61b1e9b'::uuid, 2.000), -- Switch OLED Mario: consola, dock y cargador + caja
  ('c2b1db89-b672-4d83-b1c5-4dd2d1611149'::uuid, 0.600), -- Beats Studio3 (260 g) + caja pequeña
  ('91e8bd0f-b6cd-41b9-9c14-8fad559ba498'::uuid, 4.400)  -- Xbox One S (2,9 kg) + mando, cables y caja
) as v(id, peso)
where p.id = v.id
  and p.peso_estimado;
