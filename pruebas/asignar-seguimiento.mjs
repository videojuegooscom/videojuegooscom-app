/**
 * pruebas/asignar-seguimiento.mjs — «Asignar seguimiento» desde Administración → Chat (api/asignar-seguimiento.ts).
 *
 * Qué hace: carga la función REAL (Node 24 ejecuta TypeScript sin compilar) y le manda peticiones simuladas; Supabase
 * (sesiones, perfiles, conversaciones, reparaciones, pedidos) se simula EN MEMORIA, con lo que hacen sus disparadores
 * (la base de datos pone el número de seguimiento y deja una reparación nueva sin cliente y en su primera etapa). No toca
 * producción ni Internet. Comprueba:
 *  A1) Sin sesión: 401. Con la sesión de un cliente (no administrador): 403. Datos no válidos: 400 sin crear nada.
 *  A2) Conversación que no existe: 404.
 *  A3) Reparación: queda EN LA CUENTA del cliente de la conversación, con la etapa, la nota y «Asignado desde el chat»,
 *      y responde con su número de seguimiento.
 *  A4) Pedido: en la cuenta del cliente, con su correo, su nombre de «Mi perfil», «sin teléfono» si no se da, el importe
 *      y el artículo de la conversación; responde con el número de seguimiento y el número de pedido.
 *  A5) El navegador no puede elegir a otro cliente: se usa siempre el de la conversación.
 *  A6) Sin los números de seguimiento (migración 20261031170000 sin aplicar): 503 sin dejar nada a medias.
 *  CONTROL) Sin la comprobación de administrador, un cliente podría asignar (la prueba A1 lo detecta).
 *
 * Uso: node pruebas/asignar-seguimiento.mjs
 * Sale con código 1 si algo falla.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const FALSO = "https://falso.supabase.test";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENTE = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";
const PRODUCTO = "33333333-3333-4333-8333-333333333333";
const CHAT_PRODUCTO = "44444444-4444-4444-8444-444444444444";
const CHAT_GENERAL = "55555555-5555-4555-8555-555555555555";

const sesiones = { "token-admin": ADMIN, "token-cliente": CLIENTE };
const roles = { [ADMIN]: "admin", [CLIENTE]: "user", [OTRO]: "user" };
const cuentas = {
  [CLIENTE]: { id: CLIENTE, email: "ana@example.com", user_metadata: { full_name: "Ana Pérez Gil" } },
  [OTRO]: { id: OTRO, email: "otro@example.com", user_metadata: {} },
};
const perfiles = { [CLIENTE]: { nombre: "Ana" } };
const chats = {
  [CHAT_PRODUCTO]: { id: CHAT_PRODUCTO, customer_user_id: CLIENTE, product_id: PRODUCTO },
  [CHAT_GENERAL]: { id: CHAT_GENERAL, customer_user_id: CLIENTE, product_id: null },
};
const reparaciones = new Map();
const pedidos = new Map();
const articulos = [];
let numeros = true; // false = migración de los números sin aplicar
let numero = 40;
const SIMBOLOS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codigoNuevo = () => {
  const s = Array.from(randomBytes(8), (b) => SIMBOLOS[b % 32]).join("");
  return `VZ-${s.slice(0, 4)}-${s.slice(4)}`;
};

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const eq = (url, campo) => (url.searchParams.get(campo) ?? "").replace(/^eq\./, "");
const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const metodo = opciones.method ?? "GET";
  const cabeceras = new Headers(opciones.headers ?? {});
  const objeto = /vnd\.pgrst\.object/.test(cabeceras.get("accept") ?? "");
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  const ruta = url.pathname;

  if (ruta === "/auth/v1/user") {
    const token = (cabeceras.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const uid = sesiones[token];
    return uid ? json({ id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@example.com` }) : json({ message: "invalid JWT" }, 401);
  }
  if (ruta.startsWith("/auth/v1/admin/users/")) {
    const u = cuentas[ruta.split("/").pop()];
    return u ? json(u) : json({ message: "User not found" }, 404);
  }
  if (ruta === "/rest/v1/profiles") {
    const r = roles[eq(url, "id")];
    return objeto ? (r ? json({ role: r }) : json(null)) : json(r ? [{ role: r }] : []);
  }
  if (ruta === "/rest/v1/perfiles_cliente") {
    const p = perfiles[eq(url, "user_id")];
    return objeto ? json(p ?? null) : json(p ? [p] : []);
  }
  if (ruta === "/rest/v1/product_chats") {
    const c = chats[eq(url, "id")];
    return objeto ? json(c ?? null) : json(c ? [c] : []);
  }
  if (ruta === "/rest/v1/service_requests" || ruta === "/rest/v1/pedidos") {
    const esPedido = ruta.endsWith("/pedidos");
    const tabla = esPedido ? pedidos : reparaciones;
    if (metodo === "POST") {
      if (!numeros) return json({ code: "42703", message: `column ${esPedido ? "pedidos" : "service_requests"}.codigo_seguimiento does not exist` }, 400);
      // Como la base de datos: número nuevo; una reparación nueva sin cliente (el disparador pone la cuenta de quien la
      // crea, y el servidor no tiene) y en su primera etapa.
      const fila = esPedido
        ? { ...cuerpo, id: randomUUID(), numero: ++numero, codigo_seguimiento: codigoNuevo() }
        : { ...cuerpo, id: randomUUID(), customer_user_id: null, status: "nuevo", seguimiento: "solicitado", seguimiento_nota: null, nota_admin: null, codigo_seguimiento: codigoNuevo() };
      tabla.set(fila.id, fila);
      return json(objeto ? fila : [fila], 201);
    }
    if (metodo === "PATCH") {
      const id = eq(url, "id");
      const fila = tabla.get(id);
      if (fila) tabla.set(id, { ...fila, ...cuerpo });
      return new Response(null, { status: 204 });
    }
  }
  if (ruta === "/rest/v1/pedido_items" && metodo === "POST") {
    articulos.push(...[].concat(cuerpo));
    return new Response(null, { status: 201 });
  }
  return json([]);
};

function respuesta() {
  const r = { codigo: 200, cuerpo: null };
  r.setHeader = () => {};
  r.status = (c) => ((r.codigo = c), r);
  r.json = (b) => ((r.cuerpo = b), r);
  return r;
}
async function pedir(manejador, token, body, metodo = "POST") {
  const res = respuesta();
  const req = { method: metodo, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  const consolaError = console.error;
  console.error = () => {};
  try {
    await manejador(req, res);
  } finally {
    console.error = consolaError;
  }
  return res;
}
const FORMATO = /^VZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const reparacion = { chat_id: CHAT_GENERAL, tipo: "reparacion", titulo: "Reparación de mando PS5", etapa: "recibido", nota: "Lo tenemos en el taller" };
const pedido = { chat_id: CHAT_PRODUCTO, tipo: "pedido", titulo: "Nintendo Switch OLED", etapa: "confirmado", entrega: "recogida", total_eur: 249.99, telefono: null };
const filas = () => reparaciones.size + pedidos.size;

try {
  const manejador = (await import("../api/asignar-seguimiento.ts")).default;

  // A1) Quién puede.
  const sinSesion = await pedir(manejador, null, reparacion);
  const deCliente = await pedir(manejador, "token-cliente", reparacion);
  const malos = await Promise.all([
    pedir(manejador, "token-admin", { ...reparacion, tipo: "devolucion" }),
    pedir(manejador, "token-admin", { ...reparacion, titulo: "" }),
    pedir(manejador, "token-admin", { ...reparacion, etapa: "enviado" }),
    pedir(manejador, "token-admin", { ...pedido, total_eur: "mucho" }),
    pedir(manejador, "token-admin", { ...reparacion, chat_id: "no-es-un-id" }),
  ]);
  ok(sinSesion.codigo === 401 && deCliente.codigo === 403 && filas() === 0, `A1: sin sesión 401 y un cliente 403, sin crear nada (${sinSesion.codigo}, ${deCliente.codigo})`);
  ok(malos.every((r) => r.codigo === 400) && filas() === 0, `A1: tipo, título, etapa, importe o conversación no válidos: 400 sin crear nada (${malos.map((r) => r.cuerpo?.error).join(" · ")})`);

  // A2) Conversación que no existe.
  const noExiste = await pedir(manejador, "token-admin", { ...reparacion, chat_id: randomUUID() });
  ok(noExiste.codigo === 404 && filas() === 0, `A2: una conversación que no existe da 404 (${noExiste.codigo})`);

  // A3) Reparación.
  const r3 = await pedir(manejador, "token-admin", reparacion);
  const f3 = [...reparaciones.values()][0];
  ok(r3.codigo === 200 && r3.cuerpo?.ok === true && r3.cuerpo?.tipo === "reparacion" && FORMATO.test(r3.cuerpo?.codigo_seguimiento ?? "") && r3.cuerpo?.codigo_seguimiento === f3?.codigo_seguimiento, `A3: la reparación responde con su número de seguimiento (${JSON.stringify(r3.cuerpo)})`);
  ok(f3?.customer_user_id === CLIENTE && f3?.seguimiento === "recibido" && f3?.seguimiento_nota === "Lo tenemos en el taller" && f3?.status === "revisado" && f3?.nota_admin === "Asignado desde el chat" && f3?.service_title === "Reparación de mando PS5" && f3?.nombre === "Ana", `A3: queda en la cuenta del cliente de la conversación, con su etapa, la nota y «Asignado desde el chat» (${JSON.stringify({ cliente: f3?.customer_user_id, etapa: f3?.seguimiento, nota_admin: f3?.nota_admin })})`);

  // A4) Pedido (conversación de un artículo).
  const r4 = await pedir(manejador, "token-admin", pedido);
  const f4 = [...pedidos.values()][0];
  const a4 = articulos.filter((a) => a.pedido_id === f4?.id);
  ok(r4.codigo === 200 && r4.cuerpo?.tipo === "pedido" && FORMATO.test(r4.cuerpo?.codigo_seguimiento ?? "") && r4.cuerpo?.numero_pedido === f4?.numero, `A4: el pedido responde con su número de seguimiento y su número de pedido (${JSON.stringify(r4.cuerpo)})`);
  ok(f4?.user_id === CLIENTE && f4?.email === "ana@example.com" && f4?.nombre === "Ana" && f4?.telefono === "sin teléfono" && f4?.estado === "confirmado" && f4?.entrega === "recogida" && f4?.total_eur === 249.99 && f4?.nota_admin === "Asignado desde el chat", `A4: en la cuenta del cliente, con su correo, su nombre de «Mi perfil», «sin teléfono», la etapa, la entrega y el importe (${JSON.stringify({ email: f4?.email, nombre: f4?.nombre, telefono: f4?.telefono })})`);
  ok(a4.length === 1 && a4[0].product_id === PRODUCTO && a4[0].titulo === "Nintendo Switch OLED" && a4[0].precio_eur === 249.99, "A4: con el artículo de la conversación");

  // A5) El navegador no elige el cliente.
  const r5 = await pedir(manejador, "token-admin", { ...reparacion, titulo: "Limpieza", customer_user_id: OTRO, user_id: OTRO });
  const f5 = [...reparaciones.values()].find((f) => f.service_title === "Limpieza");
  ok(r5.codigo === 200 && f5?.customer_user_id === CLIENTE, "A5: aunque el navegador mande otro cliente, se usa siempre el de la conversación");

  // A6) Sin la migración de los números.
  numeros = false;
  const antes6 = filas();
  const r6 = await pedir(manejador, "token-admin", pedido);
  ok(r6.codigo === 503 && r6.cuerpo?.error === "falta activar los números de seguimiento" && filas() === antes6, `A6: sin los números de seguimiento responde 503 sin crear nada (${r6.codigo} ${r6.cuerpo?.error})`);
  numeros = true;

  // CONTROL: sin la comprobación de administrador, un cliente podría asignar.
  const fuente = readFileSync("api/asignar-seguimiento.ts", "utf8");
  const sinControl = fuente.replace("    await administrador(supabase, req);\n", "");
  ok(sinControl !== fuente, "(control) se ha podido quitar la comprobación de administrador en la copia de prueba");
  const carpeta = mkdtempSync(join(tmpdir(), "vz-asignar-"));
  mkdirSync(join(carpeta, "api"));
  symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
  writeFileSync(join(carpeta, "api", "asignar-seguimiento.ts"), sinControl);
  const manejadorRoto = (await import(pathToFileURL(join(carpeta, "api", "asignar-seguimiento.ts")).href)).default;
  const rControl = await pedir(manejadorRoto, "token-cliente", { ...reparacion, titulo: "Control" });
  ok(rControl.codigo === 200, `(control) sin la comprobación, un cliente asigna (${rControl.codigo}): la prueba A1 SÍ lo detecta`);
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
