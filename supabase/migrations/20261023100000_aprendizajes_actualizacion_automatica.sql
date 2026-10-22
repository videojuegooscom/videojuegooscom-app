-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección de «no veo los cambios» y de la actualización automática de la tienda abierta en segundo plano.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('«No veo los cambios»: comprobar publicación, base de datos y copia guardada', 'general', 1,
   'Cuando el dueño dice que no ve un cambio, se mira por este orden antes de tocar código: 1) la publicación de producción (última publicación lista, dominio apuntando a ella y el cambio visible en la web real con el navegador de pruebas, solo lectura); 2) si la función depende de una migración sin aplicar (p. ej. «Tu perfil» y «Perfiles de clientes» no salen hasta que existe perfiles_cliente) o de un suceso (avisos de reserva, de pedido o de reparación solo salen cuando pasa algo; «Avísame cuando llegue» solo con una búsqueda sin resultados); 3) la copia guardada en el móvil: una tienda abierta en segundo plano, sobre todo la instalada en la pantalla de inicio, sigue con el código viejo. Por eso app/_layout.tsx comprueba al volver a la tienda si hay versión nueva (compara el archivo entry-<huella>.js con el de la portada publicada) y se recarga sola si estuvo fuera 30 s o más, no está en un formulario, chat o panel (vender, checkout, chat, blue-ia, admin, reset-password) ni hay texto escrito; como mucho una vez cada 10 min. Se prueba con pruebas/actualizacion-automatica.mjs. La respuesta al dueño dice qué está publicado y qué depende de una migración pendiente.',
   'Decir «ya está publicado» sin explicar que la función depende de una migración sin aplicar o de que se recargue la tienda del móvil.', 'Comprobar la web real, decir qué cambios se ven ya y cuáles esperan una migración, y que la tienda se actualiza sola al volver a ella.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
