-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones sobre el buscador de Inicio, los botones destacados y los formularios
-- Qué hace: corrige la lección «Todo al alcance del pulgar derecho» (el buscador de Inicio va
--           SIEMPRE arriba por defecto, lo pidió el dueño) y añade dos lecciones nuevas.
-- Tipo:     actualiza el texto de una lección y añade otras si no existen. No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = 'La tienda se usa con un solo dedo, el pulgar de la mano derecha: lo que se toca a menudo va abajo y a la derecha (botón de volver arriba a la derecha, botón «Volver» flotante en las páginas de lectura, selector de pestañas del Foro encima de enviar) y mide al menos 44 px. Excepción pedida por el dueño: el buscador de Inicio va SIEMPRE arriba por defecto (se puede arrastrar abajo). Las acciones no dependen de gestos de dos dedos: mover algo = mantener pulsado y arrastrar con un dedo.',
    ejemplo_bien = '«Volver arriba» y «Volver» abajo a la derecha, objetivos de 46-52 px y el buscador de Inicio arriba.'
where titulo = 'Todo al alcance del pulgar derecho';

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Botones principales de Inicio destacados con medida', 'diseno', 2,
   '«Ver categorías» y «Vender ahora» llaman la atención con tamaño, icono, sombra azul y una respiración muy suave; nunca con brillos ni destellos, que son de «Oferta de la semana». Así cada apartado conserva su efecto y el cliente sabe por dónde empezar.',
   'Poner a los dos botones el mismo brillo que «Oferta de la semana».', 'Botón más alto con icono y sombra azul que respira suavemente.'),
  ('Formularios en rejilla, no en columna', 'diseno', 2,
   'Los formularios aprovechan el ancho: campos cortos en filas de 2 columnas en el móvil y hasta 3 en pantallas anchas (Nombre | Apellido | Género); los textos largos (artículo, dirección, fotos) ocupan toda la fila. Se agrupa con sentido y los recuadros quedan alineados abajo.',
   'Un campo por fila, con el formulario larguísimo en el móvil.', 'Nombre | Apellido, Género | Ciudad, artículo a todo el ancho…')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
