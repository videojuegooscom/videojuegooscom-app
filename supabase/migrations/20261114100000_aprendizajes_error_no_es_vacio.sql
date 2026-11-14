-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (al dueño le salió «Mi perfil» vacío al abrir la app por la mañana: una lectura
--            fallida por la sesión se mostró como «no hay datos», con «Guardar» activo).
-- Qué hace: apunta la lección «Un error al leer no es "no hay datos": nunca formulario vacío ni guardar».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx);
--           components/PerfilPublico.tsx y lib/supabase.ts (sesionActual, esErrorDeSesion, alVolverALaTienda).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un error al leer no es «no hay datos»: nunca formulario vacío ni guardar', 'codigo', 1,
   'Cuando una pantalla del cliente lee sus datos (perfil, dirección, preferencias…) y la lectura falla (401/403, permiso denegado, red), no se enseña el formulario vacío como si no tuviera datos ni se deja «Guardar», que borraría lo que tiene. Se renueva la sesión y se reintenta una vez; si sigue fallando, «No hemos podido cargar tus datos · Reintentar» y guardar bloqueado. Se vuelve a leer al iniciar sesión, al renovarse la sesión y al volver a la tienda. Antes de culpar al cliente o a los datos, mirar en edge_logs y auth_logs qué recibió su app.',
   '«Mi perfil» sale vacío con «Guardar» activo porque la lectura dio 401 tras dormir la app toda la noche.',
   'La lectura da 401: se renueva la sesión y se reintenta; si sigue mal, «No hemos podido cargar tus datos · Reintentar» y no se puede guardar.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
