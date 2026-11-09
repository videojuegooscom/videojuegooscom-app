-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-04. Claude le recomendó al dueño activar «Leaked password protection» en Supabase sin
--            comprobar si su plan lo incluye; cuando el dueño pidió los pasos, la documentación decía que solo está en el
--            plan Pro y superiores (la tienda está en el plan gratuito).
-- Qué hace: apunta la lección de mirar el plan antes de recomendar un ajuste de Supabase o Vercel.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Antes de recomendar un ajuste de Supabase o Vercel, mirar si el plan lo incluye y qué toca en la tienda', 'general', 1,
   'Antes de pedirle al dueño que active o cambie algo en el panel de Supabase, Vercel u otro servicio (o de ponerlo en TRABAJO PENDIENTE o en RECOMENDACIONES), Claude comprueba en la documentación oficial (search_docs de Supabase, documentación de Vercel) dónde está, si su plan lo incluye (Supabase y Vercel están en planes gratuitos) y si la tienda tiene que cambiar algo para que cuadre (textos, comprobaciones, mensajes de error en español). Si es de pago, se dice claramente, con qué plan y qué más aporta, y se ofrece lo que sí se puede hacer gratis. Los avisos del asesor de Supabase (get_advisors) no dicen si la solución es de pago: hay que mirarlo.',
   'Poner «Activa Leaked password protection en Supabase → Authentication (lo cambias tú)» en TRABAJO PENDIENTE sin saber que solo está en el plan Pro, y que el dueño lo descubra al buscarlo.',
   'Mirar antes la documentación («Leaked password protection is available on the Pro Plan and above»), decirle que es del plan Pro y qué más trae, y ofrecer lo gratis (por ejemplo, subir el mínimo de contraseña adaptando antes la tienda, que pide 6).')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
