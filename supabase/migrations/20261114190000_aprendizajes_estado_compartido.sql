-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 8 «Comparar 2-3 productos», aprobada por el dueño).
-- Qué hace: apunta la lección «Datos compartidos entre pantallas: useSyncExternalStore (el compilador de React no ve
--           las variables del módulo) y barras fijas de abajo que nunca tapan los botones de comprar».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                components/CategoryProductsShelf.tsx (useComparar, BarraComparar, useAlturaBarraComparar),
--                app/comparar.tsx y pruebas/perfil-datos.mjs (sección COMPA).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Datos compartidos entre pantallas con useSyncExternalStore y barras fijas que no tapan comprar', 'codigo', 2,
   'La tienda se compila con el compilador de React (React Compiler): un hook que lee una variable del módulo y fuerza el repintado con un useState de contador devuelve SIEMPRE lo primero que leyó (el compilador memoriza el resultado porque no ve que cambie). Lo que comparten varias pantallas o componentes fuera de React (la comparación de productos, y lo que venga) va con React.useSyncExternalStore y un objeto NUEVO en cada cambio (como useComparar en components/CategoryProductsShelf.tsx). Una barra fija abajo (position fixed) mide su alto real con onLayout y lo publica: las pantallas dejan ese hueco al final y el «Volver» flotante sube lo mismo; en la ficha se esconde (opacidad y desplazamiento con CSS, pointerEvents como propiedad) mientras «Comprar ya» o «Añadir a la cesta» estén donde iría ella. Se prueba recorriendo la ficha de arriba abajo y mirando en cada paso que la barra visible no cruza esos botones ni a Blue (pruebas/perfil-datos.mjs, sección COMPA).',
   'El «Comparar» se guardaba en el dispositivo pero ni la casilla ni la barra cambiaban: el hook devolvía la lista vacía del primer pintado.',
   'useComparar con useSyncExternalStore: al tocar «Comparar» la casilla pasa a «Comparando» y la barra aparece; en la ficha, la barra se esconde cuando llegan «Comprar ya» y «Añadir a la cesta».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
