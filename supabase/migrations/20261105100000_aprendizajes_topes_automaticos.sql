-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-05. Claude propuso pegar los topes de la analítica tal cual y «si ves que crecen las
--            visitas, me dices "sube el tope" y lo amplío». El dueño: «Yo no tengo por qué decirte nada, quiero que
--            automáticamente se haga, si hay que subir el tope de la analítica».
-- Qué hace: apunta la lección «Topes y límites que se ajustan solos: el dueño no tiene que vigilarlos».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Topes y límites que se ajustan solos: el dueño no tiene que vigilarlos', 'general', 1,
   'Cuando la tienda pone un tope o un límite (analítica, reservas, peticiones, mensajes…), no se le pide al dueño que avise si hay que subirlo: el tope se ajusta solo con el uso real (por ejemplo, 3 veces el día con más movimiento del último mes, con un mínimo de partida y un techo para que un ataque sostenido no lo haga crecer sin fin), lo que se pasa del tope no rompe la tienda (no se guarda y se cuenta) y Administración enseña el tope de hoy y lo cortado. La regla vive en la base de datos y el panel usa la misma. Se prueba en una base aislada que el tope sube solo tras un día lleno, que respeta el techo y que lo cortado se cuenta (pruebas/analitica-sql.mjs).',
   'Topes fijos de 120 eventos por minuto y 20.000 al día con «si ves que crecen las visitas, me dices "sube el tope" y lo amplío».',
   'analitica_topes(): el mayor de 20.000 y 3 × el día con más eventos del último mes (como mucho 200.000), por minuto el diario × 20 / 1.440 (mínimo 300) y 120 por sesión; lo cortado se cuenta en analitica_ritmo y Administración → Analítica lo enseña.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
