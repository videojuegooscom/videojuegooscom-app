-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Claude ejecuta, el dueño solo da la orden»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Claude ejecuta, el dueño solo da la orden', 'general', 1,
   'El dueño da la orden y Claude la ejecuta entera sin pasarle tareas: publicar, aplicar migraciones, comprobar y volver a publicar en Vercel (para que lea variables nuevas, Claude publica un cambio en main, que lanza la publicación de Production). Al dueño solo se le pide lo que Claude no puede hacer por seguridad: poner secretos o claves, y cambios reservados (infraestructura, dependencias).',
   'Pedir al dueño que haga Redeploy en Vercel tras poner una variable.', 'Claude publica un cambio en main, comprueba que la publicación de Production está Ready y avisa.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
