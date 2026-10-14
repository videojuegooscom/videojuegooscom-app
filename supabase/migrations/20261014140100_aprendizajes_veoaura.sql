-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Integraciones con VeoAura sin cruzar proyectos»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Integraciones con VeoAura sin cruzar proyectos', 'seguridad', 1,
   'Para conectar la tienda con VeoAura se trabaja con el contrato que pega el dueño, nunca entrando en el repositorio, el servidor ni las credenciales de VeoAura. El único dato compartido es el secreto del puente, que pone el dueño en Vercel (VEOAURA_ESCAPARATE_SECRETO) y Claude nunca ve. La dirección del receptor va sin www (www redirige y el contrato prohíbe redirecciones).',
   'Leer el repositorio de VeoAura desde el servidor de la tienda.', 'Pedir al dueño el texto del contrato y construir solo el lado de la tienda.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
