-- == VIDEOJUEGOSZARAGOZA ====================================================
-- PRUEBAS de 20261018110000_pedidos_idempotencia.sql
-- SOLO para una base de pruebas (rama de Supabase o copia local) con las migraciones ya aplicadas.
-- NO ejecutar en producción: aunque todo termina con ROLLBACK, los pedidos de prueba consumen
-- números de la secuencia de pedidos y dejarían huecos en la numeración.
--
-- Uso:  psql "$URL_BASE_DE_PRUEBAS" -v ON_ERROR_STOP=1 -f supabase/tests/crear_pedido_idempotente.sql
-- Si todo va bien, termina mostrando «TODAS LAS PRUEBAS OK». Si alguna falla, para con su mensaje.
--
-- Parte 1 (este archivo): lógica de idempotencia, en una sola sesión.
-- Parte 2 (al final, en comentarios): concurrencia real con dos sesiones psql.
-- ============================================================================

begin;

-- Datos de prueba (se deshacen con el ROLLBACK final).
insert into public.products (id, title, price_eur, status, is_active) values
  ('00000000-0000-4000-8000-0000000000a1', 'Prueba A', 100.00, 'PUBLISHED', true),
  ('00000000-0000-4000-8000-0000000000a2', 'Prueba B', 50.50, 'PUBLISHED', true),
  ('00000000-0000-4000-8000-0000000000a3', 'Prueba oculta', 10.00, 'DRAFT', true);

-- Simula un cliente con sesión: el rol authenticated y su identificador en el token.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

do $$
declare
  datos jsonb := '{"nombre":"Cliente Prueba","email":"prueba@example.com","telefono":"600000000","entrega":"recogida"}';
  clave uuid := '22222222-2222-4222-8222-222222222222';
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  n_pedidos int;
  n_items int;
begin
  -- T1: primera llamada crea el pedido.
  r1 := public.crear_pedido_idempotente(clave, datos, array['00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2']::uuid[]);
  assert (r1->>'repetido')::boolean = false, 'T1: la primera llamada no debe ser repetida';
  select count(*) into n_pedidos from public.pedidos where clave_unica = clave;
  select count(*) into n_items from public.pedido_items i join public.pedidos p on p.id = i.pedido_id where p.clave_unica = clave;
  assert n_pedidos = 1, 'T1: debe haber 1 pedido';
  assert n_items = 2, 'T1: debe haber 2 artículos';
  assert (select total_eur from public.pedidos where clave_unica = clave) = 150.50, 'T1: total 150,50 calculado con los precios de la base de datos';

  -- T2: reintento con la misma clave y el carrito en otro orden: mismo número, nada nuevo.
  r2 := public.crear_pedido_idempotente(clave, datos, array['00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a1']::uuid[]);
  assert (r2->>'repetido')::boolean = true, 'T2: el reintento debe marcarse repetido';
  assert r2->>'numero' = r1->>'numero', 'T2: el reintento devuelve el mismo número';
  select count(*) into n_pedidos from public.pedidos where clave_unica = clave;
  select count(*) into n_items from public.pedido_items i join public.pedidos p on p.id = i.pedido_id where p.clave_unica = clave;
  assert n_pedidos = 1 and n_items = 2, 'T2: sigue habiendo 1 pedido y 2 artículos';

  -- T3: la misma clave con otro carrito falla.
  begin
    perform public.crear_pedido_idempotente(clave, datos, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
    raise exception 'T3: debía fallar';
  exception when others then
    assert sqlerrm like '%ya se usó con otro pedido%', 'T3: mensaje inesperado: ' || sqlerrm;
  end;

  -- T4: otra clave con el mismo carrito es otra operación: crea otro pedido con el número siguiente (sin huecos por el reintento).
  r3 := public.crear_pedido_idempotente('33333333-3333-4333-8333-333333333333', datos, array['00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2']::uuid[]);
  assert (r3->>'repetido')::boolean = false, 'T4: clave nueva = pedido nuevo';
  assert (r3->>'numero')::bigint = (r1->>'numero')::bigint + 1, 'T4: el reintento T2 no consumió ningún número';

  -- T5: sin clave falla.
  begin
    perform public.crear_pedido_idempotente(null, datos, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
    raise exception 'T5: debía fallar';
  exception when others then
    assert sqlerrm like '%falta la clave%', 'T5: mensaje inesperado: ' || sqlerrm;
  end;

  -- T6: carrito sin productos disponibles falla y no deja ningún pedido con esa clave.
  begin
    perform public.crear_pedido_idempotente('44444444-4444-4444-8444-444444444444', datos, array['00000000-0000-4000-8000-0000000000a3']::uuid[]);
    raise exception 'T6: debía fallar';
  exception when others then
    assert sqlerrm like '%productos no disponibles%', 'T6: mensaje inesperado: ' || sqlerrm;
  end;
  assert not exists (select 1 from public.pedidos where clave_unica = '44444444-4444-4444-8444-444444444444'), 'T6: no debe quedar pedido';

  -- T7: entrega no válida y carrito vacío fallan.
  begin
    perform public.crear_pedido_idempotente('55555555-5555-4555-8555-555555555555', '{"entrega":"dron"}'::jsonb, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
    raise exception 'T7a: debía fallar';
  exception when others then
    assert sqlerrm like '%entrega no válida%', 'T7a: mensaje inesperado: ' || sqlerrm;
  end;
  begin
    perform public.crear_pedido_idempotente('55555555-5555-4555-8555-555555555555', datos, array[]::uuid[]);
    raise exception 'T7b: debía fallar';
  exception when others then
    assert sqlerrm like '%pedido sin productos%', 'T7b: mensaje inesperado: ' || sqlerrm;
  end;
end $$;

-- T8: otra persona con la clave de la primera no puede recuperar su pedido.
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.crear_pedido_idempotente('22222222-2222-4222-8222-222222222222', '{"nombre":"Otra Persona","email":"otra@example.com","telefono":"611111111","entrega":"recogida"}'::jsonb, array['00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2']::uuid[]);
    raise exception 'T8: debía fallar';
  exception when others then
    assert sqlerrm like '%ya se usó con otro pedido%', 'T8: mensaje inesperado: ' || sqlerrm;
  end;
end $$;

-- T9: el permiso: un visitante sin sesión (anon) puede llamar a la función, y la antigua sigue existiendo y funcionando.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$
declare
  r jsonb;
  numero_antiguo bigint;
begin
  r := public.crear_pedido_idempotente('77777777-7777-4777-8777-777777777777', '{"nombre":"Visitante","email":"visita@example.com","telefono":"622222222","entrega":"recogida"}'::jsonb, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
  assert (r->>'repetido')::boolean = false, 'T9: el visitante sin sesión crea su pedido';
  r := public.crear_pedido_idempotente('77777777-7777-4777-8777-777777777777', '{"nombre":"Visitante","email":"visita@example.com","telefono":"622222222","entrega":"recogida"}'::jsonb, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
  assert (r->>'repetido')::boolean = true, 'T9: y su reintento es repetido';
  numero_antiguo := public.crear_pedido('{"nombre":"Antiguo","email":"viejo@example.com","telefono":"633333333","entrega":"recogida"}'::jsonb, array['00000000-0000-4000-8000-0000000000a1']::uuid[]);
  assert numero_antiguo is not null, 'T9: la función antigua sigue funcionando';
end $$;

reset role;
select 'TODAS LAS PRUEBAS OK' as resultado;

rollback;

-- ============================================================================
-- PARTE 2: concurrencia real (dos sesiones psql contra la misma base de pruebas).
-- Hay que ejecutarla a mano porque necesita dos conexiones a la vez. La misma clave en las dos.
-- Antes: insertar a mano un producto publicado (id 00000000-0000-4000-8000-0000000000b1) y confirmarlo.
--
-- SESIÓN A (lanzar primero):
--   begin;
--   select public.crear_pedido_idempotente('88888888-8888-4888-8888-888888888888',
--     '{"nombre":"Carrera","email":"carrera@example.com","telefono":"644444444","entrega":"recogida"}'::jsonb,
--     array['00000000-0000-4000-8000-0000000000b1']::uuid[]);
--   select pg_sleep(8);      -- retiene el bloqueo 8 s antes de confirmar
--   commit;
--
-- SESIÓN B (1 o 2 s después de lanzar A, mientras A duerme):
--   select public.crear_pedido_idempotente('88888888-8888-4888-8888-888888888888',
--     '{"nombre":"Carrera","email":"carrera@example.com","telefono":"644444444","entrega":"recogida"}'::jsonb,
--     array['00000000-0000-4000-8000-0000000000b1']::uuid[]);
--   -- Resultado esperado: B se queda esperando hasta que A confirma (~6 s) y entonces devuelve
--   -- {"numero": N, "repetido": true} con el MISMO N que A. Nunca dos pedidos.
--
-- COMPROBACIÓN FINAL (solo lectura):
--   select count(*), count(distinct numero) from public.pedidos where clave_unica = '88888888-8888-4888-8888-888888888888';
--   -- Esperado: 1 | 1
--
-- Prueba de carga opcional: lanzar 20 sesiones a la vez con la misma clave
--   for i in $(seq 1 20); do psql "$URL" -Atc "select public.crear_pedido_idempotente(...)" & done; wait
-- y comprobar que hay un único pedido con esa clave y que solo una respuesta tiene repetido = false.
--
-- LIMPIEZA de la Parte 2 (solo en la base de pruebas, a mano): los pedidos y el producto de la prueba.
-- ============================================================================
