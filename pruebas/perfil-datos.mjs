/**
 * pruebas/perfil-datos.mjs — comprueba «Mi cuenta → Tu perfil» (nombre, usuario, país, provincia y edad) y su seguimiento en
 * Administración → Usuarios y en la ficha del cliente, como un iPhone (390×844).
 *
 * Todo con sesión SIMULADA y datos FICTICIOS: las lecturas de la base de datos se responden aquí y las escrituras se interceptan
 * (se comprueba lo que la tienda MANDARÍA guardar); nada llega a ninguna base de datos ni a la cuenta real de nadie.
 *
 * Comprueba:
 *  - Tu perfil: se rellena con lo que la persona escribió al registrarse; desplegables de país y de provincia (52 provincias de
 *    España; con otro país la provincia pasa a ser un texto), fecha de nacimiento y edad calculada («23 Años»); ✓ verde cuando está
 *    bien; usuario con formato; menos de 14 años no se puede guardar; «Guardar perfil» manda lo escrito, confirma, y actualiza
 *    también los datos de la cuenta (el Foro enseña de ahí el nombre); usuario repetido, «Deshacer», perfil ya guardado y tabla
 *    todavía sin crear (la tarjeta no sale y el resto de Mi cuenta sigue igual).
 *  - Administración → Usuarios: contadores (con perfil, completos, edad media, provincias), chips por edad, provincia y país que
 *    filtran la lista, el resumen de cada cliente, el buscador por nombre/usuario/provincia, y la ficha con el perfil. Sin la
 *    tabla, nada de eso sale y la lista funciona igual.
 *  - Diseño: nada se ensancha, campos y botones de 56 px, sin errores de JavaScript.
 *
 * Uso: node pruebas/perfil-datos.mjs [carpeta_dist] [carpeta_capturas]
 * Requisitos: playwright-core y npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const raiz = resolve(process.argv[2] ?? "dist");
if (!existsSync(join(raiz, "index.html"))) {
  console.error(`FALLO ${raiz} no tiene index.html: ¿has hecho npm run build?`);
  process.exit(1);
}
const SALIDA = process.argv[3] ? resolve(process.argv[3]) : null;
if (SALIDA) mkdirSync(SALIDA, { recursive: true });

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
const DINAMICAS = [
  [/^\/producto\/[^/]+$/, "producto/[id].html"],
  [/^\/admin\/cliente\/[^/]+$/, "admin/cliente/[userId].html"],
];
const buscar = (ruta) => {
  const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [limpia, `${limpia}.html`, join(limpia, "index.html")]) {
    const p = join(raiz, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  for (const [re, destino] of DINAMICAS) {
    const p = join(raiz, destino);
    if (re.test(ruta) && existsSync(p)) return p;
  }
  return null;
};
const servidor = createServer((req, res) => {
  const ruta = (req.url ?? "/").split("?")[0];
  if (ruta.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    return;
  }
  const p = ruta === "/" ? join(raiz, "index.html") : buscar(ruta);
  if (p) {
    res.writeHead(200, { "content-type": TIPOS[extname(p)] ?? "application/octet-stream" });
    res.end(readFileSync(p));
  } else {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("No encontrado");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

// La misma cuenta de cálculo que la tienda: edad cumplida hoy.
const edadHoy = (fecha) => {
  const [a, m, d] = fecha.split("-").map(Number);
  const h = new Date();
  let e = h.getFullYear() - a;
  if (h.getMonth() + 1 < m || (h.getMonth() + 1 === m && h.getDate() < d)) e -= 1;
  return e;
};
const haceAnios = (anios, dias = 0) => {
  const h = new Date();
  return new Date(Date.UTC(h.getFullYear() - anios, h.getMonth(), h.getDate() - dias)).toISOString().slice(0, 10);
};

const CLIENTE = {
  id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "cliente@example.com",
  app_metadata: {}, user_metadata: { full_name: "Dani", username: "dani", country: "España" }, created_at: "2026-01-01T00:00:00Z",
};
const ADMIN = { ...CLIENTE, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "admin@example.com", user_metadata: {} };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

// Contexto con sesión simulada. `estado` es lo que «responde» la base de datos ficticia y recoge lo que la tienda manda guardar.
async function contexto(navegador, usuario, rol, estado) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(([u]) => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, role: "authenticated", exp, aud: "authenticated", email: u.email })}.firma`;
      localStorage.setItem("videojuegoos.supabase.auth", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 3600, token_type: "bearer", user: u }));
    } catch {
      // sin almacenamiento
    }
  }, [usuario]);
  await ctx.route("**/*", async (r) => {
    const peticion = r.request();
    const url = new URL(peticion.url());
    const metodo = peticion.method();
    const json = (cuerpo, status = 200, extra = {}) => r.fulfill({ status, contentType: "application/json", headers: { ...CORS, ...extra }, body: JSON.stringify(cuerpo) });
    if (metodo === "OPTIONS" && /\/(rest|auth)\/v1\//.test(url.pathname)) return r.fulfill({ status: 204, headers: CORS });
    if (url.pathname.endsWith("/auth/v1/user")) {
      if (metodo === "PUT") {
        estado.cuenta = JSON.parse(peticion.postData() ?? "{}");
        return json({ ...usuario, user_metadata: { ...usuario.user_metadata, ...(estado.cuenta.data ?? {}) } });
      }
      return json(usuario);
    }
    if (url.pathname.endsWith("/rest/v1/profiles")) return json({ id: usuario.id, role: rol });
    if (url.pathname.endsWith("/rpc/get_unread_chat_count")) return json(0);
    if (url.pathname.endsWith("/rpc/admin_list_users_with_stats")) return json(estado.usuarios ?? []);
    if (url.pathname.endsWith("/rest/v1/perfiles_cliente")) {
      if (metodo === "POST") {
        estado.guardados.push({ cuerpo: JSON.parse(peticion.postData() ?? "{}"), url: peticion.url(), prefer: peticion.headers()["prefer"] ?? "" });
        return estado.respuestaGuardar ? json(estado.respuestaGuardar.cuerpo, estado.respuestaGuardar.status) : r.fulfill({ status: 201, headers: CORS, body: "" });
      }
      if (estado.sinTabla) return json({ code: "PGRST205", message: "Could not find the table 'public.perfiles_cliente' in the schema cache" }, 404);
      // Como la base de datos: con «user_id=eq.<id>» solo la fila de esa persona.
      const filtro = url.searchParams.get("user_id");
      const filas = estado.filas ?? [];
      return json(filtro?.startsWith("eq.") ? filas.filter((f) => !f.user_id || f.user_id === filtro.slice(3)) : filas);
    }
    // Lecturas vacías de todo lo demás que pide la tienda con esta sesión (nada de la base de datos real).
    if (metodo === "GET" || metodo === "HEAD") {
      if (/\/rest\/v1\/(pedidos|pedido_items|service_requests|sell_requests|store_reviews|product_sales|customer_notes|avisos_busqueda)$/.test(url.pathname)) {
        return json([], 200, { "content-range": "*/0" });
      }
      return r.continue();
    }
    return r.abort();
  });
  return ctx;
}

async function pagina(ctx, ruta) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(`error JS: ${e.message.slice(0, 160)}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|status of 40\d/.test(m.text())) p.errores.push(`consola: ${m.text().slice(0, 160)}`);
  });
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 });
  return p;
}

const navegador = await chromium.launch();
try {
  // ===== A) «Tu perfil»: rellenar con lo del registro, elegir, validar y guardar ====================================
  {
    const estado = { filas: [], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-datos").waitFor({ timeout: 30000 });
    const t = await p.locator("#perfil-datos").innerText();
    ok(/Tu perfil/.test(t), "A: sale la tarjeta «Tu perfil» en Mi cuenta");
    const valor = (etiqueta) => p.locator(`#perfil-datos [aria-label="${etiqueta}"]`).first();
    ok((await valor("Nombre").inputValue()) === "Dani" && (await valor("Nombre de usuario").inputValue()) === "dani", "A: nombre y usuario salen rellenados con lo que escribió al registrarse");
    ok(/España/.test(t), "A: y el país también (España)");
    ok(/Provincia/.test(t) && /Fecha de nacimiento/.test(t) && /Edad/.test(t), "A: faltan la provincia, la fecha y la edad (se ven los textos de ayuda)");
    const guardar = p.getByRole("button", { name: "Guardar perfil" });
    ok((await guardar.getAttribute("aria-disabled")) !== "true", "A: «Guardar perfil» está activo (lo del registro está sin guardar)");
    ok((await p.getByRole("button", { name: "Deshacer los cambios" }).count()) === 1, "A: está «Deshacer»");
    await capturar(p, "A1-perfil-inicial");

    // Provincia (España: 52) y fecha.
    const provincias = await p.locator('#perfil-datos select[aria-label="Provincia"] option').allInnerTexts();
    ok(provincias.length === 53 && provincias.includes("Zaragoza") && provincias.includes("A Coruña") && provincias.includes("Melilla"), `A: el desplegable de provincias tiene las 52 de España (${provincias.length - 1})`);
    ok((await p.locator('#perfil-datos select[aria-label="País"] option').count()) > 40, "A: el desplegable de país tiene la lista de países");
    await p.locator('#perfil-datos select[aria-label="Provincia"]').selectOption("Zaragoza");
    await p.locator('#perfil-datos input[aria-label="Fecha de nacimiento"]').fill("2003-08-19");
    await p.waitForTimeout(300);
    const t2 = await p.locator("#perfil-datos").innerText();
    ok(/Zaragoza/.test(t2), "A: la provincia elegida se ve en el campo");
    ok(/19 ago 2003/.test(t2), "A: la fecha se ve así: «19 ago 2003»");
    ok(t2.includes(`${edadHoy("2003-08-19")} Años`), `A: la edad se calcula sola («${edadHoy("2003-08-19")} Años»)`);
    await capturar(p, "A2-perfil-relleno");

    // Validaciones.
    await valor("Nombre de usuario").fill("ab");
    ok(/de 3 a 24 caracteres/.test(await p.locator("#perfil-datos").innerText()), "A: un usuario de 2 letras da error");
    ok((await guardar.getAttribute("aria-disabled")) === "true", "A: y «Guardar perfil» queda desactivado");
    await valor("Nombre de usuario").fill("dani_zgz");
    await p.locator('#perfil-datos input[aria-label="Fecha de nacimiento"]').fill(haceAnios(10));
    ok(/hay que tener 14 años o más/.test(await p.locator("#perfil-datos").innerText()), "A: con menos de 14 años no se puede guardar (mensaje)");
    ok((await guardar.getAttribute("aria-disabled")) === "true", "A: y «Guardar perfil» queda desactivado");
    const maxFecha = await p.locator('#perfil-datos input[aria-label="Fecha de nacimiento"]').getAttribute("max");
    ok(maxFecha === haceAnios(14), `A: el selector de fecha no deja elegir a menos de 14 años (máximo ${maxFecha})`);
    await p.locator('#perfil-datos input[aria-label="Fecha de nacimiento"]').fill("2003-08-19");
    ok((await guardar.getAttribute("aria-disabled")) !== "true", "A: arreglado, vuelve a poder guardarse");

    // Guardar.
    await guardar.click();
    await p.getByText("Perfil guardado.").waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText("Perfil guardado.").count()) === 1, "A: «Perfil guardado.»");
    const g = estado.guardados.at(-1);
    ok(!!g && g.cuerpo.user_id === CLIENTE.id && g.cuerpo.nombre === "Dani" && g.cuerpo.usuario === "dani_zgz" && g.cuerpo.pais === "España" && g.cuerpo.provincia === "Zaragoza" && g.cuerpo.fecha_nacimiento === "2003-08-19", `A: manda guardar lo escrito (${JSON.stringify(g?.cuerpo ?? null)})`);
    ok(/on_conflict=user_id/.test(g?.url ?? "") && /merge-duplicates/.test(g?.prefer ?? ""), "A: y lo hace sobre SU fila (si ya existe la actualiza; no crea otra)");
    ok(!!estado.cuenta && estado.cuenta.data?.full_name === "Dani" && estado.cuenta.data?.username === "dani_zgz" && estado.cuenta.data?.country === "España", `A: actualiza también los datos de la cuenta (de ahí saca el Foro el nombre): ${JSON.stringify(estado.cuenta?.data ?? null)}`);
    ok((await guardar.getAttribute("aria-disabled")) === "true", "A: tras guardar no hay nada pendiente: «Guardar perfil» se desactiva");
    ok(p.errores.length === 0, `A: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);

    // Deshacer.
    await valor("Nombre").fill("Otro nombre");
    ok((await guardar.getAttribute("aria-disabled")) !== "true", "A: cambiar algo activa «Guardar perfil»");
    await p.getByRole("button", { name: "Deshacer los cambios" }).click();
    ok((await valor("Nombre").inputValue()) === "Dani", "A: «Deshacer» vuelve a lo último guardado");

    // Otro país: la provincia pasa a ser un texto («Región») y se borra la de España.
    await p.locator('#perfil-datos select[aria-label="País"]').selectOption("Francia");
    await p.waitForTimeout(300);
    ok((await p.locator('#perfil-datos select[aria-label="Provincia"]').count()) === 0 && (await p.locator('#perfil-datos [aria-label="Provincia o región"]').count()) === 1, "A: con otro país la provincia pasa a ser un texto («Región»)");
    ok(!/Zaragoza/.test(await p.locator("#perfil-datos").innerText()), "A: y se borra la provincia de España");
    await p.locator('#perfil-datos [aria-label="Provincia o región"]').fill("Lyon");
    await guardar.click();
    await p.waitForFunction(() => /Perfil guardado/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    ok(estado.guardados.at(-1)?.cuerpo.pais === "Francia" && estado.guardados.at(-1)?.cuerpo.provincia === "Lyon", "A: con otro país guarda la región escrita");

    // Diseño.
    const medidas = await p.evaluate(() => {
      const caja = (document.getElementById("perfil-datos") ?? document.body).getBoundingClientRect();
      const botones = Array.from(document.querySelectorAll('#perfil-datos [role="button"]')).map((b) => Math.round(b.getBoundingClientRect().height));
      const nativos = Array.from(document.querySelectorAll("#perfil-datos select, #perfil-datos input[type=date]")).map((e) => Math.round(e.getBoundingClientRect().height));
      return { ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth, caja: Math.round(caja.width), botones, nativos };
    });
    ok(medidas.ancho <= medidas.pantalla + 1, `A: la página no se ensancha (${medidas.ancho}/${medidas.pantalla})`);
    ok(medidas.botones.length >= 2 && medidas.botones.every((h) => h >= 55), `A: los botones miden 56 px (${medidas.botones.join(", ")})`);
    // (el campo mide 56 px con su borde; el control nativo cubre lo de dentro)
    ok(medidas.nativos.length >= 2 && medidas.nativos.every((h) => h >= 52), `A: los desplegables y la fecha se tocan en todo el campo, de 52 px o más (${medidas.nativos.join(", ")})`);
    await ctx.close();
  }

  // ===== B) Usuario repetido ======================================================================================
  {
    const estado = { filas: [], guardados: [], respuestaGuardar: { status: 409, cuerpo: { code: "23505", message: "duplicate key value violates unique constraint" } } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-datos").waitFor({ timeout: 30000 });
    await p.getByRole("button", { name: "Guardar perfil" }).click();
    await p.getByText(/ya está en uso/).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText("Ese nombre de usuario ya está en uso. Prueba con otro.").count()) === 1, "B: un usuario repetido se explica: «Ese nombre de usuario ya está en uso»");
    ok((await p.getByText("Perfil guardado.").count()) === 0 && !estado.cuenta, "B: y no se da por guardado ni se tocan los datos de la cuenta");
    await ctx.close();
  }

  // ===== C) Perfil ya guardado ====================================================================================
  {
    const estado = { filas: [{ nombre: "Ana", usuario: "ana_g", pais: "Francia", provincia: "Lyon", fecha_nacimiento: "1990-05-02" }], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-datos").waitFor({ timeout: 30000 });
    const v = async (e) => p.locator(`#perfil-datos [aria-label="${e}"]`).first().inputValue();
    ok((await v("Nombre")) === "Ana" && (await v("Nombre de usuario")) === "ana_g" && (await v("Provincia o región")) === "Lyon", "C: con un perfil ya guardado salen sus datos (no los del registro)");
    const t = await p.locator("#perfil-datos").innerText();
    ok(/Francia/.test(t) && /2 may 1990/.test(t) && t.includes(`${edadHoy("1990-05-02")} Años`), `C: país, fecha («2 may 1990») y edad («${edadHoy("1990-05-02")} Años») correctos`);
    ok((await p.getByRole("button", { name: "Guardar perfil" }).getAttribute("aria-disabled")) === "true", "C: sin cambios, «Guardar perfil» está desactivado");
    await capturar(p, "C-perfil-guardado");
    await ctx.close();
  }

  // ===== D) La tabla aún no existe (migración sin aplicar): la tarjeta no sale y todo lo demás sigue igual ==========
  {
    const estado = { sinTabla: true, guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.getByText("SESIÓN ACTUAL").waitFor({ timeout: 30000 });
    await p.waitForTimeout(1500);
    ok((await p.locator("#perfil-datos").count()) === 0, "D: sin la tabla, «Tu perfil» no sale");
    ok((await p.getByText("Cerrar sesión").count()) >= 1, "D: y el resto de Mi cuenta sigue igual (sesión y «Cerrar sesión»)");
    ok(p.errores.length === 0, `D: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // ===== E) Administración → Usuarios ============================================================================
  const U = [
    { user_id: "u1000000-0000-4000-8000-000000000001", email: "dani@example.com", role: "user", created_at: "2026-10-01T10:00:00Z", chat_messages_count: 3, product_chats_count: 0, store_reviews_count: 0 },
    { user_id: "u2000000-0000-4000-8000-000000000002", email: "ana@example.com", role: "user", created_at: "2026-10-02T10:00:00Z", chat_messages_count: 0, product_chats_count: 1, store_reviews_count: 1 },
    { user_id: "u3000000-0000-4000-8000-000000000003", email: "luis@example.com", role: "user", created_at: "2026-10-03T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 },
    { user_id: "u4000000-0000-4000-8000-000000000004", email: "sin-perfil@example.com", role: "user", created_at: "2026-10-04T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 },
  ];
  const PERFILES = [
    { user_id: U[0].user_id, nombre: "Dani", usuario: "dani", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "2003-08-19" },
    { user_id: U[1].user_id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" },
    { user_id: U[2].user_id, nombre: "", usuario: "", pais: "Francia", provincia: "Zaragoza", fecha_nacimiento: null },
  ];
  {
    const estado = { usuarios: U, filas: PERFILES, guardados: [] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-perfiles").waitFor({ timeout: 40000 });
    const t = await p.locator("#admin-perfiles").innerText();
    ok(/Perfiles de clientes/.test(t), "E: Administración → Usuarios enseña «Perfiles de clientes»");
    ok(/Con perfil\s*3 de 4/.test(t.replace(/\n/g, " ")), "E: «Con perfil: 3 de 4»");
    ok(/Perfil completo\s*2/.test(t.replace(/\n/g, " ")), "E: «Perfil completo: 2»");
    const edades = [edadHoy("2003-08-19"), edadHoy("1990-05-02")];
    const media = Math.round((edades[0] + edades[1]) / 2);
    ok(new RegExp(`Edad media\\s*${media} años`).test(t.replace(/\n/g, " ")), `E: «Edad media: ${media} años»`);
    ok(/Provincias\s*2/.test(t.replace(/\n/g, " ")), "E: «Provincias: 2»");
    const tramo = (e) => (e < 18 ? "14–17" : e < 25 ? "18–24" : e < 35 ? "25–34" : e < 45 ? "35–44" : "45 o más");
    ok(t.includes(`${tramo(edades[0])} (1)`) && t.includes(`${tramo(edades[1])} (1)`), `E: chips de edad con su recuento (${tramo(edades[0])} (1), ${tramo(edades[1])} (1))`);
    ok(t.includes("Zaragoza (2)") && t.includes("Huesca (1)"), "E: chips de provincia con su recuento («Zaragoza (2)», «Huesca (1)»)");
    ok(t.includes("España (2)") && t.includes("Francia (1)"), "E: chips de país con su recuento («España (2)», «Francia (1)»)");
    const lista = await p.evaluate(() => document.body.innerText);
    ok(lista.includes("Dani · @dani · Zaragoza (España)") && lista.includes(`${edades[0]} años`), "E: cada cliente enseña su resumen («Dani · @dani · Zaragoza (España) · N años»)");
    ok(lista.includes("Zaragoza (Francia)") || lista.includes("Zaragoza · "), "E: también si el perfil está a medias (provincia y país sin nombre)");
    ok(lista.includes("Perfil sin completar"), "E: y «Perfil sin completar» para quien no ha escrito nada");
    await capturar(p, "E1-admin-perfiles");

    // Filtrar por provincia (los contadores filtran).
    await p.getByText("Zaragoza (2)").click();
    await p.waitForTimeout(400);
    const filtrada = await p.evaluate(() => document.body.innerText);
    ok(filtrada.includes("dani@example.com") && filtrada.includes("luis@example.com") && !filtrada.includes("ana@example.com") && !filtrada.includes("sin-perfil@example.com"), "E: tocar «Zaragoza (2)» deja solo a esos 2 clientes");
    ok((await p.getByText("Quitar filtros").count()) === 1, "E: sale «Quitar filtros»");
    await p.getByText("Quitar filtros").click();
    await p.waitForTimeout(300);
    ok((await p.evaluate(() => document.body.innerText)).includes("ana@example.com"), "E: «Quitar filtros» vuelve a enseñar a todos");
    // Filtrar por tramo de edad.
    await p.getByText(`${tramo(edades[1])} (1)`).click();
    await p.waitForTimeout(400);
    const porEdad = await p.evaluate(() => document.body.innerText);
    ok(porEdad.includes("ana@example.com") && !porEdad.includes("dani@example.com"), `E: filtrar por «${tramo(edades[1])}» deja solo a quien está en ese tramo`);
    await p.getByText("Quitar filtros").click();
    // Buscar por nombre/usuario.
    await p.getByPlaceholder(/Buscar por email, nombre, usuario o provincia/).fill("ana_g");
    await p.waitForTimeout(300);
    const buscada = await p.evaluate(() => document.body.innerText);
    ok(buscada.includes("ana@example.com") && !buscada.includes("dani@example.com"), "E: el buscador encuentra por usuario («ana_g»)");
    ok(p.errores.length === 0, `E: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `E: la página no se ensancha (${ancho.a}/${ancho.p})`);

    // Ficha del cliente.
    const f = await pagina(ctx, `/admin/cliente/${U[0].user_id}?email=dani%40example.com&createdAt=2026-10-01T10%3A00%3A00Z`);
    await f.getByText("Compras a la tienda").waitFor({ timeout: 40000 });
    const tf = (await f.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/Perfil/.test(tf) && /Nombre\s*Dani/.test(tf) && /Usuario\s*@dani/.test(tf) && /País\s*España/.test(tf) && /Provincia\s*Zaragoza/.test(tf), "E: la ficha del cliente enseña su perfil (nombre, usuario, país y provincia)");
    ok(new RegExp(`Edad\\s*${edades[0]} años`).test(tf) && !/2003/.test(tf), "E: y su edad, sin enseñar la fecha de nacimiento");
    await capturar(f, "E2-admin-ficha");
    await ctx.close();
  }

  // ===== F) Administración sin la tabla: la lista funciona y no sale nada de perfiles ============================
  {
    const estado = { usuarios: U, sinTabla: true, guardados: [] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.getByText("dani@example.com").waitFor({ timeout: 40000 });
    ok((await p.locator("#admin-perfiles").count()) === 0 && !(await p.evaluate(() => document.body.innerText)).includes("Perfil sin completar"), "F: sin la tabla no sale nada de perfiles");
    ok((await p.evaluate(() => document.body.innerText)).includes("ana@example.com"), "F: y la lista de usuarios funciona igual");
    ok(p.errores.length === 0, `F: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  await navegador.close();
  servidor.close();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
