-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones de la tienda solo online (sin dirección pública; entregas y plazos) y de cómo escribir
--            páginas para personas que además entiendan Google y las IA («Quiénes somos»).
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('La tienda es solo online: sin dirección pública', 'negocio', 1,
   'Videojuegoszaragoza.com no tiene tienda física y el dueño no quiere ninguna dirección a la vista (2026-10-28). Nunca se escribe «tienda física», «recoger en tienda» ni una calle en pantallas, textos, Blue o datos para Google; el domicilio fiscal solo va en los textos legales (lo exige la ley). Entregas reales: en Zaragoza, a domicilio el mismo día o en mano en Cuarte de Huerva; al resto de España el pedido sale del almacén en 1-2 días y llega en 72 horas como máximo. En la base de datos la entrega en mano sigue siendo entrega = «recogida»; en pantalla se llama «Entrega en mano».',
   'Ofrecer «Recogida en tienda» con icono de tienda o poner la calle de las entregas en una página pública.', '«Entrega en mano» en Cuarte de Huerva y «En Zaragoza, el mismo día», sin calle ni número.'),
  ('Páginas para personas, datos aparte para Google y las IA', 'textos', 1,
   'Las páginas se escriben para que una persona las lea a gusto: cercanas, concretas, con párrafos cortos, sin frases hechas («líderes del sector») ni palabras repetidas para Google, y con un siguiente paso claro al final. Lo que necesitan Google y las IA va aparte y no se ve: datos estructurados de la tienda (JSON-LD, tipo OnlineStore, en app/+html.tsx), título y descripción de cada página (components/SiteHead.tsx), el mapa del sitio (api/sitemap.ts), un resumen en <noscript> para quien no ejecuta JavaScript (sin él solo se ve «Cargando tienda…») y public/llms.txt. Todo debe decir lo mismo que la página y solo con datos que haya dado el dueño; la historia y quién está detrás los escribe él.',
   'Un «Quiénes somos» con «tienda de consolas en Zaragoza» repetido diez veces o con una historia inventada.', 'Texto natural en la página y la ficha de la tienda en datos estructurados, con los mismos datos.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
