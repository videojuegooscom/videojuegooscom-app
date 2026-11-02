-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-02.
--   El dueño trabaja desde el móvil. Claude no puede cambiar la configuración de Auth de Supabase (no hay herramienta y
--   su clave no debe verla). Para la plantilla del correo de contraseña se le dio el texto listo en un bloque del chat
--   (con botón de copiar); al principio el editor del panel no le dejaba pegar, se le dio también un comando de Termius
--   con python3 (API de gestión, clave pedida sin mostrarla) y al final consiguió pegarlo en el panel y guardarlo.
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Configurar Supabase desde el móvil: texto listo para copiar y, si no deja pegar, comando de Termius', 'general', 2,
   'El dueño usa el móvil y la configuración de Authentication de Supabase (plantillas de correo, SMTP…) no la puede tocar Claude. Se le da el contenido listo en un bloque de código del chat (tiene botón de copiar) y los pasos exactos del panel; en el editor de código del panel cuesta pegar desde el móvil (tocar dentro del recuadro y mantener pulsado, o tocar con tres dedos para que salga la barra de pegar). Si aun así no deja, un comando de Termius en python3 que lee el contenido del repositorio y lo manda a la API de gestión (api.supabase.com, PATCH /v1/projects/<ref>/config/auth); la clave la pide el comando con getpass, sin mostrarla, solo imprime OK o el error (nunca la configuración entera, que lleva secretos) y después se le pide borrar el token. Antes se prueba en local la parte que prepara el contenido y al final se comprueba con una captura de «Preview».',
   'Darle solo un enlace a un archivo largo para que lo copie y lo pegue desde el móvil, sin bloque de copiar ni plan B.',
   'Un bloque con la plantilla (botón de copiar), los pasos del panel, el truco para pegar y, por si no deja, el comando de Termius; y una captura de «Preview» para comprobarlo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
