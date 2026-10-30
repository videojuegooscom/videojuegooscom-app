-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) — todo cambio de la tienda que toque a los clientes tiene su parte en
--            Administración, en la misma PR.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Toda novedad de la tienda tiene su parte en Administración', 'panel', 1,
   'OBLIGATORIO (dueño, 2026-10-30): cada cambio de la tienda que toque a los clientes (datos que rellenan, pantallas o pasos obligatorios nuevos, funciones, avisos) se refleja en la MISMA PR en su apartado de Administración: verlo, contarlo, filtrarlo y medir su uso con la analítica propia (trackEvent). Dentro de lo legal: solo datos que cubre la política de privacidad, edad en vez de fecha de nacimiento, agregados cuando basten y nada de quien rechazó la analítica. Si no hay apartado, va al más afín. Se prueba con el navegador igual que la tienda.',
   'Publicar «Completa tu perfil» en la tienda y que en Administración no se vea quién lo tiene a medias ni cuántos lo abandonan.',
   'Perfil público obligatorio + Administración → Usuarios con foto, «Faltan datos», «Con foto», chips de estado, «Completa tu perfil (30 días)» y la ficha del cliente con su estado.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
