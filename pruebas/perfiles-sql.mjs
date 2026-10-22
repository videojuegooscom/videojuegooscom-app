/**
 * pruebas/perfiles-sql.mjs — prueba la migración de datos de perfil (supabase/migrations/20261022100000_perfiles_cliente.sql)
 * en un PostgreSQL LOCAL y de usar y tirar. NUNCA toca producción: arranca su propio servidor en 127.0.0.1, con una base nueva
 * y un esqueleto mínimo de Supabase (roles anon/authenticated, auth.uid(), is_admin(), touch_updated_at), y al terminar lo para
 * y borra su carpeta de datos.
 *
 * Comprueba (con roles y «token» de verdad, no solo leyendo el SQL):
 *  - La migración se aplica y se puede repetir sin error (idempotente).
 *  - Permisos: visitantes (anon) y PUBLIC no tocan nada; los clientes leen, crean y editan pero NO borran.
 *  - Cada cliente solo ve, crea y edita SU fila; el administrador lee todas y no puede editar ni crear las de otros.
 *  - Reglas de los datos: usuario único sin distinguir mayúsculas y con formato; edad mínima 14 años; largos; campos vacíos.
 *  - Al borrar la cuenta desaparece su fila.
 *  - «Prueba de las pruebas»: con una versión rota de la migración (cualquiera lee todas las filas) la comprobación de
 *    privacidad FALLA, así que de verdad detecta el problema.
 *
 * Uso: node pruebas/perfiles-sql.mjs [carpeta_temporal]      (por defecto, una carpeta nueva en el directorio temporal)
 * Requisitos: embedded-postgres y pg (instalados en el servidor sin guardarlos en package.json).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

const RAIZ = resolve(".");
const NATIVO = join(RAIZ, "node_modules/@embedded-postgres/linux-x64/native");
const MIGRACION = readFileSync("supabase/migrations/20261022100000_perfiles_cliente.sql", "utf8");
const PUERTO = 55451;

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

// --- servidor local -----------------------------------------------------------------------------------------------
const base = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), "vz-perfiles-")));
mkdirSync(base, { recursive: true });
const libs = join(base, "lib");
mkdirSync(libs, { recursive: true });
// Los binarios traen las librerías con su versión completa y buscan el nombre corto: se enlazan (sin ejecutar scripts de instalación).
for (const f of readdirSync(join(NATIVO, "lib"))) {
  const m = /^(.*\.so\.\d+)\.\d+(\.\d+)?$/.exec(f);
  if (m && !existsSync(join(libs, m[1]))) symlinkSync(join(NATIVO, "lib", f), join(libs, m[1]));
}
const entorno = { ...process.env, LD_LIBRARY_PATH: `${libs}:${join(NATIVO, "lib")}` };
const bin = (n) => join(NATIVO, "bin", n);
const datos = join(base, "datos");

let servidorArrancado = false;
const parar = () => {
  if (!servidorArrancado) return;
  try {
    execFileSync(bin("pg_ctl"), ["stop", "-D", datos, "-m", "immediate"], { env: entorno, stdio: "ignore" });
  } catch {
    // ya estaba parado
  }
  servidorArrancado = false;
};

const ESQUELETO = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $f$;
-- Permisos por defecto de Supabase: toda tabla nueva en public es accesible a anon, authenticated y service_role.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role text not null default 'user');
alter table public.profiles enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $f$;
create function public.touch_updated_at() returns trigger language plpgsql as $f$
begin new.updated_at = now(); return new; end $f$;
`;

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function nuevaBase(nombre, sql) {
  const admin = new pg.Client({ host: "127.0.0.1", port: PUERTO, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${nombre}`);
  await admin.end();
  const c = new pg.Client({ host: "127.0.0.1", port: PUERTO, user: "postgres", database: nombre });
  await c.connect();
  await c.query(ESQUELETO);
  await c.query(`insert into auth.users (id, email) values ('${U1}', 'u1@example.com'), ('${U2}', 'u2@example.com'), ('${ADMIN}', 'admin@example.com')`);
  await c.query(`insert into public.profiles (id, role) values ('${U1}', 'user'), ('${U2}', 'user'), ('${ADMIN}', 'admin')`);
  await c.query(sql);
  return c;
}

// Ejecuta `consulta` como un rol y una persona concretos (dentro de una transacción que se deshace salvo `confirmar`).
async function como(c, rol, uid, consulta, { confirmar = false } = {}) {
  await c.query("begin");
  try {
    await c.query(`set local role ${rol}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(uid ? { sub: uid, role: rol } : {})]);
    const r = await c.query(consulta);
    await c.query(confirmar ? "commit" : "rollback");
    return { ok: true, filas: r.rows, cuantas: r.rowCount };
  } catch (e) {
    await c.query("rollback");
    return { ok: false, codigo: e.code, mensaje: String(e.message) };
  }
}

try {
  execFileSync(bin("initdb"), ["-D", datos, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { env: entorno, stdio: "ignore" });
  execFileSync(bin("pg_ctl"), ["start", "-w", "-D", datos, "-l", join(base, "servidor.log"), "-o", `-p ${PUERTO} -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c fsync=off`], { env: entorno, stdio: "ignore" });
  servidorArrancado = true;

  const c = await nuevaBase("vz_aislada_perfiles", MIGRACION);
  // 1) Idempotente: repetirla no falla ni duplica nada.
  let repetida = true;
  try {
    await c.query(MIGRACION);
  } catch (e) {
    repetida = false;
    console.log(String(e.message));
  }
  ok(repetida, "La migración se puede aplicar dos veces sin error (idempotente)");
  const politicas = (await c.query("select policyname from pg_policies where schemaname='public' and tablename='perfiles_cliente' order by 1")).rows.map((r) => r.policyname);
  ok(politicas.length === 3, `Tiene las 3 políticas, sin duplicar tras repetirla (${politicas.join(", ")})`);
  ok((await c.query("select relrowsecurity from pg_class where oid='public.perfiles_cliente'::regclass")).rows[0].relrowsecurity === true, "La seguridad por filas (RLS) está activada");

  // 2) Permisos de las tablas.
  const priv = async (rol, p) => (await c.query("select has_table_privilege($1, 'public.perfiles_cliente', $2) as t", [rol, p])).rows[0].t;
  ok(!(await priv("anon", "select")) && !(await priv("anon", "insert")) && !(await priv("anon", "update")) && !(await priv("anon", "delete")), "Visitantes (anon): ningún permiso sobre la tabla");
  ok((await priv("authenticated", "select")) && (await priv("authenticated", "insert")) && (await priv("authenticated", "update")), "Clientes (authenticated): pueden leer, crear y editar");
  ok(!(await priv("authenticated", "delete")), "Clientes: NO pueden borrar filas");
  const anonLee = await como(c, "anon", null, "select * from public.perfiles_cliente");
  ok(!anonLee.ok && anonLee.codigo === "42501", `Un visitante que intenta leer recibe «permiso denegado» (${anonLee.codigo})`);

  // 3) Cada cliente solo toca lo suyo.
  const propia = await como(c, "authenticated", U1, `insert into public.perfiles_cliente (user_id, nombre, usuario, pais, provincia, fecha_nacimiento) values ('${U1}', 'Dani', 'dani', 'España', 'Zaragoza', '2003-08-19')`, { confirmar: true });
  ok(propia.ok, "Un cliente crea su propio perfil");
  const ajena = await como(c, "authenticated", U1, `insert into public.perfiles_cliente (user_id, nombre) values ('${U2}', 'Intruso')`);
  ok(!ajena.ok && ajena.codigo === "42501", `Un cliente NO puede crear el perfil de otra persona (${ajena.codigo})`);
  const segundo = await como(c, "authenticated", U2, `insert into public.perfiles_cliente (user_id, nombre, provincia) values ('${U2}', 'Otra Persona', 'Huesca')`, { confirmar: true });
  ok(segundo.ok, "Otro cliente crea el suyo");
  const veSuyo = await como(c, "authenticated", U1, "select user_id from public.perfiles_cliente");
  ok(veSuyo.ok && veSuyo.cuantas === 1 && veSuyo.filas[0].user_id === U1, `Un cliente ve SOLO su fila (ve ${veSuyo.cuantas})`);
  const editaSuyo = await como(c, "authenticated", U1, `update public.perfiles_cliente set provincia = 'Teruel' where user_id = '${U1}'`);
  ok(editaSuyo.ok && editaSuyo.cuantas === 1, "Un cliente edita su fila");
  const editaAjeno = await como(c, "authenticated", U1, `update public.perfiles_cliente set provincia = 'Hackeada' where user_id = '${U2}'`);
  ok(editaAjeno.ok && editaAjeno.cuantas === 0, `Un cliente NO puede editar la fila de otro (filas cambiadas: ${editaAjeno.cuantas})`);
  const cambiaDueno = await como(c, "authenticated", U1, `update public.perfiles_cliente set user_id = '${U2}' where user_id = '${U1}'`);
  ok(!cambiaDueno.ok || cambiaDueno.cuantas === 0, "Un cliente NO puede pasar su fila a otra persona");
  const borra = await como(c, "authenticated", U1, `delete from public.perfiles_cliente where user_id = '${U1}'`);
  ok(!borra.ok && borra.codigo === "42501", `Un cliente NO puede borrar (${borra.codigo})`);
  const actualizadoAntes = (await c.query(`select updated_at from public.perfiles_cliente where user_id='${U1}'`)).rows[0].updated_at;
  await como(c, "authenticated", U1, `update public.perfiles_cliente set nombre = 'Daniel' where user_id = '${U1}'`, { confirmar: true });
  const actualizadoDespues = (await c.query(`select updated_at from public.perfiles_cliente where user_id='${U1}'`)).rows[0].updated_at;
  ok(actualizadoDespues > actualizadoAntes, "updated_at se actualiza solo al editar");

  // 4) El administrador lee todo, pero no edita ni crea lo de otros.
  const adminLee = await como(c, "authenticated", ADMIN, "select user_id from public.perfiles_cliente");
  ok(adminLee.ok && adminLee.cuantas === 2, `El administrador ve todas las filas (ve ${adminLee.cuantas})`);
  const adminEdita = await como(c, "authenticated", ADMIN, `update public.perfiles_cliente set provincia = 'Cambiada' where user_id = '${U1}'`);
  ok(adminEdita.ok && adminEdita.cuantas === 0, `El administrador NO edita perfiles de clientes (filas cambiadas: ${adminEdita.cuantas})`);
  const adminCrea = await como(c, "authenticated", ADMIN, `insert into public.perfiles_cliente (user_id, nombre) values ('${U1}', 'Falso')`);
  ok(!adminCrea.ok, "El administrador NO crea perfiles a nombre de otros");

  // 5) Reglas de los datos.
  const repetido = await como(c, "authenticated", U2, `update public.perfiles_cliente set usuario = 'DANI' where user_id = '${U2}'`);
  ok(!repetido.ok && repetido.codigo === "23505", `El usuario es único sin distinguir mayúsculas: «DANI» choca con «dani» (${repetido.codigo})`);
  for (const [usuario, motivo] of [["ab", "muy corto"], ["con espacio", "con espacio"], ["a".repeat(25), "de 25 letras"], ["ñandú", "con ñ"]]) {
    const r = await como(c, "authenticated", U2, `update public.perfiles_cliente set usuario = '${usuario}' where user_id = '${U2}'`);
    ok(!r.ok && r.codigo === "23514", `Usuario ${motivo}: rechazado (${r.codigo})`);
  }
  const bien = await como(c, "authenticated", U2, `update public.perfiles_cliente set usuario = 'otra.persona-1_' where user_id = '${U2}'`);
  ok(bien.ok && bien.cuantas === 1, "Usuario con letras, números, punto, guion y guion bajo: aceptado");
  const hoy = new Date();
  const hace = (anios, dias = 0) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate() - dias));
    return d.toISOString().slice(0, 10);
  };
  for (const [fecha, texto, aceptada] of [[hace(13), "13 años", false], [hace(14, -1), "casi 14 años (mañana los cumple)", false], [hace(14), "justo 14 años", true], [hace(22), "22 años", true], ["1899-12-31", "antes de 1900", false]]) {
    const r = await como(c, "authenticated", U2, `update public.perfiles_cliente set fecha_nacimiento = '${fecha}' where user_id = '${U2}'`);
    ok(aceptada ? r.ok : !r.ok && r.codigo === "23514", `Fecha de nacimiento (${texto}): ${aceptada ? "aceptada" : "rechazada"} (${r.ok ? "ok" : r.codigo})`);
  }
  const vacio = await como(c, "authenticated", U2, `update public.perfiles_cliente set nombre = null, usuario = null, pais = null, provincia = null, fecha_nacimiento = null where user_id = '${U2}'`);
  ok(vacio.ok, "Todos los campos se pueden dejar vacíos (perfil incompleto)");
  const nombreCorto = await como(c, "authenticated", U2, `update public.perfiles_cliente set nombre = 'A' where user_id = '${U2}'`);
  ok(!nombreCorto.ok && nombreCorto.codigo === "23514", `Nombre de 1 letra: rechazado (${nombreCorto.codigo})`);

  // 6) Al borrar la cuenta desaparece su perfil.
  await c.query(`delete from auth.users where id = '${U2}'`);
  ok((await c.query(`select count(*)::int as n from public.perfiles_cliente where user_id = '${U2}'`)).rows[0].n === 0, "Al borrar la cuenta se borra su perfil");
  await c.end();

  // 7) PRUEBA DE LAS PRUEBAS: con la política de lectura rota (cualquiera lee todo) la comprobación de privacidad tiene que fallar.
  const rota = MIGRACION.replace("using (user_id = (select auth.uid()) or (select public.is_admin()));", "using (true);");
  ok(rota !== MIGRACION, "(control) se ha podido romper la política de lectura en la copia de prueba");
  const c2 = await nuevaBase("vz_aislada_perfiles_rota", rota);
  await como(c2, "authenticated", U1, `insert into public.perfiles_cliente (user_id, nombre) values ('${U1}', 'Dani')`, { confirmar: true });
  await como(c2, "authenticated", U2, `insert into public.perfiles_cliente (user_id, nombre) values ('${U2}', 'Otra')`, { confirmar: true });
  const ve = await como(c2, "authenticated", U1, "select user_id from public.perfiles_cliente");
  ok(ve.ok && ve.cuantas === 2, `(control) con la política rota un cliente ve filas ajenas (${ve.cuantas}): la comprobación de privacidad SÍ lo detecta`);
  await c2.end();
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  parar();
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    // nada que borrar
  }
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
