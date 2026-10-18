-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Probar formularios de punta a punta sin ensuciar la base de datos»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Probar formularios de punta a punta sin ensuciar la base de datos', 'codigo', 1,
   'Un formulario se prueba entero con el navegador de pruebas: abrir cada desplegable, elegir cada opción, cambiar de opinión, ver los campos condicionales, llegar al 100 % y enviar, en móvil (390 px) y en ancho (1024 px). El envío se intercepta con page.route para responder en falso y NO crear datos reales (hay que probar contra la tienda real sin dejar solicitudes de prueba). Después se miran las capturas: textos cortados, huecos raros y desplegables abiertos.',
   'Dar por bueno un formulario porque compila, sin abrir sus desplegables ni ver las capturas (el correo salía cortado en el móvil).', 'Recorrer el flujo con el envío interceptado, ver las capturas y corregir lo que salga cortado.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
