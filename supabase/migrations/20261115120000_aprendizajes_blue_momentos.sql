-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 12 «Blue en momentos clave», aprobada por el dueño).
-- Qué hace: apunta la lección «Consejos de Blue en los primeros momentos: una vez por dispositivo, en la misma cola de
--           mensajes y sin tapar nunca los botones de comprar».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                components/Campanita.tsx (ConsejoBlue, sitioConsejo, NO_TAPAR), app/admin/analytics.tsx
--                (#analitica-consejos) y pruebas/perfil-datos.mjs (sección MOMB).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Consejos de Blue en los primeros momentos: una vez por dispositivo, en la misma cola y sin tapar los botones de comprar', 'codigo', 2,
   'Los consejos de primeros momentos (primera vez en la cesta con artículos, el catálogo, una ficha, el primer «Comparar» y la cuenta recién creada) reutilizan a Blue (components/Campanita.tsx): pasan por la MISMA cola de «decir» que sus mensajes (15 s tras entrar, 15 s entre uno y otro; el que pide un toque, como «Comparar», no espera los 15 s de leer la pantalla), nunca dos a la vez ni con la guía abierta, y quedan dichos AL ENSEÑARSE (consejo:<momento> en DICHOS_KEY). Van en su propia tarjeta (ConsejoBlue) porque Blue no sale en la cesta ni en el catálogo; la tarjeta mide en cada momento lo que no puede tapar (NO_TAPAR: «Comprar ya», «Añadir a la cesta», «Ir a pagar», la barra de comparar, el «Volver», las pestañas) y va abajo, si no arriba, y si no hay hueco se esconde hasta que lo haya. X de 44 px y «No volver a mostrar consejos» (también en «Mis avisos» del panel de Blue), que apaga SOLO los consejos: los avisos de pedido, precio y valoración siguen. Formas de pago solo si GET /api/pago dice que el pago online está activo. Analítica solo con el momento (consejo_mostrado / _seguido / _cerrado, consejos_desactivados) y su tarjeta en Administración → Analítica.',
   'Un globo nuevo con su propio temporizador que sale a la vez que el mensaje de Blue, tapa «Comprar ya», vuelve en cada visita y, al apagarlo, también se dejan de ver los avisos del pedido.',
   'Primera vez en la cesta: a su turno sale «Tu compra en 3 pasos · 1 Revisa tu cesta · 2 Tus datos de entrega · 3 Paga seguro (tarjeta, Apple Pay o Google Pay)» con «Ir a pagar» y «Ahora no», encima de las pestañas y sin tapar «Ir a pagar»; al recargar ya no sale y Analítica cuenta «Primera compra (cesta): mostrados 1 · seguidos 1».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
