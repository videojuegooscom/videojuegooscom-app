-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-11 (la vista previa de la PR #227 falló en Vercel: «No more than 12 Serverless
--            Functions can be added to a Deployment on the Hobby plan» al añadir api/reparacion-archivo.ts).
-- Qué hace: apunta la lección «Vercel gratis: como mucho 12 funciones en api/».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx); la carpeta api/.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Vercel gratis: como mucho 12 funciones en api/', 'codigo', 1,
   'El plan gratis (Hobby) de Vercel admite como máximo 12 funciones por despliegue, y cada archivo de api/ es una. Con 13 la vista previa falla («exceeded_serverless_functions_per_deployment») aunque tsc, lint, build y las pruebas locales pasen. Antes de crear un archivo nuevo en api/ se cuentan los que hay; si ya son 12, lo nuevo va dentro de la función más afín con un parámetro (como ?solicitud= en api/factura.ts) y se dice en su cabecera. Si la vista previa falla, se mira el errorCode del despliegue (get_deployment) antes de suponer nada.',
   'Crear api/reparacion-archivo.ts como función número 13: la vista previa falla y la PR no se puede publicar.',
   'Descargas de la reparación por envío dentro de api/factura.ts con ?solicitud=…&tipo=…, y la cabecera lo explica.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
