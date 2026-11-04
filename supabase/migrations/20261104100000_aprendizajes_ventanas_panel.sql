-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04.
--   El dueño pidió en Administración → Servicios que la X para cerrar la ventana de «Nuevo servicio» vaya a la derecha
--   del botón «Crear servicio» (más práctico), lo mismo en todas las ventanas del panel, quitar del todo las burbujas
--   alrededor de los iconos y que los títulos y subtítulos de las listas se lean enteros.
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Ventanas del panel: la X abajo a la derecha del botón principal', 'panel', 1,
   'Toda ventana del panel de administración se cierra con una X abajo a la derecha, en la misma fila que su botón principal («Crear servicio», «Guardar cambios», «Sí, borrar»…), al alcance del pulgar: nada de X arriba ni de botón «Cancelar». Se usa PieVentana (y BotonCerrarVentana) de lib/admin/products.components.tsx; en las ventanas largas, el pie va fijo debajo de lo que se desplaza. Los iconos del panel van SIN burbuja alrededor (IconButton: solo el icono con su color, 44 × 44 para el dedo); sobre una foto, un icono que ya es redondo y oscuro (close-circle). Los títulos y datos de las listas se leen enteros, en las líneas que hagan falta (sin numberOfLines ni «…»). Se prueba con pruebas/perfil-datos.mjs (sección VP, en el móvil y en el ordenador).',
   'Una X arriba a la derecha del título, un botón «Cancelar» debajo de «Crear» y el lápiz y la papelera dentro de círculos de color; títulos cortados con «…».',
   '«Crear servicio» y a su derecha la X, sin burbuja; lápiz y papelera solos; el título del servicio entero en dos o tres líneas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
