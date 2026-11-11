-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Bizum en el pago online (Stripe). Dueño, 2026-11-11: «añade Bizum de Stripe».
-- Qué hace:
--   1) Privacidad, «Con quién compartimos tus datos»: si el cliente paga con Bizum, escribe su móvil de Bizum en la
--      página de pago de Stripe y aprueba el pago en la app de su banco; Bizum y su banco tratan esos datos. Hasta que
--      esta frase exista, api/pago.ts no ofrece Bizum (primero la privacidad). Solo si la privacidad aún no nombra Bizum.
--   2) Términos, «Precios y pago»: «Si pagas con tarjeta o con Klarna (…)» pasa a nombrar también Bizum. Solo si la frase
--      sigue como la dejó 20261106150000_politicas_klarna_envios (lo que el dueño haya editado no se toca).
--      La política «Reparación por envío» ya dice «con tarjeta, Bizum o transferencia, según lo que veas allí»: sigue
--      siendo correcta y no se toca.
--   3) Con qué se pagó online, según Stripe: pedidos.pago_metodo y, en las reparaciones, service_requests.pago_metodo
--      (la reparación o la vuelta) y etiqueta_pago_metodo (la etiqueta): 'card', 'klarna' o 'bizum'. Las escribe solo el
--      servidor (api/pago.ts) tras preguntárselo a Stripe; los valores de pago_modo no cambian. Un cliente no puede
--      escribirlas: en pedidos no tiene regla para cambiar, y en sus solicitudes el disparador
--      reparacion_envio_cliente_cambia solo le deja tocar sus columnas libres (estas no lo son).
-- Conectado con: public.policy_pages (privacidad y términos), public.pedidos, public.service_requests; api/pago.ts,
--           app/checkout.tsx, app/(tabs)/perfil.tsx, app/admin/pedidos.tsx, app/admin/services.tsx,
--           app/admin/analytics.tsx, pruebas/perfiles-sql.mjs y pruebas/pago-api.mjs.
-- Tipo:     aditiva: 3 columnas nulas con su comprobación y texto de dos políticas. No borra nada, no cambia permisos ni
--           crea funciones. Se puede aplicar varias veces (la segunda no cambia nada).
-- ============================================================================

-- 1) Política de privacidad: Bizum.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si eliges pagar con Bizum, escribes tu número de móvil de Bizum en la página de pago de Stripe y apruebas el pago en la app de tu banco: Stripe, Bizum, S.L. y tu banco tratan esos datos para hacer el pago, según sus propias condiciones de privacidad; nosotros solo sabemos, por Stripe, si el pago se ha hecho, y para todo lo demás de esta política cuenta igual que pagar con tarjeta.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and p.sections::text not like '%Bizum%';

-- 2) Términos y condiciones: Bizum junto a la tarjeta y Klarna.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Precios y pago'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                          replace(s.sec ->> 'body',
                            'Si pagas con tarjeta o con Klarna (que permite pagar a plazos; la aprobación y sus condiciones las pone Klarna), lo haces',
                            'Si pagas con tarjeta, con Bizum o con Klarna (que permite pagar a plazos; la aprobación y sus condiciones las pone Klarna), lo haces')))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and p.sections::text not like '%Bizum%'
  and exists (
        select 1 from jsonb_array_elements(p.sections) as s (sec)
        where s.sec ->> 'heading' = 'Precios y pago'
          and s.sec ->> 'body' like '%Si pagas con tarjeta o con Klarna (que permite pagar a plazos;%');

-- 3) Con qué se pagó online (según Stripe).
alter table if exists public.pedidos add column if not exists pago_metodo text;
alter table if exists public.service_requests add column if not exists pago_metodo text;
alter table if exists public.service_requests add column if not exists etiqueta_pago_metodo text;

do $$
begin
  if to_regclass('public.pedidos') is not null then
    comment on column public.pedidos.pago_metodo is 'Con qué se pagó online, según Stripe: card, klarna o bizum. Solo lo escribe api/pago.ts.';
    if not exists (select 1 from pg_constraint where conname = 'pedidos_metodo_pago_valido' and conrelid = 'public.pedidos'::regclass) then
      alter table public.pedidos add constraint pedidos_metodo_pago_valido check (pago_metodo is null or pago_metodo in ('card', 'klarna', 'bizum'));
    end if;
  end if;
  if to_regclass('public.service_requests') is not null then
    comment on column public.service_requests.pago_metodo is 'Con qué se pagó online la reparación o la vuelta, según Stripe: card, klarna o bizum. Solo lo escribe api/pago.ts.';
    comment on column public.service_requests.etiqueta_pago_metodo is 'Con qué se pagó online la etiqueta, según Stripe: card, klarna o bizum. Solo lo escribe api/pago.ts.';
    if not exists (select 1 from pg_constraint where conname = 'service_requests_metodo_pago_valido' and conrelid = 'public.service_requests'::regclass) then
      alter table public.service_requests add constraint service_requests_metodo_pago_valido check (
        (pago_metodo is null or pago_metodo in ('card', 'klarna', 'bizum'))
        and (etiqueta_pago_metodo is null or etiqueta_pago_metodo in ('card', 'klarna', 'bizum')));
    end if;
  end if;
end;
$$;
