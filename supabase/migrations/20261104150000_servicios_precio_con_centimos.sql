-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: el precio de los servicios admite céntimos (petición del dueño, 2026-11-04: «que en los precios me deje
--            poner decimales»). La columna services.price_eur era de números enteros (45,50 € no se podía guardar); la
--            de productos ya es numeric(10,2).
-- Tipo:     cambia la columna a un tipo más amplio; los precios que ya hay se conservan tal cual (45 → 45,00). No borra
--           nada y ninguna vista ni función depende de ella (comprobado el 2026-11-04). Repetirla no cambia nada.
-- ============================================================================

alter table public.services
  alter column price_eur type numeric(10,2) using price_eur::numeric(10,2);
