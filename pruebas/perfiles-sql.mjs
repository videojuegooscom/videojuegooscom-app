/**
 * pruebas/perfiles-sql.mjs — prueba la migración del «Perfil público» (supabase/migrations/20261030150000_perfiles_cliente_completo.sql,
 * que sustituye a 20261022100000_perfiles_cliente.sql y añade la foto) en un PostgreSQL LOCAL y de usar y tirar. NUNCA toca
 * producción: arranca su propio servidor en 127.0.0.1, con una base nueva y un esqueleto mínimo de Supabase (roles
 * anon/authenticated, auth.uid(), is_admin(), touch_updated_at, storage.buckets/objects y storage.foldername), y al terminar lo
 * para y borra su carpeta de datos.
 *
 * Comprueba (con roles y «token» de verdad, no solo leyendo el SQL):
 *  - La migración se aplica y se puede repetir sin error (idempotente), también encima de la anterior (20261022100000).
 *  - Permisos: visitantes (anon) y PUBLIC no tocan nada; los clientes leen, crean y editan pero NO borran.
 *  - Cada cliente solo ve, crea y edita SU fila; el administrador lee todas y no puede editar ni crear las de otros.
 *  - Reglas de los datos: usuario único sin distinguir mayúsculas y con formato; edad mínima 14 años; largos; campos vacíos;
 *    foto solo https:// y de como mucho 500 caracteres.
 *  - Fotos de perfil: almacén «avatares» público, 2 MB, solo JPG/PNG/WEBP; cada cliente sube solo a SU carpeta; ni visitantes
 *    ni otra carpeta ni otro almacén.
 *  - Al borrar la cuenta desaparece su fila.
 *  - «Prueba de las pruebas»: con una versión rota de la migración (cualquiera lee todas las filas) la comprobación de
 *    privacidad FALLA, así que de verdad detecta el problema.
 *  - El Foro (20261030200000_perfiles_publicos.sql): la función perfiles_publicos da SOLO id, usuario y foto, solo de quien
 *    ha escrito en el Foro y tiene usuario, como mucho 200 a la vez; la tabla sigue cerrada y PUBLIC no la ejecuta (con su
 *    «prueba de las pruebas»: sin el filtro del Foro, la comprobación falla).
 *  - Foro, parte 2 (20261031110000_foro_silencios_y_moderacion.sql), con tablas y políticas como las de producción:
 *    usuario y foto también de quien comenta (sin ocultar) o reseña; «Silenciar usuario» solo lo hace el administrador
 *    (nunca a sí mismo ni a otro administrador, un mes como mucho), la persona silenciada no escribe en el Foro ni comenta
 *    y no se lo puede quitar; el registro de moderación se rellena solo, solo lo lee el administrador y nadie lo escribe
 *    ni lo borra a mano (con su «prueba de las pruebas»: sin el bloqueo, la persona silenciada escribiría).
 *  - Políticas (20261031150000_politicas_privacidad_y_normas_foro.sql), partiendo de la privacidad como está en producción:
 *    cambia solo los 5 apartados que tocan (por su título) y deja igual el resto y su orden, ya no nombra un «proveedor de
 *    pagos» que no existe, crea las Normas del Foro una vez, repetirla no cambia nada y respeta lo que edite el dueño (con
 *    su «prueba de las pruebas»: con el cruce por título roto se perderían apartados).
 *  - Números de seguimiento (20261031170000_seguimiento_codigos.sql), sobre pedidos y reparaciones como en producción: lo
 *    que ya existía recibe su número sin cambiar su fecha de actualización; el número lo pone siempre la base de datos
 *    (nadie elige el suyo ni lo cambia) e id_veoaura solo el servidor; añadirlo a la cuenta solo con sesión, con formato,
 *    sin quitárselo a otra persona y con un límite de 10 intentos fallidos por hora y persona; los intentos solo los lee
 *    el administrador; la privacidad lo explica una vez (con su «prueba de las pruebas»: sin el límite, entra el 11.º).
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
const MIGRACION = readFileSync("supabase/migrations/20261030150000_perfiles_cliente_completo.sql", "utf8");
const ANTERIOR = readFileSync("supabase/migrations/20261022100000_perfiles_cliente.sql", "utf8");
const PUBLICOS = readFileSync("supabase/migrations/20261030200000_perfiles_publicos.sql", "utf8");
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
end $$;
create schema auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $f$;
-- Permisos por defecto de Supabase: toda tabla nueva en public es accesible a anon y authenticated (el rol interno del
-- servidor salta las políticas y no interviene en estas comprobaciones, así que no se reproduce).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role text not null default 'user');
alter table public.profiles enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $f$;
create function public.touch_updated_at() returns trigger language plpgsql as $f$
begin new.updated_at = now(); return new; end $f$;
-- Almacenamiento (lo justo): almacenes, archivos con RLS (como en Supabase) y storage.foldername.
create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare _parts text[];
begin _parts := string_to_array(name, '/'); return _parts[1:array_length(_parts, 1) - 1]; end $f$;
insert into storage.buckets (id, name, public) values ('product-media', 'product-media', true);
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
  const almacen = (await c.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatares'")).rows[0];
  ok(!!almacen && almacen.public === true && Number(almacen.file_size_limit) === 2097152 && almacen.allowed_mime_types.join(",") === "image/jpeg,image/png,image/webp", `Almacén «avatares»: público, 2 MB y solo JPG/PNG/WEBP (${JSON.stringify(almacen ?? null)})`);
  const politicasFotos = (await c.query("select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects' order by 1")).rows;
  ok(politicasFotos.length === 1 && politicasFotos[0].policyname === "avatares_subir_propia" && politicasFotos[0].cmd === "INSERT", `Fotos: una sola regla (subir a la carpeta propia), sin duplicar tras repetirla (${politicasFotos.map((p) => p.policyname).join(", ")})`);

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
  const fotoBien = await como(c, "authenticated", U2, `update public.perfiles_cliente set foto_url = 'https://fotos.ejemplo.invalid/avatares/${U2}/1.jpg' where user_id = '${U2}'`);
  ok(fotoBien.ok && fotoBien.cuantas === 1, "Foto con dirección https://: aceptada");
  for (const [foto, motivo] of [["http://fotos.ejemplo.invalid/1.jpg", "sin https"], ["javascript:alert(1)", "que no es una dirección"], [`https://fotos.ejemplo.invalid/${"a".repeat(500)}.jpg`, "de más de 500 caracteres"]]) {
    const r = await como(c, "authenticated", U2, `update public.perfiles_cliente set foto_url = '${foto}' where user_id = '${U2}'`);
    ok(!r.ok && r.codigo === "23514", `Foto ${motivo}: rechazada (${r.codigo})`);
  }

  // Fotos de perfil en el almacenamiento: cada cliente solo en su carpeta.
  const subeSuya = await como(c, "authenticated", U1, `insert into storage.objects (bucket_id, name) values ('avatares', '${U1}/1793390000000.jpg')`);
  ok(subeSuya.ok, "Un cliente sube su foto a SU carpeta de «avatares»");
  const subeAjena = await como(c, "authenticated", U1, `insert into storage.objects (bucket_id, name) values ('avatares', '${U2}/1793390000000.jpg')`);
  ok(!subeAjena.ok && subeAjena.codigo === "42501", `NO puede subirla a la carpeta de otra persona (${subeAjena.codigo})`);
  const subeSuelta = await como(c, "authenticated", U1, `insert into storage.objects (bucket_id, name) values ('avatares', 'suelta.jpg')`);
  ok(!subeSuelta.ok && subeSuelta.codigo === "42501", `NI fuera de una carpeta (${subeSuelta.codigo})`);
  const subeOtroAlmacen = await como(c, "authenticated", U1, `insert into storage.objects (bucket_id, name) values ('product-media', '${U1}/1.jpg')`);
  ok(!subeOtroAlmacen.ok && subeOtroAlmacen.codigo === "42501", `NI en otro almacén (product-media) (${subeOtroAlmacen.codigo})`);
  const subeVisitante = await como(c, "anon", null, `insert into storage.objects (bucket_id, name) values ('avatares', '${U1}/2.jpg')`);
  ok(!subeVisitante.ok && subeVisitante.codigo === "42501", `Un visitante sin sesión NO sube nada (${subeVisitante.codigo})`);

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

  // 8) Encima de la migración anterior (por si llegara a aplicarse antes): añade la foto y no duplica nada.
  const c3 = await nuevaBase("vz_aislada_perfiles_encima", ANTERIOR);
  await como(c3, "authenticated", U1, `insert into public.perfiles_cliente (user_id, nombre) values ('${U1}', 'Dani')`, { confirmar: true });
  let encima = true;
  try {
    await c3.query(MIGRACION);
  } catch (e) {
    encima = false;
    console.log(String(e.message));
  }
  const columnas = (await c3.query("select column_name from information_schema.columns where table_schema='public' and table_name='perfiles_cliente'")).rows.map((r) => r.column_name);
  const politicas3 = (await c3.query("select count(*)::int as n from pg_policies where schemaname='public' and tablename='perfiles_cliente'")).rows[0].n;
  const conserva = (await c3.query(`select nombre from public.perfiles_cliente where user_id = '${U1}'`)).rows[0]?.nombre;
  ok(encima && columnas.includes("foto_url") && politicas3 === 3 && conserva === "Dani", `Encima de la anterior: sin error, añade foto_url, 3 políticas y conserva los datos (${columnas.length} columnas, ${politicas3} políticas)`);
  await c3.end();

  // 9) El Foro: perfiles_publicos (20261030200000) da SOLO usuario y foto de quien ha escrito en el Foro.
  const FORO = `create table public.chat_messages (id uuid primary key default gen_random_uuid(), user_id uuid not null, body text);
    alter table public.chat_messages enable row level security;`;
  const U3 = "33333333-3333-4333-8333-333333333333";
  const prepararForo = async (nombre, publicos) => {
    const b = await nuevaBase(nombre, MIGRACION);
    await b.query(FORO);
    await b.query(`insert into auth.users (id, email) values ('${U3}', 'u3@example.com')`);
    await b.query(`insert into public.perfiles_cliente (user_id, nombre, usuario, pais, provincia, fecha_nacimiento, foto_url) values
      ('${U1}', 'Dani García López', 'dani', 'España', 'Zaragoza', '2003-08-19', 'https://fotos.ejemplo.invalid/avatares/${U1}/1.jpg'),
      ('${U2}', 'Sin Foro', 'callado', 'España', 'Huesca', '1990-01-01', null),
      ('${U3}', 'Sin Usuario', null, 'España', 'Teruel', '1990-01-01', null)`);
    await b.query(`insert into public.chat_messages (user_id, body) values ('${U1}', 'hola'), ('${U3}', 'buenas')`);
    await b.query(publicos);
    return b;
  };
  const c4 = await prepararForo("vz_aislada_perfiles_foro", PUBLICOS);
  let repetidaForo = true;
  try {
    await c4.query(PUBLICOS);
  } catch (e) {
    repetidaForo = false;
    console.log(String(e.message));
  }
  ok(repetidaForo, "Foro: la función se puede aplicar dos veces sin error (idempotente)");
  const todos = `select * from public.perfiles_publicos(array['${U1}', '${U2}', '${U3}']::uuid[])`;
  const visitante = await como(c4, "anon", null, todos);
  ok(visitante.ok && visitante.cuantas === 1 && visitante.filas[0].user_id === U1 && visitante.filas[0].usuario === "dani" && /\/1\.jpg$/.test(visitante.filas[0].foto_url ?? ""), `Foro: un visitante ve el usuario y la foto de quien ha escrito (${JSON.stringify(visitante.filas ?? visitante.mensaje)})`);
  ok(visitante.ok && Object.keys(visitante.filas[0] ?? {}).sort().join(",") === "foto_url,user_id,usuario", `Foro: solo tres datos (id, usuario y foto), nunca nombre, país, provincia ni fecha (${Object.keys(visitante.filas?.[0] ?? {}).join(", ")})`);
  ok(visitante.ok && !visitante.filas.some((f) => f.user_id === U2), "Foro: de quien NO ha escrito en el Foro no sale nada");
  ok(visitante.ok && !visitante.filas.some((f) => f.user_id === U3), "Foro: de quien no tiene usuario no sale nada");
  const cliente = await como(c4, "authenticated", U2, todos);
  ok(cliente.ok && cliente.cuantas === 1, `Foro: un cliente con sesión ve lo mismo (${cliente.cuantas})`);
  const muchos = await como(c4, "anon", null, `select count(*)::int as n from public.perfiles_publicos(array_append(array_fill('${U2}'::uuid, array[200]), '${U1}'::uuid))`);
  ok(muchos.ok && muchos.filas[0].n === 0, `Foro: como mucho 200 personas por consulta (la 201 no sale: ${muchos.filas?.[0]?.n})`);
  const vacia = await como(c4, "anon", null, "select count(*)::int as n from public.perfiles_publicos(null)");
  ok(vacia.ok && vacia.filas[0].n === 0, "Foro: sin ids no devuelve nada (ni falla)");
  const sigueCerrada = await como(c4, "anon", null, "select * from public.perfiles_cliente");
  ok(!sigueCerrada.ok && sigueCerrada.codigo === "42501", `Foro: la tabla de perfiles sigue cerrada para visitantes (${sigueCerrada.codigo})`);
  await c4.query("create role vz_ajeno nologin");
  const ajenoEjecuta = (await c4.query("select has_function_privilege('vz_ajeno', 'public.perfiles_publicos(uuid[])', 'execute') as t")).rows[0].t;
  ok(!ajenoEjecuta, "Foro: PUBLIC (cualquier otro rol) no puede ejecutarla");
  const ficha = (await c4.query("select prosecdef, proconfig from pg_proc where proname = 'perfiles_publicos'")).rows[0];
  ok(ficha.prosecdef === true && (ficha.proconfig ?? []).some((s) => s.startsWith("search_path=")), `Foro: lee por su cuenta con el search_path fijado (${JSON.stringify(ficha)})`);
  await c4.end();

  // PRUEBA DE LAS PRUEBAS: sin el filtro del Foro, la comprobación «quien no ha escrito no sale» tiene que fallar.
  const sinFiltro = PUBLICOS.replace("\n    and exists (select 1 from public.chat_messages m where m.user_id = p.user_id);", ";");
  ok(sinFiltro !== PUBLICOS, "(control) se ha podido quitar el filtro del Foro en la copia de prueba");
  const c5 = await prepararForo("vz_aislada_perfiles_foro_rota", sinFiltro);
  const rotaForo = await como(c5, "anon", null, todos);
  ok(rotaForo.ok && rotaForo.filas.some((f) => f.user_id === U2), "(control) sin el filtro sale quien no ha escrito: la comprobación SÍ lo detecta");
  await c5.end();

  // 10) Foro, parte 2 (20261031110000): usuario y foto también de quien comenta o reseña, «Silenciar usuario» y el
  //     registro de moderación. Tablas como las de producción (mismas políticas), en una base aislada.
  const U4 = "44444444-4444-4444-8444-444444444444";
  const ADMIN2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const FORO2 = `
    create policy profiles_select_own_or_admin on public.profiles for select using ((auth.uid() = id) or public.is_admin());
    create table public.chat_messages (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), body text);
    alter table public.chat_messages enable row level security;
    create policy chat_messages_select_public on public.chat_messages for select to anon, authenticated using (true);
    create policy chat_messages_insert_authenticated on public.chat_messages for insert to authenticated with check (user_id = auth.uid());
    create policy chat_messages_delete_admin on public.chat_messages for delete to authenticated using (public.is_admin());
    create table public.noticias_comentarios (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), noticia_id uuid,
      user_id uuid default auth.uid(), autor text, texto text, oculto boolean not null default false);
    alter table public.noticias_comentarios enable row level security;
    create policy noticias_comentarios_lectura on public.noticias_comentarios for select to anon, authenticated using ((not oculto) or (select public.is_admin()));
    create policy noticias_comentarios_insert on public.noticias_comentarios for insert to authenticated with check (user_id = (select auth.uid()) and not oculto);
    create policy noticias_comentarios_admin_update on public.noticias_comentarios for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
    create table public.store_reviews (id uuid primary key default gen_random_uuid(), user_id uuid, rating smallint, comment text);
    alter table public.store_reviews enable row level security;
    create policy store_reviews_select_public on public.store_reviews for select to anon, authenticated using (true);`;
  const MODERACION = readFileSync("supabase/migrations/20261031110000_foro_silencios_y_moderacion.sql", "utf8");
  const prepararModeracion = async (nombre, migracion) => {
    const b = await nuevaBase(nombre, MIGRACION);
    await b.query(FORO2);
    await b.query(`insert into auth.users (id, email) values ('${U3}', 'u3@example.com'), ('${U4}', 'u4@example.com'), ('${ADMIN2}', 'admin2@example.com')`);
    await b.query(`insert into public.profiles (id, role) values ('${U3}', 'user'), ('${U4}', 'user'), ('${ADMIN2}', 'admin')`);
    await b.query(`insert into public.perfiles_cliente (user_id, nombre, usuario, pais, provincia, fecha_nacimiento) values
      ('${U1}', 'Dani', 'dani', 'España', 'Zaragoza', '2003-08-19'), ('${U2}', 'Ana', 'ana_g', 'España', 'Huesca', '1990-05-02'),
      ('${U3}', 'Luis', 'luis', 'España', 'Teruel', '1990-01-01'), ('${U4}', 'Oculta', 'oculta', 'España', 'Teruel', '1990-01-01')`);
    await b.query(`insert into public.chat_messages (user_id, body) values ('${U1}', 'hola'), ('${U2}', 'mensaje de ana')`);
    await b.query(`insert into public.noticias_comentarios (user_id, autor, texto, oculto) values ('${U2}', 'Ana', 'comentario visible', false), ('${U4}', 'Oculta', 'comentario oculto', true)`);
    await b.query(`insert into public.store_reviews (user_id, rating, comment) values ('${U3}', 5, 'genial')`);
    await b.query(PUBLICOS);
    await b.query(migracion);
    return b;
  };
  const c6 = await prepararModeracion("vz_aislada_foro_moderacion", MODERACION);
  let repetidaModeracion = true;
  try {
    await c6.query(MODERACION);
  } catch (e) {
    repetidaModeracion = false;
    console.log(String(e.message));
  }
  ok(repetidaModeracion, "Parte 2: la migración se puede aplicar dos veces sin error (idempotente)");
  const politicasForo2 = (await c6.query("select tablename, policyname, permissive from pg_policies where policyname in ('chat_messages_insert_no_silenciado','noticias_comentarios_insert_no_silenciado','foro_silencios_select','foro_silencios_insert_admin','foro_silencios_update_admin','foro_moderacion_select_admin')")).rows;
  ok(politicasForo2.length === 6 && politicasForo2.filter((x) => x.permissive === "RESTRICTIVE").length === 2, `Parte 2: sus 6 políticas, sin duplicar tras repetirla (2 restrictivas: ${politicasForo2.map((x) => x.policyname).join(", ")})`);

  // Usuario y foto: también de quien comenta (sin ocultar) o reseña.
  const publicos2 = await como(c6, "anon", null, `select user_id from public.perfiles_publicos(array['${U1}','${U2}','${U3}','${U4}']::uuid[])`);
  const ids2 = (publicos2.filas ?? []).map((x) => x.user_id);
  ok(publicos2.ok && ids2.includes(U1) && ids2.includes(U2) && ids2.includes(U3), `Parte 2: usuario y foto de quien escribe en el Foro, comenta noticias o reseña la tienda (${ids2.length})`);
  ok(publicos2.ok && !ids2.includes(U4), "Parte 2: de quien solo tiene un comentario eliminado (oculto) no sale nada");

  // Silenciar: solo el administrador, nunca a sí mismo ni a otro administrador; un mes como mucho.
  const enUnDia = "now() + interval '1 day'";
  const clienteSilencia = await como(c6, "authenticated", U2, `insert into public.foro_silencios (user_id, hasta) values ('${U1}', ${enUnDia})`);
  ok(!clienteSilencia.ok && clienteSilencia.codigo === "42501", `Silenciar: un cliente NO puede silenciar a nadie (${clienteSilencia.codigo})`);
  const visitanteSilencia = await como(c6, "anon", null, `insert into public.foro_silencios (user_id, hasta) values ('${U1}', ${enUnDia})`);
  ok(!visitanteSilencia.ok && visitanteSilencia.codigo === "42501", `Silenciar: un visitante tampoco (${visitanteSilencia.codigo})`);
  const aSiMismo = await como(c6, "authenticated", ADMIN, `insert into public.foro_silencios (user_id, hasta) values ('${ADMIN}', ${enUnDia})`);
  ok(!aSiMismo.ok && aSiMismo.codigo === "42501", `Silenciar: el administrador no se puede silenciar a sí mismo (${aSiMismo.codigo})`);
  const aOtroAdmin = await como(c6, "authenticated", ADMIN, `insert into public.foro_silencios (user_id, hasta) values ('${ADMIN2}', ${enUnDia})`);
  ok(!aOtroAdmin.ok && aOtroAdmin.codigo === "42501", `Silenciar: ni a otro administrador (${aOtroAdmin.codigo})`);
  const demasiado = await como(c6, "authenticated", ADMIN, `insert into public.foro_silencios (user_id, hasta) values ('${U1}', now() + interval '40 days')`);
  ok(!demasiado.ok && demasiado.codigo === "23514", `Silenciar: como mucho un mes de una vez (${demasiado.codigo})`);
  const silencia = await como(c6, "authenticated", ADMIN, `insert into public.foro_silencios (user_id, hasta, motivo) values ('${U1}', ${enUnDia}, 'spam')`, { confirmar: true });
  ok(silencia.ok, `Silenciar: el administrador silencia a un cliente un día (${silencia.mensaje ?? "ok"})`);
  const veSuyo2 = await como(c6, "authenticated", U1, "select user_id, hasta from public.foro_silencios");
  ok(veSuyo2.ok && veSuyo2.cuantas === 1, "Silenciar: la persona silenciada ve su silencio (para saber hasta cuándo)");
  const veAjeno = await como(c6, "authenticated", U2, "select user_id from public.foro_silencios");
  ok(veAjeno.ok && veAjeno.cuantas === 0, `Silenciar: otro cliente no ve los silencios de nadie (${veAjeno.cuantas})`);
  const visitanteVe = await como(c6, "anon", null, "select user_id from public.foro_silencios");
  ok(!visitanteVe.ok && visitanteVe.codigo === "42501", `Silenciar: un visitante no ve nada (${visitanteVe.codigo})`);

  // Lo hace cumplir la base de datos.
  const escribeSilenciado = await como(c6, "authenticated", U1, "insert into public.chat_messages (body) values ('vuelvo a escribir')");
  ok(!escribeSilenciado.ok && escribeSilenciado.codigo === "42501", `Silenciar: la persona silenciada NO puede escribir en el Foro (${escribeSilenciado.codigo})`);
  const comentaSilenciado = await como(c6, "authenticated", U1, "insert into public.noticias_comentarios (autor, texto) values ('Dani', 'comento')");
  ok(!comentaSilenciado.ok && comentaSilenciado.codigo === "42501", `Silenciar: ni comentar noticias (${comentaSilenciado.codigo})`);
  const escribeOtro = await como(c6, "authenticated", U2, "insert into public.chat_messages (body) values ('yo sí puedo')");
  ok(escribeOtro.ok, "Silenciar: los demás escriben con normalidad");
  const clienteQuita = await como(c6, "authenticated", U1, `update public.foro_silencios set hasta = now() - interval '1 minute' where user_id = '${U1}'`);
  ok(clienteQuita.ok && clienteQuita.cuantas === 0, `Silenciar: la persona silenciada no puede quitarse el silencio (filas cambiadas: ${clienteQuita.cuantas})`);
  const quita = await como(c6, "authenticated", ADMIN, `update public.foro_silencios set hasta = now() - interval '1 minute' where user_id = '${U1}'`, { confirmar: true });
  ok(quita.ok && quita.cuantas === 1, "Silenciar: el administrador quita el silencio");
  const vuelve = await como(c6, "authenticated", U1, "insert into public.chat_messages (body) values ('ya puedo')");
  ok(vuelve.ok, "Silenciar: sin silencio, vuelve a poder escribir");

  // Registro de moderación: se rellena solo y solo lo lee el administrador.
  const mensajeAna = (await c6.query(`select id from public.chat_messages where body = 'mensaje de ana'`)).rows[0].id;
  const borra2 = await como(c6, "authenticated", ADMIN, `delete from public.chat_messages where id = '${mensajeAna}'`, { confirmar: true });
  ok(borra2.ok && borra2.cuantas === 1, "Moderación: el administrador elimina un mensaje del Foro");
  const oculta2 = await como(c6, "authenticated", ADMIN, "update public.noticias_comentarios set oculto = true where texto = 'comentario visible'", { confirmar: true });
  ok(oculta2.ok && oculta2.cuantas === 1, "Moderación: el administrador elimina (oculta) un comentario");
  await c6.query("delete from public.chat_messages where body = 'hola'"); // sin sesión (como al eliminarse una cuenta): no se apunta
  const registro = (await c6.query("select accion, admin_id, user_id, detalle from public.foro_moderacion order by created_at, accion")).rows;
  const por = (a) => registro.filter((x) => x.accion === a);
  ok(por("mensaje_eliminado").length === 1 && por("mensaje_eliminado")[0].admin_id === ADMIN && por("mensaje_eliminado")[0].user_id === U2 && por("mensaje_eliminado")[0].detalle === "mensaje de ana", `Moderación: apunta el mensaje eliminado, quién lo eliminó, de quién era y qué decía (${JSON.stringify(por("mensaje_eliminado"))})`);
  ok(por("comentario_eliminado").length === 1 && por("comentario_eliminado")[0].user_id === U2, "Moderación: apunta el comentario eliminado");
  ok(por("silenciado").length === 1 && /^Hasta el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} · spam$/.test(por("silenciado")[0].detalle ?? "") && por("silencio_quitado").length === 1, `Moderación: apunta el silencio (hasta cuándo y por qué) y cuándo se quitó (${JSON.stringify(por("silenciado").map((x) => x.detalle))})`);
  ok(registro.length === 4, `Moderación: lo que desaparece sin sesión (al eliminarse una cuenta) no se apunta (${registro.length} filas)`);
  const adminLeeReg = await como(c6, "authenticated", ADMIN, "select id from public.foro_moderacion");
  ok(adminLeeReg.ok && adminLeeReg.cuantas === 4, `Moderación: el administrador lo lee (${adminLeeReg.cuantas})`);
  const clienteLeeReg = await como(c6, "authenticated", U1, "select id from public.foro_moderacion");
  ok(clienteLeeReg.ok && clienteLeeReg.cuantas === 0, `Moderación: un cliente no ve nada (${clienteLeeReg.cuantas})`);
  const visitanteLeeReg = await como(c6, "anon", null, "select id from public.foro_moderacion");
  ok(!visitanteLeeReg.ok && visitanteLeeReg.codigo === "42501", `Moderación: un visitante tampoco (${visitanteLeeReg.codigo})`);
  const escribeReg = await como(c6, "authenticated", ADMIN, `insert into public.foro_moderacion (accion) values ('silenciado')`);
  ok(!escribeReg.ok && escribeReg.codigo === "42501", `Moderación: nadie escribe en el registro a mano, ni el administrador (${escribeReg.codigo})`);
  const borraReg = await como(c6, "authenticated", ADMIN, "delete from public.foro_moderacion");
  ok(!borraReg.ok && borraReg.codigo === "42501", `Moderación: ni lo borra (${borraReg.codigo})`);
  const fichaMod = (await c6.query("select prosecdef, proconfig from pg_proc where proname = 'foro_moderacion_apuntar'")).rows[0];
  ok(fichaMod.prosecdef === true && (fichaMod.proconfig ?? []).some((s) => s.startsWith("search_path=")), "Moderación: la función del registro tiene el search_path fijado");
  await c6.end();

  // PRUEBA DE LAS PRUEBAS: sin la política restrictiva, la persona silenciada podría escribir y la comprobación lo detecta.
  const sinBloqueo = MODERACION.replace(
    "with check (not exists (select 1 from public.foro_silencios s where s.user_id = (select auth.uid()) and s.hasta > now()));\n  end if;\n\n  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'noticias_comentarios'",
    "with check (true);\n  end if;\n\n  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'noticias_comentarios'"
  );
  ok(sinBloqueo !== MODERACION, "(control) se ha podido quitar el bloqueo del Foro en la copia de prueba");
  const c7 = await prepararModeracion("vz_aislada_foro_moderacion_rota", sinBloqueo);
  await como(c7, "authenticated", ADMIN, `insert into public.foro_silencios (user_id, hasta) values ('${U1}', now() + interval '1 day')`, { confirmar: true });
  const cuela = await como(c7, "authenticated", U1, "insert into public.chat_messages (body) values ('me cuelo')");
  ok(cuela.ok, "(control) sin el bloqueo, la persona silenciada escribe: la comprobación SÍ lo detecta");
  await c7.end();

  // 11) Políticas (20261031150000): privacidad al día y Normas del Foro. Se parte de la política de privacidad como está
  // en producción (los 8 apartados con su título; el texto de los que no cambian da igual) y de las otras políticas.
  // (En su propio bloque: sus nombres no se mezclan con los de las secciones de arriba.)
  {
  const POLITICAS = readFileSync("supabase/migrations/20261031150000_politicas_privacidad_y_normas_foro.sql", "utf8");
  const TITULOS = [
    "Responsable del tratamiento",
    "Qué datos tratamos",
    "Para qué usamos tus datos",
    "Base legal",
    "Con quién compartimos tus datos",
    "Cuánto tiempo conservamos tus datos",
    "Cookies y analítica propia",
    "Tus derechos",
  ];
  const PRIVACIDAD_HOY = TITULOS.map((heading) =>
    heading === "Con quién compartimos tus datos"
      ? { heading, body: "Solo compartimos los datos estrictamente necesarios con empresas de transporte (para entregar tu pedido) y con nuestro proveedor de pagos (Supabase/Stripe u otro que uses), bajo sus propias políticas de privacidad. No vendemos tus datos a terceros." }
      : { heading, body: `Texto de hoy de «${heading}».` }
  );
  const ESQUEMA_POLITICAS = `
    create table public.policy_pages (
      id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
      sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());`;
  const prepararPoliticas = async (nombre, privacidad) => {
    const cp = await nuevaBase(nombre, ESQUEMA_POLITICAS);
    await cp.query(
      "insert into public.policy_pages (slug, title, intro, sections, sort_order, updated_at) values ('privacidad', 'Política de privacidad', 'Intro', $1::jsonb, 14, '2026-10-22T15:08:41Z'), ('terminos', 'Términos y condiciones', 'Intro', '[]'::jsonb, 30, '2026-10-16T18:49:06Z')",
      [JSON.stringify(privacidad)]
    );
    return cp;
  };
  const leer = async (cp, slug) => (await cp.query("select * from public.policy_pages where slug = $1", [slug])).rows;
  const cuerpo = (fila, titulo) => (fila.sections.find((s) => s.heading === titulo) ?? {}).body ?? "";

  const c8 = await prepararPoliticas("vz_aislada_politicas", PRIVACIDAD_HOY);
  await c8.query(POLITICAS);
  let [priv] = await leer(c8, "privacidad");
  ok(JSON.stringify(priv.sections.map((s) => s.heading)) === JSON.stringify(TITULOS), "Políticas: la privacidad conserva sus 8 apartados en el mismo orden");
  ok(
    /una foto si decides añadirla/.test(cuerpo(priv, "Qué datos tratamos")) &&
      /comentarios de las noticias y en las reseñas/.test(cuerpo(priv, "Qué datos tratamos")) &&
      /Tu nombre de usuario y tu foto, si la añades, se ven/.test(cuerpo(priv, "Para qué usamos tus datos")) &&
      /registro interno de qué se hizo, a quién y cuándo/.test(cuerpo(priv, "Para qué usamos tus datos")) &&
      /al menos 14 años/.test(cuerpo(priv, "Base legal")) &&
      /deja de estar vinculado a ti/.test(cuerpo(priv, "Cuánto tiempo conservamos tus datos")),
    "Políticas: dice que el usuario y la foto se ven, la foto es opcional, el perfil pide 14 años y que hay un registro de moderación"
  );
  ok(
    /Supabase \(base de datos, cuentas y fotos\), Vercel/.test(cuerpo(priv, "Con quién compartimos tus datos")) &&
      /OpenAI/.test(cuerpo(priv, "Con quién compartimos tus datos")) &&
      !/Stripe|proveedor de pagos|u otro que uses/.test(JSON.stringify(priv.sections)),
    "Políticas: ya no habla de un «proveedor de pagos (Supabase/Stripe u otro que uses)»: nombra los proveedores reales"
  );
  ok(
    ["Responsable del tratamiento", "Cookies y analítica propia", "Tus derechos"].every((t) => cuerpo(priv, t) === `Texto de hoy de «${t}».`),
    "Políticas: los apartados que no cambian se quedan exactamente como estaban (responsable, cookies, derechos)"
  );
  ok(new Date(priv.updated_at).getFullYear() > 2025 && priv.updated_at.toISOString() !== "2026-10-22T15:08:41.000Z", "Políticas: la fecha de actualización cambia");
  const [terminos] = await leer(c8, "terminos");
  ok(terminos.updated_at.toISOString() === "2026-10-16T18:49:06.000Z", "Políticas: las otras políticas no se tocan");
  let normas = await leer(c8, "normas-foro");
  ok(
    normas.length === 1 && normas[0].is_active && normas[0].sort_order === 40 && normas[0].title === "Normas del Foro" && normas[0].sections.length === 5,
    "Políticas: crea la página «Normas del Foro» publicada, con sus 5 apartados"
  );
  ok(/silenciar a una persona durante unos días \(1, 3 o 7\)/.test(cuerpo(normas[0], "Si no se cumplen")), "Políticas: las normas explican qué pasa si no se cumplen (silencio de 1, 3 o 7 días)");

  // Idempotente y respetuosa con lo que edite el dueño después.
  const antes = priv.updated_at.toISOString();
  await c8.query("update public.policy_pages set intro = 'Intro editada por el dueño' where slug = 'normas-foro'");
  await c8.query(
    "update public.policy_pages set sections = jsonb_set(sections, '{7,body}', to_jsonb('Derechos editados por el dueño'::text)) where slug = 'privacidad'"
  );
  await c8.query("update public.policy_pages set updated_at = '2026-10-31T10:00:00Z' where slug = 'privacidad'");
  await c8.query(POLITICAS);
  [priv] = await leer(c8, "privacidad");
  normas = await leer(c8, "normas-foro");
  ok(priv.updated_at.toISOString() === "2026-10-31T10:00:00.000Z" && antes !== priv.updated_at.toISOString(), "Políticas: aplicarla otra vez no cambia nada (ya estaba al día)");
  ok(cuerpo(priv, "Tus derechos") === "Derechos editados por el dueño" && normas.length === 1 && normas[0].intro === "Intro editada por el dueño", "Políticas: y respeta lo que el dueño haya editado después (no duplica las normas)");
  await c8.end();

  // Si al dueño le faltara un apartado, los demás se actualizan igual y no falla.
  const sinBase = PRIVACIDAD_HOY.filter((s) => s.heading !== "Base legal");
  const c9 = await prepararPoliticas("vz_aislada_politicas_incompleta", sinBase);
  await c9.query(POLITICAS);
  [priv] = await leer(c9, "privacidad");
  ok(priv.sections.length === 7 && /una foto si decides añadirla/.test(cuerpo(priv, "Qué datos tratamos")), "Políticas: sin uno de los apartados, actualiza los demás y no añade ni quita nada");
  await c9.end();

  // PRUEBA DE LAS PRUEBAS: si el cruce por título se hiciera sin «left join», se perderían los apartados que no cambian.
  const rotaPoliticas = POLITICAS.replace("left join nuevos n on", "join nuevos n on");
  ok(rotaPoliticas !== POLITICAS, "(control) se ha podido romper el cruce por título en la copia de prueba");
  const c10 = await prepararPoliticas("vz_aislada_politicas_rota", PRIVACIDAD_HOY);
  await c10.query(rotaPoliticas);
  [priv] = await leer(c10, "privacidad");
  ok(priv.sections.length !== 8, `(control) con el cruce roto se pierden apartados y la comprobación SÍ lo detecta (${priv.sections.length} apartados)`);
  await c10.end();
  }

  // 12) Números de seguimiento (20261031170000), sobre pedidos y reparaciones como están en producción (columnas,
  // disparadores y permisos copiados de la base de datos real).
  {
  const NUMEROS = readFileSync("supabase/migrations/20261031170000_seguimiento_codigos.sql", "utf8");
  const U3 = "33333333-3333-4333-8333-333333333333";
  const ESQUEMA_NUMEROS = `
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant usage on schema public to service_role;
    grant usage on schema auth to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    insert into auth.users (id, email) values ('${U3}', 'u3@example.com');
    insert into public.profiles (id, role) values ('${U3}', 'user');
    create table public.service_requests (
      id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      service_id uuid, service_title text not null, nombre text not null, apellido text not null, metodo_contacto text, contacto text,
      ciudad text not null, direccion text, disponibilidad text, comentario text, status text not null default 'nuevo', nota_admin text,
      customer_user_id uuid references auth.users (id) on delete set null, seguimiento text not null default 'solicitado',
      seguimiento_nota text, seguimiento_actualizado timestamptz not null default now());
    create table public.pedidos (
      id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), user_id uuid references auth.users (id) on delete set null,
      estado text not null default 'pendiente', entrega text not null default 'envio', nombre text not null, email text not null,
      telefono text not null, direccion text, codigo_postal text, ciudad text, notas text, total_eur numeric not null default 0, nota_admin text);
    create table public.policy_pages (
      id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
      sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    insert into public.policy_pages (slug, title, sections) values ('privacidad', 'Política de privacidad',
      '[{"heading":"Qué datos tratamos","body":"Datos."},{"heading":"Para qué usamos tus datos","body":"Para gestionar tu pedido."}]'::jsonb);
    -- Disparadores de producción.
    create function public.solicitudes_campos_internos() returns trigger language plpgsql security definer set search_path = public, pg_temp as $f$
    begin
      if not public.is_admin() then
        new.status := 'nuevo'; new.nota_admin := null;
        if tg_table_name = 'service_requests' then new.seguimiento := 'solicitado'; new.seguimiento_nota := null; new.seguimiento_actualizado := now(); end if;
      end if;
      return new;
    end $f$;
    create function public.set_request_customer_user_id() returns trigger language plpgsql security definer set search_path = public as $f$
    begin new.customer_user_id := auth.uid(); return new; end $f$;
    create function public.set_service_requests_updated_at() returns trigger language plpgsql set search_path = public, pg_temp as $f$
    begin new.updated_at = now(); return new; end $f$;
    create function public.set_pedidos_updated_at() returns trigger language plpgsql set search_path = public as $f$
    begin new.updated_at := now(); return new; end $f$;
    create trigger trg_service_requests_campos_internos before insert on public.service_requests for each row execute function public.solicitudes_campos_internos();
    create trigger trg_service_requests_customer_user_id before insert on public.service_requests for each row execute function public.set_request_customer_user_id();
    create trigger trg_service_requests_updated_at before update on public.service_requests for each row execute function public.set_service_requests_updated_at();
    create trigger trg_pedidos_updated_at before update on public.pedidos for each row execute function public.set_pedidos_updated_at();
    -- Permisos de producción (RLS).
    alter table public.service_requests enable row level security;
    alter table public.pedidos enable row level security;
    create policy service_requests_insert_public on public.service_requests for insert to anon, authenticated with check (true);
    create policy service_requests_select_own on public.service_requests for select to authenticated using (customer_user_id = auth.uid());
    create policy service_requests_select_admin on public.service_requests for select to authenticated using (public.is_admin());
    create policy service_requests_update_admin on public.service_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy pedidos_admin_select on public.pedidos for select to authenticated using ((select public.is_admin()));
    create policy pedidos_admin_update on public.pedidos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
    create policy pedidos_cliente_select on public.pedidos for select to authenticated using (user_id = (select auth.uid()));
    -- Lo que ya existía antes de la migración (con fecha de actualización de hace 3 días).
    insert into public.service_requests (service_title, nombre, apellido, ciudad, updated_at) values
      ('Reparación de mando (sin cuenta)', 'Ana', 'Gil', 'Zaragoza', now() - interval '3 days'),
      ('Limpieza de consola (sin cuenta)', 'Eva', 'Sanz', 'Huesca', now() - interval '3 days');
    insert into public.pedidos (nombre, email, telefono, updated_at) values
      ('Luis', 'luis@example.com', '600111222', now() - interval '3 days'),
      ('Marta', 'marta@example.com', '600333444', now() - interval '3 days');`;
  const FORMATO = /^VZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  const comoServidor = async (cs, consulta) => {
    await cs.query("begin");
    try {
      await cs.query("set local role service_role");
      await cs.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      const r = await cs.query(consulta);
      await cs.query("commit");
      return { ok: true, filas: r.rows };
    } catch (e) {
      await cs.query("rollback");
      return { ok: false, codigo: e.code, mensaje: String(e.message) };
    }
  };
  const vincular = async (cs, uid, codigo) => {
    const r = await como(cs, "authenticated", uid, `select public.vincular_seguimiento('${codigo}') as r`, { confirmar: true });
    return r.ok ? r.filas[0].r : { error: r.codigo };
  };
  const prepararNumeros = async (nombre, sql) => {
    const cs = await nuevaBase(nombre, ESQUEMA_NUMEROS);
    await cs.query(sql);
    return cs;
  };

  const c11 = await prepararNumeros("vz_aislada_numeros", NUMEROS);
  const codigos = async (cs) => (await cs.query("select codigo_seguimiento as c from public.service_requests union all select codigo_seguimiento from public.pedidos")).rows.map((x) => x.c);
  const antesNumeros = await codigos(c11);
  ok(antesNumeros.length === 4 && antesNumeros.every((x) => FORMATO.test(x ?? "")) && new Set(antesNumeros).size === 4, `Números: lo que ya existía recibe su número, con formato y sin repetir (${antesNumeros.join(", ")})`);
  ok(antesNumeros.every((x) => !/[IO01]/.test(x.slice(3))), "Números: sin 0, O, 1 ni I (no se confunden al dictarlos)");
  const fechas = (await c11.query("select updated_at < now() - interval '2 days' as vieja from public.service_requests union all select updated_at < now() - interval '2 days' from public.pedidos")).rows;
  ok(fechas.every((f) => f.vieja), "Números: ponerlos no cambia la fecha de actualización (el aviso de «48 h sin cambios» sigue igual)");
  const disparadores = (await c11.query("select tgname, tgenabled from pg_trigger where tgrelid in ('public.service_requests'::regclass, 'public.pedidos'::regclass) and not tgisinternal")).rows;
  ok(disparadores.length === 6 && disparadores.every((t) => t.tgenabled === "O"), `Números: después, todos los disparadores vuelven a estar encendidos (${disparadores.map((t) => `${t.tgname}:${t.tgenabled}`).join(", ")})`);
  let repetidaNumeros = true;
  try {
    await c11.query(NUMEROS);
  } catch {
    repetidaNumeros = false;
  }
  ok(repetidaNumeros && JSON.stringify(await codigos(c11)) === JSON.stringify(antesNumeros), "Números: la migración se puede aplicar dos veces y los números no cambian");

  // El número lo pone siempre la base de datos; id_veoaura solo el servidor.
  await como(c11, "anon", null, `insert into public.service_requests (service_title, nombre, apellido, ciudad, codigo_seguimiento, id_veoaura) values ('Formulario web', 'Pepe', 'Ruiz', 'Zaragoza', 'VZ-AAAA-AAAA', '${U2}')`, { confirmar: true });
  const web = (await c11.query("select codigo_seguimiento, id_veoaura, customer_user_id from public.service_requests where service_title = 'Formulario web'")).rows[0];
  ok(!!web && FORMATO.test(web.codigo_seguimiento) && web.codigo_seguimiento !== "VZ-AAAA-AAAA" && web.id_veoaura === null, `Números: un formulario de la web recibe su número aunque intente elegirlo, y no puede hacerse pasar por VeoAura (${web?.codigo_seguimiento}, id_veoaura ${web?.id_veoaura})`);
  const ficha = await comoServidor(c11, "insert into public.service_requests (service_title, nombre, apellido, ciudad, id_veoaura) values ('Ficha de VeoAura', 'Cliente', '', '', 'veoaura-1') returning codigo_seguimiento, id_veoaura, customer_user_id");
  ok(ficha.ok && FORMATO.test(ficha.filas[0].codigo_seguimiento) && ficha.filas[0].id_veoaura === "veoaura-1" && ficha.filas[0].customer_user_id === null, `Números: el servidor (puente de VeoAura) crea la ficha con su id_veoaura y recibe el número (${ficha.ok ? ficha.filas[0].codigo_seguimiento : ficha.mensaje})`);
  const fichaPedido = await comoServidor(c11, "insert into public.pedidos (nombre, email, telefono, estado, id_veoaura) values ('Rosa', 'rosa@example.com', '600555666', 'preparado', 'veoaura-2') returning codigo_seguimiento, id_veoaura, numero");
  ok(fichaPedido.ok && FORMATO.test(fichaPedido.filas[0].codigo_seguimiento) && fichaPedido.filas[0].id_veoaura === "veoaura-2", "Números: también un pedido de VeoAura");
  const cambio = await como(c11, "authenticated", ADMIN, "update public.service_requests set codigo_seguimiento = 'VZ-BBBB-BBBB', id_veoaura = 'otro' where id_veoaura = 'veoaura-1'", { confirmar: true });
  const trasCambio = (await c11.query("select codigo_seguimiento, id_veoaura from public.service_requests where service_title = 'Ficha de VeoAura'")).rows[0];
  ok(cambio.ok && trasCambio.codigo_seguimiento === ficha.filas[0].codigo_seguimiento && trasCambio.id_veoaura === "veoaura-1", "Números: ni el administrador cambia el número ni la ficha de VeoAura");
  const generarAnon = await como(c11, "anon", null, "select public.generar_codigo_seguimiento()");
  const generarCliente = await como(c11, "authenticated", U1, "select public.generar_codigo_seguimiento()");
  ok(!generarAnon.ok && !generarCliente.ok && generarAnon.codigo === "42501", "Números: nadie genera números por su cuenta (42501)");

  // Añadir un número a la cuenta.
  const reparacionSinCuenta = (await c11.query("select id, codigo_seguimiento as c from public.service_requests where service_title = 'Reparación de mando (sin cuenta)'")).rows[0];
  const pedidoSinCuenta = (await c11.query("select id, numero, codigo_seguimiento as c from public.pedidos where nombre = 'Luis'")).rows[0];
  const anonVincula = await como(c11, "anon", null, `select public.vincular_seguimiento('${reparacionSinCuenta.c}')`);
  ok(!anonVincula.ok && anonVincula.codigo === "42501", "Vincular: un visitante sin sesión no puede (42501)");
  const publicPuede = (await c11.query("select has_function_privilege('public', 'public.vincular_seguimiento(text)', 'execute') as p")).rows[0].p;
  ok(publicPuede === false, "Vincular: PUBLIC tampoco la ejecuta");
  const fmt = await vincular(c11, U2, "hola");
  ok(fmt.ok === false && fmt.motivo === "formato", `Vincular: un texto sin el formato dice «formato» (${JSON.stringify(fmt)})`);
  const noExiste = await vincular(c11, U2, "VZ-2222-2222");
  ok(noExiste.ok === false && noExiste.motivo === "no_existe", "Vincular: un número que no existe dice «no_existe»");
  const escrito = reparacionSinCuenta.c.toLowerCase().replace(/-/g, " ");
  const bien = await vincular(c11, U2, escrito);
  const trasVincular = (await c11.query(`select customer_user_id, vinculado_en from public.service_requests where id = '${reparacionSinCuenta.id}'`)).rows[0];
  ok(bien.ok === true && bien.tipo === "reparacion" && bien.titulo === "Reparación de mando (sin cuenta)" && trasVincular.customer_user_id === U2 && !!trasVincular.vinculado_en, `Vincular: con su número (en minúsculas y con espacios: «${escrito}») la reparación pasa a la cuenta y se apunta cuándo`);
  const otraVez = await vincular(c11, U2, reparacionSinCuenta.c);
  ok(otraVez.ok === true && otraVez.ya_estaba === true, "Vincular: repetirlo no falla (ya estaba)");
  const ajeno = await vincular(c11, U1, reparacionSinCuenta.c);
  const sigue = (await c11.query(`select customer_user_id from public.service_requests where id = '${reparacionSinCuenta.id}'`)).rows[0];
  ok(ajeno.ok === false && ajeno.motivo === "otra_cuenta" && sigue.customer_user_id === U2, "Vincular: otra persona no se la puede quitar (otra_cuenta)");
  const pedidoBien = await vincular(c11, U2, pedidoSinCuenta.c);
  ok(pedidoBien.ok === true && pedidoBien.tipo === "pedido" && Number(pedidoBien.numero) === Number(pedidoSinCuenta.numero), "Vincular: un pedido sin cuenta (hecho sin sesión o creado en VeoAura) también");
  const veVinculados = await como(c11, "authenticated", U2, "select (select count(*) from public.service_requests) as r, (select count(*) from public.pedidos) as p");
  const otroVe = await como(c11, "authenticated", U1, "select (select count(*) from public.service_requests) as r, (select count(*) from public.pedidos) as p");
  ok(Number(veVinculados.filas[0].r) === 1 && Number(veVinculados.filas[0].p) === 1 && Number(otroVe.filas[0].r) === 0 && Number(otroVe.filas[0].p) === 0, "Vincular: desde ese momento el cliente los ve (y nadie más)");

  // Límite: 10 intentos fallidos por hora (U1 ya lleva 1: «otra_cuenta»).
  for (let i = 0; i < 9; i++) await vincular(c11, U1, `VZ-2222-22${"ABCDEFGHJ"[i]}${"ABCDEFGHJ"[i]}`);
  const libre = (await c11.query("select codigo_seguimiento as c from public.service_requests where service_title = 'Limpieza de consola (sin cuenta)'")).rows[0].c;
  const bloqueado = await vincular(c11, U1, libre);
  const sigueLibre = (await c11.query("select customer_user_id from public.service_requests where service_title = 'Limpieza de consola (sin cuenta)'")).rows[0];
  ok(bloqueado.ok === false && bloqueado.motivo === "demasiados_intentos" && sigueLibre.customer_user_id === null, "Vincular: tras 10 intentos fallidos en una hora no deja seguir (aunque el número sea bueno)");
  const otroUsuario = await vincular(c11, U3, libre);
  ok(otroUsuario.ok === true, "Vincular: el límite es por persona (otra persona sí puede)");
  const intentosCliente = await como(c11, "authenticated", U1, "select count(*) as n from public.seguimiento_intentos");
  const intentosAdmin = await como(c11, "authenticated", ADMIN, "select count(*) filter (where acierto) as si, count(*) filter (where not acierto) as no from public.seguimiento_intentos");
  const escribeIntento = await como(c11, "authenticated", U1, `insert into public.seguimiento_intentos (user_id) values ('${U1}')`);
  ok(Number(intentosCliente.filas[0].n) === 0 && Number(intentosAdmin.filas[0].si) === 4 && Number(intentosAdmin.filas[0].no) === 12 && !escribeIntento.ok, `Vincular: los intentos solo los lee el administrador (4 añadidos y 12 fallidos) y nadie los escribe a mano (${JSON.stringify(intentosAdmin.filas[0])})`);
  const fichaVin = (await c11.query("select prosecdef, proconfig from pg_proc where proname = 'vincular_seguimiento'")).rows[0];
  ok(fichaVin.prosecdef === true && (fichaVin.proconfig ?? []).some((s) => s.startsWith("search_path=")), "Vincular: la función tiene el search_path fijado");
  const privNumeros = (await c11.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
  const frases = JSON.stringify(privNumeros).split("número de seguimiento").length - 1;
  ok(frases === 1, `Números: la privacidad explica el número de seguimiento una sola vez aunque se repita la migración (${frases})`);
  await c11.end();

  // PRUEBA DE LAS PRUEBAS: sin el límite de intentos, la comprobación del límite falla.
  const sinLimite = NUMEROS.replace("created_at > now() - interval '1 hour') >= 10 then", "created_at > now() - interval '1 hour') >= 1000 then");
  ok(sinLimite !== NUMEROS, "(control) se ha podido quitar el límite de intentos en la copia de prueba");
  const c12 = await prepararNumeros("vz_aislada_numeros_sin_limite", sinLimite);
  for (let i = 0; i < 10; i++) await vincular(c12, U1, `VZ-2222-22${"ABCDEFGHJK"[i]}${"ABCDEFGHJK"[i]}`);
  const libre2 = (await c12.query("select codigo_seguimiento as c from public.service_requests limit 1")).rows[0].c;
  const sinFreno = await vincular(c12, U1, libre2);
  ok(sinFreno.ok === true, "(control) sin el límite, el intento 11 entra: la comprobación SÍ lo detecta");
  await c12.end();
  }
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
