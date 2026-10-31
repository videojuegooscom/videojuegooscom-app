-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-10-31 — el dueño vio a Blue encima de la foto ampliada de un artículo y notó tirones
--            al hacer zoom en el visor de fotos (components/ImageLightbox.tsx).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue nunca encima de una pantalla completa', 'diseno', 1,
   'Todo lo que ocupa la pantalla entera para mirar algo (el visor de fotos de la ficha y cualquier otro que se añada) esconde a Blue mientras está abierto: no se ve, no se puede tocar (ni su saludo) y lo que tenga que decir espera a que se cierre, para no perder los mensajes que salen una sola vez. Se hace avisando a Blue (como suscribirVisorFotos en components/ImageLightbox.tsx), no subiendo el zIndex de la pantalla nueva, porque Blue vive en la capa de más arriba.',
   'El visor de fotos abierto a pantalla completa y Blue arriba a la izquierda tapando la foto ampliada.',
   'Al abrir el visor Blue se desliza a su borde y desaparece; al cerrarlo vuelve y dice el mensaje de la ficha que tenía guardado.'),
  ('Gestos de zoom y arrastre en la web: fuera de React y sin el zoom del navegador', 'codigo', 2,
   'En un visor o recorte con pellizco: 1) la capa lleva touch-action:none (el body tiene «manipulation», que deja pellizcar la página y el iPhone hacía su zoom a la vez) y se cancelan gesturestart/gesturechange de Safari y la rueda (oyente con passive:false); 2) mover y escalar se escribe directamente en el estilo de la capa, como mucho una vez por fotograma, sin setState en cada movimiento; 3) al poner o quitar un dedo se toma la posición de nuevo (onPanResponderStart/End), y el zoom va alrededor de los dedos; 4) en react-native-web pointerEvents «box-none» deja tocables a los hijos aunque el padre sea «none»: lo que se esconde pasa a «none». Se prueba con dedos de verdad (CDP Input.dispatchTouchEvent; para soltar un solo dedo, touchEnd con ese dedo) y un MutationObserver que demuestra que durante el gesto solo cambia la capa.',
   'forceRender en cada movimiento del dedo, sin touch-action y con el zoom centrado en la foto: la foto daba tirones y saltaba al soltar un dedo.',
   'Transformación escrita en la capa con requestAnimationFrame, touch-action:none, zoom entre los dedos y muelle al pasarse de los bordes; pruebas/perfil-datos.mjs sección N.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
