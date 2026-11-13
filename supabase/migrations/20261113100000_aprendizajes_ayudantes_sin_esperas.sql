-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-13 (al dueño le saltó en el móvil «Bash quiere ejecutar: tail --pid=… -f /dev/null»,
--            un ayudante esperando a que acabara una prueba, y preguntó «¿por qué me pides tanto permitir?»).
-- Qué hace: apunta la lección «Los ayudantes nunca esperan con comandos (tail --pid, sleep, wait)».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los ayudantes nunca esperan con comandos (tail --pid, sleep, wait)', 'codigo', 1,
   'Ni Claude ni sus ayudantes esperan a que termine un proceso con comandos como «tail --pid=N -f /dev/null», sleep, wait o bucles: no están en la política, abren una ventana de «Permitir» en el móvil del dueño y además incumplen «Sin bucles de espera». Las pruebas largas se lanzan en primer plano con un tiempo máximo amplio o en segundo plano esperando el aviso de que han terminado, y su salida se lee después con la herramienta Read. Cada encargo a un ayudante lo dice expresamente.',
   'Un ayudante ejecuta «tail --pid=3465489 -f /dev/null» para esperar a la pasada de pruebas: al dueño le sale «Permitir una vez» en el móvil.',
   'La pasada se lanza en segundo plano y, cuando llega el aviso de que ha terminado, se lee su archivo de salida con Read.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
