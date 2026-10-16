-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: límites de longitud en las solicitudes de venta (protección contra spam)
-- Tipo:     SOLO AÑADE una restricción nueva (NOT VALID: no toca las filas que ya existen y se
--           aplica a las nuevas). No borra ni modifica datos.
-- Para qué: cualquiera puede enviar el formulario «Vender mi artículo» sin cuenta (política
--           sell_requests_insert_public). Sin límites, un robot podría guardar textos enormes.
--           Los límites coinciden con los del formulario (maxLength en VenderAhoraModal.tsx).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sell_requests_longitudes_check'
      and conrelid = 'public.sell_requests'::regclass
  ) then
    alter table public.sell_requests
      add constraint sell_requests_longitudes_check check (
        char_length(nombre) <= 80
        and char_length(apellido) <= 80
        and char_length(articulo) <= 300
        and char_length(ciudad) <= 100
        and char_length(precio_estimado) <= 40
        and (motivo_venta is null or char_length(motivo_venta) <= 600)
        and (descripcion_problema is null or char_length(descripcion_problema) <= 600)
        and (contacto is null or char_length(contacto) <= 160)
        and (direccion is null or char_length(direccion) <= 300)
      ) not valid;
  end if;
end
$$;
