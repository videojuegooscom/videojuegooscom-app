-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del corte de Supabase por cuota (fotos descargadas por las pruebas) y de comprobar los
--            permisos después de pegar una migración en el SQL Editor.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Las pruebas nunca descargan fotos reales de Supabase', 'codigo', 1,
   'El 2026-10-23 Supabase (plan gratuito) cortó toda la API de la tienda con 402 «Payment Required»: la «Salida en caché» del mes iba por 25,4 de 5 GB. La causa probable fueron las pruebas de navegador: en local (http) SmartImage no puede usar el optimizador de Vercel y pide la foto ORIGINAL al almacenamiento de Supabase, y cada recorrido bajaba decenas de MB. Desde entonces toda prueba de navegador abre Chromium con lanzarNavegador(ok) de pruebas/sin-fotos-reales.mjs (nunca chromium.launch): cada petición de foto (/storage/v1/object, /storage/v1/render y /_vercel/image) se responde con una imagen falsa de 1 × 1 píxel, la ruta gana aunque la prueba añada otras, y si una foto real llega la prueba falla. node pruebas/sin-fotos-reales.mjs (también en pruebas/todas.mjs) comprueba que ninguna prueba abre el navegador por su cuenta y que la protección funciona, con su prueba de la prueba. Cualquier proceso automático que pida fotos (crons, auditorías, scripts) debe pensar en la cuota de salida.',
   'Una prueba nueva con chromium.launch() que deja pasar las fotos: cada ejecución baja decenas de MB del almacenamiento y la tienda acaba cortada a final de mes.', 'Abrir el navegador con lanzarNavegador(ok) y ver en la salida «ninguna foto real descargada de Supabase».'),
  ('Después de pegar una migración, comprobar los permisos', 'seguridad', 1,
   'Cuando el dueño pega una migración en el SQL Editor de Supabase (las que tocan permisos o auth las aplica él), «Success» no garantiza que se ejecutara entera: el 2026-10-22 la de limite_peticiones quedó sin sus dos últimas líneas (revoke y grant) y la función se podía ejecutar sin sesión. Después de cada una, Claude comprueba por catálogo, solo leyendo, que todo quedó como dice el archivo: pg_proc.proacl de cada función, pg_class.relacl y relrowsecurity de cada tabla, information_schema.role_table_grants y pg_policies (has_function_privilege y pg_database_size los bloquea el guardián). Al dueño se le pide pegar el archivo entero desde el enlace raw de GitHub, comprobar que la última línea del editor es la última del archivo y que no hay texto seleccionado al pulsar Run. Si falta algo, se vuelve a pegar entero: las migraciones son repetibles.',
   'Dar por aplicada una migración porque el SQL Editor dijo «Success. No rows returned».', 'Leer proacl y ver {postgres=X/postgres,service_role=X/postgres} antes de decir que está hecho.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
