/**
 * pruebas/interaccion-api.mjs — pruebas del manejador REAL api/interaccion.ts (visitas y «me gusta»).
 *
 * Qué hace: carga api/interaccion.ts tal cual está (Node 24 ejecuta TypeScript sin compilar) y le manda
 * peticiones simuladas. Las llamadas a Supabase se interceptan: las funciones consumir_limite, fijar_apoyo,
 * sumar_vista_producto y sumar_vista_servicio se ejecutan de verdad contra la base AISLADA (psql como
 * service_role, con las migraciones reales aplicadas) y Supabase Auth es simulado. Comprueba:
 *  1) Visitas: 100 peticiones de la misma IP a la misma ficha suman 1 (las demás responden contado:false);
 *     otra ficha u otra IP cuentan aparte.
 *  2) Tope por IP (60 cada 10 min), aunque cambie x-forwarded-for; y un script que inventa un visitante
 *     nuevo en cada petición queda acotado a ese tope.
 *  3) «Me gusta»: por persona (usuario con sesión o visitante anónimo): repetir no suma, quitar resta, un token
 *     falso no da identidad de usuario, un usuario cuenta una sola vez aunque cambie de navegador.
 *  4) Tope de 30 cambios por persona y hora; 50 peticiones SIMULTÁNEAS de la misma persona suman 1.
 *  5) Entradas inválidas (método, acción, id, activo, sin identificador): 4xx sin tocar la base de datos.
 * NO toca producción ni Supabase real.
 *
 * Uso: node pruebas/interaccion-api.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/interaccion-api.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const base = await db.crearBase();
await db.psql(base, [
  "-c",
  `create table public.services (id uuid primary key default gen_random_uuid(), title text not null default 's', view_count integer not null default 0);
   create function public.adjust_product_like(product_id uuid, delta integer) returns integer language plpgsql security definer set search_path = public as $$ declare n int; begin update public.products set like_count = greatest(0, like_count + delta) where id = product_id returning like_count into n; return n; end $$;
   create function public.increment_product_view(product_id uuid) returns integer language plpgsql security definer set search_path = public as $$ declare n int; begin update public.products set view_count = view_count + 1 where id = product_id returning view_count into n; return n; end $$;
   create function public.increment_service_view(service_id uuid) returns integer language plpgsql security definer set search_path = public as $$ declare n int; begin update public.services set view_count = view_count + 1 where id = service_id returning view_count into n; return n; end $$;
   insert into public.products (id, title, price_eur, status) select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'P' || i, 10, 'PUBLISHED' from generate_series(1, 120) i;
   insert into public.services (id) values ('00000000-0000-4000-8000-0000000000b1')`,
]);
await db.aplicar(base, ["supabase/migrations/20261018120000_limite_peticiones.sql", "supabase/migrations/20261018130000_visitas_y_apoyos_protegidos.sql"]);

const FALSO = "https://falso.supabase.test";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
const USUARIOS = { "token-u1": "11111111-1111-4111-8111-111111111111", "token-u2": "22222222-2222-4222-8222-222222222222" };
let llamadasBD = 0;
const original = globalThis.fetch;
const literal = (v) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));
globalThis.fetch = async (entrada, opciones) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    llamadasBD++;
    const args = JSON.parse(opciones.body);
    const sql = `select public.${rpc[1]}(${Object.entries(args).map(([k, v]) => `${k} => ${literal(v)}`).join(", ")})`;
    try {
      const salida = await db.psql(base, ["-c", "set role service_role", "-A", "-t", "-c", sql]);
      return new Response(salida.trim() || "null", { status: 200, headers: { "content-type": "application/json" } });
    } catch (e) {
      const mensaje = String(e.message).replace(/^ERROR:\s+/, "").split("\n")[0];
      return new Response(JSON.stringify({ message: mensaje }), { status: 400, headers: { "content-type": "application/json" } });
    }
  }
  if (url.pathname === "/auth/v1/user") {
    const token = String(new Headers(opciones?.headers).get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return USUARIOS[token]
      ? new Response(JSON.stringify({ id: USUARIOS[token], aud: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ message: "token no válido" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const consolaError = console.error;
console.error = () => {};

const manejador = (await import("../api/interaccion.ts")).default;
const prod = (i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
const SERVICIO = "00000000-0000-4000-8000-0000000000b1";
let n = 0;
const ipNueva = () => `203.0.113.${(n++ % 250) + 1}`;

async function llamar(cuerpo, { metodo = "POST", cabeceras = {} } = {}) {
  const req = { method: metodo, headers: cabeceras, body: cuerpo, socket: { remoteAddress: "10.0.0.1" } };
  const res = { codigo: 200, cuerpo: null, cabeceras: {} };
  res.setHeader = (k, v) => void (res.cabeceras[k.toLowerCase()] = v);
  res.status = (c) => ((res.codigo = c), res);
  res.json = (b) => ((res.cuerpo = b), res);
  await manejador(req, res);
  return res;
}
const contador = (columna, tabla, id) => db.consulta(base, `select ${columna} from public.${tabla} where id = '${id}'`).then(Number);
const reiniciarLimites = () => db.consulta(base, "update public.limites_peticiones set ventana_inicio = now() - interval '2 days'");

try {
  // 1) Visitas
  {
    const ip = "198.51.100.1";
    const rs = [];
    for (let i = 0; i < 50; i++) rs.push(await llamar({ accion: "vista_producto", id: prod(1) }, { cabeceras: { "x-vercel-forwarded-for": ip } }));
    const contadas = rs.filter((r) => r.cuerpo?.contado === true).length;
    ok(contadas === 1 && rs.every((r) => r.codigo === 200), `50 visitas de la misma IP a la misma ficha: todas responden 200 y cuenta 1 (contadas ${contadas})`);
    ok((await contador("view_count", "products", prod(1))) === 1, "y la ficha tiene exactamente 1 visita en la base de datos");
    const otra = await llamar({ accion: "vista_producto", id: prod(2) }, { cabeceras: { "x-vercel-forwarded-for": ip } });
    ok(otra.cuerpo?.contado === true && otra.cuerpo.total === 1, "otra ficha desde la misma IP cuenta aparte");
    const otraIp = await llamar({ accion: "vista_producto", id: prod(1) }, { cabeceras: { "x-vercel-forwarded-for": "198.51.100.2" } });
    ok(otraIp.cuerpo?.contado === true && otraIp.cuerpo.total === 2, "la misma ficha desde otra IP cuenta (total 2)");
    const serv = await llamar({ accion: "vista_servicio", id: SERVICIO }, { cabeceras: { "x-vercel-forwarded-for": ip } });
    ok(serv.cuerpo?.contado === true && (await contador("view_count", "services", SERVICIO)) === 1, "las visitas de servicios también cuentan 1 por IP y página");
  }

  // 2) Tope por IP y minteo de visitantes
  {
    await reiniciarLimites();
    const ip = "198.51.100.3";
    const rs = [];
    for (let i = 0; i < 70; i++) rs.push(await llamar({ accion: "vista_producto", id: prod(10 + i) }, { cabeceras: { "x-vercel-forwarded-for": ip, "x-forwarded-for": `192.0.2.${i}`, "x-real-ip": `192.0.2.${100 + (i % 100)}` } }));
    ok(rs.filter((r) => r.codigo === 200).length === 60 && rs.filter((r) => r.codigo === 429).length === 10, `una IP que recorre 70 fichas: 60 pasan y 10 reciben 429 aunque cambie x-forwarded-for (${rs.filter((r) => r.codigo === 200).length} / ${rs.filter((r) => r.codigo === 429).length})`);
    ok(Number(rs.find((r) => r.codigo === 429).cabeceras["retry-after"]) > 0, "el 429 lleva Retry-After");
    await reiniciarLimites();
    const antes = await contador("like_count", "products", prod(100));
    const minteo = [];
    for (let i = 0; i < 100; i++) minteo.push(await llamar({ accion: "apoyo", id: prod(100), activo: true, visitante: `nuevo-visitante-${String(i).padStart(4, "0")}` }, { cabeceras: { "x-vercel-forwarded-for": "198.51.100.4" } }));
    const sumados = (await contador("like_count", "products", prod(100))) - antes;
    ok(sumados === 60, `un script que inventa un visitante nuevo en cada petición suma como mucho 60 «me gusta» por IP y 10 minutos (sumó ${sumados} de 100 intentos): inflar cuesta una IP por cada 60`);
  }

  // 3) «Me gusta» por persona
  {
    await reiniciarLimites();
    const ip = () => ({ "x-vercel-forwarded-for": ipNueva() });
    const p = prod(101);
    const v1 = { accion: "apoyo", id: p, activo: true, visitante: "visitante-uno-aaaa" };
    const a = await llamar(v1, { cabeceras: ip() });
    ok(a.codigo === 200 && a.cuerpo.total === 1, "un visitante da «me gusta»: total 1");
    for (let i = 0; i < 20; i++) await llamar(v1, { cabeceras: ip() });
    ok((await contador("like_count", "products", p)) === 1, "repetirlo 20 veces (desde IP distintas) sigue en 1");
    const q = await llamar({ ...v1, activo: false }, { cabeceras: ip() });
    ok(q.cuerpo.total === 0, "quitarlo vuelve a 0");
    const otro = await llamar({ ...v1, visitante: "visitante-dos-bbbb" }, { cabeceras: ip() });
    ok(otro.cuerpo.total === 1, "otro visitante suma aparte");
    // Usuario con sesión: una sola persona aunque cambie de navegador (identificador anónimo distinto).
    const u1 = await llamar({ accion: "apoyo", id: p, activo: true, visitante: "navegador-del-movil-1" }, { cabeceras: { ...ip(), authorization: "Bearer token-u1" } });
    const u2 = await llamar({ accion: "apoyo", id: p, activo: true, visitante: "navegador-del-portatil" }, { cabeceras: { ...ip(), authorization: "Bearer token-u1" } });
    ok(u1.cuerpo.total === 2 && u2.cuerpo.total === 2, `un usuario con sesión cuenta UNA vez aunque use dos navegadores (totales ${u1.cuerpo.total} y ${u2.cuerpo.total})`);
    const falso = await llamar({ accion: "apoyo", id: p, activo: true, visitante: "visitante-falso-cccc" }, { cabeceras: { ...ip(), authorization: "Bearer token-inventado" } });
    ok(falso.codigo === 200 && falso.cuerpo.total === 3, "un token inventado no da identidad de usuario: cuenta como un visitante más");
    const sinNada = await llamar({ accion: "apoyo", id: p, activo: true }, { cabeceras: ip() });
    ok(sinNada.codigo === 400, "sin sesión y sin identificador de visitante: 400");
    const inexistente = await llamar({ accion: "apoyo", id: "00000000-0000-4000-8000-0000000fffff", activo: true, visitante: "visitante-uno-aaaa" }, { cabeceras: ip() });
    ok(inexistente.codigo === 404, "producto inexistente: 404");
  }

  // 4) Tope por persona y simultaneidad
  {
    await reiniciarLimites();
    const p = prod(102);
    const rs = [];
    for (let i = 0; i < 40; i++) rs.push(await llamar({ accion: "apoyo", id: p, activo: i % 2 === 0, visitante: "visitante-pesado-dddd" }, { cabeceras: { "x-vercel-forwarded-for": ipNueva() } }));
    ok(rs.filter((r) => r.codigo === 200).length === 30 && rs.filter((r) => r.codigo === 429).length === 10, `una persona que da y quita sin parar: 30 cambios por hora y los demás 429 (${rs.filter((r) => r.codigo === 200).length} / ${rs.filter((r) => r.codigo === 429).length})`);
    await reiniciarLimites();
    const q = prod(103);
    const simult = await Promise.all(Array.from({ length: 50 }, () => llamar({ accion: "apoyo", id: q, activo: true, visitante: "visitante-rafaga-eeee" }, { cabeceras: { "x-vercel-forwarded-for": "198.51.100.50" } })));
    const buenas = simult.filter((r) => r.codigo === 200).length;
    ok((await contador("like_count", "products", q)) === 1 && buenas > 0, `50 «me gusta» SIMULTÁNEOS de la misma persona suman exactamente 1 (${buenas} respondidas)`);
  }

  // 5) Entradas inválidas: no tocan la base de datos
  {
    await reiniciarLimites();
    const antes = llamadasBD;
    const casos = [
      ["método GET", () => llamar({}, { metodo: "GET" }), 405],
      ["acción desconocida", () => llamar({ accion: "borrar", id: prod(1) }), 400],
      ["id que no es uuid", () => llamar({ accion: "vista_producto", id: "no-es-un-uuid" }), 400],
      ["sin id", () => llamar({ accion: "vista_producto" }), 400],
      ["activo que no es booleano", () => llamar({ accion: "apoyo", id: prod(1), activo: "si", visitante: "visitante-uno-aaaa" }), 400],
      ["cuerpo vacío", () => llamar(undefined), 400],
    ];
    for (const [nombre, f, esperado] of casos) {
      const r = await f();
      ok(r.codigo === esperado, `entrada inválida «${nombre}»: ${r.codigo} (esperado ${esperado})`);
    }
    ok(llamadasBD === antes, "las entradas inválidas no llegan a la base de datos (ni siquiera al límite)");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
  console.error = consolaError;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
