-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-02.
--   El dueño trabaja desde el móvil y el editor de plantillas de Supabase (Authentication → Emails) no le deja pegar
--   texto. Claude no puede cambiar la configuración de Auth (no hay herramienta y su clave no debe verla), así que se le
--   dio un comando de Termius con python3 que usa la API de gestión de Supabase y le pide la clave sin mostrarla.
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Configurar Supabase desde el móvil: comando de Termius, no copiar y pegar', 'general', 2,
   'El dueño usa el móvil: los editores de código del panel de Supabase (plantillas de correo, por ejemplo) no le dejan pegar. Para cambiar la configuración de Authentication (plantillas, SMTP…), que Claude no puede tocar, se le da un comando de Termius en python3 que lee el contenido del repositorio y lo manda a la API de gestión de Supabase (api.supabase.com, PATCH /v1/projects/<ref>/config/auth). La clave (token de acceso) la pide el propio comando con getpass, sin mostrarla ni guardarla, y el comando solo imprime OK o el error, nunca la configuración entera (lleva secretos). Antes se prueba en local la parte que prepara el contenido; después se le pide borrar el token.',
   'Pedirle que copie un HTML largo del chat y lo pegue en el editor del panel desde el móvil.',
   'Un bloque de python3 para Termius que descarga la plantilla del repositorio, pide el token sin mostrarlo, la guarda con la API y dice «OK»; y una captura de «Preview» para comprobarlo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
