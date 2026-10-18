/**
 * pruebas/permisos-chat-sql.mjs — pruebas REALES (SQL en una base aislada) de los permisos de las seis funciones
 * del chat que producción deja ejecutables por PUBLIC.
 *
 * Qué hace: crea una base aislada con las seis funciones (mismas firmas y mismo arranque —comprobar auth.uid()—
 * que las de producción, leídas el 2026-10-18, y con los permisos por defecto de Supabase) y prueba
 * 20261018160000_funciones_chat_sin_public.sql con roles de PostgreSQL reales:
 *  1) CONTROL (sin la migración): las seis tienen «=X/postgres» y un rol cualquiera, sin ningún permiso propio,
 *     las puede ejecutar: el problema es real.
 *  2) Tras la migración: PUBLIC ya no las ejecuta (un rol cualquiera recibe «permission denied»), pero anon,
 *     authenticated y service_role siguen pudiendo y se comportan igual (sin sesión: 0, nada o «Debes iniciar
 *     sesión», como antes), y la lista de permisos queda solo con entradas explícitas.
 *  3) Idempotencia, vuelta atrás exacta (vuelve el permiso de PUBLIC) y volver a aplicar.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/permisos-chat-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/permisos-chat-sql.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const MIG = "supabase/migrations/20261018160000_funciones_chat_sin_public.sql";
const REV = "supabase/rollbacks/20261018160000_funciones_chat_sin_public_revertir.sql";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const U = "11111111-1111-4111-8111-111111111111";
const FUNCIONES = [
  ["delete_chat_for_me", "uuid", `'${U}'`],
  ["get_or_create_product_chat", "uuid", `'${U}'`],
  ["get_or_create_sell_request_chat", "uuid", `'${U}'`],
  ["get_or_create_support_chat", "", ""],
  ["get_unread_chat_count", "", ""],
  ["mark_chat_read", "uuid", `'${U}'`],
];
const como = (base, rol, sql) => db.psql(base, [...(rol === "postgres" ? [] : ["-c", `set role ${rol}`]), "-A", "-t", "-c", sql]).then((s) => s.trim());
const error = async (promesa) => {
  try {
    await promesa;
    return "";
  } catch (e) {
    return String(e.message);
  }
};
const llamar = (base, rol, [nombre, , arg]) => como(base, rol, `select public.${nombre}(${arg})`);
const acl = (base, nombre) => como(base, "postgres", `select p.proacl::text from pg_proc p where p.proname = '${nombre}'`);

// Mismas firmas y mismo arranque que producción (el cuerpo real consulta product_chats; aquí solo hace falta
// lo que decide qué recibe un visitante sin sesión).
const DDL = `
create function public.delete_chat_for_me(p_chat_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if; end $$;
create function public.get_or_create_product_chat(p_product_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then raise exception 'Debes iniciar sesión para escribir por este producto.'; end if; return gen_random_uuid(); end $$;
create function public.get_or_create_sell_request_chat(p_sell_request_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then raise exception 'Debes iniciar sesión para continuar por chat.'; end if; return gen_random_uuid(); end $$;
create function public.get_or_create_support_chat() returns uuid language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then raise exception 'Debes iniciar sesión para escribirnos.'; end if; return gen_random_uuid(); end $$;
create function public.get_unread_chat_count() returns integer language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then return 0; end if; return 3; end $$;
create function public.mark_chat_read(p_chat_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin if auth.uid() is null then return; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'vz_rol_cualquiera') then create role vz_rol_cualquiera nologin; end if; end $$;
grant usage on schema public to vz_rol_cualquiera;
grant usage on schema auth to vz_rol_cualquiera;
`;

async function nueva({ migracion = false } = {}) {
  const b = await db.crearBase();
  await db.psql(b, ["-c", DDL]);
  if (migracion) await db.aplicar(b, [MIG]);
  return b;
}
const sinPublic = async (b) => {
  for (const f of FUNCIONES) if (/(^\{|,)=X\//.test(await acl(b, f[0]))) return false;
  return true;
};

try {
  // 1) CONTROL
  {
    const b = await nueva();
    let conPublic = 0;
    let ejecutan = 0;
    for (const f of FUNCIONES) {
      if (/(^\{|,)=X\//.test(await acl(b, f[0]))) conPublic++;
      // «Ejecutar» = no recibir «permission denied» (puede dar su propio error de sesión, que es la función ejecutándose).
      if (!/permission denied/.test(await error(llamar(b, "vz_rol_cualquiera", f)))) ejecutan++;
    }
    ok(conPublic === 6 && ejecutan === 6, `CONTROL (SIN la migración): las 6 funciones tienen «=X/postgres» y un rol sin ningún permiso propio las ejecuta (${conPublic} con PUBLIC, ${ejecutan} ejecutadas)`);
  }

  // 2) Tras la migración
  {
    const b = await nueva({ migracion: true });
    ok(await sinPublic(b), "la lista de permisos de las 6 funciones ya no tiene la entrada de PUBLIC («=X/…»)");
    for (const f of FUNCIONES) {
      const e = await error(llamar(b, "vz_rol_cualquiera", f));
      ok(/permission denied/.test(e), `${f[0]}: un rol cualquiera recibe «permission denied»`);
    }
    for (const rol of ["anon", "authenticated", "service_role"]) {
      let bien = 0;
      for (const f of FUNCIONES) if (!/permission denied/.test(await error(llamar(b, rol, f)))) bien++;
      ok(bien === 6, `${rol} sigue pudiendo ejecutar las 6 (sin «permission denied»)`);
    }
    ok((await llamar(b, "anon", FUNCIONES[4])) === "0", "get_unread_chat_count sin sesión sigue devolviendo 0");
    ok((await error(llamar(b, "anon", FUNCIONES[5]))) === "", "mark_chat_read sin sesión sigue sin hacer nada (sin error)");
    for (const i of [0, 1, 2, 3]) {
      const e = await error(llamar(b, "anon", FUNCIONES[i]));
      ok(/Debes iniciar sesión/.test(e), `${FUNCIONES[i][0]} sin sesión sigue lanzando «Debes iniciar sesión» (no «permission denied»)`);
    }
    const entradas = await acl(b, "get_unread_chat_count");
    ok(/anon=X/.test(entradas) && /authenticated=X/.test(entradas) && /service_role=X/.test(entradas) && /postgres=X/.test(entradas), `y los permisos explícitos son los de siempre (${entradas})`);
  }

  // 3) Idempotencia y vuelta atrás
  {
    const b = await nueva({ migracion: true });
    const antes = await acl(b, "mark_chat_read");
    await db.aplicar(b, [MIG]);
    ok((await acl(b, "mark_chat_read")) === antes, "repetir la migración no cambia nada (idempotente)");
    await db.aplicar(b, [REV]);
    let conPublic = 0;
    for (const f of FUNCIONES) if (/(^\{|,)=X\//.test(await acl(b, f[0]))) conPublic++;
    ok(conPublic === 6, "vuelta atrás: las 6 recuperan el permiso de PUBLIC que tenían");
    ok(/anon=X/.test(await acl(b, "mark_chat_read")) && /authenticated=X/.test(await acl(b, "mark_chat_read")), "y los permisos explícitos de anon y authenticated siguen intactos");
    await db.aplicar(b, [MIG]);
    ok(await sinPublic(b), "volver a aplicar tras la vuelta atrás deja otra vez las 6 sin PUBLIC");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 800)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
