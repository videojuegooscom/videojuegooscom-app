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
 *  - Seguidores de TikTok e Instagram (20261101100000_redes_seguidores.sql), sobre social_links como en producción: añade
 *    las dos columnas sin tocar los permisos; cualquiera los lee; solo el administrador los escribe; no admite negativos;
 *    repetirla no duplica nada ni borra lo escrito (con su «prueba de las pruebas»: sin la comprobación, entra un negativo).
 *  - Reseñas en los canales de venta (20261101120000_resenas_canales.sql), sobre site_settings como en producción: lo
 *    mismo (dos columnas sin tocar permisos, lectura pública, solo el administrador escribe, sin negativos, repetible).
 *  - Cuánto se ve la portada en Inicio (20261101140000_categorias_opacidad_portada.sql), sobre categories como en
 *    producción: la columna sin tocar permisos, lectura pública, solo el administrador la cambia, solo de 10 a 100 y
 *    repetible (con su «prueba de las pruebas»: sin la comprobación, entra un 5 %).
 *  - El encuadre de cada portada para Inicio (20261101170000_categorias_portadas_inicio.sql): la columna (lista de
 *    textos, vacía para las que ya había), sin tocar permisos, solo el administrador la cambia, lectura pública y
 *    repetible (con su «prueba de las pruebas»: sin «if not exists», aplicarla dos veces falla).
 *  - Dónde va el nombre encima de la portada (20261101190000_categorias_titulo_posicion.sql): la columna (vacía = en el
 *    centro), sin tocar permisos, solo el administrador la cambia, lectura pública, solo {x, y} entre 0 y 100 y
 *    repetible (con su «prueba de las pruebas»: sin la comprobación, entra un 120 %).
 *  - «Mejoras en la tienda» (20261101200000_mejoras_tienda.sql): sin sesión nada; cada cliente envía las suyas (a su
 *    nombre, sin leer, de 3 a 500 letras, desde blue/pie/perfil) y solo ve las suyas; el administrador las ve todas y las
 *    marca como leídas; nadie las borra desde la app; 5 al día por persona; se van con la cuenta; la privacidad lo explica
 *    una vez (con su «prueba de las pruebas»: sin el límite, entra la sexta).
 *  - Dirección de envío en «Mi perfil» (20261102120000_perfiles_direccion.sql): 4 columnas con sus comprobaciones, sin tocar
 *    permisos; cada cliente guarda y cambia la suya, nadie más que él y el administrador la ve, el Foro sigue dando solo
 *    usuario y foto; la privacidad lo explica una vez (con su «prueba de las pruebas»: sin las comprobaciones, entra «5»).
 *  - Resend en la privacidad (20261103100000_privacidad_resend.sql): una frase en «Con quién compartimos tus datos», una
 *    sola vez y sin tocar lo demás (con su «prueba de las pruebas»: sin la condición, la frase se repite).
 *  - Nombre del titular y correo de protección de datos (20261017200000_politicas_nombre_titular.sql y
 *    20261103130000_politicas_email_contacto.sql): solo cambian las marcas, las demás políticas no se tocan y aplicadas
 *    otra vez no cambian nada (con su «prueba de las pruebas»: con la marca sin tilde, el correo no se pondría).
 *  - Tope diario del historial de Blue IA (20261103150000_blue_ia_limite_diario.sql): 300 mensajes y 40 conversaciones
 *    nuevas al día por persona (también de golpe), por persona, sin tocar políticas y repetible (con su «prueba de las
 *    pruebas»: sin los disparadores, entra el 301).
 *  - VeoAura (20261103180000_privacidad_veoaura.sql y 20261103181000_escaparate_pedido_pagado.sql): la privacidad lo
 *    explica una vez sin tocar lo demás; los avisos que había siguen igual, entra «pedido_pagado» y nada fuera de la
 *    lista, sin tocar permisos (con sus «pruebas de las pruebas»: sin la migración no entra; sin la condición, la frase
 *    se repite).
 *  - Pago con tarjeta (20261105120000_pagos_tarjeta.sql y 20261105121000_politicas_pago_tarjeta.sql): 7 columnas sin
 *    tocar permisos ni los pedidos que había; no entran valores raros; el servidor apunta el pago sin cambiar el total;
 *    el cliente ve el de su pedido y no puede apuntárselo; Stripe en la privacidad y los términos una sola vez (con sus
 *    «pruebas de las pruebas»: sin la condición la frase se repite; sin las comprobaciones entra un estado inventado).
 *
 * Uso: node pruebas/perfiles-sql.mjs [carpeta_temporal]      (por defecto, una carpeta nueva en el directorio temporal)
 * Requisitos: embedded-postgres y pg (instalados en el servidor sin guardarlos en package.json).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
      if not exists (select 1 from pg_roles where rolname = 'puente_tienda') then create role puente_tienda nologin bypassrls; end if;
    end $$;
    -- El servidor (puente de VeoAura): un rol que no es de cliente y que se salta las políticas, como el de Supabase.
    grant usage on schema public to puente_tienda;
    grant usage on schema auth to puente_tienda;
    alter default privileges in schema public grant all on tables to puente_tienda;
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
      await cs.query("set local role puente_tienda");
      await cs.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "puente_tienda" })]);
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

  // 13) Seguidores de TikTok e Instagram (20261101100000), sobre social_links como está en producción (lectura pública y
  // solo el administrador la cambia).
  {
    const TABLA_REDES = `
      create table public.social_links (platform text primary key, label text not null, url text, enabled boolean not null default false,
        sort_order integer not null default 0, updated_at timestamptz default now(), updated_by uuid);
      alter table public.social_links enable row level security;
      create policy social_links_public_read on public.social_links for select using (true);
      create policy social_links_admin_update on public.social_links for update using (public.is_admin()) with check (public.is_admin());
      insert into public.social_links (platform, label, url, enabled, sort_order) values
        ('instagram', 'Instagram', 'Videojuegoszaragoza', true, 1), ('tiktok', 'TikTok', 'Videojuegoszaragoza', true, 2);
    `;
    const REDES = readFileSync("supabase/migrations/20261101100000_redes_seguidores.sql", "utf8");
    const c13 = await nuevaBase("vz_aislada_redes", TABLA_REDES + REDES);
    const columnas = (await c13.query("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'social_links' and column_name like 'seguidores%' order by 1")).rows;
    ok(columnas.map((x) => `${x.column_name}:${x.data_type}`).join(",") === "seguidores:integer,seguidores_actualizado:timestamp with time zone", `Redes: añade los seguidores y su fecha (${columnas.map((x) => x.column_name).join(", ")})`);
    const politicasRedes = (await c13.query("select policyname from pg_policies where tablename = 'social_links' order by 1")).rows.map((x) => x.policyname);
    ok(politicasRedes.join(",") === "social_links_admin_update,social_links_public_read", `Redes: no toca los permisos (siguen las 2 políticas: ${politicasRedes.join(", ")})`);
    const anonLee = await como(c13, "anon", null, "select platform, seguidores from public.social_links order by platform");
    ok(anonLee.ok && anonLee.filas.length === 2, "Redes: cualquiera (también sin sesión) lee los seguidores, como Inicio");
    const adminEscribe = await como(c13, "authenticated", ADMIN, "update public.social_links set seguidores = 1234, seguidores_actualizado = now() where platform = 'tiktok'", { confirmar: true });
    const clienteEscribe = await como(c13, "authenticated", U1, "update public.social_links set seguidores = 999999 where platform = 'tiktok'", { confirmar: true });
    const anonEscribe = await como(c13, "anon", null, "update public.social_links set seguidores = 5 where platform = 'instagram'", { confirmar: true });
    const quedan = Object.fromEntries((await c13.query("select platform, seguidores from public.social_links")).rows.map((x) => [x.platform, x.seguidores]));
    ok(adminEscribe.ok && adminEscribe.cuantas === 1 && quedan.tiktok === 1234, "Redes: el administrador escribe los seguidores");
    ok((!clienteEscribe.ok || clienteEscribe.cuantas === 0) && (!anonEscribe.ok || anonEscribe.cuantas === 0) && quedan.instagram === null, "Redes: un cliente o un visitante no los pueden cambiar");
    const negativo = await como(c13, "authenticated", ADMIN, "update public.social_links set seguidores = -5 where platform = 'instagram'");
    ok(!negativo.ok && negativo.codigo === "23514", `Redes: un número negativo no se guarda (${negativo.codigo ?? "entró"})`);
    let repetidaRedes = true;
    try {
      await c13.query(REDES);
    } catch {
      repetidaRedes = false;
    }
    const checks = Number((await c13.query("select count(*) as n from pg_constraint where conname = 'social_links_seguidores_check'")).rows[0].n);
    const sigue = (await c13.query("select seguidores from public.social_links where platform = 'tiktok'")).rows[0].seguidores;
    ok(repetidaRedes && checks === 1 && sigue === 1234, "Redes: la migración se puede aplicar dos veces sin duplicar nada ni borrar lo escrito");
    await c13.end();

    // PRUEBA DE LAS PRUEBAS: sin la comprobación, un número negativo entraría.
    const sinComprobacion = REDES.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    ok(sinComprobacion !== REDES, "(control) se ha podido quitar la comprobación en la copia de prueba");
    const c14 = await nuevaBase("vz_aislada_redes_sin_comprobacion", TABLA_REDES + sinComprobacion);
    const negativo2 = await como(c14, "authenticated", ADMIN, "update public.social_links set seguidores = -5 where platform = 'instagram'");
    ok(negativo2.ok, "(control) sin la comprobación entra un negativo: la prueba SÍ lo detecta");
    await c14.end();
  }

  // 14) Reseñas en los canales de venta (20261101120000), sobre site_settings como está en producción (fila única, lectura
  // pública y solo el administrador la cambia).
  {
    const TABLA_AJUSTES = `
      create table public.site_settings (id integer primary key, seo_title text, seo_description text, logo_url text,
        updated_at timestamptz default now(), updated_by uuid, social_links_title text);
      alter table public.site_settings enable row level security;
      create policy site_settings_public_read on public.site_settings for select using (true);
      create policy site_settings_admin_update on public.site_settings for update using (public.is_admin());
      insert into public.site_settings (id, seo_title, social_links_title) values (1, 'Videojuegos Zaragoza', 'Síguenos');
    `;
    const RESENAS = readFileSync("supabase/migrations/20261101120000_resenas_canales.sql", "utf8");
    const c15 = await nuevaBase("vz_aislada_resenas", TABLA_AJUSTES + RESENAS);
    const cols = (await c15.query("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'site_settings' and column_name like 'resenas%' order by 1")).rows;
    ok(cols.map((x) => `${x.column_name}:${x.data_type}`).join(",") === "resenas_canales:integer,resenas_canales_actualizado:timestamp with time zone", `Reseñas: añade el número y su fecha (${cols.map((x) => x.column_name).join(", ")})`);
    const polAjustes = (await c15.query("select policyname from pg_policies where tablename = 'site_settings' order by 1")).rows.map((x) => x.policyname);
    ok(polAjustes.join(",") === "site_settings_admin_update,site_settings_public_read", `Reseñas: no toca los permisos (${polAjustes.join(", ")})`);
    const anonLeeAjustes = await como(c15, "anon", null, "select resenas_canales from public.site_settings where id = 1");
    ok(anonLeeAjustes.ok && anonLeeAjustes.filas.length === 1, "Reseñas: cualquiera (también sin sesión) las lee, como Inicio");
    const adminRes = await como(c15, "authenticated", ADMIN, "update public.site_settings set resenas_canales = 350, resenas_canales_actualizado = now() where id = 1", { confirmar: true });
    const clienteRes = await como(c15, "authenticated", U1, "update public.site_settings set resenas_canales = 99999 where id = 1", { confirmar: true });
    const anonRes = await como(c15, "anon", null, "update public.site_settings set resenas_canales = 5 where id = 1", { confirmar: true });
    const quedaRes = (await c15.query("select resenas_canales from public.site_settings where id = 1")).rows[0].resenas_canales;
    ok(adminRes.ok && adminRes.cuantas === 1 && quedaRes === 350, "Reseñas: el administrador escribe el número");
    ok((!clienteRes.ok || clienteRes.cuantas === 0) && (!anonRes.ok || anonRes.cuantas === 0), "Reseñas: un cliente o un visitante no lo pueden cambiar");
    const negRes = await como(c15, "authenticated", ADMIN, "update public.site_settings set resenas_canales = -1 where id = 1");
    ok(!negRes.ok && negRes.codigo === "23514", `Reseñas: un número negativo no se guarda (${negRes.codigo ?? "entró"})`);
    let repetidaRes = true;
    try {
      await c15.query(RESENAS);
    } catch {
      repetidaRes = false;
    }
    const checksRes = Number((await c15.query("select count(*) as n from pg_constraint where conname = 'site_settings_resenas_canales_check'")).rows[0].n);
    const sigueRes = (await c15.query("select resenas_canales from public.site_settings where id = 1")).rows[0].resenas_canales;
    ok(repetidaRes && checksRes === 1 && sigueRes === 350, "Reseñas: la migración se puede aplicar dos veces sin duplicar nada ni borrar lo escrito");
    await c15.end();

    // PRUEBA DE LAS PRUEBAS: sin la comprobación, un número negativo entraría.
    const sinComprobacionRes = RESENAS.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    ok(sinComprobacionRes !== RESENAS, "(control) se ha podido quitar la comprobación de las reseñas en la copia de prueba");
    const c16 = await nuevaBase("vz_aislada_resenas_sin_comprobacion", TABLA_AJUSTES + sinComprobacionRes);
    const negRes2 = await como(c16, "authenticated", ADMIN, "update public.site_settings set resenas_canales = -1 where id = 1");
    ok(negRes2.ok, "(control) sin la comprobación entra un negativo: la prueba SÍ lo detecta");
    await c16.end();
  }

  // 15) Cuánto se ve la portada de cada categoría en Inicio (20261101140000), sobre categories como en producción
  // (lectura pública de las activas y solo el administrador cambia).
  {
    const TABLA_CATEGORIAS = `
      create table public.categories (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
        sort_order integer not null default 0, is_active boolean not null default true, image_url text, imagenes jsonb,
        created_at timestamptz default now(), updated_at timestamptz default now());
      alter table public.categories enable row level security;
      create policy categories_select_public_or_admin on public.categories for select using ((is_active = true) or public.is_admin());
      create policy categories_admin_update on public.categories for update using (public.is_admin());
      insert into public.categories (name, slug, imagenes) values ('PlayStation 5', 'playstation-5', '["https://fotos.ejemplo.invalid/ps5.jpg"]');
    `;
    const OPACIDAD = readFileSync("supabase/migrations/20261101140000_categorias_opacidad_portada.sql", "utf8");
    const c17 = await nuevaBase("vz_aislada_opacidad", TABLA_CATEGORIAS + OPACIDAD);
    const tipo = (await c17.query("select data_type from information_schema.columns where table_schema = 'public' and table_name = 'categories' and column_name = 'portada_opacidad'")).rows[0]?.data_type;
    ok(tipo === "smallint", `Opacidad: añade la columna (${tipo ?? "no está"})`);
    const polCat = (await c17.query("select policyname from pg_policies where tablename = 'categories' order by 1")).rows.map((x) => x.policyname);
    ok(polCat.join(",") === "categories_admin_update,categories_select_public_or_admin", `Opacidad: no toca los permisos (${polCat.join(", ")})`);
    const anonLeeCat = await como(c17, "anon", null, "select portada_opacidad from public.categories");
    ok(anonLeeCat.ok && anonLeeCat.filas.length === 1 && anonLeeCat.filas[0].portada_opacidad === null, "Opacidad: cualquiera la lee (vacía = 55 % en Inicio)");
    const adminCat = await como(c17, "authenticated", ADMIN, "update public.categories set portada_opacidad = 40 where slug = 'playstation-5'", { confirmar: true });
    const clienteCat = await como(c17, "authenticated", U1, "update public.categories set portada_opacidad = 100 where slug = 'playstation-5'", { confirmar: true });
    const quedaCat = (await c17.query("select portada_opacidad from public.categories")).rows[0].portada_opacidad;
    ok(adminCat.ok && adminCat.cuantas === 1 && (!clienteCat.ok || clienteCat.cuantas === 0) && quedaCat === 40, "Opacidad: el administrador la cambia; un cliente no");
    const fuera = [5, 101];
    const rechazos = [];
    for (const v of fuera) rechazos.push((await como(c17, "authenticated", ADMIN, `update public.categories set portada_opacidad = ${v}`)).codigo);
    ok(rechazos.every((cod) => cod === "23514"), `Opacidad: solo de 10 a 100 (5 y 101 se rechazan: ${rechazos.join(", ")})`);
    let repetidaCat = true;
    try {
      await c17.query(OPACIDAD);
    } catch {
      repetidaCat = false;
    }
    const checksCat = Number((await c17.query("select count(*) as n from pg_constraint where conname = 'categories_portada_opacidad_check'")).rows[0].n);
    ok(repetidaCat && checksCat === 1 && (await c17.query("select portada_opacidad from public.categories")).rows[0].portada_opacidad === 40, "Opacidad: la migración se puede aplicar dos veces sin duplicar nada ni borrar lo elegido");
    await c17.end();

    // PRUEBA DE LAS PRUEBAS: sin la comprobación, un 5 % entraría (la foto casi desaparecería).
    const sinComprobacionCat = OPACIDAD.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    ok(sinComprobacionCat !== OPACIDAD, "(control) se ha podido quitar la comprobación de la opacidad en la copia de prueba");
    const c18 = await nuevaBase("vz_aislada_opacidad_sin_comprobacion", TABLA_CATEGORIAS + sinComprobacionCat);
    ok((await como(c18, "authenticated", ADMIN, "update public.categories set portada_opacidad = 5")).ok, "(control) sin la comprobación entra un 5 %: la prueba SÍ lo detecta");
    await c18.end();

    // 16) El encuadre de cada portada para el recuadro de Inicio (20261101170000), sobre la misma tabla.
    const ENCUADRES = readFileSync("supabase/migrations/20261101170000_categorias_portadas_inicio.sql", "utf8");
    const c19 = await nuevaBase("vz_aislada_encuadres", TABLA_CATEGORIAS + OPACIDAD + ENCUADRES);
    const col = (await c19.query("select data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'categories' and column_name = 'portadas_inicio'")).rows[0];
    ok(col?.udt_name === "_text" && col?.is_nullable === "NO", `Encuadres: añade la columna, una lista de textos que nunca está vacía de valor (${JSON.stringify(col ?? null)})`);
    const yaEstaba = (await c19.query("select portadas_inicio from public.categories")).rows[0].portadas_inicio;
    ok(Array.isArray(yaEstaba) && yaEstaba.length === 0, `Encuadres: la categoría que ya existía queda sin encuadres (Inicio usa la foto entera: ${JSON.stringify(yaEstaba)})`);
    const polEnc = (await c19.query("select policyname from pg_policies where tablename = 'categories' order by 1")).rows.map((x) => x.policyname);
    ok(polEnc.join(",") === "categories_admin_update,categories_select_public_or_admin", `Encuadres: no toca los permisos (${polEnc.join(", ")})`);
    const encuadre = "https://fotos.ejemplo.invalid/inicio-1.jpg";
    const adminEnc = await como(c19, "authenticated", ADMIN, `update public.categories set portadas_inicio = array['${encuadre}'] where slug = 'playstation-5'`, { confirmar: true });
    const clienteEnc = await como(c19, "authenticated", U1, "update public.categories set portadas_inicio = array['https://otra.invalid/x.jpg']", { confirmar: true });
    const anonEnc = await como(c19, "anon", null, "select portadas_inicio from public.categories");
    ok(
      adminEnc.ok && adminEnc.cuantas === 1 && (!clienteEnc.ok || clienteEnc.cuantas === 0) && anonEnc.ok && anonEnc.filas[0]?.portadas_inicio?.[0] === encuadre,
      "Encuadres: el administrador los guarda, un cliente no, y cualquiera los lee (como la portada)"
    );
    let repetidaEnc = true;
    try {
      await c19.query(ENCUADRES);
    } catch {
      repetidaEnc = false;
    }
    ok(repetidaEnc && (await c19.query("select portadas_inicio from public.categories")).rows[0].portadas_inicio?.[0] === encuadre, "Encuadres: la migración se puede aplicar dos veces sin borrar lo guardado");
    await c19.end();

    // PRUEBA DE LAS PRUEBAS: sin «if not exists», aplicarla otra vez falla (y la prueba de arriba lo habría visto).
    const sinSiNoExiste = ENCUADRES.replace("add column if not exists", "add column");
    ok(sinSiNoExiste !== ENCUADRES, "(control) se ha podido quitar «if not exists» en la copia de prueba");
    const c20 = await nuevaBase("vz_aislada_encuadres_sin_si_no_existe", TABLA_CATEGORIAS + sinSiNoExiste);
    let falla = false;
    try {
      await c20.query(sinSiNoExiste);
    } catch {
      falla = true;
    }
    ok(falla, "(control) sin «if not exists» aplicarla dos veces falla: la prueba SÍ lo detecta");
    await c20.end();

    // 17) Dónde va el nombre encima de la portada (20261101190000), sobre la misma tabla.
    const POSICION = readFileSync("supabase/migrations/20261101190000_categorias_titulo_posicion.sql", "utf8");
    const c21 = await nuevaBase("vz_aislada_posicion", TABLA_CATEGORIAS + OPACIDAD + ENCUADRES + POSICION);
    const tipoPos = (await c21.query("select data_type from information_schema.columns where table_schema = 'public' and table_name = 'categories' and column_name = 'titulo_posicion'")).rows[0]?.data_type;
    const vaciaPos = (await c21.query("select titulo_posicion from public.categories")).rows[0].titulo_posicion;
    ok(tipoPos === "jsonb" && vaciaPos === null, `Posición del nombre: añade la columna, vacía para la que ya había (en el centro) (${tipoPos ?? "no está"})`);
    const polPos = (await c21.query("select policyname from pg_policies where tablename = 'categories' order by 1")).rows.map((x) => x.policyname);
    ok(polPos.join(",") === "categories_admin_update,categories_select_public_or_admin", `Posición del nombre: no toca los permisos (${polPos.join(", ")})`);
    const adminPos = await como(c21, "authenticated", ADMIN, `update public.categories set titulo_posicion = '{"x": 30, "y": 22}' where slug = 'playstation-5'`, { confirmar: true });
    const clientePos = await como(c21, "authenticated", U1, `update public.categories set titulo_posicion = '{"x": 90, "y": 90}'`, { confirmar: true });
    const anonPos = await como(c21, "anon", null, "select titulo_posicion from public.categories");
    ok(
      adminPos.ok && adminPos.cuantas === 1 && (!clientePos.ok || clientePos.cuantas === 0) && anonPos.ok && anonPos.filas[0]?.titulo_posicion?.x === 30,
      "Posición del nombre: el administrador la guarda, un cliente no, y cualquiera la lee (como la portada)"
    );
    const malas = [`'{"x": 120, "y": 50}'`, `'{"x": -1, "y": 50}'`, `'{"x": "a", "y": 50}'`, `'{"x": 50}'`, `'[50, 50]'`];
    const codigosPos = [];
    for (const v of malas) codigosPos.push((await como(c21, "authenticated", ADMIN, `update public.categories set titulo_posicion = ${v}`)).codigo);
    ok(codigosPos.every((c) => c === "23514" || c === "22P02"), `Posición del nombre: solo {x, y} entre 0 y 100 (las 5 malas se rechazan: ${codigosPos.join(", ")})`);
    let repetidaPos = true;
    try {
      await c21.query(POSICION);
    } catch {
      repetidaPos = false;
    }
    const checksPos = Number((await c21.query("select count(*) as n from pg_constraint where conname = 'categories_titulo_posicion_check'")).rows[0].n);
    ok(repetidaPos && checksPos === 1 && (await c21.query("select titulo_posicion from public.categories")).rows[0].titulo_posicion?.y === 22, "Posición del nombre: la migración se puede aplicar dos veces sin duplicar nada ni borrar lo guardado");
    await c21.end();

    // PRUEBA DE LAS PRUEBAS: sin la comprobación, una posición fuera del recuadro (120 %) entraría.
    const sinComprobacionPos = POSICION.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    ok(sinComprobacionPos !== POSICION, "(control) se ha podido quitar la comprobación de la posición en la copia de prueba");
    const c22 = await nuevaBase("vz_aislada_posicion_sin_comprobacion", TABLA_CATEGORIAS + sinComprobacionPos);
    ok((await como(c22, "authenticated", ADMIN, `update public.categories set titulo_posicion = '{"x": 120, "y": 50}'`)).ok, "(control) sin la comprobación entra un 120 %: la prueba SÍ lo detecta");
    await c22.end();
  }

  // 18) «Mejoras en la tienda» (20261101200000): la tabla de ideas, quién ve y escribe qué, el límite diario, que se van
  // con la cuenta y la frase de la privacidad (sobre la política como está en producción: sus 8 apartados).
  {
    const MEJORAS = readFileSync("supabase/migrations/20261101200000_mejoras_tienda.sql", "utf8");
    const TITULOS_PRIV = ["Responsable del tratamiento", "Qué datos tratamos", "Para qué usamos tus datos", "Base legal", "Con quién compartimos tus datos", "Cuánto tiempo conservamos tus datos", "Cookies y analítica propia", "Tus derechos"];
    const PRIV = JSON.stringify(TITULOS_PRIV.map((heading) => ({ heading, body: `Texto de hoy de «${heading}».` })));
    const ESQUEMA_MEJORAS = `
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values ('privacidad', 'Política de privacidad', '${PRIV.replace(/'/g, "''")}'::jsonb), ('terminos', 'Términos', '[]'::jsonb);
    `;
    const c23 = await nuevaBase("vz_aislada_mejoras", ESQUEMA_MEJORAS + MEJORAS);
    let repetidaMej = true;
    try {
      await c23.query(MEJORAS);
    } catch (e) {
      repetidaMej = false;
      console.log(String(e.message));
    }
    const politicasMej = (await c23.query("select policyname from pg_policies where schemaname = 'public' and tablename = 'mejoras_tienda' order by 1")).rows.map((r) => r.policyname);
    const disparadores = Number((await c23.query("select count(*) as n from pg_trigger where tgrelid = 'public.mejoras_tienda'::regclass and not tgisinternal")).rows[0].n);
    ok(repetidaMej && politicasMej.length === 3 && disparadores === 1, `Mejoras: la migración se puede aplicar dos veces sin duplicar políticas ni el límite (${politicasMej.join(", ")}; ${disparadores} disparador)`);
    ok((await c23.query("select relrowsecurity from pg_class where oid = 'public.mejoras_tienda'::regclass")).rows[0].relrowsecurity === true, "Mejoras: la seguridad por filas (RLS) está activada");
    const privMej = async (rol, p) => (await c23.query("select has_table_privilege($1, 'public.mejoras_tienda', $2) as t", [rol, p])).rows[0].t;
    ok(!(await privMej("anon", "select")) && !(await privMej("anon", "insert")) && !(await privMej("anon", "update")) && !(await privMej("anon", "delete")), "Mejoras: los visitantes sin sesión (anon) no tienen ningún permiso");
    ok((await privMej("authenticated", "insert")) && !(await privMej("authenticated", "delete")), "Mejoras: con sesión se pueden enviar, pero nadie las borra desde la app");
    const anonMej = await como(c23, "anon", null, "insert into public.mejoras_tienda (texto) values ('Hola desde fuera')");
    ok(!anonMej.ok && anonMej.codigo === "42501", `Mejoras: sin sesión no se puede enviar (${anonMej.codigo})`);

    const propiaMej = await como(c23, "authenticated", U1, "insert into public.mejoras_tienda (texto, origen) values ('Poned filtro por precio en el catálogo', 'pie') returning user_id, leida", { confirmar: true });
    ok(propiaMej.ok && propiaMej.filas[0]?.user_id === U1 && propiaMej.filas[0]?.leida === false, "Mejoras: un cliente envía su idea; queda a su nombre y sin leer");
    const ajenaMej = await como(c23, "authenticated", U1, `insert into public.mejoras_tienda (user_id, texto) values ('${U2}', 'A nombre de otra persona')`);
    ok(!ajenaMej.ok && ajenaMej.codigo === "42501", `Mejoras: no se puede enviar a nombre de otra persona (${ajenaMej.codigo})`);
    const yaLeida = await como(c23, "authenticated", U1, "insert into public.mejoras_tienda (texto, leida) values ('Me la marco como leída', true)");
    ok(!yaLeida.ok && yaLeida.codigo === "42501", `Mejoras: un cliente no la puede enviar ya marcada como leída (${yaLeida.codigo})`);
    const malasMej = [];
    for (const [texto, origen] of [["ab", "blue"], ["   ab   ", "blue"], ["x".repeat(501), "blue"], ["Una idea normal", "otro"]]) {
      malasMej.push((await como(c23, "authenticated", U1, `insert into public.mejoras_tienda (texto, origen) values ('${texto}', '${origen}')`)).codigo);
    }
    ok(malasMej.every((x) => x === "23514"), `Mejoras: rechaza textos de menos de 3 letras (también con espacios), de más de 500 y un sitio desconocido (${malasMej.join(", ")})`);
    const otroVe = await como(c23, "authenticated", U2, "select count(*)::int as n from public.mejoras_tienda");
    ok(otroVe.ok && otroVe.filas[0].n === 0, `Mejoras: otro cliente no ve las ideas de los demás (${otroVe.filas?.[0]?.n})`);
    const clienteMarca = await como(c23, "authenticated", U1, "update public.mejoras_tienda set leida = true, leida_en = now()", { confirmar: true });
    ok(!clienteMarca.ok || clienteMarca.cuantas === 0, "Mejoras: un cliente no puede marcarlas como leídas (ni las suyas)");
    const adminVe = await como(c23, "authenticated", ADMIN, "select count(*)::int as n from public.mejoras_tienda");
    const adminMarca = await como(c23, "authenticated", ADMIN, "update public.mejoras_tienda set leida = true, leida_en = now() returning leida", { confirmar: true });
    ok(adminVe.ok && adminVe.filas[0].n === 1 && adminMarca.ok && adminMarca.cuantas === 1, "Mejoras: el administrador las ve todas y las marca como leídas");

    // Como mucho 5 al día por persona (ya lleva 1): entran 4 más y la sexta no, con un mensaje claro. Otra persona sí puede.
    const cuatro = [];
    for (let i = 1; i <= 4; i++) cuatro.push((await como(c23, "authenticated", U1, `insert into public.mejoras_tienda (texto) values ('Idea número ${i + 1}')`, { confirmar: true })).ok);
    const sexta = await como(c23, "authenticated", U1, "insert into public.mejoras_tienda (texto) values ('La sexta del día')");
    ok(cuatro.every(Boolean) && !sexta.ok && sexta.codigo === "P0001" && /5 ideas hoy/.test(sexta.mensaje), `Mejoras: como mucho 5 ideas al día por persona, con un mensaje claro (${sexta.codigo}: ${sexta.mensaje?.slice(0, 60)})`);
    const otraPersona = await como(c23, "authenticated", U2, "insert into public.mejoras_tienda (texto, origen) values ('Más fotos de cada consola', 'perfil')", { confirmar: true });
    ok(otraPersona.ok, "Mejoras: el límite es por persona (otra persona sí puede enviar)");
    await c23.query(`update public.mejoras_tienda set created_at = now() - interval '2 days' where user_id = '${U1}'`);
    ok((await como(c23, "authenticated", U1, "insert into public.mejoras_tienda (texto) values ('Al día siguiente')")).ok, "Mejoras: al día siguiente se puede volver a enviar");

    // Se van con la cuenta.
    await c23.query(`delete from auth.users where id = '${U2}'`);
    ok(Number((await c23.query(`select count(*) as n from public.mejoras_tienda where user_id = '${U2}'`)).rows[0].n) === 0, "Mejoras: al borrar una cuenta, sus ideas se borran con ella");

    // La privacidad lo explica una vez, al final de «Para qué usamos tus datos», sin tocar el resto.
    const leerPriv = async () => (await c23.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
    const secciones = await leerPriv();
    const paraQue = secciones.find((s) => s.heading === "Para qué usamos tus datos")?.body ?? "";
    ok(
      JSON.stringify(secciones.map((s) => s.heading)) === JSON.stringify(TITULOS_PRIV) &&
        paraQue.startsWith("Texto de hoy de «Para qué usamos tus datos».") &&
        (paraQue.match(/Mejoras en la tienda/g) ?? []).length === 1 &&
        secciones.filter((s) => s.heading !== "Para qué usamos tus datos").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "Mejoras: la privacidad lo explica una sola vez (aunque se aplique dos veces) y el resto queda igual"
    );
    await c23.end();

    // PRUEBA DE LAS PRUEBAS: sin el disparador del límite, la sexta idea del día entraría.
    const sinLimite = MEJORAS.replace(/do \$\$\s*begin\s*if not exists \(select 1 from pg_trigger[\s\S]*?end \$\$;/, "");
    ok(sinLimite !== MEJORAS, "(control) se ha podido quitar el límite diario en la copia de prueba");
    const c24 = await nuevaBase("vz_aislada_mejoras_sin_limite", ESQUEMA_MEJORAS + sinLimite);
    const entran = [];
    for (let i = 1; i <= 6; i++) entran.push((await como(c24, "authenticated", U1, `insert into public.mejoras_tienda (texto) values ('Idea ${i}')`, { confirmar: true })).ok);
    ok(entran.every(Boolean), "(control) sin el límite entra la sexta idea del día: la prueba SÍ lo detecta");
    await c24.end();
  }

  // 19) Dirección de envío en «Mi perfil» (20261102120000), sobre perfiles_cliente y la función del Foro como en producción.
  {
    const DIRECCION = readFileSync("supabase/migrations/20261102120000_perfiles_direccion.sql", "utf8");
    const TITULOS_D = ["Responsable del tratamiento", "Qué datos tratamos", "Para qué usamos tus datos", "Base legal", "Con quién compartimos tus datos", "Cuánto tiempo conservamos tus datos", "Cookies y analítica propia", "Tus derechos"];
    const PRIV_D = JSON.stringify(TITULOS_D.map((heading) => ({ heading, body: `Texto de hoy de «${heading}».` })));
    const ESQUEMA_D = `
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values ('privacidad', 'Política de privacidad', '${PRIV_D.replace(/'/g, "''")}'::jsonb);
      create table public.chat_messages (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), body text);
    `;
    const c25 = await nuevaBase("vz_aislada_direccion", MIGRACION + ESQUEMA_D + PUBLICOS + DIRECCION);
    let repetidaD = true;
    try {
      await c25.query(DIRECCION);
    } catch (e) {
      repetidaD = false;
      console.log(String(e.message));
    }
    const columnasD = (await c25.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'perfiles_cliente' and column_name in ('codigo_postal', 'localidad', 'direccion', 'piso') order by 1")).rows.map((r) => r.column_name);
    const checksD = Number((await c25.query("select count(*) as n from pg_constraint where conname in ('perfiles_cliente_codigo_postal_check', 'perfiles_cliente_localidad_check', 'perfiles_cliente_direccion_check', 'perfiles_cliente_piso_check')")).rows[0].n);
    const politicasD = (await c25.query("select policyname from pg_policies where schemaname = 'public' and tablename = 'perfiles_cliente' order by 1")).rows.map((r) => r.policyname);
    ok(repetidaD && columnasD.join(",") === "codigo_postal,direccion,localidad,piso" && checksD === 4, `Dirección: añade las 4 columnas con sus 4 comprobaciones y se puede aplicar dos veces (${columnasD.join(", ")}; ${checksD})`);
    ok(politicasD.length === 3, `Dirección: no toca los permisos (siguen las 3 políticas: ${politicasD.join(", ")})`);

    const guardarD = await como(c25, "authenticated", U1, `insert into public.perfiles_cliente (user_id, nombre, usuario, pais, provincia, fecha_nacimiento, codigo_postal, localidad, direccion, piso) values ('${U1}', 'Ana', 'ana_g', 'España', 'Zaragoza', '1990-05-02', '50410', 'Cuarte de Huerva', 'Calle Mayor 5', '3º B')`, { confirmar: true });
    ok(guardarD.ok, "Dirección: un cliente guarda su dirección de envío en su perfil");
    const cambiarD = await como(c25, "authenticated", U1, "update public.perfiles_cliente set piso = '4º A' where user_id = (select auth.uid())", { confirmar: true });
    ok(cambiarD.ok && cambiarD.cuantas === 1, "Dirección: y la cambia");
    const malasD = [];
    for (const [col, v] of [["codigo_postal", "5"], ["codigo_postal", "50-41$"], ["codigo_postal", "12345678901"], ["localidad", "Z"], ["direccion", "C/1"], ["piso", "x".repeat(41)]]) {
      malasD.push((await como(c25, "authenticated", U1, `update public.perfiles_cliente set ${col} = '${v}' where user_id = (select auth.uid())`)).codigo);
    }
    ok(malasD.every((x) => x === "23514"), `Dirección: rechaza códigos postales raros, localidades, direcciones y pisos fuera de medida (${malasD.join(", ")})`);
    ok((await como(c25, "authenticated", U1, "update public.perfiles_cliente set codigo_postal = 'SW1A 1AA' where user_id = (select auth.uid())")).ok, "Dirección: admite códigos postales de otros países (con letras y espacio)");
    await c25.query(`update public.perfiles_cliente set codigo_postal = '50410' where user_id = '${U1}'`);
    const otroLee = await como(c25, "authenticated", U2, `select direccion from public.perfiles_cliente where user_id = '${U1}'`);
    ok(otroLee.ok && otroLee.filas.length === 0, "Dirección: otro cliente no ve la dirección de nadie");
    const anonLee = await como(c25, "anon", null, "select direccion from public.perfiles_cliente");
    ok(!anonLee.ok && anonLee.codigo === "42501", `Dirección: un visitante tampoco (${anonLee.codigo})`);
    const adminLee = await como(c25, "authenticated", ADMIN, `select codigo_postal, localidad, direccion, piso from public.perfiles_cliente where user_id = '${U1}'`);
    ok(adminLee.ok && adminLee.filas[0]?.direccion === "Calle Mayor 5" && adminLee.filas[0]?.piso === "4º A", "Dirección: el administrador la lee (ficha del cliente)");
    // El Foro solo enseña usuario y foto: la dirección nunca sale por la función pública.
    await c25.query(`insert into public.chat_messages (user_id, body) values ('${U1}', 'hola')`);
    const foro = await como(c25, "anon", null, `select * from public.perfiles_publicos(array['${U1}']::uuid[])`);
    ok(foro.ok && foro.filas.length === 1 && Object.keys(foro.filas[0]).sort().join(",") === "foto_url,user_id,usuario", `Dirección: el Foro sigue dando solo usuario y foto, nunca la dirección (${foro.ok ? Object.keys(foro.filas[0] ?? {}).join(", ") : foro.mensaje})`);
    const seccionesD = (await c25.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
    const queDatos = seccionesD.find((s) => s.heading === "Qué datos tratamos")?.body ?? "";
    ok(
      (queDatos.match(/dirección de envío \(código postal/g) ?? []).length === 1 &&
        seccionesD.filter((s) => s.heading !== "Qué datos tratamos").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "Dirección: la privacidad lo explica una sola vez (aunque se aplique dos veces) y el resto queda igual"
    );
    await c25.end();

    // PRUEBA DE LAS PRUEBAS: sin las comprobaciones, un código postal de una cifra entraría.
    const sinChecksD = DIRECCION.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    ok(sinChecksD !== DIRECCION, "(control) se han podido quitar las comprobaciones de la dirección en la copia de prueba");
    const c26 = await nuevaBase("vz_aislada_direccion_sin_checks", MIGRACION + ESQUEMA_D + sinChecksD);
    await c26.query(`insert into public.perfiles_cliente (user_id, nombre) values ('${U1}', 'Ana')`);
    ok((await como(c26, "authenticated", U1, "update public.perfiles_cliente set codigo_postal = '5' where user_id = (select auth.uid())")).ok, "(control) sin las comprobaciones entra un código postal de una cifra: la prueba SÍ lo detecta");
    await c26.end();
  }

  // 20) Resend en la política de privacidad (20261103100000): una frase en «Con quién compartimos tus datos», una vez.
  {
    const RESEND = readFileSync("supabase/migrations/20261103100000_privacidad_resend.sql", "utf8");
    const TITULOS_R = ["Responsable del tratamiento", "Qué datos tratamos", "Para qué usamos tus datos", "Base legal", "Con quién compartimos tus datos", "Cuánto tiempo conservamos tus datos", "Cookies y analítica propia", "Tus derechos"];
    const PRIV_R = JSON.stringify(TITULOS_R.map((heading) => ({ heading, body: `Texto de hoy de «${heading}».` })));
    const ESQUEMA_R = `
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values ('privacidad', 'Política de privacidad', '${PRIV_R.replace(/'/g, "''")}'::jsonb), ('terminos', 'Términos', '[]'::jsonb);
    `;
    const c27 = await nuevaBase("vz_aislada_privacidad_resend", ESQUEMA_R + RESEND);
    await c27.query(RESEND);
    const seccionesR = (await c27.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
    const conQuien = seccionesR.find((s) => s.heading === "Con quién compartimos tus datos")?.body ?? "";
    ok(
      conQuien.startsWith("Texto de hoy de «Con quién compartimos tus datos».") &&
        (conQuien.match(/Resend/g) ?? []).length === 1 &&
        /no-responder@videojuegoszaragoza\.com/.test(conQuien) &&
        JSON.stringify(seccionesR.map((s) => s.heading)) === JSON.stringify(TITULOS_R) &&
        seccionesR.filter((s) => s.heading !== "Con quién compartimos tus datos").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "Privacidad: nombra a Resend una sola vez (aunque se aplique dos veces) y el resto queda igual"
    );
    ok(Number((await c27.query("select count(*) as n from public.policy_pages where slug = 'terminos' and sections = '[]'::jsonb")).rows[0].n) === 1, "Privacidad: las otras políticas no se tocan");
    await c27.end();

    // PRUEBA DE LAS PRUEBAS: sin la condición «not exists», aplicarla dos veces repetiría la frase.
    const sinGuarda = RESEND.replace(/\n\s*and not exists \(select 1 from jsonb_array_elements\(p\.sections\) as s \(sec\) where s\.sec ->> 'body' like '%Resend%'\);/, ";");
    ok(sinGuarda !== RESEND, "(control) se ha podido quitar la condición en la copia de prueba");
    const c28 = await nuevaBase("vz_aislada_privacidad_resend_sin_guarda", ESQUEMA_R + sinGuarda);
    await c28.query(sinGuarda);
    const repetida = ((await c28.query("select sections::text as t from public.policy_pages where slug = 'privacidad'")).rows[0].t.match(/Resend/g) ?? []).length;
    ok(repetida === 2, `(control) sin la condición la frase se repite (${repetida} veces): la prueba SÍ lo detecta`);
    await c28.end();
  }

  // 21) Nombre del titular y correo de protección de datos (20261017200000 y 20261103130000), como en producción el
  // 2026-11-03: privacidad con el nombre una vez y el correo dos; términos con el nombre; las demás, sin marcas.
  {
    const NOMBRE = readFileSync("supabase/migrations/20261017200000_politicas_nombre_titular.sql", "utf8");
    const CORREO = readFileSync("supabase/migrations/20261103130000_politicas_email_contacto.sql", "utf8");
    const MARCA_N = "[NOMBRE LEGAL / RAZÓN SOCIAL]";
    const MARCA_E = "[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]";
    const EMAIL = "VideojuegosZaragoza.com@gmail.com";
    const sql = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
    const PRIV_C = [
      { heading: "Responsable del tratamiento", body: `${MARCA_N}, con NIF/CIF Y4751659B y domicilio en C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza, es el responsable. Escribe a ${MARCA_E}.` },
      { heading: "Con quién compartimos tus datos", body: "Resend envía los correos desde no-responder@videojuegoszaragoza.com." },
      { heading: "Tus derechos", body: `Escribe a ${MARCA_E}. También puedes reclamar ante la AEPD (aepd.es).` },
    ];
    const TERM_C = [{ heading: "Quiénes somos", body: `Operada por ${MARCA_N}, NIF/CIF Y4751659B.` }];
    const ENV_C = [{ heading: "Plazos", body: "España 1-2 días [texto entre corchetes que no es una marca]." }];
    const ESQUEMA_C = `
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections, updated_at) values
        ('privacidad', 'Política de privacidad', ${sql(PRIV_C)}, '2026-11-03 05:33:58+00'),
        ('terminos', 'Términos y condiciones', ${sql(TERM_C)}, '2026-10-16 18:49:06+00'),
        ('envios', 'Política de envíos', ${sql(ENV_C)}, '2026-10-15 20:46:39+00');
    `;
    const veces = (texto, aguja) => texto.split(aguja).length - 1;
    const c29 = await nuevaBase("vz_aislada_politicas_titular_correo", ESQUEMA_C + NOMBRE + CORREO);
    const tras1 = (await c29.query("select slug, sections::text as t, intro, updated_at from public.policy_pages order by slug")).rows;
    await c29.query(NOMBRE + CORREO);
    const tras2 = (await c29.query("select slug, sections::text as t, intro, updated_at from public.policy_pages order by slug")).rows;
    const de = (filas, slug) => filas.find((f) => f.slug === slug);
    const priv = de(tras2, "privacidad").t;
    const term = de(tras2, "terminos").t;
    ok(
      veces(priv, EMAIL) === 2 && veces(priv, "Daniel Gutiérrez") === 1 && !priv.includes(MARCA_E) && !priv.includes(MARCA_N),
      `Políticas: privacidad con el nombre una vez y el correo dos, sin marcas (${veces(priv, "Daniel Gutiérrez")} y ${veces(priv, EMAIL)})`
    );
    ok(veces(term, "Daniel Gutiérrez") === 1 && !term.includes(MARCA_N) && !term.includes(EMAIL), "Políticas: términos con el nombre y sin el correo (no lo tenía)");
    const privJson = JSON.parse(priv);
    ok(
      privJson.length === 3 &&
        privJson[1].body === PRIV_C[1].body &&
        privJson[0].body === PRIV_C[0].body.replace(MARCA_N, "Daniel Gutiérrez").replace(MARCA_E, EMAIL) &&
        privJson[2].body === PRIV_C[2].body.replace(MARCA_E, EMAIL),
      "Políticas: solo cambian las marcas; el resto del texto, igual"
    );
    const envios = JSON.parse(de(tras2, "envios").t);
    ok(
      envios.length === 1 && envios[0].heading === ENV_C[0].heading && envios[0].body === ENV_C[0].body,
      "Políticas: las que no tienen marcas no se tocan (ni sus corchetes normales)"
    );
    ok(
      String(de(tras2, "envios").updated_at.toISOString()) === "2026-10-15T20:46:39.000Z" &&
        de(tras2, "privacidad").updated_at.getTime() === de(tras1, "privacidad").updated_at.getTime() &&
        de(tras2, "terminos").updated_at.getTime() === de(tras1, "terminos").updated_at.getTime(),
      "Políticas: aplicadas otra vez no tocan nada (ni la fecha); envíos conserva la suya"
    );
    await c29.end();

    // PRUEBA DE LAS PRUEBAS: con la marca mal escrita (sin la tilde de PROTECCIÓN), el correo no se pondría.
    const sinTilde = CORREO.replace(/PROTECCIÓN/g, "PROTECCION");
    ok(sinTilde !== CORREO, "(control) se ha podido quitar la tilde de la marca en la copia de prueba");
    const c30 = await nuevaBase("vz_aislada_politicas_correo_sin_tilde", ESQUEMA_C + sinTilde);
    const quedan = veces((await c30.query("select sections::text as t from public.policy_pages where slug = 'privacidad'")).rows[0].t, MARCA_E);
    ok(quedan === 2, `(control) con la marca mal escrita quedan ${quedan} marcas sin rellenar: la prueba SÍ lo detecta`);
    await c30.end();
  }

  // 22) Tope diario del historial de Blue IA (20261103150000), sobre las tablas tal cual las creó 20261013170000:
  // 300 mensajes y 40 conversaciones nuevas al día por persona, sin tocar permisos.
  {
    const HISTORIAL = readFileSync("supabase/migrations/20261013170000_historial_blue_ia.sql", "utf8");
    const TOPE = readFileSync("supabase/migrations/20261103150000_blue_ia_limite_diario.sql", "utf8");
    const c31 = await nuevaBase("vz_aislada_blue_ia_tope", HISTORIAL + TOPE);
    let repetidaTope = true;
    try {
      await c31.query(TOPE);
    } catch (e) {
      repetidaTope = false;
      console.log(String(e.message));
    }
    const disparadoresTope = (await c31.query("select tgrelid::regclass::text as t, tgname from pg_trigger where tgname like '%limite_diario' order by 1")).rows;
    const politicasTope = (await c31.query("select policyname from pg_policies where tablename like 'blue_ia_%' order by 1")).rows.map((r) => r.policyname);
    ok(repetidaTope && disparadoresTope.length === 2, `Blue IA: el tope se puede aplicar dos veces sin duplicar disparadores (${disparadoresTope.map((d) => d.tgname).join(", ")})`);
    ok(politicasTope.join(",") === "blue_ia_conv_insert,blue_ia_conv_select,blue_ia_conv_update,blue_ia_msg_insert,blue_ia_msg_select", `Blue IA: no toca las políticas (${politicasTope.join(", ")})`);
    const conv = (await como(c31, "authenticated", U1, "insert into public.blue_ia_conversaciones (titulo) values ('Hola') returning id", { confirmar: true })).filas?.[0]?.id;
    const trescientos = await como(c31, "authenticated", U1, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) select '${conv}', 'user', 'mensaje ' || g from generate_series(1, 300) g`, { confirmar: true });
    const elDeMas = await como(c31, "authenticated", U1, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) values ('${conv}', 'assistant', 'uno más')`);
    ok(trescientos.ok && trescientos.cuantas === 300 && !elDeMas.ok && elDeMas.codigo === "P0001" && /máximo de mensajes/.test(elDeMas.mensaje), `Blue IA: entran 300 mensajes al día por persona y el 301 no, con un mensaje claro (${elDeMas.codigo}: ${elDeMas.mensaje?.slice(0, 50)})`);
    // (La conversación se crea antes, en su propia orden: la política de los mensajes no ve una conversación que se
    // está creando en la misma orden.)
    const convU2 = (await como(c31, "authenticated", U2, "insert into public.blue_ia_conversaciones (titulo) values ('Otra') returning id", { confirmar: true })).filas?.[0]?.id;
    const enBloque = await como(c31, "authenticated", U2, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) select '${convU2}', 'user', 'x' from generate_series(1, 301) g`);
    ok(!enBloque.ok && enBloque.codigo === "P0001", `Blue IA: tampoco entran 301 de golpe en una sola orden (${enBloque.codigo})`);
    const otra = await como(c31, "authenticated", U2, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) values ('${convU2}', 'user', 'hola')`, { confirmar: true });
    ok(otra.ok, `Blue IA: el tope es por persona (otra persona sí guarda${otra.ok ? "" : `: ${otra.codigo}`})`);
    const conversaciones = await como(c31, "authenticated", U1, "insert into public.blue_ia_conversaciones (titulo) select 'Conv ' || g from generate_series(1, 39) g", { confirmar: true });
    const conv41 = await como(c31, "authenticated", U1, "insert into public.blue_ia_conversaciones (titulo) values ('La 41')");
    ok(conversaciones.ok && !conv41.ok && conv41.codigo === "P0001" && /conversaciones nuevas/.test(conv41.mensaje), `Blue IA: como mucho 40 conversaciones nuevas al día (${conv41.codigo})`);
    await c31.query(`update public.blue_ia_mensajes set created_at = now() - interval '2 days' where user_id = '${U1}'`);
    await c31.query(`update public.blue_ia_conversaciones set created_at = now() - interval '2 days' where user_id = '${U1}'`);
    const manana = await como(c31, "authenticated", U1, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) values ('${conv}', 'user', 'Al día siguiente')`);
    const mananaConv = await como(c31, "authenticated", U1, "insert into public.blue_ia_conversaciones (titulo) values ('Al día siguiente')");
    ok(manana.ok && mananaConv.ok, "Blue IA: al día siguiente se vuelve a guardar");
    const ajeno = await como(c31, "authenticated", U2, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) values ('${conv}', 'user', 'En la conversación de otro')`);
    ok(!ajeno.ok && ajeno.codigo === "42501", `Blue IA: sigue sin poder escribirse en la conversación de otra persona (${ajeno.codigo})`);
    await c31.end();

    // PRUEBA DE LAS PRUEBAS: sin los disparadores, el mensaje 301 entraría.
    const sinTope = TOPE.replace(/do \$\$\s*begin\s*if not exists \(select 1 from pg_trigger[\s\S]*?end \$\$;/, "");
    ok(sinTope !== TOPE, "(control) se han podido quitar los disparadores del tope en la copia de prueba");
    const c32 = await nuevaBase("vz_aislada_blue_ia_sin_tope", HISTORIAL + sinTope);
    const conv2 = (await como(c32, "authenticated", U1, "insert into public.blue_ia_conversaciones (titulo) values ('Hola') returning id", { confirmar: true })).filas?.[0]?.id;
    const sinLimite = await como(c32, "authenticated", U1, `insert into public.blue_ia_mensajes (conversacion_id, rol, texto) select '${conv2}', 'user', 'x' from generate_series(1, 301) g`);
    ok(sinLimite.ok && sinLimite.cuantas === 301, "(control) sin el tope entran 301 mensajes: la prueba SÍ lo detecta");
    await c32.end();
  }

  // 23) VeoAura: la privacidad lo explica (20261103180000) y los avisos admiten «pedido_pagado» (20261103181000).
  {
    const PRIV_V = readFileSync("supabase/migrations/20261103180000_privacidad_veoaura.sql", "utf8");
    const PAGADO = readFileSync("supabase/migrations/20261103181000_escaparate_pedido_pagado.sql", "utf8");
    const TITULOS_V = ["Responsable del tratamiento", "Qué datos tratamos", "Para qué usamos tus datos", "Base legal", "Con quién compartimos tus datos", "Cuánto tiempo conservamos tus datos", "Cookies y analítica propia", "Tus derechos"];
    const PRIV = JSON.stringify(TITULOS_V.map((heading) => ({ heading, body: `Texto de hoy de «${heading}».` })));
    // escaparate_salida tal cual la creó 20261015100000 (con su comprobación de «evento»).
    const ESQUEMA_V = `
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values ('privacidad', 'Política de privacidad', '${PRIV.replace(/'/g, "''")}'::jsonb), ('terminos', 'Términos', '[]'::jsonb);
      create table public.escaparate_salida (
        id uuid primary key default gen_random_uuid(), creado_en timestamptz not null default now(),
        evento text not null check (evento in ('pedido', 'pedido_anulado')), id_veoaura uuid not null, pedido_id uuid not null,
        estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'descartado')),
        intentos integer not null default 0, ultimo_intento timestamptz, enviado_en timestamptz,
        detalle text check (detalle is null or char_length(detalle) <= 300), unique (pedido_id, id_veoaura, evento));
      alter table public.escaparate_salida enable row level security;
      create policy escaparate_salida_admin_select on public.escaparate_salida for select to authenticated using ((select public.is_admin()));
      insert into public.escaparate_salida (evento, id_veoaura, pedido_id, estado) values
        ('pedido', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'enviado'),
        ('pedido_anulado', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'pendiente');
    `;
    const c33 = await nuevaBase("vz_aislada_veoaura_clientes", ESQUEMA_V + PRIV_V + PAGADO);
    let repetidaV = true;
    try {
      await c33.query(PRIV_V + PAGADO);
    } catch (e) {
      repetidaV = false;
      console.log(String(e.message));
    }
    const secciones = (await c33.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
    const conQuien = secciones.find((s) => s.heading === "Con quién compartimos tus datos")?.body ?? "";
    ok(
      repetidaV &&
        conQuien.startsWith("Texto de hoy de «Con quién compartimos tus datos».") &&
        (conQuien.match(/VeoAura/g) ?? []).length === 1 &&
        /tu nombre, tu correo electrónico y tu teléfono/.test(conQuien) &&
        /No le pasamos tu dirección/.test(conQuien) &&
        JSON.stringify(secciones.map((s) => s.heading)) === JSON.stringify(TITULOS_V) &&
        secciones.filter((s) => s.heading !== "Con quién compartimos tus datos").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "VeoAura: la privacidad lo explica una sola vez (aunque se aplique dos veces) y el resto queda igual"
    );
    ok(Number((await c33.query("select count(*) as n from public.policy_pages where slug = 'terminos' and sections = '[]'::jsonb")).rows[0].n) === 1, "VeoAura: las otras políticas no se tocan");
    const filasV = (await c33.query("select evento, estado from public.escaparate_salida order by evento")).rows.map((r) => `${r.evento}:${r.estado}`);
    ok(filasV.join(",") === "pedido:enviado,pedido_anulado:pendiente", `VeoAura: los avisos que ya había siguen igual (${filasV.join(", ")})`);
    let pagadoEntra = true;
    try {
      await c33.query("insert into public.escaparate_salida (evento, id_veoaura, pedido_id) values ('pedido_pagado', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')");
    } catch {
      pagadoEntra = false;
    }
    let otroEntra = true;
    try {
      await c33.query("insert into public.escaparate_salida (evento, id_veoaura, pedido_id) values ('otro', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')");
    } catch {
      otroEntra = false;
    }
    ok(pagadoEntra && !otroEntra, `VeoAura: se puede apuntar «pedido_pagado» y nada que no esté en la lista (${pagadoEntra}, ${otroEntra})`);
    const politicasV = (await c33.query("select policyname from pg_policies where tablename = 'escaparate_salida'")).rows.map((r) => r.policyname);
    const comprobaciones = Number((await c33.query("select count(*) as n from pg_constraint where conrelid = 'public.escaparate_salida'::regclass and contype = 'c'")).rows[0].n);
    ok(politicasV.join(",") === "escaparate_salida_admin_select" && comprobaciones === 3, `VeoAura: no toca los permisos y no duplica comprobaciones (${politicasV.join(", ")}; ${comprobaciones})`);
    await c33.end();

    // PRUEBA DE LAS PRUEBAS: sin la migración, «pedido_pagado» no entra; y sin la condición, la frase se repetiría.
    const c34 = await nuevaBase("vz_aislada_veoaura_sin_migracion", ESQUEMA_V);
    let sinMig = true;
    try {
      await c34.query("insert into public.escaparate_salida (evento, id_veoaura, pedido_id) values ('pedido_pagado', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b9')");
    } catch {
      sinMig = false;
    }
    ok(!sinMig, "(control) sin la migración, «pedido_pagado» no entra: la prueba SÍ lo detecta");
    const sinGuardaV = PRIV_V.replace(/\n\s*and not exists \(select 1 from jsonb_array_elements\(p\.sections\) as s \(sec\) where s\.sec ->> 'body' like '%VeoAura%'\);/, ";");
    ok(sinGuardaV !== PRIV_V, "(control) se ha podido quitar la condición de la privacidad en la copia de prueba");
    await c34.query(sinGuardaV);
    await c34.query(sinGuardaV);
    const repetidaFrase = ((await c34.query("select sections::text as t from public.policy_pages where slug = 'privacidad'")).rows[0].t.match(/VeoAura/g) ?? []).length;
    ok(repetidaFrase === 2, `(control) sin la condición la frase se repite (${repetidaFrase} veces): la prueba SÍ lo detecta`);
    await c34.end();
  }

  // 24) Reseñas de servicios terminados (20261103210000), sobre store_reviews como en producción (sql/store_reviews.sql,
  // con el disparador y los permisos de entonces) y service_requests como en producción.
  {
    const RESENAS = readFileSync("supabase/migrations/20261103210000_resenas_servicios.sql", "utf8");
    const TIENDA = readFileSync("sql/store_reviews.sql", "utf8").replace(/do \$\$\s*begin\s*alter publication[\s\S]*?end \$\$;/, "");
    const SERV_A = "5e000000-0000-4000-8000-0000000000a1";
    const ESQUEMA_R = `
      -- Los datos de la cuenta, como en Supabase (de ahí saca el disparador el nombre de quien reseña).
      alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;
      update auth.users set raw_user_meta_data = jsonb_build_object('full_name', 'Ana García', 'username', 'ana_g') where id = '${U1}';
      create table public.services (id uuid primary key default gen_random_uuid(), title text not null);
      insert into public.services (id, title) values ('${SERV_A}', 'Limpieza PS5');
      create table public.service_requests (
        id uuid primary key default gen_random_uuid(), service_id uuid, service_title text not null, nombre text not null default '',
        customer_user_id uuid references auth.users (id) on delete set null, seguimiento text not null default 'solicitado');
      alter table public.service_requests enable row level security;
      create policy service_requests_select_own on public.service_requests for select to authenticated using (customer_user_id = auth.uid());
      insert into public.service_requests (id, service_id, service_title, customer_user_id, seguimiento) values
        ('5f000000-0000-4000-8000-000000000001', '${SERV_A}', 'Limpieza PS5', '${U1}', 'entregado'),
        ('5f000000-0000-4000-8000-000000000002', '${SERV_A}', 'Limpieza PS5', '${U1}', 'reparando'),
        ('5f000000-0000-4000-8000-000000000003', '${SERV_A}', 'Limpieza PS5', '${U2}', 'entregado'),
        ('5f000000-0000-4000-8000-000000000004', null, 'Reparación por chat', '${U1}', 'entregado');
      insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'u4@example.com');
    `;
    const SR = (n) => `5f000000-0000-4000-8000-00000000000${n}`;
    const c35 = await nuevaBase("vz_aislada_resenas_servicios", ESQUEMA_R + TIENDA);
    // Una reseña de la tienda de antes de la migración (con el disparador de entonces).
    const vieja = await como(c35, "authenticated", "44444444-4444-4444-8444-444444444444", "insert into public.store_reviews (rating, comment) values (5, 'Antigua')", { confirmar: true });
    const antiguas = Number((await c35.query("select count(*) as n from public.store_reviews")).rows[0].n);
    ok(vieja.ok && antiguas === 1, `Reseñas de servicios: antes de la migración se reseña la tienda como siempre (${vieja.ok ? antiguas : vieja.mensaje})`);
    await c35.query(RESENAS);
    let repetidaR = true;
    try {
      await c35.query(RESENAS);
    } catch (e) {
      repetidaR = false;
      console.log(String(e.message));
    }
    const columnasR = (await c35.query("select column_name from information_schema.columns where table_name = 'store_reviews' and column_name like 'service%' order by 1")).rows.map((r) => r.column_name);
    ok(repetidaR && columnasR.join(",") === "service_id,service_request_id,service_title", `Reseñas de servicios: añade las columnas y se puede aplicar dos veces (${columnasR.join(", ")})`);
    ok(Number((await c35.query("select count(*) as n from public.store_reviews")).rows[0].n) === antiguas, "Reseñas de servicios: no toca las reseñas que ya había");
    const politicasR = (await c35.query("select policyname from pg_policies where tablename = 'store_reviews' order by 1")).rows.map((r) => r.policyname);
    ok(politicasR.join(",") === "store_reviews_delete_admin,store_reviews_insert_authenticated,store_reviews_select_public", `Reseñas de servicios: no toca las políticas (${politicasR.join(", ")})`);

    const resena = (uid, sr, extra = "") => como(c35, "authenticated", uid, `insert into public.store_reviews (rating, comment, service_request_id${extra ? ", service_id" : ""}) values (5, 'Muy bien', ${sr ? `'${sr}'` : "null"}${extra ? `, '${extra}'` : ""}) returning service_id, service_title, user_id`, { confirmar: true });
    const propia = await resena(U1, SR(1));
    ok(propia.ok && propia.filas[0].service_id === SERV_A && propia.filas[0].service_title === "Limpieza PS5" && propia.filas[0].user_id === U1, `Reseñas de servicios: el cliente valora su servicio entregado y la reseña queda en ese servicio (${propia.ok ? propia.filas[0].service_title : propia.mensaje})`);
    const otraVez = await resena(U1, SR(1));
    ok(!otraVez.ok && otraVez.codigo === "23505", `Reseñas de servicios: una sola reseña por solicitud (${otraVez.codigo})`);
    const sinEntregar = await resena(U1, SR(2));
    ok(!sinEntregar.ok && /ya te hayamos entregado/.test(sinEntregar.mensaje), "Reseñas de servicios: no se puede valorar un servicio que aún no está entregado");
    const ajena = await resena(U1, SR(3));
    ok(!ajena.ok && /ya te hayamos entregado/.test(ajena.mensaje), "Reseñas de servicios: ni la solicitud de otra persona");
    const inventada = await resena(U1, "5f000000-0000-4000-8000-0000000000ff");
    ok(!inventada.ok, `Reseñas de servicios: ni una solicitud que no existe (${inventada.codigo})`);
    const colada = await resena(U2, null, SERV_A);
    ok(colada.ok && colada.filas[0].service_id === null, "Reseñas de servicios: una reseña de la tienda no puede colarse en la ficha de un servicio (service_id se queda vacío)");
    const deChat = await resena(U1, SR(4));
    ok(deChat.ok && deChat.filas[0].service_id === null && deChat.filas[0].service_title === "Reparación por chat", "Reseñas de servicios: una solicitud sin servicio (de chat o VeoAura) se valora igual, sin ficha");
    const sinSesion = await como(c35, "anon", null, `insert into public.store_reviews (rating, comment, service_request_id) values (5, 'x', '${SR(3)}')`);
    ok(!sinSesion.ok, `Reseñas de servicios: sin sesión no se puede (${sinSesion.codigo})`);
    const lectura = await como(c35, "anon", null, `select display_name, rating, comment from public.store_reviews where service_id = '${SERV_A}'`);
    ok(lectura.ok && lectura.filas.length === 1, `Reseñas de servicios: cualquiera lee las reseñas de un servicio (como las de Inicio) (${lectura.filas?.length})`);
    const acl = (await c35.query("select coalesce(proacl::text, '') as acl, prosecdef from pg_proc where proname = 'store_reviews_before_insert'")).rows[0];
    ok(acl.prosecdef === true && !/(^\{|,)=X|anon=|authenticated=/.test(acl.acl), `Reseñas de servicios: la función sigue sin poder ejecutarla nadie desde el navegador (${acl.acl})`);
    await c35.end();

    // PRUEBA DE LAS PRUEBAS: con la función de antes (sin la comprobación), cualquiera valoraría la solicitud de otro.
    const sinComprobacion = RESENAS.replace(/  -- Reseña de un servicio:[\s\S]*?  end if;\n\n  return new;/, "  return new;");
    ok(sinComprobacion !== RESENAS, "(control) se ha podido quitar la comprobación en la copia de prueba");
    const c36 = await nuevaBase("vz_aislada_resenas_servicios_sin_comprobacion", ESQUEMA_R + TIENDA + sinComprobacion);
    const ajenaSin = await como(c36, "authenticated", U1, `insert into public.store_reviews (rating, comment, service_request_id, service_id) values (1, 'Malo', '${SR(3)}', '${SERV_A}') returning id`, { confirmar: true });
    ok(ajenaSin.ok, "(control) sin la comprobación, alguien valora la solicitud de otro: la prueba SÍ lo detecta");
    await c36.end();
  }

  // Tarifas de envío (20261104210000_tarifas_envio.sql), sobre los pedidos como están en producción: la tabla de zonas
  // (lectura pública, solo el administrador cambia precios, nadie crea ni borra zonas), la regla de la zona por código
  // postal, el disparador que calcula el envío al crear el pedido (y en un reintento), el envío a mano del administrador
  // y su vuelta al automático. Los mismos casos que la página (lib/envio.ts; pruebas/perfil-datos.mjs, sección TE).
  {
    const TARIFAS = readFileSync("supabase/migrations/20261104210000_tarifas_envio.sql", "utf8");
    const ESQUEMA_T = `
      create table public.pedidos (
        id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(), user_id uuid references auth.users (id) on delete set null,
        estado text not null default 'pendiente', entrega text not null default 'envio', nombre text not null, email text not null,
        telefono text not null, direccion text, codigo_postal text, ciudad text, notas text, total_eur numeric not null default 0, nota_admin text);
      create function public.set_pedidos_updated_at() returns trigger language plpgsql set search_path = public as $f$
      begin new.updated_at := now(); return new; end $f$;
      create trigger trg_pedidos_updated_at before update on public.pedidos for each row execute function public.set_pedidos_updated_at();
      alter table public.pedidos enable row level security;
      create policy pedidos_admin_select on public.pedidos for select to authenticated using ((select public.is_admin()));
      create policy pedidos_admin_update on public.pedidos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
      create policy pedidos_cliente_select on public.pedidos for select to authenticated using (user_id = (select auth.uid()));
      -- Lo que ya había (envío gratis hasta hoy).
      insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values
        ('Luis', 'luis@example.com', '600111222', 'envio', '28001', 100),
        ('Marta', 'marta@example.com', '600333444', 'recogida', null, 55.5);`;
    const c37 = await nuevaBase("vz_aislada_tarifas_envio", ESQUEMA_T + TARIFAS);
    let repetidaT = true;
    try {
      await c37.query(TARIFAS);
    } catch (e) {
      repetidaT = false;
      console.log(String(e.message));
    }
    const zonasT = (await c37.query("select zona, precio_eur::text as p, gratis_desde_eur, activa from public.tarifas_envio order by orden")).rows;
    ok(repetidaT && zonasT.map((z) => z.zona).join(",") === "mano,local,peninsula,baleares,canarias,ceuta_melilla", `Tarifas: 6 zonas y se puede aplicar dos veces sin duplicar (${zonasT.map((z) => z.zona).join(", ")})`);
    ok(zonasT.every((z) => z.p === "0.00" && z.gratis_desde_eur === null && z.activa === true), "Tarifas: todas empiezan a 0 € y activas (como hoy, gratis)");
    const antiguos = (await c37.query("select productos_eur::text as pr, envio_eur::text as en, total_eur::text as t, envio_manual from public.pedidos order by numero")).rows;
    ok(antiguos[0].pr === "100.00" && antiguos[0].en === "0.00" && Number(antiguos[0].t) === 100 && antiguos[1].pr === "55.50" && antiguos[1].envio_manual === false, `Tarifas: los pedidos que había quedan igual (artículos = total, envío 0) (${JSON.stringify(antiguos)})`);
    const politicasT = (await c37.query("select policyname from pg_policies where tablename = 'tarifas_envio' order by 1")).rows.map((r) => r.policyname);
    ok(politicasT.join(",") === "tarifas_envio_admin,tarifas_envio_leer" && (await c37.query("select relrowsecurity from pg_class where oid = 'public.tarifas_envio'::regclass")).rows[0].relrowsecurity, `Tarifas: RLS y sus 2 reglas, sin duplicar (${politicasT.join(", ")})`);

    // Permisos.
    const anonLee = await como(c37, "anon", null, "select zona, precio_eur from public.tarifas_envio");
    ok(anonLee.ok && anonLee.filas.length === 6, "Tarifas: cualquiera las lee (se enseñan en la cesta y al pagar)");
    const anonCambia = await como(c37, "anon", null, "update public.tarifas_envio set precio_eur = 1 where zona = 'local'");
    ok(!anonCambia.ok && anonCambia.codigo === "42501", `Tarifas: un visitante no las cambia (${anonCambia.codigo})`);
    const clienteCambia = await como(c37, "authenticated", U1, "update public.tarifas_envio set precio_eur = 1 where zona = 'local'", { confirmar: true });
    ok(clienteCambia.ok && clienteCambia.cuantas === 0, `Tarifas: un cliente con sesión no las cambia (${clienteCambia.cuantas ?? clienteCambia.codigo})`);
    const clienteCrea = await como(c37, "authenticated", ADMIN, "insert into public.tarifas_envio (zona, nombre) values ('luna', 'La Luna')");
    ok(!clienteCrea.ok && clienteCrea.codigo === "42501", `Tarifas: nadie crea zonas desde la app, ni el administrador (${clienteCrea.codigo})`);
    const adminBorra = await como(c37, "authenticated", ADMIN, "delete from public.tarifas_envio where zona = 'canarias'");
    ok(!adminBorra.ok && adminBorra.codigo === "42501", `Tarifas: nadie borra zonas desde la app (${adminBorra.codigo})`);
    const adminZona = await como(c37, "authenticated", ADMIN, "update public.tarifas_envio set zona = 'otra' where zona = 'local'");
    ok(!adminZona.ok && adminZona.codigo === "42501", `Tarifas: el administrador no cambia la clave de una zona (${adminZona.codigo})`);
    const negativo = await como(c37, "authenticated", ADMIN, "update public.tarifas_envio set precio_eur = -1 where zona = 'local'");
    ok(!negativo.ok && negativo.codigo === "23514", `Tarifas: no admite precios negativos (${negativo.codigo})`);
    const adminPone = await como(
      c37,
      "authenticated",
      ADMIN,
      `update public.tarifas_envio set precio_eur = case zona when 'local' then 4.90 when 'peninsula' then 6.90 when 'baleares' then 12 when 'canarias' then 20 when 'ceuta_melilla' then 25 else 0 end,
         gratis_desde_eur = case zona when 'peninsula' then 150 else null end,
         activa = zona <> 'canarias'`,
      { confirmar: true }
    );
    ok(adminPone.ok && adminPone.cuantas === 6, `Tarifas: el administrador pone sus precios (${adminPone.cuantas ?? adminPone.mensaje})`);
    const acls = (await c37.query("select proname, coalesce(proacl::text, '') as acl from pg_proc where proname in ('zona_envio', 'calcular_envio', 'pedidos_calcular_envio') order by 1")).rows;
    ok(
      acls.length === 3 &&
        acls.every((a) => !/(^\{|,)=X/.test(a.acl)) &&
        acls.filter((a) => a.proname !== "pedidos_calcular_envio").every((a) => /anon=X/.test(a.acl) && /authenticated=X/.test(a.acl)) &&
        !/anon=|authenticated=/.test(acls.find((a) => a.proname === "pedidos_calcular_envio").acl),
      `Tarifas: la regla la puede usar la página y nadie de fuera ejecuta la función del disparador (${acls.map((a) => `${a.proname} ${a.acl}`).join(" · ")})`
    );

    // La regla de la zona: los mismos casos que la página.
    const CASOS = [
      ["recogida", null, "mano"],
      ["envio", "50003", "local"],
      ["envio", "50410", "local"],
      ["envio", "50022", "local"],
      ["envio", "50023", "peninsula"],
      ["envio", "28001", "peninsula"],
      ["envio", "07001", "baleares"],
      ["envio", "35001", "canarias"],
      ["envio", "38500", "canarias"],
      ["envio", "51001", "ceuta_melilla"],
      ["envio", "52001", "ceuta_melilla"],
      ["envio", "5000", null],
      ["envio", "", null],
      ["envio", null, null],
      ["envio", "50 003", "local"],
    ];
    const zonasCalc = [];
    for (const [entrega, cp, esperada] of CASOS) {
      const z = (await c37.query("select public.zona_envio($1, $2) as z", [entrega, cp])).rows[0].z;
      zonasCalc.push(`${cp ?? "—"}→${z ?? "sin zona"}${z === esperada ? "" : ` (esperaba ${esperada})`}`);
    }
    ok(zonasCalc.every((s) => !s.includes("esperaba")), `Tarifas: cada código postal va a su zona (${zonasCalc.join(", ")})`);

    // El disparador: el pedido nuevo lleva su envío y el total con él (la función del pedido solo pone los artículos).
    const nuevo = async (entrega, cp, articulos) =>
      (await c37.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values ('Ana', 'ana@example.com', '600999888', $1, $2, $3) returning id, productos_eur::text as pr, envio_eur::text as en, total_eur::text as t, zona_envio, envio_manual", [entrega, cp, articulos])).rows[0];
    const pen = await nuevo("envio", "28001", 100);
    ok(pen.pr === "100.00" && pen.en === "6.90" && Number(pen.t) === 106.9 && pen.zona_envio === "peninsula" && pen.envio_manual === false, `Tarifas: un pedido a Madrid suma 6,90 € de envío (${JSON.stringify(pen)})`);
    const gratis = await nuevo("envio", "28001", 200);
    ok(gratis.en === "0.00" && Number(gratis.t) === 200, `Tarifas: desde 150 € el envío a la península es gratis (${gratis.en})`);
    const zgz = await nuevo("envio", "50003", 80);
    ok(zgz.en === "4.90" && zgz.zona_envio === "local" && Number(zgz.t) === 84.9, `Tarifas: un pedido en Zaragoza suma 4,90 € (${zgz.en})`);
    const mano = await nuevo("recogida", null, 80);
    ok(mano.en === "0.00" && mano.zona_envio === "mano" && Number(mano.t) === 80, `Tarifas: la entrega en mano va con su tarifa (0 €) (${mano.en})`);
    const isla = await nuevo("envio", "35001", 80);
    ok(isla.en === "20.00" && isla.zona_envio === "canarias", `Tarifas: una zona sin envío desde la web lleva su precio si aun así llega un pedido (${isla.en})`);
    const forzado = (await c37.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur, envio_eur, envio_manual) values ('Eva', 'eva@example.com', '600777666', 'envio', '28001', 100, 0, true) returning envio_eur::text as en, envio_manual")).rows[0];
    ok(forzado.en === "6.90" && forzado.envio_manual === false, `Tarifas: un pedido nuevo no puede venir con el envío «a mano» (${JSON.stringify(forzado)})`);
    // Un pedido asignado desde el chat (api/asignar-seguimiento.ts): a domicilio y sin código postal, sin envío automático.
    const chat = (await c37.query("insert into public.pedidos (nombre, email, telefono, entrega, total_eur, nota_admin) values ('Ana', 'ana@example.com', 'sin teléfono', 'envio', 90, 'Asignado desde el chat') returning envio_eur::text as en, total_eur::text as t, zona_envio")).rows[0];
    ok(chat.en === "0.00" && Number(chat.t) === 90 && chat.zona_envio === null, `Tarifas: sin código postal (un pedido asignado desde el chat) no se suma envío (${JSON.stringify(chat)})`);
    // Una venta de VeoAura trae su total: nunca envío automático, ni al cambiarle la entrega (el disparador funciona sin
    // la columna, como arriba, y con ella).
    await c37.query("alter table public.pedidos add column id_veoaura text");
    const veo = (await c37.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur, id_veoaura) values ('Pepe', 'pepe@example.com', '600123123', 'envio', '28001', 70, 'veo-1') returning id, envio_eur::text as en, total_eur::text as t, envio_manual")).rows[0];
    const veoCambio = (await c37.query("update public.pedidos set entrega = 'recogida', estado = 'enviado' where id = $1 returning envio_eur::text as en, total_eur::text as t", [veo.id])).rows[0];
    ok(veo.en === "0.00" && Number(veo.t) === 70 && veo.envio_manual === true && veoCambio.en === "0.00" && Number(veoCambio.t) === 70, `Tarifas: una venta de VeoAura se queda con su total, también al cambiarle la entrega (${JSON.stringify(veo)} → ${JSON.stringify(veoCambio)})`);
    const webConColumna = await nuevo("envio", "28001", 100);
    ok(webConColumna.en === "6.90", `Tarifas: con esa columna, los pedidos de la web siguen con su envío (${webConColumna.en})`);

    // Un reintento del pedido (la función nueva corrige el pedido pendiente): cambia la entrega o los artículos.
    const reintento = (await c37.query("update public.pedidos set entrega = 'recogida', codigo_postal = null, total_eur = 100 where id = $1 returning productos_eur::text as pr, envio_eur::text as en, total_eur::text as t, zona_envio", [pen.id])).rows[0];
    ok(reintento.pr === "100.00" && reintento.en === "0.00" && Number(reintento.t) === 100 && reintento.zona_envio === "mano", `Tarifas: si el reintento cambia a entrega en mano, se recalcula (${JSON.stringify(reintento)})`);
    const otrosArticulos = (await c37.query("update public.pedidos set entrega = 'envio', codigo_postal = '07001', total_eur = 120 where id = $1 returning productos_eur::text as pr, envio_eur::text as en, total_eur::text as t", [pen.id])).rows[0];
    ok(otrosArticulos.pr === "120.00" && otrosArticulos.en === "12.00" && Number(otrosArticulos.t) === 132, `Tarifas: y si cambian los artículos y la dirección, también (${JSON.stringify(otrosArticulos)})`);

    // A mano: el administrador pone el envío de ESE pedido; ya no se recalcula; «Volver al automático» lo devuelve.
    const aMano = await como(c37, "authenticated", ADMIN, `update public.pedidos set envio_eur = 3 where id = '${pen.id}' returning envio_eur::text as en, envio_manual, total_eur::text as t`, { confirmar: true });
    ok(aMano.ok && aMano.filas[0].en === "3.00" && aMano.filas[0].envio_manual === true && Number(aMano.filas[0].t) === 123, `Tarifas: el administrador pone el envío a mano y el total cambia (${JSON.stringify(aMano.filas?.[0] ?? aMano.mensaje)})`);
    const estado = await como(c37, "authenticated", ADMIN, `update public.pedidos set estado = 'confirmado', codigo_postal = '28001' where id = '${pen.id}' returning envio_eur::text as en, total_eur::text as t`, { confirmar: true });
    ok(estado.ok && estado.filas[0].en === "3.00" && Number(estado.filas[0].t) === 123, `Tarifas: a mano, ya no se recalcula aunque cambie el pedido (${JSON.stringify(estado.filas?.[0])})`);
    const automatico = await como(c37, "authenticated", ADMIN, `update public.pedidos set envio_manual = false where id = '${pen.id}' returning envio_eur::text as en, envio_manual, total_eur::text as t, zona_envio`, { confirmar: true });
    ok(automatico.ok && automatico.filas[0].en === "6.90" && automatico.filas[0].envio_manual === false && Number(automatico.filas[0].t) === 126.9 && automatico.filas[0].zona_envio === "peninsula", `Tarifas: «Volver al automático» lo recalcula con la tarifa (${JSON.stringify(automatico.filas?.[0])})`);
    const clientePedido = await como(c37, "authenticated", U1, `update public.pedidos set envio_eur = 0 where id = '${pen.id}'`, { confirmar: true });
    ok(clientePedido.ok && clientePedido.cuantas === 0, "Tarifas: un cliente no puede cambiar el envío de un pedido");
    await c37.end();

    // PRUEBA DE LAS PRUEBAS: sin el disparador, el pedido a Madrid no llevaría su envío y la comprobación lo detecta.
    const sinDisparador = TARIFAS.replace(/do \$\$\nbegin\n  if not exists \(select 1 from pg_trigger[\s\S]*?end \$\$;\n?$/, "");
    ok(sinDisparador !== TARIFAS, "(control) se ha podido quitar el disparador en la copia de prueba");
    const c38 = await nuevaBase("vz_aislada_tarifas_sin_disparador", ESQUEMA_T + sinDisparador);
    await c38.query("update public.tarifas_envio set precio_eur = 6.90 where zona = 'peninsula'");
    const sinEnvio = (await c38.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values ('Ana', 'ana@example.com', '600999888', 'envio', '28001', 100) returning envio_eur::text as en, total_eur::text as t")).rows[0];
    ok(sinEnvio.en !== "6.90" && Number(sinEnvio.t) === 100, `(control) sin el disparador el pedido no lleva su envío: la prueba SÍ lo detecta (${JSON.stringify(sinEnvio)})`);
    await c38.end();

    // Envío por kilos con Correos (20261107120000_envio_por_kilos.sql, encima de 20261107100000): peso de los artículos
    // (estimado por tipo, sin pisar el que ya hay), tramos de Paq Estándar en la península, peso del pedido al guardar
    // sus artículos y su envío por tramo; el envío a mano no se toca; la política de envíos lo explica.
    const CORREOS_K = readFileSync("supabase/migrations/20261107100000_tarifas_envio_correos.sql", "utf8");
    const KILOS = readFileSync("supabase/migrations/20261107120000_envio_por_kilos.sql", "utf8");
    const ESQUEMA_K = `
      create table public.products (
        id uuid primary key default gen_random_uuid(), title text not null, price_eur numeric not null default 0,
        status text not null default 'PUBLISHED', is_active boolean not null default true);
      create table public.pedido_items (
        id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos (id) on delete cascade,
        product_id uuid references public.products (id) on delete set null, titulo text not null, precio_eur numeric not null default 0);
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values ('envios', 'Política de envíos', '[
        {"heading": "Zonas de envío", "body": "Enviamos a toda la península."},
        {"heading": "Coste de envío", "body": "El coste se calcula automáticamente al finalizar la compra, según el destino y el importe del pedido, y lo ves antes de pagar o confirmar."}]'::jsonb);
      insert into public.products (title, price_eur) values
        ('Consola Nintendo Switch', 130), ('Playstation 5 Slim Con Lector', 570), ('Minecraft Videojuego Sin Caset', 15),
        ('Nintendo Switch + Accesorios + Funda', 145), ('Smart TV Philips 55” 4K', 200), ('Cosa rara sin tipo', 10),
        ('Mando Pro Original Nintendo Switch', 33);`;
    const c41 = await nuevaBase("vz_aislada_envio_kilos", ESQUEMA_T + ESQUEMA_K + TARIFAS + CORREOS_K);
    await c41.query("alter table public.products add column peso_kg numeric(6,3)");
    await c41.query("update public.products set peso_kg = 0.7 where title like 'Mando Pro%'");
    let repetidaK = true;
    try {
      await c41.query(KILOS);
      await c41.query(KILOS);
    } catch (e) {
      repetidaK = false;
      console.log(String(e.message));
    }
    const pesosK = Object.fromEntries((await c41.query("select title, peso_kg::float8 as p from public.products")).rows.map((r) => [r.title, r.p]));
    ok(
      repetidaK && pesosK["Consola Nintendo Switch"] === 2 && pesosK["Playstation 5 Slim Con Lector"] === 5 && pesosK["Minecraft Videojuego Sin Caset"] === 0.2 &&
        pesosK["Nintendo Switch + Accesorios + Funda"] === 2 && pesosK["Smart TV Philips 55” 4K"] === 20 && pesosK["Cosa rara sin tipo"] === null,
      `Kilos: se puede aplicar dos veces y cada artículo recibe su peso estimado por tipo (una consola con funda no cuenta como funda; lo desconocido, sin peso) (${JSON.stringify(pesosK)})`
    );
    ok(pesosK["Mando Pro Original Nintendo Switch"] === 0.7, "Kilos: el peso que ya tenía un artículo no se toca");
    const penK = (await c41.query("select precio_eur::text as p, jsonb_array_length(tramos) as n, tramos -> 0 ->> 'precio_eur' as primero, tramos -> -1 ->> 'precio_eur' as ultimo from public.tarifas_envio where zona = 'peninsula'")).rows[0];
    ok(penK.p === "13.65" && penK.n === 10 && Number(penK.primero) === 13.65 && Number(penK.ultimo) === 44.25, `Kilos: la península con los 10 tramos de Paq Estándar (${JSON.stringify(penK)})`);

    const id = async (t) => (await c41.query("select id from public.products where title = $1", [t])).rows[0].id;
    const SW = await id("Consola Nintendo Switch");
    const PS5 = await id("Playstation 5 Slim Con Lector");
    const MC = await id("Minecraft Videojuego Sin Caset");
    const TV = await id("Smart TV Philips 55” 4K");
    const RARA = await id("Cosa rara sin tipo");
    const SWF = await id("Nintendo Switch + Accesorios + Funda");
    // Como crear_pedido_idempotente: primero el pedido (artículos en total_eur) y después sus artículos.
    const pedidoK = async (cp, productos, total, entrega = "envio") => {
      const p = (await c41.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values ('Ana', 'ana@example.com', '600999888', $1, $2, $3) returning id", [entrega, cp, total])).rows[0];
      for (const pr of productos) await c41.query("insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur) select $1, id, title, price_eur from public.products where id = $2", [p.id, pr]);
      return (await c41.query("select id, peso_kg::float8 as kg, envio_eur::text as en, total_eur::text as t, zona_envio from public.pedidos where id = $1", [p.id])).rows[0];
    };
    const k1 = await pedidoK("28001", [MC], 15);
    ok(k1.kg === 0.2 && k1.en === "13.65" && Number(k1.t) === 28.65, `Kilos: un juego (0,2 kg) a Madrid paga el tramo de 1 kg, 13,65 € (${JSON.stringify(k1)})`);
    const k2 = await pedidoK("28001", [SW, MC], 145);
    ok(k2.kg === 2.2 && k2.en === "17.10" && Number(k2.t) === 162.1, `Kilos: consola + juego (2,2 kg) paga el tramo de 3 kg, 17,10 € (${JSON.stringify(k2)})`);
    const k3 = await pedidoK("28001", [PS5, SW], 700);
    ok(k3.kg === 7 && k3.en === "22.95", `Kilos: 7 kg paga el tramo de 10 kg, 22,95 € (${JSON.stringify(k3)})`);
    const k4 = await pedidoK("28001", [RARA], 10);
    ok(k4.kg === 2 && k4.en === "17.10", `Kilos: un artículo sin peso cuenta 2 kg (${JSON.stringify(k4)})`);
    const k5 = await pedidoK("28001", [TV, PS5, SW, SWF, RARA], 1000);
    ok(k5.kg === 31 && k5.en === "44.25", `Kilos: por encima de 30 kg, el último tramo (lo ajusta el dueño en Pedidos) (${JSON.stringify(k5)})`);
    const k6 = await pedidoK("50003", [PS5], 570);
    ok(k6.en === "0.00" && k6.zona_envio === "local", `Kilos: en Zaragoza sigue gratis (${JSON.stringify(k6)})`);
    const k7 = await pedidoK(null, [PS5], 570, "recogida");
    ok(k7.en === "0.00" && k7.zona_envio === "mano", "Kilos: en mano sigue gratis");
    // A mano: el envío que pone el administrador no se recalcula al añadir artículos.
    const manual = (await c41.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values ('Eva', 'eva@example.com', '600777666', 'envio', '28001', 15) returning id")).rows[0];
    await c41.query("update public.pedidos set envio_eur = 3 where id = $1", [manual.id]);
    await c41.query("insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur) values ($1, $2, 'PS5', 570)", [manual.id, PS5]);
    const manualK = (await c41.query("select envio_eur::text as en, envio_manual, peso_kg::float8 as kg from public.pedidos where id = $1", [manual.id])).rows[0];
    ok(manualK.en === "3.00" && manualK.envio_manual === true && manualK.kg === 5, `Kilos: el envío puesto a mano no se toca aunque cambie el peso (${JSON.stringify(manualK)})`);
    const anonK = await como(c41, "anon", null, "select public.calcular_envio('envio', '28001', 100, 4.5) as e");
    ok(anonK.ok && anonK.filas[0].e === "17.10", `Kilos: la página puede pedir el envío de un peso (como antes la de importe) (${JSON.stringify(anonK.filas?.[0] ?? anonK.mensaje)})`);
    const polK = (await c41.query("select sections -> 1 ->> 'body' as b from public.policy_pages where slug = 'envios'")).rows[0].b;
    ok(/^Enviamos con Correos\. .*el peso del pedido con su embalaje/.test(polK), `Kilos: la política de envíos dice que va con Correos y por el peso (${polK.slice(0, 80)})`);
    await c41.end();

    // PRUEBA DE LAS PRUEBAS: sin el disparador de los artículos, el pedido no tendría peso y pagaría como 2 kg.
    const sinPesoPedido = KILOS.replace(/do \$\$\nbegin\n  if not exists \(select 1 from pg_trigger where tgname = 'trg_pedido_items_peso'[\s\S]*?end \$\$;\n/, "");
    ok(sinPesoPedido !== KILOS, "(control) se ha podido quitar el disparador del peso en la copia de prueba");
    const c42 = await nuevaBase("vz_aislada_envio_kilos_sin_peso", ESQUEMA_T + ESQUEMA_K + TARIFAS + CORREOS_K + sinPesoPedido);
    const ps5c = (await c42.query("select id from public.products where title like 'Playstation 5%'")).rows[0].id;
    const swc = (await c42.query("select id from public.products where title = 'Consola Nintendo Switch'")).rows[0].id;
    const pc = (await c42.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur) values ('Ana', 'ana@example.com', '600999888', 'envio', '28001', 700) returning id")).rows[0];
    for (const pr of [ps5c, swc]) await c42.query("insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur) values ($1, $2, 'x', 1)", [pc.id, pr]);
    const pcK = (await c42.query("select envio_eur::text as en from public.pedidos where id = $1", [pc.id])).rows[0];
    ok(pcK.en !== "22.95", `(control) sin el disparador del peso, 7 kg no pagan su tramo (${pcK.en}): la prueba SÍ lo detecta`);
    await c42.end();

    // Solo entrega en mano (20261107140000): los televisores sin «caja original» se marcan; un pedido de la web a domicilio
    // con uno no se guarda (ni se puede cambiar a domicilio); en mano sí; los del chat (sin clave) no se tocan.
    const SOLO_MANO = readFileSync("supabase/migrations/20261107140000_productos_solo_entrega_mano.sql", "utf8");
    const ESQUEMA_M = `
      alter table public.pedidos add column clave_unica uuid unique;
      alter table public.products add column description text;
      insert into public.products (title, price_eur) values ('Televisor Samsung 43 con caja original', 150), ('LG TV 32 pulgadas', 90);
      update public.policy_pages set sections = sections || '[{"heading": "Embalaje", "body": "Bien protegido."}]'::jsonb where slug = 'envios';`;
    const c43 = await nuevaBase("vz_aislada_solo_mano", ESQUEMA_T + ESQUEMA_K + TARIFAS + ESQUEMA_M);
    let repetidaM = true;
    try {
      await c43.query(SOLO_MANO);
      await c43.query(SOLO_MANO);
    } catch (e) {
      repetidaM = false;
      console.log(String(e.message));
    }
    const marcas = Object.fromEntries((await c43.query("select title, solo_entrega_mano as m from public.products")).rows.map((r) => [r.title, r.m]));
    ok(
      repetidaM && marcas["Smart TV Philips 55” 4K"] === true && marcas["LG TV 32 pulgadas"] === true && marcas["Televisor Samsung 43 con caja original"] === false && marcas["Consola Nintendo Switch"] === false,
      `Solo en mano: se puede aplicar dos veces y se marcan los televisores sin «caja original» (y nada más) (${JSON.stringify(marcas)})`
    );
    const tvM = (await c43.query("select id from public.products where title like 'Smart TV%'")).rows[0].id;
    const swM = (await c43.query("select id from public.products where title = 'Consola Nintendo Switch'")).rows[0].id;
    const pedidoM = async (entrega, conClave) =>
      (await c43.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur, clave_unica) values ('Ana', 'ana@example.com', '600999888', $1, $2, 200, $3) returning id", [entrega, entrega === "envio" ? "28001" : null, conClave ? randomUUID() : null])).rows[0].id;
    const item = (pedido, producto) => c43.query("insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur) values ($1, $2, 'x', 1)", [pedido, producto]);
    let rechazoEnvio = "";
    const pEnvio = await pedidoM("envio", true);
    try {
      await item(pEnvio, tvM);
    } catch (e) {
      rechazoEnvio = String(e.message);
    }
    ok(/solo se entrega en mano/.test(rechazoEnvio), `Solo en mano: un pedido de la web a domicilio con la TV no se guarda (${rechazoEnvio.slice(0, 80)})`);
    let okOtros = true;
    try {
      await item(pEnvio, swM);
      await item(await pedidoM("recogida", true), tvM);
      await item(await pedidoM("envio", false), tvM);
    } catch (e) {
      okOtros = false;
      console.log(String(e.message));
    }
    ok(okOtros, "Solo en mano: una consola a domicilio sí, la TV en mano sí, y un pedido del chat (sin clave) no se toca");
    const pMano = await pedidoM("recogida", true);
    await item(pMano, tvM);
    let rechazoCambio = "";
    try {
      await c43.query("update public.pedidos set entrega = 'envio', codigo_postal = '28001' where id = $1", [pMano]);
    } catch (e) {
      rechazoCambio = String(e.message);
    }
    ok(/solo se entrega en mano/.test(rechazoCambio), "Solo en mano: un pedido en mano con la TV no se puede cambiar a domicilio");
    const polM = (await c43.query("select sections::text as t from public.policy_pages where slug = 'envios'")).rows[0].t;
    ok((polM.match(/no conservan su caja original no se envían/g) ?? []).length === 1, "Solo en mano: la política de envíos lo dice una sola vez");
    await c43.end();

    // PRUEBA DE LAS PRUEBAS: sin el disparador de los artículos, la TV a domicilio entraría.
    const sinBloqueo = SOLO_MANO.replace(/  if not exists \(select 1 from pg_trigger where tgname = 'trg_pedido_items_solo_mano'[\s\S]*?  end if;\n/, "");
    ok(sinBloqueo !== SOLO_MANO, "(control) se ha podido quitar el bloqueo de solo en mano en la copia de prueba");
    const c44 = await nuevaBase("vz_aislada_solo_mano_sin_bloqueo", ESQUEMA_T + ESQUEMA_K + TARIFAS + ESQUEMA_M + sinBloqueo);
    const tvC = (await c44.query("select id from public.products where title like 'Smart TV%'")).rows[0].id;
    const pC = (await c44.query("insert into public.pedidos (nombre, email, telefono, entrega, codigo_postal, total_eur, clave_unica) values ('Ana', 'ana@example.com', '600999888', 'envio', '28001', 200, $1) returning id", [randomUUID()])).rows[0].id;
    let entraTv = true;
    try {
      await c44.query("insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur) values ($1, $2, 'x', 1)", [pC, tvC]);
    } catch {
      entraTv = false;
    }
    ok(entraTv, "(control) sin el bloqueo, la TV a domicilio entra: la prueba SÍ lo detecta");
    await c44.end();
  }

  // Pago con tarjeta (20261105120000_pagos_tarjeta.sql), sobre los pedidos como en producción (con sus tarifas de envío), y
  // Stripe en la privacidad y en los términos (20261105121000_politicas_pago_tarjeta.sql). Las columnas las escribe solo
  // el servidor (api/pago.ts, con la clave del servidor, que salta las reglas: aquí, el usuario postgres).
  {
    const TARIFAS_P = readFileSync("supabase/migrations/20261104210000_tarifas_envio.sql", "utf8");
    const PAGOS = readFileSync("supabase/migrations/20261105120000_pagos_tarjeta.sql", "utf8");
    const POL_PAGO = readFileSync("supabase/migrations/20261105121000_politicas_pago_tarjeta.sql", "utf8");
    const TITULOS_P = ["Responsable del tratamiento", "Qué datos tratamos", "Con quién compartimos tus datos", "Tus derechos"];
    const TERMINOS_P = ["Quiénes somos", "Precios y pago", "Disponibilidad"];
    const seccionesDe = (titulos) => JSON.stringify(titulos.map((heading) => ({ heading, body: `Texto de hoy de «${heading}».` }))).replace(/'/g, "''");
    const ESQUEMA_P = `
      create table public.pedidos (
        id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique, created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(), user_id uuid references auth.users (id) on delete set null,
        estado text not null default 'pendiente', entrega text not null default 'envio', nombre text not null, email text not null,
        telefono text not null, direccion text, codigo_postal text, ciudad text, notas text, total_eur numeric not null default 0, nota_admin text);
      alter table public.pedidos enable row level security;
      create policy pedidos_admin_select on public.pedidos for select to authenticated using ((select public.is_admin()));
      create policy pedidos_admin_update on public.pedidos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
      create policy pedidos_cliente_select on public.pedidos for select to authenticated using (user_id = (select auth.uid()));
      insert into public.pedidos (user_id, nombre, email, telefono, entrega, codigo_postal, total_eur) values
        ('${U1}', 'Luis', 'luis@example.com', '600111222', 'envio', '28001', 100),
        (null, 'Marta', 'marta@example.com', '600333444', 'recogida', null, 55.5);
      create table public.policy_pages (
        id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, intro text not null default '',
        sections jsonb not null default '[]'::jsonb, is_active boolean not null default true, sort_order integer not null default 0,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.policy_pages (slug, title, sections) values
        ('privacidad', 'Política de privacidad', '${seccionesDe(TITULOS_P)}'::jsonb),
        ('terminos', 'Términos y condiciones', '${seccionesDe(TERMINOS_P)}'::jsonb),
        ('envios', 'Política de envíos', '[]'::jsonb);`;
    const DEVOL = readFileSync("supabase/migrations/20261106100000_pagos_devolucion.sql", "utf8");
    const c39 = await nuevaBase("vz_aislada_pagos_tarjeta", ESQUEMA_P + TARIFAS_P + PAGOS + POL_PAGO + DEVOL);
    let repetidaP = true;
    try {
      await c39.query(PAGOS + POL_PAGO + DEVOL);
    } catch (e) {
      repetidaP = false;
      console.log(String(e.message));
    }
    const columnasP = (await c39.query("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'pedidos' and (column_name like 'pago%' or column_name like 'pagado%') order by column_name")).rows;
    ok(
      repetidaP && columnasP.map((x) => x.column_name).join(",") === "pagado_en,pagado_eur,pago_estado,pago_iniciado_en,pago_modo,pago_referencia,pago_sesion",
      `Pago: las 7 columnas y se puede aplicar dos veces (${columnasP.map((x) => `${x.column_name} ${x.data_type}`).join(", ")})`
    );
    const comprobacionesP = Number((await c39.query("select count(*) as n from pg_constraint where conrelid = 'public.pedidos'::regclass and contype = 'c' and conname like 'pedidos_pag%'")).rows[0].n);
    ok(comprobacionesP === 6, `Pago: 6 comprobaciones, sin duplicar (${comprobacionesP})`);
    const antiguosP = (await c39.query("select pago_estado, pagado_eur, total_eur::text as t from public.pedidos order by numero")).rows;
    ok(antiguosP.every((x) => x.pago_estado === null && x.pagado_eur === null) && Number(antiguosP[0].t) === 100, `Pago: los pedidos que había quedan igual, sin pago (${JSON.stringify(antiguosP)})`);
    const politicasPed = (await c39.query("select policyname from pg_policies where tablename = 'pedidos' order by 1")).rows.map((x) => x.policyname);
    ok(politicasPed.join(",") === "pedidos_admin_select,pedidos_admin_update,pedidos_cliente_select", `Pago: no toca los permisos de pedidos (${politicasPed.join(", ")})`);

    // Valores raros: no entran.
    const raros = [];
    for (const cambio of ["pago_estado = 'regalado'", "pago_modo = 'gratis'", "pagado_eur = -1", "pago_estado = 'pagado', pago_modo = 'real'", `pago_sesion = '${"x".repeat(300)}'`]) {
      try {
        await c39.query(`update public.pedidos set ${cambio} where numero = 1`);
        raros.push(`${cambio.slice(0, 30)}: entra`);
      } catch (e) {
        raros.push(e.code);
      }
    }
    ok(raros.every((x) => x === "23514"), `Pago: estado, modo, importe negativo, «pagado» sin importe ni fecha o una sesión enorme no entran (${raros.join(", ")})`);

    // El servidor apunta el pago: el total y el envío no cambian (el disparador del envío no recalcula por esto).
    const antesPago = (await c39.query("select envio_eur::text as en, total_eur::text as t from public.pedidos where numero = 1")).rows[0];
    const pagado = (await c39.query("update public.pedidos set pago_estado = 'pagado', pago_modo = 'prueba', pago_sesion = 'cs_test_abc', pago_referencia = 'pi_abc', pagado_eur = 106.90, pagado_en = now() where numero = 1 returning pago_estado, pagado_eur::text as eur, envio_eur::text as en, total_eur::text as t")).rows[0];
    ok(pagado.pago_estado === "pagado" && pagado.eur === "106.90" && Number(pagado.en) === Number(antesPago.en) && Number(pagado.t) === Number(antesPago.t), `Pago: el servidor apunta el pago y el total y el envío no cambian (${JSON.stringify(antesPago)} → ${JSON.stringify(pagado)})`);

    // Quién ve y quién cambia.
    const clienteVe = await como(c39, "authenticated", U1, "select numero, pago_estado, pagado_eur::text as eur from public.pedidos");
    ok(clienteVe.ok && clienteVe.filas.length === 1 && clienteVe.filas[0].pago_estado === "pagado", `Pago: el cliente ve el pago de SU pedido y solo el suyo (${JSON.stringify(clienteVe.filas ?? clienteVe.mensaje)})`);
    const clienteCambiaP = await como(c39, "authenticated", U1, "update public.pedidos set pago_estado = 'pagado', pago_modo = 'real', pagado_eur = 1, pagado_en = now() where numero = 2", { confirmar: true });
    const clienteSuyo = await como(c39, "authenticated", U1, "update public.pedidos set pagado_eur = 0 where numero = 1", { confirmar: true });
    const sigue = (await c39.query("select numero, pago_estado, pagado_eur::text as eur from public.pedidos order by numero")).rows;
    ok(clienteCambiaP.ok && clienteCambiaP.cuantas === 0 && clienteSuyo.ok && clienteSuyo.cuantas === 0 && sigue[0].eur === "106.90" && sigue[1].pago_estado === null, `Pago: un cliente no puede apuntarse un pago, ni en su propio pedido (${clienteCambiaP.cuantas ?? clienteCambiaP.codigo}, ${clienteSuyo.cuantas ?? clienteSuyo.codigo})`);
    // Devoluciones (20261106100000): 3 columnas; no entran importes de 0 ni sin fecha; el servidor las apunta sin
    // cambiar el total; un cliente no puede apuntarse una devolución.
    const columnasD = (await c39.query("select string_agg(column_name, ',' order by column_name) as c from information_schema.columns where table_schema = 'public' and table_name = 'pedidos' and column_name in ('devuelto_eur','devuelto_en','devolucion_referencia')")).rows[0].c;
    const rarosD = [];
    for (const cambio of ["devuelto_eur = 0, devuelto_en = now()", "devuelto_eur = 10", `devolucion_referencia = '${"x".repeat(300)}'`]) {
      try {
        await c39.query(`update public.pedidos set ${cambio} where numero = 1`);
        rarosD.push("entra");
      } catch (e) {
        rarosD.push(e.code);
      }
    }
    const devuelto = (await c39.query("update public.pedidos set devuelto_eur = 106.90, devuelto_en = now(), devolucion_referencia = 're_abc' where numero = 1 returning devuelto_eur::text as d, total_eur::text as t")).rows[0];
    const clienteDevuelve = await como(c39, "authenticated", U1, "update public.pedidos set devuelto_eur = 1, devuelto_en = now() where numero = 2", { confirmar: true });
    const comprobacionesD = Number((await c39.query("select count(*) as n from pg_constraint where conrelid = 'public.pedidos'::regclass and contype = 'c' and conname like 'pedidos_dev%'")).rows[0].n);
    ok(
      columnasD === "devolucion_referencia,devuelto_en,devuelto_eur" && rarosD.every((x) => x === "23514") && devuelto.d === "106.90" && Number(devuelto.t) === 100 && clienteDevuelve.ok && clienteDevuelve.cuantas === 0 && comprobacionesD === 2,
      `Devoluciones: 3 columnas y 2 comprobaciones sin duplicar; 0 € o sin fecha no entran; el servidor la apunta sin tocar el total; un cliente no (${columnasD}; ${rarosD.join(", ")}; ${JSON.stringify(devuelto)}; ${clienteDevuelve.cuantas ?? clienteDevuelve.codigo})`
    );
    const anonVe = await como(c39, "anon", null, "select numero from public.pedidos");
    ok(anonVe.ok && anonVe.filas.length === 0, `Pago: un visitante no ve ningún pedido (${anonVe.filas?.length ?? anonVe.codigo})`);

    // Privacidad y términos: Stripe una sola vez (aunque se aplique dos veces) y el resto igual.
    const privP = (await c39.query("select sections from public.policy_pages where slug = 'privacidad'")).rows[0].sections;
    const termP = (await c39.query("select sections from public.policy_pages where slug = 'terminos'")).rows[0].sections;
    const conQuienP = privP.find((s) => s.heading === "Con quién compartimos tus datos")?.body ?? "";
    const preciosP = termP.find((s) => s.heading === "Precios y pago")?.body ?? "";
    ok(
      conQuienP.startsWith("Texto de hoy de «Con quién compartimos tus datos».") &&
        (conQuienP.match(/Stripe Payments Europe/g) ?? []).length === 1 &&
        /la tienda nunca ve ni guarda los datos de tu tarjeta/.test(conQuienP) &&
        /solo le pasamos el número de tu pedido y su importe/.test(conQuienP) &&
        privP.filter((s) => s.heading !== "Con quién compartimos tus datos").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "Pago: la privacidad nombra a Stripe una sola vez (qué recibe y que la tienda no ve la tarjeta) y el resto queda igual"
    );
    ok(
      preciosP.startsWith("Texto de hoy de «Precios y pago».") &&
        (preciosP.match(/Stripe/g) ?? []).length === 1 &&
        /confirmar el pedido sin pagar/.test(preciosP) &&
        termP.filter((s) => s.heading !== "Precios y pago").every((s) => s.body === `Texto de hoy de «${s.heading}».`),
      "Pago: los términos explican el pago con tarjeta una sola vez y el resto queda igual"
    );
    ok(Number((await c39.query("select count(*) as n from public.policy_pages where slug = 'envios' and sections = '[]'::jsonb")).rows[0].n) === 1, "Pago: las otras políticas no se tocan");

    // VeoAura y la tarjeta (20261106110000): «cuando te lo entregamos» pasa a «cuando lo pagas con tarjeta o te lo
    // entregamos», una sola vez; lo demás igual; sin esa frase (otra redacción del dueño) no toca nada.
    const VEO_T = readFileSync("supabase/migrations/20261106110000_privacidad_veoaura_tarjeta.sql", "utf8");
    const FRASE_V = " Si tu pedido incluye artículos que gestionamos con VeoAura, le comunicamos ese pedido y, cuando te lo entregamos, también tu nombre, tu correo electrónico y tu teléfono.";
    await c39.query(`update public.policy_pages set sections = jsonb_set(sections, '{2,body}', to_jsonb((sections -> 2 ->> 'body') || $1::text)) where slug = 'privacidad'`, [FRASE_V]);
    await c39.query(VEO_T);
    await c39.query(VEO_T);
    const conQuienV = (await c39.query("select sections -> 2 ->> 'body' as b from public.policy_pages where slug = 'privacidad'")).rows[0].b;
    ok(
      (conQuienV.match(/cuando lo pagas con tarjeta o te lo entregamos, también tu nombre/g) ?? []).length === 1 && !/y, cuando te lo entregamos/.test(conQuienV) && /Stripe Payments Europe/.test(conQuienV),
      "VeoAura y la tarjeta: la privacidad dice «cuando lo pagas con tarjeta o te lo entregamos» una sola vez (aplicada dos veces) y lo demás sigue igual"
    );
    const terminosIgual = (await c39.query("select sections::text as t from public.policy_pages where slug = 'terminos'")).rows[0].t;
    ok(!/pagas con tarjeta o te lo entregamos/.test(terminosIgual), "VeoAura y la tarjeta: los términos no se tocan");

    // Klarna y envíos (20261106150000): Klarna en la privacidad una vez; en los términos, sin «checkout de la app» y con
    // Klarna; envíos con las entregas reales, solo donde sigue el texto antiguo (lo editado por el dueño se queda).
    const KLARNA = readFileSync("supabase/migrations/20261106150000_politicas_klarna_envios.sql", "utf8");
    const PRECIOS_VIEJO = "Los precios mostrados incluyen los impuestos aplicables. El pago se realiza a través de los métodos disponibles en el checkout de la app. Nos reservamos el derecho a corregir errores evidentes de precio antes de confirmar el pedido. Si pagas con tarjeta, lo haces en la página de pago segura de Stripe (la tienda nunca ve los datos de tu tarjeta); también puedes confirmar el pedido sin pagar.";
    const ENVIOS_VIEJO = [
      { heading: "Zonas de envío", body: "Enviamos a toda la península." },
      { heading: "Plazos de preparación y entrega", body: "Preparamos cada pedido en 24–48h laborables tras confirmarse el pago. El transporte añade normalmente 24–72h laborables adicionales en península. Te avisamos por email o WhatsApp en cuanto el pedido sale de tienda, con su número de seguimiento." },
      { heading: "Coste de envío", body: "Lo ha cambiado el dueño a mano." },
      { heading: "Recogida en tienda", body: "Puedes elegir recoger tu pedido en nuestra tienda física sin coste de envío. Te avisamos en cuanto esté listo para recoger." },
      { heading: "Embalaje", body: "Bien protegido." },
    ];
    await c39.query("update public.policy_pages set sections = jsonb_set(sections, '{1,body}', to_jsonb($1::text)) where slug = 'terminos'", [PRECIOS_VIEJO]);
    await c39.query("update public.policy_pages set intro = 'Enviamos a toda España, bien protegido y con seguimiento. Si lo prefieres, también puedes recoger tu pedido en tienda sin coste.', sections = $1::jsonb where slug = 'envios'", [JSON.stringify(ENVIOS_VIEJO)]);
    await c39.query(KLARNA);
    await c39.query(KLARNA);
    const privK = (await c39.query("select sections -> 2 ->> 'body' as b from public.policy_pages where slug = 'privacidad'")).rows[0].b;
    ok((privK.match(/Klarna Bank AB/g) ?? []).length === 1 && /Stripe Payments Europe/.test(privK), "Klarna: la privacidad nombra a Klarna una sola vez (aplicada dos veces) y lo de Stripe sigue");
    const precK = (await c39.query("select sections -> 1 ->> 'body' as b from public.policy_pages where slug = 'terminos'")).rows[0].b;
    ok(!/checkout de la app/.test(precK) && /en la página de pago de la tienda\./.test(precK) && (precK.match(/Si pagas con tarjeta o con Klarna/g) ?? []).length === 1 && /confirmar el pedido sin pagar/.test(precK), `Klarna: los términos, sin «checkout de la app» y con Klarna una vez (${precK.slice(60, 140)})`);
    const envK = (await c39.query("select intro, sections from public.policy_pages where slug = 'envios'")).rows[0];
    const envTexto = JSON.stringify(envK);
    ok(!/recoger tu pedido en tienda|nuestra tienda física|sale de tienda|Recogida en tienda/.test(envTexto) && /a domicilio o en mano en Cuarte de Huerva/.test(envK.intro), "Envíos: sin «recoger en tienda», «tienda física» ni «sale de tienda»");
    ok(envK.sections.length === 5 && envK.sections[3].heading === "Entregas en Zaragoza" && /llega a destino en 72 horas como máximo/.test(envK.sections[1].body), "Envíos: plazos reales y «Entregas en Zaragoza» en su sitio");
    ok(envK.sections[2].body === "Lo ha cambiado el dueño a mano." && envK.sections[0].body === "Enviamos a toda la península." && envK.sections[4].body === "Bien protegido.", "Envíos: lo que el dueño cambió a mano y lo demás se queda igual");

    // Primeros precios (20261107100000): península 6,90 €; islas, Ceuta y Melilla «escríbenos»; en mano y Zaragoza, 0 €.
    // No pisa lo que el dueño haya puesto (updated_by) y repetirla no cambia nada.
    const CORREOS = readFileSync("supabase/migrations/20261107100000_tarifas_envio_correos.sql", "utf8");
    await c39.query(`update public.tarifas_envio set precio_eur = 9.50, updated_by = '${U1}' where zona = 'canarias'`);
    await c39.query(CORREOS);
    await c39.query(CORREOS);
    const tar = Object.fromEntries((await c39.query("select zona, precio_eur::text as p, activa from public.tarifas_envio")).rows.map((r) => [r.zona, `${r.p}/${r.activa}`]));
    ok(tar.peninsula === "6.90/true" && tar.mano === "0.00/true" && tar.local === "0.00/true", `Tarifas Correos: península 6,90 €; en mano y Zaragoza siguen a 0 € (${JSON.stringify(tar)})`);
    ok(tar.baleares === "0.00/false" && tar.ceuta_melilla === "0.00/false", "Tarifas Correos: Baleares, Ceuta y Melilla pasan a «escríbenos» (sin envío desde la web)");
    ok(tar.canarias === "9.50/true", "Tarifas Correos: lo que el dueño ya había puesto no se toca");
    await c39.end();

    // PRUEBA DE LAS PRUEBAS: sin la condición «ya nombra a Stripe», la frase se repetiría; sin las comprobaciones, entraría
    // un estado inventado.
    const sinGuardaP = POL_PAGO.replace(/\n\s*and not exists \(select 1 from jsonb_array_elements\(p\.sections\) as s \(sec\) where s\.sec ->> 'body' like '%Stripe%'\);/g, ";");
    ok(sinGuardaP !== POL_PAGO, "(control) se ha podido quitar la condición de las políticas en la copia de prueba");
    const sinComprobaciones = PAGOS.replace(/\ndo \$\$[\s\S]*?\$\$;\n?$/, "\n");
    ok(sinComprobaciones !== PAGOS, "(control) se han podido quitar las comprobaciones de las columnas en la copia de prueba");
    const c40 = await nuevaBase("vz_aislada_pagos_sin_guardas", ESQUEMA_P + TARIFAS_P + sinComprobaciones);
    await c40.query(sinGuardaP);
    await c40.query(sinGuardaP);
    const repetidaStripe = ((await c40.query("select sections::text as t from public.policy_pages where slug = 'privacidad'")).rows[0].t.match(/Stripe Payments Europe/g) ?? []).length;
    ok(repetidaStripe === 2, `(control) sin la condición la frase de Stripe se repite (${repetidaStripe} veces): la prueba SÍ lo detecta`);
    let entraRaro = false;
    try {
      await c40.query("update public.pedidos set pago_estado = 'regalado' where numero = 1");
      entraRaro = true;
    } catch {
      entraRaro = false;
    }
    ok(entraRaro, "(control) sin las comprobaciones entra un estado inventado: la prueba SÍ lo detecta");
    await c40.end();
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
