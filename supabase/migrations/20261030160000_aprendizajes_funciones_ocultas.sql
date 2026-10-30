-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) — «Tu perfil» se hizo el 2026-10-22 pero nunca se vio porque su tabla
--            esperaba una migración que tenía que pegar él, y el aviso se perdió entre otros pendientes.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Una función oculta esperando una migración se recuerda hasta que se aplica', 'general', 1,
   'Si una función ya está publicada pero no se ve porque espera una migración que tiene que aplicar el dueño (p. ej. permisos delicados que pega él en el SQL Editor), para el dueño NO está hecha. Se le dice claro qué no se ve y por qué, se le da el SQL listo para pegar (un solo archivo, idempotente) y se repite en TRABAJO PENDIENTE de cada respuesta, con lo que desbloquea, hasta comprobar que está aplicada (to_regclass, columnas, políticas). Pasó con «Tu perfil» (perfiles_cliente): hecho el 2026-10-22 y sin ver hasta el 2026-10-30.',
   'Dejar «migración pendiente» en una lista larga una vez y no volver a mencionarla.', 'En cada respuesta: «Pega 20261030150000_perfiles_cliente_completo.sql en Supabase → SQL Editor: sin eso no se ve el Perfil público ni se exige».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
