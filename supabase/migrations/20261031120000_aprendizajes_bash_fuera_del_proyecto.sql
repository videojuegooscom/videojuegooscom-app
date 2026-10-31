-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-10-31 — un «ls /usr/local/bin» le sacó al dueño una ventana «Permitir / Denegar» en el
--            móvil mientras Claude estudiaba el servidor para el sistema de auditoría.
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Nada de Bash fuera del proyecto: cada comando así es una ventana en el móvil del dueño', 'codigo', 1,
   'El guardián solo da por buena sin preguntar la lectura demostrable DENTRO del proyecto (y de las carpetas añadidas). Cualquier Bash que mire fuera (ls /usr/local/bin, which, systemctl, crontab, journalctl, versiones de programas del sistema…) le saca al dueño una ventana «Permitir / Denegar» en el móvil, aunque sea inofensivo. Para conocer el servidor: lo que ya está en el repo (infraestructura/, vercel.json), la memoria, la herramienta Read sobre archivos concretos (por ejemplo /etc/claude-code) y lo que diga el dueño; si de verdad hace falta un dato del sistema, se le da el comando para Termius en TRABAJO PENDIENTE en vez de lanzarlo.',
   'Lanzar «ls /usr/local/bin», «which claude» y «systemctl list-timers» para estudiar el servidor: el dueño recibe ventanas de permiso en el móvil.',
   'Leer infraestructura/claude-code/README.md y la memoria del servidor con Read, y pedir al dueño en Termius «systemctl list-timers» si hace falta.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
