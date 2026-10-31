/**
 * pruebas/perfil-datos.mjs — comprueba «Mi cuenta → Tu perfil» (nombre, usuario, país, provincia y edad) y su seguimiento en
 * Administración → Usuarios y en la ficha del cliente, como un iPhone (390×844).
 *
 * Todo con sesión SIMULADA y datos FICTICIOS: las lecturas de la base de datos se responden aquí y las escrituras se interceptan
 * (se comprueba lo que la tienda MANDARÍA guardar); nada llega a ninguna base de datos ni a la cuenta real de nadie.
 *
 * Comprueba:
 *  - Mi perfil (Mi cuenta): cabecera plegable «Mi perfil · @usuario · Completo/Faltan datos» (abierta si faltan datos,
 *    plegada si está completo, y se pliega sola al guardarlo completo); dentro, la cuenta («Tu cuenta está activa», la sesión y
 *    «Cerrar sesión»), sin otra tarjeta aparte; se rellena con lo que la persona escribió al registrarse; usuario y «Nombre y
 *    apellidos» a lo ancho; desplegables de país y de provincia (52 provincias de España; con otro país la provincia pasa a ser
 *    un texto), fecha de nacimiento y, a su lado, la edad calculada («23 Años»); ✓ verde cuando está bien; usuario con formato;
 *    menos de 14 años no se puede guardar; «Guardar perfil» manda lo escrito, confirma, y actualiza también los datos de la
 *    cuenta; usuario repetido, «Deshacer», perfil ya guardado y tabla todavía sin crear (la tarjeta no sale y la cuenta sale en
 *    su tarjeta de siempre).
 *  - Foto (opcional): se elige, se ENCUADRA (arrastrar, acercar o alejar; «Cancelar» no sube nada) y se sube recortada
 *    (cuadrado de 320 px en JPEG, con lo que se dejó en el centro) a la carpeta del cliente en «avatares»; al guardar va en
 *    foto_url y en los datos de la cuenta; «Quitar foto».
 *  - Foro: cada mensaje enseña el usuario y la foto de «Mi perfil» de quien escribe (función perfiles_publicos), no su nombre
 *    completo; quien no tiene perfil sigue con su nombre y la inicial; sin la función, el Foro sigue como antes.
 *  - Moderación del Foro: un administrador toca un mensaje → «Eliminar mensaje» → confirma (con «Cancelar» no pasa nada) y se
 *    borra de la base de datos y de la pantalla; si la base de datos no lo permite, lo dice y el mensaje se queda; los
 *    comentarios de noticias se eliminan igual (se marcan ocultos); un cliente no ve ninguna papelera; Administración →
 *    Usuarios cuenta los comentarios eliminados («Moderación del Foro», con datos de la base de datos). El aviso de
 *    silencio enlaza a las Normas del Foro (/politicas/normas-foro) y Usuarios cuenta quién las abre desde el aviso.
 *  - Perfil: deslizar el dedo a la izquierda abre «Mis seguimientos» y a la derecha vuelve a «Mi cuenta» (tocar las
 *    pestañas sigue funcionando); un gesto vertical no cambia de pestaña; «Reparaciones y Mantenimientos» con su texto
 *    nuevo; Administración → Usuarios cuenta quién abre «Mis seguimientos» y cuántos deslizando.
 *  - «Completa tu perfil» (obligatorio): con sesión y el perfil a medias tapa Inicio; «Guardar y continuar» solo con todo lo
 *    obligatorio; al guardar desaparece; «Cerrar sesión» sale; Blue no se ve mientras tanto; no sale en Mi cuenta, en las
 *    políticas, con el perfil completo ni sin la tabla.
 *  - Administración → Usuarios: contadores (con perfil, completos, edad media, provincias), cuántos encuadraron su foto o dejaron
 *    el recorte (30 días), chips por edad, provincia y país que filtran la lista, el resumen de cada cliente, el buscador por nombre/usuario/provincia, y la ficha con el perfil. Sin la
 *    tabla, nada de eso sale y la lista funciona igual.
 *  - Ficha del cliente: sus pedidos (con su cuenta y los hechos sin sesión con su correo, no los de otros) con sus etapas;
 *    un toque cambia la etapa (y avisa al puente de VeoAura); cada reparación con su etapa, «nota del taller» y «Guardar
 *    seguimiento», sin ir a Pedidos ni a Servicios.
 *  - Diseño: nada se ensancha, campos y botones compactos pero de 44 px o más (se tocan bien), sin errores de JavaScript.
 *  - N) Visor de fotos de la ficha (producto ficticio con 3 fotos): Blue, que se veía y se podía tocar, se esconde al
 *    abrirlo (donde estaba se toca el visor) y vuelve al cerrarlo; su mensaje de la ficha espera a que se cierre. Pellizcar
 *    acerca entre los dedos; mientras tanto solo cambia la capa de la foto (nada más del visor se vuelve a pintar); al
 *    soltar un dedo la foto no salta; al soltar vuelve a sus bordes y baja la foto original; alejar de más vuelve al
 *    tamaño normal; doble toque acerca donde se toca y vuelve; la rueda acerca sin mover la ficha de debajo; deslizar y
 *    la flecha cambian de foto; la analítica cuenta una apertura y un zoom, y Administración → Analítica lo enseña.
 *
 *  - P) Números de seguimiento: en «Mis seguimientos» el cliente escribe el número (en cualquiera de los dos campos, en
 *    minúsculas o con espacios) y el pedido o la reparación pasan a su cuenta con su número; los que no existen o son de
 *    otra cuenta se explican; sin la migración no sale el campo. Administración → Pedidos y Servicios enseñan el número
 *    de cada uno, si es de VeoAura y si el cliente ya lo tiene (recuento y filtro «Sin cuenta»), y Usuarios cuenta los
 *    números añadidos y los intentos fallidos.
 *
 * Uso: node pruebas/perfil-datos.mjs [carpeta_dist] [carpeta_capturas] [N|P]
 * Con «N» o «P» de cuarto argumento solo se ejecuta esa sección (el visor o los números de seguimiento).
 * Requisitos: playwright-core y npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { lanzarNavegador } from "./sin-fotos-reales.mjs";

const raiz = resolve(process.argv[2] ?? "dist");
if (!existsSync(join(raiz, "index.html"))) {
  console.error(`FALLO ${raiz} no tiene index.html: ¿has hecho npm run build?`);
  process.exit(1);
}
const SALIDA = process.argv[3] ? resolve(process.argv[3]) : null;
if (SALIDA) mkdirSync(SALIDA, { recursive: true });
const SOLO = (process.argv[4] ?? "").toUpperCase();

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
  await ctx.addInitScript(([u, acepta]) => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", acepta ? "accepted" : "declined");
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, role: "authenticated", exp, aud: "authenticated", email: u.email })}.firma`;
      localStorage.setItem("videojuegoos.supabase.auth", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 3600, token_type: "bearer", user: u }));
    } catch {
      // sin almacenamiento
    }
  }, [usuario, estado.aceptaAnalitica === true]);
  await ctx.route("**/*", async (r) => {
    const peticion = r.request();
    const url = new URL(peticion.url());
    const metodo = peticion.method();
    const json = (cuerpo, status = 200, extra = {}) => r.fulfill({ status, contentType: "application/json", headers: { ...CORS, ...extra }, body: JSON.stringify(cuerpo) });
    if (metodo === "OPTIONS" && /\/(rest|auth|storage)\/v1\//.test(url.pathname)) return r.fulfill({ status: 204, headers: CORS });
    if (url.pathname.endsWith("/auth/v1/logout")) {
      estado.salio = true;
      return r.fulfill({ status: 204, headers: CORS, body: "" });
    }
    // Subida de la foto de perfil (nada llega a ningún almacén): se apunta qué se mandaría (y la foto, para mirarla).
    if (url.pathname.startsWith("/storage/v1/object/avatares/") && metodo === "POST") {
      const cuerpo = peticion.postDataBuffer() ?? Buffer.alloc(0);
      const texto = cuerpo.toString("latin1");
      const inicio = cuerpo.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const fin = cuerpo.lastIndexOf(Buffer.from([0xff, 0xd9]));
      const jpeg = inicio >= 0 && fin > inicio ? cuerpo.subarray(inicio, fin + 2).toString("base64") : "";
      estado.subidas = [...(estado.subidas ?? []), { ruta: decodeURIComponent(url.pathname.slice("/storage/v1/object/".length)), tipo: (texto.match(/Content-Type:\s*(image\/[a-z]+)/i) ?? [null, peticion.headers()["content-type"] ?? ""])[1], jpeg }];
      return json({ Key: url.pathname.slice("/storage/v1/object/".length) });
    }
    // Foro: mensajes ficticios y la función perfiles_publicos (usuario y foto de quien escribe).
    if (url.pathname.endsWith("/rest/v1/chat_messages") && metodo === "GET") return json(estado.mensajes ?? []);
    // Moderación: un administrador elimina un mensaje (la base de datos devuelve lo borrado; [] = no se lo ha permitido).
    if (url.pathname.endsWith("/rest/v1/chat_messages") && metodo === "DELETE") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      estado.borrados = [...(estado.borrados ?? []), id];
      return json(estado.borrarSinPermiso ? [] : [{ id }]);
    }
    // Blue del administrador: pedidos y reparaciones olvidados (48 h sin cambios), contados sin descargar filas.
    if (metodo === "HEAD" && estado.olvidados && /\/rest\/v1\/(pedidos|service_requests)$/.test(url.pathname)) {
      const n = url.pathname.endsWith("/pedidos") ? estado.olvidados.pedidos : estado.olvidados.reparaciones;
      estado.consultasOlvidados = [...(estado.consultasOlvidados ?? []), `${url.pathname.split("/").pop()}?${decodeURIComponent(url.search.slice(1))}`];
      return json([], 200, { "content-range": `*/${n}`, "access-control-expose-headers": "*" });
    }
    // Números de seguimiento (sección P): pedidos y reparaciones con su número y «vincular_seguimiento» como la base de
    // datos (sin la migración: columna y función inexistentes).
    if (estado.numeros && /\/rest\/v1\/(pedidos|service_requests)$/.test(url.pathname) && metodo === "GET") {
      const esPedido = url.pathname.endsWith("/pedidos");
      if (estado.numeros.sinColumnas && /codigo_seguimiento/.test(url.searchParams.get("select") ?? "")) {
        return json({ code: "42703", message: `column ${esPedido ? "pedidos" : "service_requests"}.codigo_seguimiento does not exist` }, 400);
      }
      const campo = esPedido ? "user_id" : "customer_user_id";
      const dueno = (url.searchParams.get(campo) ?? "").replace(/^eq\./, "");
      return json((esPedido ? estado.numeros.pedidos : estado.numeros.reparaciones).filter((f) => !dueno || f[campo] === dueno));
    }
    if (estado.numeros && url.pathname.endsWith("/rest/v1/pedido_items") && metodo === "GET") return json(estado.numeros.items ?? []);
    if (estado.numeros && url.pathname.endsWith("/rest/v1/seguimiento_intentos") && metodo === "GET") return json(estado.numeros.intentos ?? []);
    if (url.pathname.endsWith("/rpc/vincular_seguimiento")) {
      if (!estado.numeros || estado.numeros.sinColumnas) return json({ code: "PGRST202", message: "Could not find the function public.vincular_seguimiento" }, 404);
      const { p_codigo } = JSON.parse(peticion.postData() ?? "{}");
      estado.vinculaciones = [...(estado.vinculaciones ?? []), p_codigo];
      const limpio = String(p_codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!/^VZ[A-HJ-NP-Z2-9]{8}$/.test(limpio)) return json({ ok: false, motivo: "formato" });
      const codigo = `VZ-${limpio.slice(2, 6)}-${limpio.slice(6)}`;
      const rep = estado.numeros.reparaciones.find((f) => f.codigo_seguimiento === codigo);
      const ped = estado.numeros.pedidos.find((f) => f.codigo_seguimiento === codigo);
      const fila = rep ?? ped;
      const campo = rep ? "customer_user_id" : "user_id";
      if (!fila) return json({ ok: false, motivo: "no_existe" });
      if (fila[campo] && fila[campo] !== usuario.id) return json({ ok: false, motivo: "otra_cuenta" });
      fila[campo] = usuario.id;
      fila.vinculado_en = new Date().toISOString();
      return json(rep ? { ok: true, tipo: "reparacion", titulo: rep.service_title } : { ok: true, tipo: "pedido", numero: ped.numero });
    }
    // Ficha del cliente: pedidos y reparaciones ficticios (solo si la prueba los da); se apunta lo que se mandaría cambiar.
    if (url.pathname.endsWith("/rest/v1/pedidos") && estado.pedidosFicha) {
      if (metodo === "PATCH") {
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        estado.cambiosPedido = [...(estado.cambiosPedido ?? []), { id, cuerpo: JSON.parse(peticion.postData() ?? "{}") }];
        return json([{ id }]);
      }
      if (metodo === "GET") {
        const uid = url.searchParams.get("user_id") ?? "";
        if (uid.startsWith("eq.")) return json(estado.pedidosFicha.filter((p) => p.user_id === uid.slice(3)));
        if (uid === "is.null") {
          const correo = (url.searchParams.get("email") ?? "").replace(/^ilike\./, "").replace(/\\(.)/g, "$1").toLowerCase();
          return json(estado.pedidosFicha.filter((p) => !p.user_id && p.email.toLowerCase() === correo));
        }
        return json([]);
      }
    }
    if (url.pathname.endsWith("/rest/v1/service_requests") && estado.serviciosFicha) {
      if (metodo === "PATCH") {
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        estado.cambiosServicio = [...(estado.cambiosServicio ?? []), { id, cuerpo: JSON.parse(peticion.postData() ?? "{}") }];
        return json([{ id }]);
      }
      if (metodo === "GET") return json(estado.serviciosFicha);
    }
    // Foro, parte 2: silencios y registro de moderación. Sin datos en la prueba, «la tabla aún no existe» (antes de la
    // migración), igual que en producción hasta que el dueño la aplique.
    if (url.pathname.endsWith("/rest/v1/foro_silencios")) {
      if (!estado.silencios) return json({ code: "PGRST205", message: "Could not find the table 'public.foro_silencios' in the schema cache" }, 404);
      if (metodo === "POST" || metodo === "PATCH") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        const id = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "") || cuerpo.user_id;
        estado.silenciosEscritos = [...(estado.silenciosEscritos ?? []), { metodo, id, cuerpo, prefer: peticion.headers()["prefer"] ?? "" }];
        estado.silencios = [...estado.silencios.filter((s) => s.user_id !== id), { user_id: id, motivo: null, ...cuerpo }];
        return json([{ user_id: id }]);
      }
      if (metodo === "GET") {
        const uid = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
        const filas = estado.silencios.filter((s) => (!uid || s.user_id === uid) && (!url.searchParams.get("hasta") || new Date(s.hasta) > new Date()));
        const objeto = /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "");
        return objeto ? json(filas[0] ?? null, filas[0] ? 200 : 406) : json(filas);
      }
    }
    if (url.pathname.endsWith("/rest/v1/foro_moderacion") && metodo === "GET") {
      if (!estado.moderacion) return json({ code: "PGRST205", message: "Could not find the table 'public.foro_moderacion' in the schema cache" }, 404);
      const uid = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
      return json(estado.moderacion.filter((m) => !uid || m.user_id === uid));
    }
    if (url.pathname.endsWith("/rest/v1/store_reviews") && metodo === "GET" && estado.resenas) return json(estado.resenas);
    // Políticas: sin filas (la página usa su texto de reserva, el mismo que pone la migración), salvo que la prueba las dé.
    if (url.pathname.endsWith("/rest/v1/policy_pages") && metodo === "GET") return json(estado.politicas ?? []);
    // Ficha de producto ficticia (sección N) y sus fotos (las fotos llegan falsas: pruebas/sin-fotos-reales.mjs).
    if (estado.producto && url.pathname.endsWith("/rest/v1/products") && metodo === "GET") {
      return /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? json(estado.producto) : json([estado.producto]);
    }
    if (estado.producto && url.pathname.endsWith("/rest/v1/product_media") && metodo === "GET") return json(estado.fotosProducto ?? []);
    // Analítica propia (solo con aceptaAnalitica): se apunta lo que la tienda mandaría guardar.
    if (url.pathname.endsWith("/rest/v1/analytics_events") && metodo === "POST") {
      estado.eventosEnviados = [...(estado.eventosEnviados ?? []), ...[].concat(JSON.parse(peticion.postData() ?? "[]"))];
      return r.fulfill({ status: 201, headers: CORS, body: "" });
    }
    // Administración → Analítica con un embudo ficticio.
    if (estado.embudo && /\/rpc\/analytics_(totals|daily_visitors|funnel)$/.test(url.pathname)) {
      if (url.pathname.endsWith("_funnel")) return json(estado.embudo);
      if (url.pathname.endsWith("_totals")) return json([{ total_sessions: 10, total_pageviews: 20, total_events: 30, registered_visitors: 2 }]);
      return json([]);
    }
    if (url.pathname.endsWith("/rest/v1/chat_messages") && metodo === "POST") {
      estado.mensajesEnviados = [...(estado.mensajesEnviados ?? []), JSON.parse(peticion.postData() ?? "{}")];
      return estado.bloqueoForo
        ? json({ code: "42501", message: "new row violates row-level security policy for table \"chat_messages\"" }, 403)
        : r.fulfill({ status: 201, headers: CORS, body: "" });
    }
    // Noticias y sus comentarios ficticios (solo si la prueba los da).
    if (url.pathname.endsWith("/rest/v1/noticias_gaming") && metodo === "GET" && estado.noticias) return json(estado.noticias);
    if (url.pathname.endsWith("/rest/v1/noticias_comentarios")) {
      if (metodo === "HEAD") return json([], 200, { "content-range": `*/${estado.comentariosOcultos ?? 0}`, "access-control-expose-headers": "*" });
      if (metodo === "PATCH") {
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        estado.ocultados = [...(estado.ocultados ?? []), { id, cuerpo: JSON.parse(peticion.postData() ?? "{}") }];
        return json([{ id }]);
      }
      if (metodo === "GET" && estado.comentarios) {
        const visibles = estado.comentarios.filter((c) => !(estado.ocultados ?? []).some((o) => o.id === c.id));
        if ((url.searchParams.get("select") ?? "").startsWith("noticia_id")) return json(visibles.map((c) => ({ noticia_id: c.noticia_id })));
        return json(visibles.map(({ noticia_id: _n, ...c }) => c));
      }
    }
    if (url.pathname.endsWith("/rpc/perfiles_publicos")) {
      estado.pedidosPerfilesForo = [...(estado.pedidosPerfilesForo ?? []), JSON.parse(peticion.postData() ?? "{}")];
      if (!estado.perfilesForo) return json({ code: "PGRST202", message: "Could not find the function public.perfiles_publicos(ids) in the schema cache" }, 404);
      return json(estado.perfilesForo);
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      if (metodo === "PUT") {
        estado.cuenta = JSON.parse(peticion.postData() ?? "{}");
        return json({ ...usuario, user_metadata: { ...usuario.user_metadata, ...(estado.cuenta.data ?? {}) } });
      }
      return json(usuario);
    }
    if (url.pathname.endsWith("/rest/v1/profiles")) return json({ id: usuario.id, role: rol });
    if (url.pathname.endsWith("/rest/v1/analytics_events") && metodo === "GET") return json(estado.eventos ?? []);
    if (url.pathname.endsWith("/rpc/get_unread_chat_count")) return json(0);
    if (url.pathname.endsWith("/rpc/admin_list_users_with_stats")) return json(estado.usuarios ?? []);
    if (url.pathname.endsWith("/rest/v1/perfiles_cliente")) {
      if (metodo === "POST") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        estado.guardados.push({ cuerpo, url: peticion.url(), prefer: peticion.headers()["prefer"] ?? "" });
        if (estado.respuestaGuardar) return json(estado.respuestaGuardar.cuerpo, estado.respuestaGuardar.status);
        // Como la base de datos: queda guardado (lo vuelve a leer «Completa tu perfil»).
        estado.filas = [...(estado.filas ?? []).filter((f) => f.user_id && f.user_id !== cuerpo.user_id), cuerpo];
        return r.fulfill({ status: 201, headers: CORS, body: "" });
      }
      if (estado.sinTabla) return json({ code: "PGRST205", message: "Could not find the table 'public.perfiles_cliente' in the schema cache" }, 404);
      // Como la base de datos: con «user_id=eq.<id>» solo la fila de esa persona.
      const filtro = url.searchParams.get("user_id");
      const filas = estado.filas ?? [];
      return json(filtro?.startsWith("eq.") ? filas.filter((f) => !f.user_id || f.user_id === filtro.slice(3)) : filas);
    }
    // Lecturas vacías de todo lo demás que pide la tienda con esta sesión (nada de la base de datos real).
    if (metodo === "GET" || metodo === "HEAD") {
      if (/\/rest\/v1\/(pedidos|pedido_items|service_requests|sell_requests|store_reviews|product_sales|customer_notes|avisos_busqueda|chat_message_reactions|services|service_media|seguimiento_intentos)$/.test(url.pathname)) {
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

// ===== N) Visor de fotos de la ficha: Blue se esconde, zoom sin tirones y su uso en Administración ==================
async function seccionN() {
  const ID = "b7c1d2e3-0000-4000-8000-0000000000aa";
  const foto = (n) => `https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/visor/${n}.jpg`;
  {
    const estado = {
      // Perfil completo: sin «Completa tu perfil» (que esconde a Blue por su cuenta).
      filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
      guardados: [],
      aceptaAnalitica: true,
      producto: {
        id: ID, title: "Nintendo Switch OLED", description: "Consola revisada.", price_eur: 249.99, status: "PUBLISHED", is_active: true,
        category_id: null, images: [], updated_at: "2026-10-30T10:00:00Z", created_at: "2026-10-30T10:00:00Z", condition: "USED",
        like_count: 0, reference: null, caracteristicas: null, mantenimiento: null, category: null,
      },
      fotosProducto: [1, 2, 3].map((n) => ({ id: `m${n}`, product_id: ID, kind: "image", public_url: foto(n), file_name: `${n}.jpg`, sort_order: n - 1, is_cover: n === 1, duration_seconds: null })),
    };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const inicio = Date.now();
    const p = await pagina(ctx, `/producto/${ID}`);
    const cdp = await ctx.newCDPSession(p);
    // Dedos de verdad (eventos táctiles del navegador): [x, y, dedo].
    const toque = (tipo, puntos) => cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: puntos.map(([x, y, id]) => ({ x, y, id: id ?? 0 })) });
    const tocar = async (x, y) => {
      await toque("touchStart", [[x, y]]);
      await toque("touchEnd", []);
    };
    const vista = () =>
      p.evaluate(() => {
        const t = document.getElementById("visor-fotos-capa")?.style.transform ?? "";
        const m = /translate3d\(([-\d.e+]+)px, ([-\d.e+]+)px, 0px\) scale\(([-\d.e+]+)\)/.exec(t);
        return m ? { x: Math.round(+m[1] * 10) / 10, y: Math.round(+m[2] * 10) / 10, s: Math.round(+m[3] * 1000) / 1000 } : { x: 0, y: 0, s: 1, sin: t };
      });
    const blue = () =>
      p.evaluate(() => {
        const b = document.getElementById("blue-flotante");
        if (!b) return { opacidad: -1, encima: "sin-blue" };
        const r = b.getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const encima = e?.closest("#blue-flotante") ? "blue" : e?.closest("#visor-fotos") ? "visor" : "otro";
        const quien = e?.closest("button")?.getAttribute("aria-label") ?? e?.tagName.toLowerCase() ?? "";
        return { opacidad: Math.round(Number(getComputedStyle(b.firstElementChild).opacity) * 100) / 100, encima, quien };
      });
    const cerca = (a, b, margen = 2) => Math.abs(a - b) <= margen;

    // Blue aparece a los 10 s y se puede tocar.
    await p.waitForFunction(() => !!document.getElementById("blue-flotante"), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const antes = await blue();
    ok(antes.opacidad > 0.9 && antes.encima === "blue", `N: antes de abrir el visor Blue se ve y se puede tocar (${JSON.stringify(antes)})`);

    // Abrir el visor tocando la foto principal (la más grande con el nombre del producto).
    const principal = await p.evaluate(() => {
      const imgs = [...document.querySelectorAll('img[alt="Nintendo Switch OLED"]')].map((i) => i.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height);
      return imgs[0] ? { x: imgs[0].left + imgs[0].width / 2, y: imgs[0].top + imgs[0].height / 2 } : null;
    });
    ok(!!principal, "N: la ficha enseña la foto principal");
    if (principal) await tocar(principal.x, principal.y);
    await p.locator("#visor-fotos").waitFor({ timeout: 8000 }).catch(() => {});
    ok((await p.locator("#visor-fotos").count()) === 1 && /1 \/ 3/.test(await p.locator("#visor-fotos").innerText()), "N: un toque en la foto abre el visor en la foto 1 de 3");
    await p.waitForTimeout(450);
    const durante = await blue();
    ok(durante.opacidad < 0.05 && durante.encima === "visor", `N: con el visor abierto Blue desaparece y donde estaba se toca el visor (${JSON.stringify(durante)})`);
    const fondo = await p.evaluate(() => getComputedStyle(document.getElementById("visor-fotos")).touchAction);
    ok(fondo === "none", `N: el navegador no hace su propio zoom a la vez que el visor (touch-action: ${fondo})`);
    await capturar(p, "N1-visor-sin-blue");

    const caja = await p.locator("#visor-fotos").boundingBox();
    const cx = caja.x + caja.width / 2;
    const cy = caja.y + caja.height / 2;

    // Pellizcar: x2 con los dedos 122 px por encima del centro. Solo debe cambiar la capa de la foto.
    await p.evaluate(() => {
      const capa = document.getElementById("visor-fotos-capa");
      window.__mut = { capa: 0, resto: 0 };
      window.__obs = new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.target === capa && m.type === "attributes") window.__mut.capa += 1;
          else window.__mut.resto += 1;
        }
      });
      window.__obs.observe(document.getElementById("visor-fotos"), { subtree: true, attributes: true, childList: true, characterData: true });
    });
    const fy = cy - 122;
    await toque("touchStart", [[cx - 50, fy, 0], [cx + 50, fy, 1]]);
    for (let i = 1; i <= 10; i++) {
      await toque("touchMove", [[cx - 50 - 5 * i, fy, 0], [cx + 50 + 5 * i, fy, 1]]);
      await p.waitForTimeout(16);
    }
    await p.waitForTimeout(80);
    const v1 = await vista();
    const mut = await p.evaluate(() => {
      window.__obs.disconnect();
      return window.__mut;
    });
    ok(cerca(v1.s, 2, 0.02) && cerca(v1.x, 0) && cerca(v1.y, 122, 3), `N: pellizcar acerca x2 justo entre los dedos (el punto bajo los dedos no se mueve) (${JSON.stringify(v1)})`);
    ok(mut.capa > 0 && mut.resto === 0, `N: mientras se pellizca solo cambia la capa de la foto: ni la foto ni nada más del visor se vuelve a pintar (${JSON.stringify(mut)})`);

    // Soltar un dedo y seguir con el otro: la foto sigue al dedo sin saltar. (CDP: «touchEnd» con ese dedo suelta solo ese.)
    await toque("touchEnd", [[cx + 100, fy, 1]]);
    await p.waitForTimeout(50);
    const v2 = await vista();
    await toque("touchMove", [[cx - 130, fy - 20, 0]]);
    await p.waitForTimeout(50);
    const v3 = await vista();
    ok(cerca(v2.x, v1.x) && cerca(v2.y, v1.y) && cerca(v3.x - v2.x, -30) && cerca(v3.y - v2.y, -20), `N: al soltar un dedo la foto no salta y sigue al otro (${JSON.stringify([v1, v2, v3])})`);
    await toque("touchEnd", []);
    await p.waitForTimeout(450);
    const v4 = await vista();
    const imgsCapa = await p.locator("#visor-fotos-capa img").count();
    ok(cerca(v4.s, 2, 0.02) && cerca(v4.x, -30) && cerca(v4.y, 0), `N: al soltar, la foto vuelve a sus bordes (sin huecos arriba ni abajo) (${JSON.stringify(v4)})`);
    ok(imgsCapa === 2, `N: con zoom se pide la foto original encima, para ver el detalle (${imgsCapa} fotos en la capa)`);
    await capturar(p, "N2-visor-zoom");

    // Doble toque: con zoom vuelve al tamaño normal; sin zoom acerca x2,5 donde se toca.
    await tocar(cx, cy);
    await p.waitForTimeout(80);
    await tocar(cx, cy);
    await p.waitForTimeout(400);
    const v5 = await vista();
    ok(cerca(v5.s, 1, 0.01) && cerca(v5.x, 0) && cerca(v5.y, 0), `N: doble toque con zoom vuelve al tamaño normal (${JSON.stringify(v5)})`);
    await tocar(cx - 95, cy - 122);
    await p.waitForTimeout(80);
    await tocar(cx - 95, cy - 122);
    await p.waitForTimeout(450);
    const v6 = await vista();
    const lado = Math.min(caja.width, caja.height * 0.86);
    const esperadoY = Math.min(183, Math.max(0, (2.5 * lado - caja.height) / 2));
    ok(cerca(v6.s, 2.5, 0.02) && cerca(v6.x, 142.5) && cerca(v6.y, esperadoY), `N: doble toque acerca x2,5 donde se toca (${JSON.stringify(v6)}; esperado x 142,5 y ${esperadoY})`);
    await tocar(cx, cy);
    await p.waitForTimeout(80);
    await tocar(cx, cy);
    await p.waitForTimeout(400);

    // Rueda del ratón (escritorio): acerca donde está el puntero y no mueve la ficha de debajo.
    const desplazado = () => p.evaluate(() => [...document.querySelectorAll("*")].reduce((t, e) => t + e.scrollTop, 0));
    const scrollAntes = await desplazado();
    // Lo que llega de verdad a la página (con pantalla de densidad 2 el navegador lo divide).
    await p.evaluate(() => {
      window.__rueda = 0;
      window.addEventListener("wheel", (e) => (window.__rueda += e.deltaY), { capture: true, passive: true });
    });
    await p.mouse.move(cx, cy);
    await p.mouse.wheel(0, -300);
    await p.waitForTimeout(150);
    const v7 = await vista();
    const rueda = await p.evaluate(() => window.__rueda);
    ok(rueda < 0 && v7.s > 1.1 && cerca(v7.s, Math.exp(-rueda * 0.002), 0.02) && cerca(v7.x, 0) && cerca(v7.y, 0), `N: la rueda acerca donde está el puntero (${JSON.stringify(v7)}; rueda ${rueda})`);
    await p.mouse.wheel(0, 900);
    await p.waitForTimeout(150);
    const v8 = await vista();
    ok(cerca(v8.s, 1, 0.01) && (await desplazado()) === scrollAntes, `N: y aleja hasta el tamaño normal sin mover la ficha de debajo (${JSON.stringify(v8)})`);

    // Alejar de más con los dedos: al soltar vuelve al tamaño normal.
    await toque("touchStart", [[cx - 100, cy, 0], [cx + 100, cy, 1]]);
    for (let i = 1; i <= 10; i++) {
      await toque("touchMove", [[cx - 100 + 5 * i, cy, 0], [cx + 100 - 5 * i, cy, 1]]);
      await p.waitForTimeout(16);
    }
    await p.waitForTimeout(60);
    const v9 = await vista();
    await toque("touchEnd", []);
    await p.waitForTimeout(400);
    const v10 = await vista();
    ok(v9.s < 1 && v9.s > 0.8 && cerca(v10.s, 1, 0.01) && cerca(v10.x, 0) && cerca(v10.y, 0), `N: alejar de más se nota como un muelle y vuelve solo al tamaño normal (${v9.s} → ${JSON.stringify(v10)})`);

    // Deslizar a la izquierda sin zoom: foto siguiente; la flecha, la otra.
    await toque("touchStart", [[cx + 100, cy]]);
    for (let i = 1; i <= 8; i++) {
      await toque("touchMove", [[cx + 100 - 25 * i, cy]]);
      await p.waitForTimeout(16);
    }
    await toque("touchEnd", []);
    await p.waitForTimeout(600);
    const v11 = await vista();
    ok(/2 \/ 3/.test(await p.locator("#visor-fotos").innerText()) && cerca(v11.x, 0) && cerca(v11.s, 1, 0.01), `N: deslizar a la izquierda pasa a la foto 2 de 3 y la deja centrada (${JSON.stringify(v11)})`);
    ok((await p.locator("#visor-fotos-capa img").count()) === 1, "N: la foto nueva vuelve a la versión del tamaño de la pantalla (sin la original)");
    await p.getByRole("button", { name: "Foto siguiente" }).click();
    await p.waitForTimeout(400);
    ok(/3 \/ 3/.test(await p.locator("#visor-fotos").innerText()), "N: la flecha pasa a la foto 3 de 3");

    // El mensaje de Blue de la ficha (a los 15 s) espera a que se cierre el visor.
    const falta = 18000 - (Date.now() - inicio);
    if (falta > 0) await p.waitForTimeout(falta);
    ok((await p.locator("#blue-mensaje").count()) === 0, "N: con el visor abierto Blue no dice nada (su mensaje de la ficha espera)");
    await p.getByRole("button", { name: "Cerrar el visor de fotos" }).click();
    await p.waitForTimeout(1500);
    const despues = await blue();
    ok((await p.locator("#visor-fotos").count()) === 0 && despues.opacidad > 0.9 && despues.encima === "blue", `N: al cerrar el visor Blue vuelve y se puede tocar (${JSON.stringify(despues)})`);
    const mensaje = await p.locator("#blue-mensaje").innerText().catch(() => "");
    ok(/¿Te gusta Nintendo Switch OLED\?/.test(mensaje), `N: y dice entonces el mensaje que tenía guardado (${mensaje.slice(0, 60)})`);

    const eventos = estado.eventosEnviados ?? [];
    const abiertos = eventos.filter((e) => e.event_name === "foto_ampliada");
    const zooms = eventos.filter((e) => e.event_name === "foto_zoom");
    ok(abiertos.length === 1 && abiertos[0].step_label === "Ficha: foto ampliada" && abiertos[0].metadata?.fotos === 3, `N: la analítica cuenta una apertura del visor (${JSON.stringify(abiertos)})`);
    ok(zooms.length === 1 && zooms[0].step_label === "Ficha: zoom en la foto" && zooms[0].metadata?.como === "pellizco", `N: y un solo zoom por apertura, con cómo se hizo (${JSON.stringify(zooms)})`);
    ok(p.errores.length === 0, `N: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `N: la ficha no se ensancha (${ancho.a}/${ancho.p})`);
    await ctx.close();
  }
  {
    // Administración → Analítica → Recorrido principal: cuántas sesiones amplían fotos y cuántas usan el zoom.
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Producto Nintendo Switch OLED", sessions: 6 },
        { step_label: "Ficha: foto ampliada", sessions: 4 },
        { step_label: "Ficha: zoom en la foto", sessions: 3 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-visor-fotos").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-visor-fotos").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Fotos de la ficha ampliadas: 4 sesiones · con zoom: 3/.test(t), `N: Administración → Analítica enseña cuántas sesiones amplían las fotos y cuántas usan el zoom (${t})`);
    const productos = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(!/Ficha: foto ampliada|Ficha: zoom/.test(productos), "N: y esos eventos no se cuelan como «productos» ni pasos del recorrido");
    ok(p.errores.length === 0, `N: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await capturar(p, "N3-admin-analitica-visor");
    await ctx.close();
  }
}

// ===== P) Números de seguimiento: el cliente añade a su cuenta un pedido o una reparación con su número ==============
async function seccionP() {
  const COD_REP = "VZ-7K3M-9QPD";
  const COD_PED = "VZ-AB2C-D3EF";
  const COD_AJENO = "VZ-HJ4K-5LMN";
  const OTRO = "99999999-9999-4999-8999-999999999999";
  const datos = () => ({
    pedidos: [
      {
        id: "pa000000-0000-4000-8000-000000000031", numero: 31, created_at: "2026-10-30T10:00:00Z", estado: "preparado", entrega: "recogida",
        total_eur: 249.99, user_id: null, codigo_seguimiento: COD_PED, id_veoaura: "8a1b2c3d-0000-4000-8000-000000000001", vinculado_en: null,
        nombre: "Luis Gil", email: "luis@example.com", telefono: "611222333", direccion: null, codigo_postal: null, ciudad: null, notas: null,
        pedido_items: [{ id: "it31", product_id: null, titulo: "Nintendo Switch OLED", precio_eur: 249.99 }],
      },
      {
        id: "pb000000-0000-4000-8000-000000000030", numero: 30, created_at: "2026-10-29T10:00:00Z", estado: "enviado", entrega: "envio",
        total_eur: 30, user_id: OTRO, codigo_seguimiento: COD_AJENO, id_veoaura: null, vinculado_en: "2026-10-29T12:00:00Z",
        nombre: "Otra persona", email: "otra@example.com", telefono: "600000000", direccion: "Calle 1", codigo_postal: "50001", ciudad: "Zaragoza", notas: null,
        pedido_items: [{ id: "it30", product_id: null, titulo: "Mando", precio_eur: 30 }],
      },
    ],
    reparaciones: [
      {
        id: "ra000000-0000-4000-8000-000000000001", created_at: "2026-10-28T10:00:00Z", service_id: null, service_title: "Reparación de mando PS5",
        nombre: "Ana", apellido: "", metodo_contacto: null, contacto: "600111222", ciudad: "", direccion: null, disponibilidad: null, comentario: null,
        status: "revisado", seguimiento: "reparando", seguimiento_nota: "Cambiamos el joystick izquierdo", seguimiento_actualizado: "2026-10-30T09:00:00Z",
        customer_user_id: null, codigo_seguimiento: COD_REP, id_veoaura: "8a1b2c3d-0000-4000-8000-000000000002", vinculado_en: null,
      },
    ],
    items: [{ pedido_id: "pa000000-0000-4000-8000-000000000031", titulo: "Nintendo Switch OLED" }],
    intentos: [
      { user_id: CLIENTE.id, acierto: true },
      { user_id: CLIENTE.id, acierto: true },
      { user_id: OTRO, acierto: false },
    ],
  });
  const perfilCompleto = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  {
    // P1) El cliente, en «Mis seguimientos».
    const estado = { filas: perfilCompleto, guardados: [], numeros: datos() };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil?tab=seguimientos");
    await p.getByText("Reparaciones y Mantenimientos").first().waitFor({ timeout: 30000 }).catch(() => {});
    const campos = p.getByLabel("Número de seguimiento", { exact: true });
    ok((await campos.count()) === 2, `P: en «Mis pedidos» y en «Reparaciones y Mantenimientos» sale «¿Te hemos dado un número de seguimiento?» (${await campos.count()} campos)`);
    const altos = await campos.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    ok(altos.every((h) => h >= 44), `P: los campos se tocan bien, de 44 px o más (${altos.join(", ")})`);
    const botones = p.getByRole("button", { name: "Añadir el número de seguimiento" });
    await campos.first().fill("hola");
    ok((await botones.first().getAttribute("aria-disabled")) === "true", "P: con algo que no es un número, «Añadir» no se puede pulsar");
    await capturar(p, "P1-mis-seguimientos");

    // La reparación de VeoAura, escrita en minúsculas y con espacios en el campo de «Mis pedidos».
    await campos.first().fill("vz 7k3m 9qpd");
    await botones.first().click();
    await p.getByText(/Listo: «Reparación de mando PS5» ya está en «Reparaciones y Mantenimientos»\./).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText("Listo: «Reparación de mando PS5» ya está en «Reparaciones y Mantenimientos».").count()) === 1, "P: un número bueno añade la reparación y dice dónde está");
    await p.getByText(`Nº de seguimiento ${COD_REP}`).waitFor({ timeout: 10000 }).catch(() => {});
    const t1 = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/Reparación de mando PS5/.test(t1) && t1.includes(`Nº de seguimiento ${COD_REP}`) && /Cambiamos el joystick izquierdo/.test(t1), "P: la reparación aparece en la lista con su número y la nota del taller");
    ok(estado.numeros.reparaciones[0].customer_user_id === CLIENTE.id && estado.vinculaciones?.[0] === "VZ 7K3M 9QPD", `P: se manda tal cual lo escribió (la base de datos lo normaliza) (${estado.vinculaciones?.[0]})`);

    // El pedido, en el campo de «Reparaciones y Mantenimientos» (da igual dónde se escriba).
    await campos.nth(1).fill(COD_PED);
    await botones.nth(1).click();
    await p.getByText("Listo: el pedido nº 31 ya está en «Mis pedidos».").waitFor({ timeout: 10000 }).catch(() => {});
    // La lista se vuelve a cargar justo después del «Listo»: se espera a que el pedido ya esté en ella.
    await p.getByText(`Nº de seguimiento ${COD_PED}`).waitFor({ timeout: 10000 }).catch(() => {});
    const t2 = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/Listo: el pedido nº 31 ya está en «Mis pedidos»\./.test(t2) && /Pedido nº 31/.test(t2) && t2.includes(`Nº de seguimiento ${COD_PED}`) && /Nintendo Switch OLED/.test(t2), "P: un pedido también, con su número y sus artículos");

    // Errores: no existe y de otra cuenta.
    await campos.first().fill("VZ-2222-2222");
    await botones.first().click();
    await p.getByText(/No encontramos ese número/).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText("No encontramos ese número. Revisa que esté bien escrito.").count()) === 1, "P: un número que no existe se explica");
    await campos.first().fill(COD_AJENO);
    await botones.first().click();
    await p.getByText(/ya está añadido a otra cuenta/).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText(/Ese número ya está añadido a otra cuenta/).count()) === 1 && estado.numeros.pedidos[1].user_id === OTRO, "P: el de otra cuenta se explica y no se toca");
    await capturar(p, "P2-numeros-anadidos");
    ok(p.errores.length === 0, `P: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `P: la página no se ensancha (${ancho.a}/${ancho.p})`);
    await ctx.close();
  }
  {
    // P2) Sin la migración: no se ofrece añadir números y los seguimientos se ven igual.
    const estado = { filas: perfilCompleto, guardados: [], numeros: { ...datos(), sinColumnas: true } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil?tab=seguimientos");
    await p.getByText("Reparaciones y Mantenimientos").first().waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    ok((await p.getByLabel("Número de seguimiento", { exact: true }).count()) === 0 && (await p.getByText("Mis pedidos").count()) >= 1, "P: sin la migración no sale el campo y «Mis seguimientos» funciona igual");
    ok(p.errores.length === 0, `P: sin errores de JavaScript sin la migración (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
  {
    // P3) Administración: Pedidos, Servicios y Usuarios.
    const estado = { usuarios: [], filas: [], guardados: [], numeros: datos() };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/pedidos");
    await p.locator("#pedidos-numeros").waitFor({ timeout: 30000 }).catch(() => {});
    const resumen = (await p.locator("#pedidos-numeros").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/de VeoAura: 1 \(en la cuenta del cliente: 0\) · añadidos con su número: 1 · sin cuenta: 1/.test(resumen), `P: Pedidos cuenta los números (de VeoAura, en la cuenta del cliente, añadidos con su número y sin cuenta) (${resumen})`);
    await p.getByText("Todos", { exact: true }).click();
    await p.waitForTimeout(300);
    const tp = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(tp.includes(`Nº de seguimiento ${COD_PED}`) && /Ficha de VeoAura · Aún no está en ninguna cuenta: dale este número al cliente/.test(tp), "P: cada pedido enseña su número, si es de VeoAura y si falta dárselo al cliente");
    ok(tp.includes(`Nº de seguimiento ${COD_AJENO}`) && /El cliente lo añadió a su cuenta el/.test(tp), "P: y cuándo lo añadió el cliente a su cuenta");
    await p.getByText("Sin cuenta (1)").click();
    await p.waitForTimeout(300);
    const sinCuenta = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/Pedido nº 31/.test(sinCuenta) && !/Pedido nº 30/.test(sinCuenta), "P: el filtro «Sin cuenta» deja los pedidos que aún no están en ninguna cuenta");
    await capturar(p, "P3-admin-pedidos");
    ok(p.errores.length === 0, `P: Pedidos sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);

    const s = await pagina(ctx, "/admin/services");
    await s.getByText("Solicitudes", { exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await s.getByText("Solicitudes", { exact: true }).first().click();
    await s.locator("#servicios-numeros").waitFor({ timeout: 20000 }).catch(() => {});
    const resumenS = (await s.locator("#servicios-numeros").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/de VeoAura: 1 \(en la cuenta del cliente: 0\) · añadidas con su número: 0 · sin cuenta: 1/.test(resumenS), `P: Servicios cuenta los números de las reparaciones (${resumenS})`);
    const ts = (await s.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(ts.includes(`Nº de seguimiento ${COD_REP}`) && /Ficha de VeoAura/.test(ts) && /Contacto: 600111222/.test(ts) && !/Ciudad:\s*(Contacto|Disponibilidad|$)/.test(ts), "P: cada reparación enseña su número, que es de VeoAura y el contacto (sin una «Ciudad» vacía)");
    await capturar(s, "P4-admin-servicios");
    ok(s.errores.length === 0, `P: Servicios sin errores de JavaScript (${s.errores.length}${s.errores[0] ? ": " + s.errores[0] : ""})`);

    const u = await pagina(ctx, "/admin/users");
    await u.locator("#admin-numeros-seguimiento").waitFor({ timeout: 30000 }).catch(() => {});
    const lineaU = (await u.locator("#admin-numeros-seguimiento").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Números de seguimiento \(30 días\): añadidos a una cuenta 2 \(por 1 persona\) · intentos fallidos 1/.test(lineaU), `P: Usuarios cuenta los números añadidos y los intentos fallidos (${lineaU})`);
    await ctx.close();
  }
}

const navegador = await lanzarNavegador(ok);
try {
  if (SOLO === "N") await seccionN();
  if (SOLO === "P") await seccionP();
  // Toda la batería (salvo si se pidió solo una sección). El bloque no se ha vuelto a sangrar para no mover todo el archivo.
  todas: {
  if (SOLO) break todas;
  // ===== A) «Tu perfil»: rellenar con lo del registro, elegir, validar y guardar ====================================
  {
    const estado = { filas: [], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-datos").waitFor({ timeout: 30000 });
    const t = await p.locator("#perfil-datos").innerText();
    ok(/Mi perfil/.test(t) && !/Perfil público/.test(t), "A: sale la tarjeta «Mi perfil» en Mi cuenta (ya no «Perfil público»)");
    ok(/Tu cuenta está activa/.test(t) && /SESIÓN ACTUAL/.test(t) && t.includes(CLIENTE.email) && (await p.locator("#perfil-datos").getByText("Cerrar sesión", { exact: true }).count()) === 1, "A: la cuenta («Tu cuenta está activa», la sesión y «Cerrar sesión») va DENTRO de «Mi perfil»");
    ok((await p.getByText("SESIÓN ACTUAL").count()) === 1 && (await p.getByText("Tu cuenta está activa").count()) === 1, "A: y no hay otra tarjeta de la cuenta aparte");
    ok((await p.getByText("Mis seguimientos").count()) >= 1 && (await p.locator("#perfil-pestanas").getByText("Seguimientos", { exact: true }).count()) === 0, "A: la pestaña se llama «Mis seguimientos»");
    ok(/Sin usuario · Faltan datos/.test(await p.locator("#perfil-cabecera").innerText()), `A: la cabecera dice «Sin usuario · Faltan datos» (${(await p.locator("#perfil-cabecera").innerText()).replace(/\n/g, " ")})`);
    ok((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) === "true", "A: con datos pendientes la tarjeta sale abierta");
    ok(/Falta: provincia, fecha de nacimiento/.test(t), "A: dice qué falta («Falta: provincia, fecha de nacimiento»)");
    ok(/Toca para añadir tu foto \(opcional\)/.test(t) && (await p.locator("#perfil-foto").count()) === 1, "A: la foto es opcional y se toca para añadirla");
    ok((await p.locator("#perfil-obligatorio").count()) === 0, "A: en Mi cuenta NO sale «Completa tu perfil» (aquí está la tarjeta)");
    const valor = (etiqueta) => p.locator(`#perfil-datos [aria-label="${etiqueta}"]`).first();
    ok((await valor("Nombre").inputValue()) === "Dani" && (await valor("Nombre de usuario").inputValue()) === "dani", "A: nombre y usuario salen rellenados con lo que escribió al registrarse");
    ok(/España/.test(t), "A: y el país también (España)");
    ok(/Provincia/.test(t) && /Fecha de nacimiento/.test(t) && !/ Años/.test(t), "A: faltan la provincia y la fecha (se ven los textos de ayuda; la edad sale al elegir la fecha)");
    // Ancho del texto escribible: a lo ancho es casi toda la fila (en dos columnas no llegaría a la mitad).
    const anchos = await p.evaluate(() => {
      const medir = (e) => document.querySelector(`#perfil-datos [aria-label="${e}"]`)?.getBoundingClientRect().width ?? 0;
      const caja = document.querySelector("#perfil-datos [aria-label=\"Nombre\"]");
      return { usuario: Math.round(medir("Nombre de usuario")), nombre: Math.round(medir("Nombre")), marcador: caja?.getAttribute("placeholder") ?? "", formulario: Math.round(document.getElementById("perfil-datos")?.getBoundingClientRect().width ?? 0) };
    });
    ok(anchos.marcador === "Nombre y apellidos", `A: el nombre pide «Nombre y apellidos» (${anchos.marcador})`);
    ok(anchos.nombre >= anchos.formulario * 0.6 && anchos.usuario >= anchos.formulario * 0.6, `A: usuario y nombre ocupan toda la fila, para que se lean enteros (${anchos.usuario} y ${anchos.nombre} px de texto en ${anchos.formulario} px)`);
    await valor("Nombre").fill("Daniel Gutiérrez Martínez");
    const cabe = await p.evaluate(() => {
      const i = document.querySelector('#perfil-datos [aria-label="Nombre"]');
      return { cabe: i.scrollWidth <= i.clientWidth + 1, texto: i.scrollWidth, sitio: i.clientWidth };
    });
    ok(cabe.cabe, `A: un nombre con dos apellidos («Daniel Gutiérrez Martínez») se lee entero (${cabe.texto}/${cabe.sitio} px)`);
    await valor("Nombre").fill("Dani");
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
    const fila = await p.evaluate(() => {
      const r = (n) => n?.getBoundingClientRect();
      const fecha = r(document.querySelector('#perfil-datos input[aria-label="Fecha de nacimiento"]'));
      const edad = r(document.querySelector('#perfil-datos [aria-label="Edad"]'));
      const textoEdad = document.querySelector('#perfil-datos [aria-label="Edad"]');
      return fecha && edad ? { mismaFila: Math.abs(fecha.top + fecha.height / 2 - (edad.top + edad.height / 2)) < 6, aLaDerecha: edad.left > fecha.right - 2, cortada: textoEdad.scrollWidth > textoEdad.clientWidth + 1 } : null;
    });
    ok(!!fila && fila.mismaFila && fila.aLaDerecha && !fila.cortada, `A: en el iPhone la edad va al lado de la fecha, entera (${JSON.stringify(fila)})`);
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
    ok(!!estado.cuenta && estado.cuenta.data?.full_name === "Dani" && estado.cuenta.data?.username === "dani_zgz" && estado.cuenta.data?.country === "España", `A: actualiza también los datos de la cuenta: ${JSON.stringify(estado.cuenta?.data ?? null)}`);
    ok(/@dani_zgz · Completo/.test(await p.locator("#perfil-cabecera").innerText()), "A: la cabecera pasa a «@dani_zgz · Completo»");
    await p.waitForTimeout(300);
    ok((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) === "false" && (await p.locator('#perfil-datos [aria-label="Nombre"]').count()) === 0, "A: al guardarlo completo, el desplegable se cierra solo");
    ok((await p.locator("#perfil-datos").getByText("Perfil guardado.").count()) === 1, "A: y debajo de la cabecera se lee «Perfil guardado.»");
    await capturar(p, "A3-perfil-guardado-plegado");
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(300);
    ok((await guardar.getAttribute("aria-disabled")) === "true", "A: al abrirlo otra vez no hay nada pendiente: «Guardar perfil» está desactivado");
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

    // Diseño (con el desplegable abierto).
    if ((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) !== "true") await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(300);
    const medidas = await p.evaluate(() => {
      const caja = (document.getElementById("perfil-datos") ?? document.body).getBoundingClientRect();
      const botones = Array.from(document.querySelectorAll('#perfil-datos [role="button"]')).map((b) => Math.round(b.getBoundingClientRect().height));
      const nativos = Array.from(document.querySelectorAll("#perfil-datos select, #perfil-datos input[type=date]")).map((e) => Math.round(e.getBoundingClientRect().height));
      return { ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth, caja: Math.round(caja.width), botones, nativos };
    });
    ok(medidas.ancho <= medidas.pantalla + 1, `A: la página no se ensancha (${medidas.ancho}/${medidas.pantalla})`);
    ok(medidas.botones.length >= 3 && medidas.botones.every((h) => h >= 44), `A: los botones se tocan bien, de 44 px o más (${medidas.botones.join(", ")})`);
    ok(medidas.botones.filter((h) => h < 100).every((h) => h <= 64), `A: y son compactos (ninguno pasa de 64 px salvo la foto: ${medidas.botones.join(", ")})`);
    // (el campo mide 48 px con su borde; el control nativo cubre lo de dentro)
    ok(medidas.nativos.length >= 2 && medidas.nativos.every((h) => h >= 44 && h <= 50), `A: los desplegables y la fecha, compactos y tocables en todo el campo, de 44 a 50 px (${medidas.nativos.join(", ")})`);
    await capturar(p, "A4-perfil-abierto");

    // «Cerrar sesión» dentro de «Mi perfil».
    const salir = await p.locator("#perfil-datos").getByText("Cerrar sesión", { exact: true }).boundingBox();
    ok(!!salir && salir.height > 0, "A: «Cerrar sesión» se ve al final de «Mi perfil»");
    await p.locator("#perfil-datos").getByText("Cerrar sesión", { exact: true }).click();
    await p.getByText("Inicia sesión o regístrate").waitFor({ timeout: 10000 }).catch(() => {});
    ok(estado.salio === true && (await p.locator("#perfil-datos").count()) === 0 && (await p.getByText("Inicia sesión o regístrate").count()) === 1, "A: «Cerrar sesión» (dentro de «Mi perfil») cierra la sesión y vuelve el acceso");
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
    const cabecera = (await p.locator("#perfil-cabecera").innerText()).replace(/\n/g, " ");
    ok(/Mi perfil/.test(cabecera) && /@ana_g · Completo/.test(cabecera), `C: la cabecera dice «Mi perfil · @ana_g · Completo» (${cabecera})`);
    ok((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) === "false" && (await p.locator('#perfil-datos [aria-label="Nombre"]').count()) === 0, "C: completo, la tarjeta sale plegada");
    ok((await p.getByText("SESIÓN ACTUAL").count()) === 0, "C: plegada, la cuenta también queda dentro (no sale una tarjeta aparte)");
    await capturar(p, "C0-perfil-plegado");
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(300);
    ok((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) === "true", "C: al tocar la cabecera se abre");
    const v = async (e) => p.locator(`#perfil-datos [aria-label="${e}"]`).first().inputValue();
    ok((await v("Nombre")) === "Ana" && (await v("Nombre de usuario")) === "ana_g" && (await v("Provincia o región")) === "Lyon", "C: con un perfil ya guardado salen sus datos (no los del registro)");
    const t = await p.locator("#perfil-datos").innerText();
    ok(/Francia/.test(t) && /2 may 1990/.test(t) && t.includes(`${edadHoy("1990-05-02")} Años`), `C: país, fecha («2 may 1990») y edad («${edadHoy("1990-05-02")} Años») correctos`);
    ok((await p.getByRole("button", { name: "Guardar perfil" }).getAttribute("aria-disabled")) === "true", "C: sin cambios, «Guardar perfil» está desactivado");
    await capturar(p, "C-perfil-guardado");

    // Deslizar con el dedo (toques reales) sobre la zona de las pestañas.
    const deslizar = async (dx, dy) => {
      // El dedo empieza siempre a la vista, justo debajo de las pestañas.
      await p.locator("#perfil-pestanas").scrollIntoViewIfNeeded();
      const pestanas = await p.locator("#perfil-pestanas").boundingBox();
      const caja = await p.locator("#perfil-deslizable").boundingBox();
      const x = caja.x + caja.width / 2;
      const y = pestanas.y + pestanas.height + 40;
      const cdp = await p.context().newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
        await p.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(700);
    };
    const enSeguimientos = async () => (await p.getByText("Reparaciones y Mantenimientos").count()) === 1;
    await deslizar(-220, 6);
    await p.getByText("Reparaciones y Mantenimientos").waitFor({ timeout: 8000 }).catch(() => {});
    ok(await enSeguimientos(), "C: deslizar el dedo hacia la izquierda abre «Mis seguimientos»");
    ok(
      (await p.getByText("No tienes ninguna Reparación o Mantenimiento en curso. Solicita un servicio con tu sesión iniciada y verás aquí el estado actual.").count()) === 1,
      "C: con el título «Reparaciones y Mantenimientos» y su texto nuevo"
    );
    await capturar(p, "C2-mis-seguimientos-deslizando");
    await deslizar(220, -4);
    await p.locator("#perfil-cabecera").waitFor({ timeout: 8000 }).catch(() => {});
    ok(!(await enSeguimientos()) && (await p.locator("#perfil-cabecera").count()) === 1, "C: deslizar hacia la derecha vuelve a «Mi cuenta»");
    await deslizar(8, -220);
    ok(!(await enSeguimientos()) && (await p.locator("#perfil-cabecera").count()) === 1, "C: un gesto vertical no cambia de pestaña");
    await p.locator("#perfil-pestanas").getByText("Mis seguimientos", { exact: true }).click();
    await p.getByText("Reparaciones y Mantenimientos").waitFor({ timeout: 8000 }).catch(() => {});
    ok(await enSeguimientos(), "C: tocar la pestaña sigue funcionando");
    const anchoC = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(anchoC.a <= anchoC.p + 1, `C: al deslizar la página no se ensancha (${anchoC.a}/${anchoC.p})`);
    ok(p.errores.length === 0, `C: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // ===== D) La tabla aún no existe (migración sin aplicar): la tarjeta no sale y todo lo demás sigue igual ==========
  {
    const estado = { sinTabla: true, guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.getByText("SESIÓN ACTUAL").waitFor({ timeout: 30000 });
    await p.waitForTimeout(1500);
    ok((await p.locator("#perfil-datos").count()) === 0, "D: sin la tabla, «Mi perfil» no sale");
    ok((await p.getByText("Cerrar sesión").count()) >= 1 && (await p.getByText("Tu cuenta está activa").count()) === 1, "D: y la cuenta sale en su tarjeta de siempre («Tu cuenta está activa», sesión y «Cerrar sesión»)");
    ok(p.errores.length === 0, `D: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // ===== H) Foto de perfil (opcional) ==============================================================================
  {
    const estado = { filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 });
    await p.locator("#perfil-cabecera").click();
    await p.locator("#perfil-foto").waitFor({ timeout: 5000 });
    // Una foto PNG de 900 × 600, mitad izquierda roja y mitad derecha azul: se encuadra, se recorta y se sube como JPEG.
    const png = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 900;
      c.height = 600;
      const x = c.getContext("2d");
      x.fillStyle = "#FF0000";
      x.fillRect(0, 0, 450, 600);
      x.fillStyle = "#0000FF";
      x.fillRect(450, 0, 450, 600);
      return c.toDataURL("image/png").split(",")[1];
    });
    const elegir = async () => {
      const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.locator("#perfil-foto").click()]);
      await selector.setFiles({ name: "yo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await p.locator('#perfil-recorte [aria-label="Arrastra la foto para encuadrarla"]').waitFor({ timeout: 10000 }).catch(() => {});
    };
    await elegir();
    const ventana = await p.locator("#perfil-recorte").innerText().catch(() => "");
    ok(/Encuadra tu foto/.test(ventana) && /Usar foto/.test(ventana) && /Cancelar/.test(ventana), "H: al elegir la foto se abre «Encuadra tu foto» (con «Usar foto» y «Cancelar»)");
    ok((estado.subidas ?? []).length === 0, "H: y todavía no se ha subido nada");
    await capturar(p, "H1-encuadrar");
    // Cancelar: no sube nada.
    await p.locator("#perfil-recorte").getByText("Cancelar").click();
    await p.waitForTimeout(400);
    ok((await p.locator("#perfil-recorte").count()) === 0 && (estado.subidas ?? []).length === 0, "H: «Cancelar» cierra sin subir nada");
    // Otra vez: acercar y alejar, y arrastrar la foto hacia la derecha (se ve más de la parte roja).
    await elegir();
    const vista = p.locator('#perfil-recorte [aria-label="Arrastra la foto para encuadrarla"]');
    const anchoFoto = async () => p.evaluate(() => Math.round(document.querySelector('#perfil-recorte img')?.getBoundingClientRect().width ?? 0));
    // La ventana entra con una animación: se mide cuando la foto ya no cambia de tamaño (con el servidor cargado, medir a
    // la primera daba un tamaño a medio camino y la comprobación de «Alejar» fallaba sin motivo).
    let antes = await anchoFoto();
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(100);
      const ahora = await anchoFoto();
      if (ahora === antes && ahora > 0) break;
      antes = ahora;
    }
    await p.locator("#perfil-recorte").getByRole("button", { name: "Acercar" }).click();
    const acercada = await anchoFoto();
    ok(acercada > antes * 1.2 && Number(await p.locator('#perfil-recorte input[type="range"]').inputValue()) > 1.2, `H: «Acercar» agranda la foto (${antes} → ${acercada} px)`);
    await p.locator("#perfil-recorte").getByRole("button", { name: "Alejar" }).click();
    ok(Math.abs((await anchoFoto()) - antes) <= 2, "H: y «Alejar» la deja como estaba (no se puede alejar más que el cuadrado: nunca quedan huecos)");
    const caja = await vista.boundingBox();
    await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await p.mouse.down();
    await p.mouse.move(caja.x + caja.width / 2 + 60, caja.y + caja.height / 2, { steps: 6 });
    await p.mouse.move(caja.x + caja.width / 2 + 400, caja.y + caja.height / 2 + 300, { steps: 6 });
    await p.mouse.up();
    const sitioFoto = await p.evaluate(() => {
      const v = document.querySelector('#perfil-recorte [aria-label="Arrastra la foto para encuadrarla"]').getBoundingClientRect();
      const i = document.querySelector("#perfil-recorte img").getBoundingClientRect();
      return { izquierda: Math.round(i.left - v.left), arriba: Math.round(i.top - v.top), abajo: Math.round(i.bottom - v.bottom) };
    });
    ok(sitioFoto.izquierda === 0 && sitioFoto.arriba === 0 && sitioFoto.abajo === 0, `H: al arrastrarla se mueve, pero sin dejar huecos (se para en el borde: ${JSON.stringify(sitioFoto)})`);
    await capturar(p, "H2-encuadrada");
    await p.locator("#perfil-recorte").getByText("Usar foto").click();
    await p.getByText("Toca la foto para cambiarla").waitFor({ timeout: 15000 }).catch(() => {});
    const subida = (estado.subidas ?? [])[0];
    ok(!!subida && new RegExp(`^avatares/${CLIENTE.id}/\\d+\\.jpg$`).test(subida.ruta) && subida.tipo === "image/jpeg", `H: «Usar foto» la sube recortada en JPEG a la carpeta del cliente (${JSON.stringify(subida ? { ruta: subida.ruta, tipo: subida.tipo } : null)})`);
    // Lo que se ha subido: cuadrado de 320 px con el encuadre elegido (izquierda y centro rojos, borde derecho azul).
    const recorte = subida?.jpeg
      ? await p.evaluate(async (b64) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
          const c = document.createElement("canvas");
          c.width = bmp.width;
          c.height = bmp.height;
          const x = c.getContext("2d");
          x.drawImage(bmp, 0, 0);
          const color = (u, v) => {
            const [r, , b] = x.getImageData(Math.round(u), Math.round(v), 1, 1).data;
            return r > 150 && b < 100 ? "rojo" : b > 150 && r < 100 ? "azul" : `otro(${r},${b})`;
          };
          return { ancho: bmp.width, alto: bmp.height, izquierda: color(6, bmp.height / 2), centro: color(bmp.width / 2, bmp.height / 2), derecha: color(bmp.width - 6, bmp.height / 2) };
        }, subida.jpeg)
      : null;
    ok(!!recorte && recorte.ancho === 320 && recorte.alto === 320, `H: la foto subida es un cuadrado de 320 × 320 px (${recorte ? `${recorte.ancho} × ${recorte.alto}` : "sin foto"})`);
    ok(!!recorte && recorte.izquierda === "rojo" && recorte.centro === "rojo" && recorte.derecha === "azul", `H: y es justo el encuadre elegido (izquierda ${recorte?.izquierda}, centro ${recorte?.centro}, derecha ${recorte?.derecha})`);
    ok((await p.getByText("Toca la foto para cambiarla").count()) === 1 && (await p.getByText("Quitar foto").count()) === 1, "H: con foto dice «Toca la foto para cambiarla» y ofrece «Quitar foto»");
    await p.getByRole("button", { name: "Guardar perfil" }).click();
    await p.waitForFunction(() => /Perfil guardado/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const g = estado.guardados.at(-1)?.cuerpo;
    ok(!!g && new RegExp(`/storage/v1/object/public/avatares/${CLIENTE.id}/\\d+\\.jpg$`).test(g.foto_url ?? ""), `H: al guardar, la foto va en foto_url (${g?.foto_url})`);
    ok(estado.cuenta?.data?.avatar_url === g?.foto_url, "H: y en los datos de la cuenta (avatar_url)");
    await capturar(p, "H3-perfil-foto");
    await p.waitForTimeout(300);
    if ((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) !== "true") await p.locator("#perfil-cabecera").click();
    await p.getByText("Quitar foto").click();
    await p.getByRole("button", { name: "Guardar perfil" }).click();
    await p.waitForTimeout(1200);
    ok(estado.guardados.at(-1)?.cuerpo.foto_url === null, "H: «Quitar foto» y guardar la deja sin foto (foto_url vacío)");
    ok(p.errores.length === 0, `H: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // ===== I) Foro: el usuario y la foto de «Mi perfil» de quien escribe ===========================================
  {
    const ANA = "22222222-2222-4222-8222-222222222222";
    const LUIS = "33333333-3333-4333-8333-333333333333";
    const mensaje = (id, user_id, display_name, username, body, minuto) => ({ id, created_at: `2026-10-30T18:${minuto}:00Z`, user_id, username, display_name, role: "member", body, reply_to_id: null });
    const MENSAJES = [
      mensaje("m1000000-0000-4000-8000-000000000001", CLIENTE.id, "Daniel García López", "cliente", "¿Alguien tiene la Switch OLED?", "03"),
      mensaje("m2000000-0000-4000-8000-000000000002", ANA, "Ana Pérez Gil", "ana", "Yo la compré aquí, va genial", "02"),
      mensaje("m3000000-0000-4000-8000-000000000003", LUIS, "Luis Romero", "luis", "Buenas a todos", "01"),
    ];
    const PERFIL_COMPLETO = [{ user_id: CLIENTE.id, nombre: "Daniel García López", usuario: "dani_zgz", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "2003-08-19" }];
    const FOTO_DANI = `https://fotos.ejemplo.invalid/storage/v1/object/public/avatares/${CLIENTE.id}/1.jpg`;
    const estado = {
      filas: PERFIL_COMPLETO,
      guardados: [],
      mensajes: MENSAJES,
      perfilesForo: [{ user_id: CLIENTE.id, usuario: "dani_zgz", foto_url: FOTO_DANI }, { user_id: ANA, usuario: "ana_g", foto_url: null }],
    };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/chat-global?tab=chat");
    await p.getByText("Buenas a todos").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForFunction(() => /dani_zgz/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
    const t = await p.evaluate(() => document.body.innerText);
    ok(t.includes("dani_zgz") && t.includes("ana_g"), "I: en el Foro cada mensaje enseña el usuario de «Mi perfil» de quien escribe");
    ok(!t.includes("Daniel García López") && !t.includes("Ana Pérez Gil"), "I: y ya no su nombre y apellidos");
    ok(t.includes("Luis Romero"), "I: quien aún no tiene usuario sigue saliendo con su nombre");
    ok((await p.locator('img[alt="Foto de dani_zgz"]').count()) >= 1, "I: con su foto de perfil al lado del usuario");
    ok((await p.locator('img[alt="Foto de ana_g"]').count()) === 0, "I: quien no tiene foto sigue con la inicial");
    const pedidos = (estado.pedidosPerfilesForo ?? []).flatMap((b) => b.ids ?? []);
    ok([CLIENTE.id, ANA, LUIS].every((id) => pedidos.includes(id)) && (estado.pedidosPerfilesForo ?? []).length <= 2, `I: lo pide de una vez para quienes han escrito (${(estado.pedidosPerfilesForo ?? []).length} peticiones)`);
    ok(p.errores.length === 0, `I: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await capturar(p, "I1-foro-usuario-foto");
    await ctx.close();

    // Sin la función (migración sin aplicar): el Foro sigue como antes.
    const estado2 = { filas: PERFIL_COMPLETO, guardados: [], mensajes: MENSAJES };
    const ctx2 = await contexto(navegador, CLIENTE, "user", estado2);
    const p2 = await pagina(ctx2, "/chat-global?tab=chat");
    await p2.getByText("Buenas a todos").waitFor({ timeout: 30000 }).catch(() => {});
    await p2.waitForTimeout(1500);
    const t2 = await p2.evaluate(() => document.body.innerText);
    ok(t2.includes("Daniel García López") && t2.includes("Ana Pérez Gil") && t2.includes("Luis Romero"), "I: sin la función de la base de datos, el Foro sigue enseñando el nombre como antes");
    ok(p2.errores.length === 0, `I: y sin errores de JavaScript (${p2.errores.length}${p2.errores[0] ? ": " + p2.errores[0] : ""})`);
    await ctx2.close();
  }

  // ===== J) Foro: un administrador elimina mensajes y comentarios de noticias ====================================
  {
    const ANA = "22222222-2222-4222-8222-222222222222";
    const LUIS = "33333333-3333-4333-8333-333333333333";
    const NOTICIA = "abcd1111-0000-4000-8000-000000000001";
    const mensaje = (id, user_id, display_name, body, minuto) => ({ id, created_at: `2026-10-30T18:${minuto}:00Z`, user_id, username: "x", display_name, role: "member", body, reply_to_id: null });
    const M_LUIS = "m3000000-0000-4000-8000-000000000003";
    const M_ANA = "m2000000-0000-4000-8000-000000000002";
    const datosForo = (uid) => ({
      filas: [{ user_id: uid, nombre: "Persona de Prueba", usuario: "persona_prueba", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02" }],
      guardados: [],
      mensajes: [mensaje(M_LUIS, LUIS, "Luis Romero", "Buenas a todos", "01"), mensaje(M_ANA, ANA, "Ana Pérez Gil", "Yo la compré aquí, va genial", "02")],
      noticias: [
        {
          id: NOTICIA, fuente: "Prueba", titulo: "Noticia de prueba del Foro", imagen_url: null, categoria: "Consolas", resumen: "Resumen de prueba.",
          puntos_clave: [], datos: [], por_que_importa: null, afecta_a: null, publicada_en: "2026-10-30T18:00:00Z", created_at: "2026-10-30T18:00:00Z",
          imagenes: [], imagenes_verificadas: false, imagenes_meta: [], me_gusta: 0,
        },
      ],
      comentarios: [{ id: "c1000000-0000-4000-8000-000000000001", noticia_id: NOTICIA, created_at: "2026-10-30T18:05:00Z", autor: "Luis Romero", texto: "Comentario que sobra" }],
    });
    // Toca un mensaje (un toque abre el selector de reacciones; el doble toque es responder).
    const tocarMensaje = async (p, texto) => {
      await p.getByText(texto, { exact: true }).click();
      await p.waitForTimeout(500);
    };

    const estado = datosForo(ADMIN.id);
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/chat-global?tab=chat");
    await p.getByText("Buenas a todos").waitFor({ timeout: 30000 }).catch(() => {});
    await tocarMensaje(p, "Buenas a todos");
    const papelera = p.getByRole("button", { name: "Eliminar mensaje" });
    ok((await papelera.count()) === 1, "J: un administrador, al tocar un mensaje, tiene «Eliminar mensaje» junto a las reacciones");
    const alto = await papelera.boundingBox();
    ok(!!alto && alto.height >= 32, `J: la papelera se toca bien (${alto ? Math.round(alto.height) : "—"} px + margen de toque)`);
    await capturar(p, "J1-foro-admin-papelera");
    await papelera.click();
    const ventana = p.locator("#foro-confirmar-eliminar");
    await ventana.waitFor({ timeout: 5000 }).catch(() => {});
    const tv = await ventana.innerText().catch(() => "");
    ok(/¿Eliminar este mensaje\?/.test(tv) && /Luis Romero/.test(tv) && /Buenas a todos/.test(tv) && /No se puede deshacer/.test(tv), "J: antes de borrar pide confirmación y enseña quién lo escribió y qué dice");
    await p.waitForTimeout(500); // (la ventana entra con un fundido)
    await capturar(p, "J2-foro-confirmar");
    await ventana.getByText("Cancelar", { exact: true }).click();
    await p.waitForTimeout(400);
    ok((await ventana.count()) === 0 && !(estado.borrados ?? []).length && (await p.getByText("Buenas a todos", { exact: true }).count()) === 1, "J: «Cancelar» no borra nada");

    await tocarMensaje(p, "Buenas a todos");
    await p.getByRole("button", { name: "Eliminar mensaje" }).click();
    await ventana.getByText("Eliminar", { exact: true }).click();
    await p.waitForFunction(() => !document.getElementById("foro-confirmar-eliminar"), null, { timeout: 10000 }).catch(() => {});
    ok((estado.borrados ?? []).includes(M_LUIS), `J: «Eliminar» lo borra en la base de datos (${JSON.stringify(estado.borrados ?? [])})`);
    ok((await p.getByText("Buenas a todos", { exact: true }).count()) === 0 && (await p.getByText("Yo la compré aquí, va genial").count()) === 1, "J: el mensaje desaparece del Foro y los demás siguen");

    // Si la base de datos no lo permite (no es administrador de verdad o ya no existía), se dice y el mensaje se queda.
    estado.borrarSinPermiso = true;
    await tocarMensaje(p, "Yo la compré aquí, va genial");
    await p.getByRole("button", { name: "Eliminar mensaje" }).click();
    await ventana.getByText("Eliminar", { exact: true }).click();
    await p.getByText("No se ha podido eliminar el mensaje. Inténtalo de nuevo.").waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText("No se ha podido eliminar el mensaje. Inténtalo de nuevo.").count()) === 1, "J: si la base de datos no lo permite, lo dice");
    await ventana.getByText("Cancelar", { exact: true }).click();
    await p.waitForTimeout(300);
    ok((await p.getByText("Yo la compré aquí, va genial").count()) === 1, "J: y el mensaje se queda");
    // (el aviso «Error eliminando el mensaje» de la consola es el del rechazo provocado arriba)
    const erroresJ = p.errores.filter((e) => !/Error eliminando el mensaje/.test(e));
    ok(erroresJ.length === 0, `J: sin errores de JavaScript inesperados (${erroresJ.length}${erroresJ[0] ? ": " + erroresJ[0] : ""})`);

    // Comentarios de una noticia.
    const n = await pagina(ctx, "/chat-global?tab=news");
    await n.getByText("Noticia de prueba del Foro").waitFor({ timeout: 30000 }).catch(() => {});
    await n.getByRole("button", { name: "Comentarios", exact: true }).first().click();
    await n.getByText("Comentario que sobra").waitFor({ timeout: 10000 }).catch(() => {});
    const papeleraComentario = n.getByRole("button", { name: "Eliminar comentario" });
    ok((await papeleraComentario.count()) === 1, "J: en los comentarios de una noticia, el administrador tiene «Eliminar comentario»");
    await papeleraComentario.click();
    const ventanaN = n.locator("#foro-confirmar-eliminar");
    await ventanaN.waitFor({ timeout: 5000 }).catch(() => {});
    ok(/¿Eliminar este comentario\?/.test(await ventanaN.innerText().catch(() => "")), "J: también pide confirmación");
    await ventanaN.getByText("Eliminar", { exact: true }).click();
    await n.waitForFunction(() => !document.getElementById("foro-confirmar-eliminar"), null, { timeout: 10000 }).catch(() => {});
    const oculto = (estado.ocultados ?? [])[0];
    ok(!!oculto && oculto.id === "c1000000-0000-4000-8000-000000000001" && oculto.cuerpo.oculto === true, `J: el comentario se marca oculto en la base de datos (${JSON.stringify(oculto ?? null)})`);
    ok((await n.getByText("Comentario que sobra").count()) === 0, "J: y desaparece de la noticia");
    ok(n.errores.length === 0, `J: sin errores de JavaScript en las noticias (${n.errores.length}${n.errores[0] ? ": " + n.errores[0] : ""})`);
    await capturar(n, "J3-noticia-sin-comentario");
    await ctx.close();

    // Un cliente (no administrador) no ve ninguna papelera.
    const estadoC = datosForo(CLIENTE.id);
    const ctxC = await contexto(navegador, CLIENTE, "user", estadoC);
    const c = await pagina(ctxC, "/chat-global?tab=chat");
    await c.getByText("Buenas a todos").waitFor({ timeout: 30000 }).catch(() => {});
    await tocarMensaje(c, "Buenas a todos");
    ok((await c.getByText("👍").count()) >= 1 && (await c.getByRole("button", { name: "Eliminar mensaje" }).count()) === 0, "J: un cliente, al tocar un mensaje, solo ve las reacciones (sin «Eliminar mensaje»)");
    const cn = await pagina(ctxC, "/chat-global?tab=news");
    await cn.getByText("Noticia de prueba del Foro").waitFor({ timeout: 30000 }).catch(() => {});
    await cn.getByRole("button", { name: "Comentarios", exact: true }).first().click();
    await cn.getByText("Comentario que sobra").waitFor({ timeout: 10000 }).catch(() => {});
    ok((await cn.getByText("Comentario que sobra").count()) === 1 && (await cn.getByRole("button", { name: "Eliminar comentario" }).count()) === 0, "J: ni en los comentarios de las noticias");
    await ctxC.close();
  }

  // ===== L) Foro, parte 2: «Silenciar usuario», la persona silenciada, y usuario y foto en comentarios y reseñas ======
  {
    const ANA = "22222222-2222-4222-8222-222222222222";
    const NOTICIA = "abcd1111-0000-4000-8000-000000000002";
    const FOTO_ANA = `https://fotos.ejemplo.invalid/storage/v1/object/public/avatares/${ANA}/1.jpg`;
    const mensaje = (id, user_id, display_name, body, minuto, role = "member") => ({ id, created_at: `2026-10-30T18:${minuto}:00Z`, user_id, username: "x", display_name, role, body, reply_to_id: null });
    const base = (uid, extra = {}) => ({
      filas: [{ user_id: uid, nombre: "Persona de Prueba", usuario: "persona_prueba", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02" }],
      guardados: [],
      mensajes: [
        mensaje("m2000000-0000-4000-8000-000000000002", ANA, "Ana Pérez Gil", "Mensaje de Ana", "01"),
        mensaje("m9000000-0000-4000-8000-000000000009", ADMIN.id, "Tienda", "Mensaje de la tienda", "02", "admin"),
      ],
      perfilesForo: [{ user_id: ANA, usuario: "ana_g", foto_url: FOTO_ANA }],
      noticias: [
        {
          id: NOTICIA, fuente: "Prueba", titulo: "Noticia con comentarios", imagen_url: null, categoria: "Consolas", resumen: "Resumen.",
          puntos_clave: [], datos: [], por_que_importa: null, afecta_a: null, publicada_en: "2026-10-30T18:00:00Z", created_at: "2026-10-30T18:00:00Z",
          imagenes: [], imagenes_verificadas: false, imagenes_meta: [], me_gusta: 0,
        },
      ],
      comentarios: [{ id: "c2000000-0000-4000-8000-000000000002", noticia_id: NOTICIA, user_id: ANA, created_at: "2026-10-30T18:05:00Z", autor: "Ana Pérez Gil", texto: "Muy buena noticia" }],
      ...extra,
    });
    const tocarMensaje = async (p, texto) => {
      await p.getByText(texto, { exact: true }).click();
      await p.waitForTimeout(500);
    };

    // L1: el administrador silencia a Ana 7 días con un motivo.
    const estado = base(ADMIN.id, { silencios: [] });
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/chat-global?tab=chat");
    await p.getByText("Mensaje de Ana").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    await tocarMensaje(p, "Mensaje de Ana");
    ok((await p.getByRole("button", { name: "Silenciar a esta persona" }).count()) === 1, "L: el administrador, al tocar el mensaje de un cliente, tiene «Silenciar a esta persona»");
    await p.getByRole("button", { name: "Silenciar a esta persona" }).click();
    const v = p.locator("#foro-silenciar");
    await v.waitFor({ timeout: 5000 }).catch(() => {});
    ok(/Silenciar a ana_g/.test(await v.innerText().catch(() => "")), "L: la ventana dice a quién (su usuario)");
    await v.getByRole("button", { name: "7 días" }).click();
    await v.getByLabel("Motivo del silencio").fill("Insultos repetidos");
    await p.waitForTimeout(400);
    await capturar(p, "L1-silenciar");
    await v.getByRole("button", { name: "Silenciar", exact: true }).click();
    await v.getByText(/no podrá escribir en el Foro/).waitFor({ timeout: 8000 }).catch(() => {});
    const escrito = (estado.silenciosEscritos ?? [])[0];
    const dias = escrito ? (new Date(escrito.cuerpo.hasta).getTime() - Date.now()) / 86400000 : 0;
    ok(!!escrito && escrito.id === ANA && Math.abs(dias - 7) < 0.1 && escrito.cuerpo.motivo === "Insultos repetidos" && /merge-duplicates/.test(escrito.prefer), `L: guarda el silencio de 7 días con su motivo (si ya tenía uno, lo cambia) (${JSON.stringify(escrito?.cuerpo ?? null)})`);
    ok((await v.getByText(/ana_g no podrá escribir en el Foro ni comentar noticias hasta el/).count()) === 1, "L: y confirma hasta cuándo");
    await v.getByRole("button", { name: "Cerrar" }).click();
    await tocarMensaje(p, "Mensaje de la tienda");
    ok((await p.getByRole("button", { name: "Eliminar mensaje" }).count()) === 1 && (await p.getByRole("button", { name: "Silenciar a esta persona" }).count()) === 0, "L: a un administrador no se le puede silenciar (no sale el botón)");
    ok(p.errores.length === 0, `L: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();

    // L2: sin la migración (sin tabla de silencios) no sale «Silenciar».
    const ctx2 = await contexto(navegador, ADMIN, "admin", base(ADMIN.id));
    const p2 = await pagina(ctx2, "/chat-global?tab=chat");
    await p2.getByText("Mensaje de Ana").waitFor({ timeout: 30000 }).catch(() => {});
    await p2.waitForTimeout(800);
    await tocarMensaje(p2, "Mensaje de Ana");
    ok((await p2.getByRole("button", { name: "Eliminar mensaje" }).count()) === 1 && (await p2.getByRole("button", { name: "Silenciar a esta persona" }).count()) === 0, "L: sin la base de datos de silencios, no se ofrece «Silenciar» (eliminar sí)");
    await ctx2.close();

    // L3: la persona silenciada lo ve junto al cuadro de escribir y no puede enviar.
    const hasta = new Date(Date.now() + 3 * 86400000).toISOString();
    const estado3 = base(CLIENTE.id, { silencios: [{ user_id: CLIENTE.id, hasta, motivo: "spam" }] });
    const ctx3 = await contexto(navegador, CLIENTE, "user", estado3);
    const p3 = await pagina(ctx3, "/chat-global?tab=chat");
    await p3.getByText(/te ha silenciado en el Foro hasta el/).waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p3.getByText(/Un administrador te ha silenciado en el Foro hasta el .*: hasta entonces no puedes escribir ni comentar noticias\./).count()) === 1, "L: la persona silenciada ve junto al cuadro de escribir hasta cuándo no puede escribir");
    await p3.getByPlaceholder("Escribe un mensaje…").fill("Hola a todos otra vez");
    await p3.getByRole("button", { name: "Enviar mensaje" }).click();
    await p3.waitForTimeout(800);
    ok(!(estado3.mensajesEnviados ?? []).length, "L: y si lo intenta, no se envía nada");
    ok(!/silenciado/i.test(JSON.stringify(estado3.mensajesEnviados ?? [])) && (await p3.getByText(/te ha silenciado/).count()) === 1, "L: el aviso sigue a la vista");
    const enlaceNormas = p3.getByRole("link", { name: "Leer las normas del Foro" });
    const altoEnlace = await enlaceNormas.boundingBox().then((b) => Math.round(b?.height ?? 0), () => 0);
    ok((await enlaceNormas.count()) === 1 && altoEnlace >= 44, `L: junto al aviso sale «Leer las normas del Foro», que se toca bien (${altoEnlace} px)`);
    await capturar(p3, "L3-silenciado");
    await enlaceNormas.click();
    await p3.waitForURL(/\/politicas\/normas-foro$/, { timeout: 15000 }).catch(() => {});
    await p3.getByText("Si no se cumplen").waitFor({ timeout: 15000 }).catch(() => {});
    const normas = (await p3.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/\/politicas\/normas-foro$/.test(p3.url()) && /Normas del Foro/.test(normas) && /Respeto ante todo/.test(normas) && /silenciar a una persona durante unos días \(1, 3 o 7\)/.test(normas), `L: el enlace abre las Normas del Foro, que explican por qué y qué pasa (${p3.url()})`);
    await capturar(p3, "L3-normas-foro");
    ok(p3.errores.length === 0, `L: sin errores de JavaScript en las normas (${p3.errores.length}${p3.errores[0] ? ": " + p3.errores[0] : ""})`);
    await ctx3.close();

    // L4: si la base de datos lo rechaza (silenciado desde otro dispositivo), se explica.
    const estado4 = base(CLIENTE.id, { silencios: [], bloqueoForo: true });
    const ctx4 = await contexto(navegador, CLIENTE, "user", estado4);
    const p4 = await pagina(ctx4, "/chat-global?tab=chat");
    await p4.getByText("Mensaje de Ana").waitFor({ timeout: 30000 }).catch(() => {});
    await p4.getByPlaceholder("Escribe un mensaje…").fill("Hola a todos otra vez");
    await p4.getByRole("button", { name: "Enviar mensaje" }).click();
    await p4.getByText(/no puedes escribir en el Foro/).waitFor({ timeout: 8000 }).catch(() => {});
    ok((estado4.mensajesEnviados ?? []).length === 1 && (await p4.getByText("Ahora mismo no puedes escribir en el Foro: un administrador te ha silenciado durante unos días.").count()) === 1, "L: si la base de datos lo rechaza, dice que está silenciado (no un error raro)");
    ok((await p4.getByRole("link", { name: "Leer las normas del Foro" }).count()) === 1, "L: y también enlaza a las Normas del Foro");
    await ctx4.close();

    // L5: usuario y foto en los comentarios de las noticias…
    const estado5 = base(CLIENTE.id, { silencios: [] });
    const ctx5 = await contexto(navegador, CLIENTE, "user", estado5);
    const n = await pagina(ctx5, "/chat-global?tab=news");
    await n.getByText("Noticia con comentarios").waitFor({ timeout: 30000 }).catch(() => {});
    await n.getByRole("button", { name: "Comentarios", exact: true }).first().click();
    await n.getByText("Muy buena noticia").waitFor({ timeout: 10000 }).catch(() => {});
    await n.waitForTimeout(800);
    const tc = await n.evaluate(() => document.body.innerText);
    ok(tc.includes("ana_g") && !tc.includes("Ana Pérez Gil") && (await n.locator('img[alt="Foto de ana_g"]').count()) >= 1, "L: los comentarios de las noticias enseñan el usuario y la foto de quien comenta (no su nombre y apellidos)");
    await capturar(n, "L5-comentario-usuario");
    // …y en las reseñas de la tienda (Inicio).
    estado5.resenas = [{ id: "r1", created_at: "2026-10-29T10:00:00Z", user_id: ANA, display_name: "Ana Pérez Gil", rating: 5, comment: "Todo perfecto" }];
    const i = await pagina(ctx5, "/");
    await i.getByText("Todo perfecto", { exact: false }).first().waitFor({ timeout: 40000 }).catch(() => {});
    await i.waitForTimeout(1000);
    const ti = await i.evaluate(() => document.body.innerText);
    ok(ti.includes("ana_g") && !ti.includes("Ana Pérez Gil") && (await i.locator('img[alt="Foto de ana_g"]').count()) >= 1, "L: las reseñas de la tienda también enseñan el usuario y la foto");
    ok(i.errores.length === 0 && n.errores.length === 0, `L: sin errores de JavaScript (${i.errores[0] ?? n.errores[0] ?? 0})`);
    await ctx5.close();
  }

  // ===== M) Administración: moderación del Foro y silenciados (Usuarios y ficha del cliente) =====================
  // (se ejecuta después de la sección E, que es donde se definen los usuarios de prueba U y sus perfiles)
  const seccionM = async () => {
    const hasta = new Date(Date.now() + 2 * 86400000).toISOString();
    const reciente = new Date(Date.now() - 86400000).toISOString();
    const estado = {
      usuarios: U,
      filas: PERFILES,
      guardados: [],
      silencios: [{ user_id: U[1].user_id, hasta, motivo: "Spam" }],
      moderacion: [
        { id: "x1", created_at: reciente, accion: "mensaje_eliminado", user_id: U[0].user_id, detalle: "compra aquí barato" },
        { id: "x2", created_at: reciente, accion: "mensaje_eliminado", user_id: U[1].user_id, detalle: "spam" },
        { id: "x3", created_at: reciente, accion: "comentario_eliminado", user_id: U[1].user_id, detalle: "otro spam" },
        { id: "x4", created_at: reciente, accion: "silenciado", user_id: U[1].user_id, detalle: "Hasta el 02/11/2026 12:00 · Spam" },
      ],
      // Ana abrió las normas desde el aviso dos veces (cuenta como una persona).
      eventos: [
        { event_name: "foro_normas_abiertas", user_id: U[1].user_id, session_id: "s2", metadata: { desde: "foro" } },
        { event_name: "foro_normas_abiertas", user_id: U[1].user_id, session_id: "s2", metadata: { desde: "comentarios" } },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-foro-moderacion").waitFor({ timeout: 40000 }).catch(() => {});
    const linea = (await p.locator("#admin-foro-moderacion").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Moderación del Foro \(30 días\) · mensajes eliminados: 2 · comentarios eliminados: 1 · silencios: 1 · silenciados ahora: 1/.test(linea), `M: Usuarios cuenta la moderación con el registro de la base de datos (${linea})`);
    ok(/leyeron las normas desde el aviso: 1/.test(linea), `M: y cuántas personas abrieron las Normas del Foro desde el aviso (${linea})`);
    ok((await p.getByRole("link", { name: "Ver o editar las Normas del Foro" }).count()) === 1, "M: con un acceso para ver o editar las Normas del Foro (Políticas)");
    const lista = (await p.locator("#admin-silenciados").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Silenciados en el Foro/.test(lista) && /@ana_g/.test(lista) && /Spam/.test(lista), `M: y la lista de silenciados (quién, hasta cuándo y por qué) (${lista.slice(0, 120)})`);
    await capturar(p, "M1-admin-moderacion");
    await p.getByRole("button", { name: "Quitar el silencio de @ana_g" }).click();
    await p.waitForTimeout(800);
    const quita = (estado.silenciosEscritos ?? []).find((s) => s.metodo === "PATCH");
    ok(!!quita && quita.id === U[1].user_id && Math.abs(new Date(quita.cuerpo.hasta).getTime() - Date.now()) < 60000, `M: «Quitar silencio» lo termina ahora mismo (${JSON.stringify(quita?.cuerpo ?? null)})`);
    ok((await p.locator("#admin-silenciados").count()) === 0, "M: y desaparece de la lista");
    ok(p.errores.length === 0, `M: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);

    // Ficha del cliente: su Foro (historial y silenciar desde aquí).
    const f = await pagina(ctx, `/admin/cliente/${U[0].user_id}?email=dani%40example.com&createdAt=2026-10-01T10%3A00%3A00Z`);
    await f.locator("#ficha-foro").waitFor({ timeout: 40000 }).catch(() => {});
    const tf = (await f.locator("#ficha-foro").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Puede escribir en el Foro/.test(tf) && /Mensaje del Foro eliminado/.test(tf) && /compra aquí barato/.test(tf), `M: la ficha enseña su historial de moderación (${tf.slice(0, 140)})`);
    await f.locator("#ficha-foro").getByRole("button", { name: "3 días" }).click();
    await f.getByText(/Silenciado hasta el/).first().waitFor({ timeout: 8000 }).catch(() => {});
    const desdeFicha = (estado.silenciosEscritos ?? []).filter((s) => s.id === U[0].user_id).at(-1);
    const dias = desdeFicha ? (new Date(desdeFicha.cuerpo.hasta).getTime() - Date.now()) / 86400000 : 0;
    ok(!!desdeFicha && Math.abs(dias - 3) < 0.1, `M: desde la ficha se le silencia 3 días (${JSON.stringify(desdeFicha?.cuerpo ?? null)})`);
    ok((await f.locator("#ficha-foro").getByRole("button", { name: "Quitar silencio" }).count()) === 1, "M: y luego sale «Quitar silencio»");
    await capturar(f, "M2-ficha-foro");
    ok(f.errores.length === 0, `M: la ficha sin errores de JavaScript (${f.errores.length}${f.errores[0] ? ": " + f.errores[0] : ""})`);
    await ctx.close();
  };

  // ===== G) «Completa tu perfil» (obligatorio) ====================================================================
  {
    // G1: perfil a medias (lo del registro) en Inicio: la pantalla tapa la tienda hasta guardarlo completo.
    const estado = { filas: [], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#perfil-obligatorio").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.locator("#perfil-obligatorio").count()) === 1, "G: con sesión y el perfil a medias, en Inicio sale «Completa tu perfil»");
    const t = await p.locator("#perfil-obligatorio").innerText();
    ok(/Completa tu perfil/.test(t) && /La foto es opcional/.test(t) && /Cómo tratamos tus datos/.test(t) && /Cerrar sesión/.test(t), "G: título, «La foto es opcional», enlace a la política y «Cerrar sesión»");
    const seguir = p.getByRole("button", { name: "Guardar y continuar" });
    ok((await seguir.getAttribute("aria-disabled")) === "true", "G: «Guardar y continuar» está desactivado mientras falte algo obligatorio");
    ok((await p.locator('#perfil-obligatorio [aria-label="Deshacer los cambios"]').count()) === 0 && (await p.locator("#perfil-obligatorio #perfil-cabecera").count()) === 0, "G: sin «Deshacer» ni cabecera plegable (no se puede esconder)");
    await capturar(p, "G1-completa-tu-perfil");
    await p.locator('#perfil-obligatorio select[aria-label="Provincia"]').selectOption("Zaragoza");
    await p.locator('#perfil-obligatorio input[aria-label="Fecha de nacimiento"]').fill("2003-08-19");
    await p.waitForTimeout(300);
    ok((await seguir.getAttribute("aria-disabled")) !== "true", "G: con todo lo obligatorio (sin foto) se puede continuar");
    await seguir.click();
    await p.waitForFunction(() => !document.getElementById("perfil-obligatorio"), null, { timeout: 10000 }).catch(() => {});
    const g = estado.guardados.at(-1)?.cuerpo;
    ok(!!g && g.usuario === "dani" && g.nombre === "Dani" && g.pais === "España" && g.provincia === "Zaragoza" && g.fecha_nacimiento === "2003-08-19", `G: guarda el perfil completo (${JSON.stringify(g ?? null)})`);
    ok((await p.locator("#perfil-obligatorio").count()) === 0, "G: al guardarlo completo, la pantalla desaparece y se sigue en la tienda");
    ok(p.errores.length === 0, `G: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
  {
    // G2: mientras está abierta Blue no se ve; «Cerrar sesión» la quita.
    const estado = { filas: [], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/catalogo");
    await p.locator("#perfil-obligatorio").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.locator("#perfil-obligatorio").count()) === 1, "G: también en el catálogo (en cualquier pantalla de la tienda)");
    await p.waitForTimeout(11500);
    ok((await p.locator("#blue-flotante").count()) === 0, "G: pasados 10 s, Blue no aparece encima");
    await p.getByText("Cerrar sesión").click();
    await p.waitForFunction(() => !document.getElementById("perfil-obligatorio"), null, { timeout: 10000 }).catch(() => {});
    ok(estado.salio === true && (await p.locator("#perfil-obligatorio").count()) === 0, "G: «Cerrar sesión» cierra la sesión y la pantalla desaparece");
    await ctx.close();
  }
  for (const [nombre, ruta, estado] of [
    ["en las políticas (se pueden leer antes de dar los datos)", "/politicas/privacidad", { filas: [], guardados: [] }],
    ["con el perfil completo", "/", { filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }], guardados: [] }],
    ["sin la tabla (migración sin aplicar)", "/", { sinTabla: true, guardados: [] }],
  ]) {
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, ruta);
    await p.waitForTimeout(4000);
    ok((await p.locator("#perfil-obligatorio").count()) === 0, `G: NO sale ${nombre}`);
    ok(p.errores.length === 0, `G: sin errores de JavaScript ${nombre} (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
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
    { user_id: U[0].user_id, nombre: "Dani", usuario: "dani", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "2003-08-19", foto_url: "https://fotos.ejemplo.invalid/storage/v1/object/public/avatares/u1/1.jpg", updated_at: "2026-10-30T18:00:00Z" },
    { user_id: U[1].user_id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" },
    { user_id: U[2].user_id, nombre: "", usuario: "", pais: "Francia", provincia: "Zaragoza", fecha_nacimiento: null },
  ];
  // Analítica propia de «Completa tu perfil»: Luis y el de sin perfil la vieron (este, dos veces), Dani la completó y el
  // de sin perfil cerró sesión.
  const EVENTOS = [
    { event_name: "perfil_obligatorio_visto", user_id: U[2].user_id, session_id: "s3" },
    { event_name: "perfil_obligatorio_visto", user_id: U[3].user_id, session_id: "s4" },
    { event_name: "perfil_obligatorio_visto", user_id: U[3].user_id, session_id: "s4" },
    { event_name: "perfil_guardado", user_id: U[0].user_id, session_id: "s1" },
    { event_name: "perfil_obligatorio_salir", user_id: U[3].user_id, session_id: "s4" },
    // Foto de perfil: Dani la encuadró y Ana dejó el recorte dos veces (cuenta como una persona).
    { event_name: "perfil_foto_encuadrada", user_id: U[0].user_id, session_id: "s1" },
    { event_name: "perfil_foto_cancelada", user_id: U[1].user_id, session_id: "s2" },
    { event_name: "perfil_foto_cancelada", user_id: U[1].user_id, session_id: "s2" },
    // «Mis seguimientos»: Dani lo abrió dos veces (una deslizando) y Ana una tocando la pestaña.
    { event_name: "seguimientos_abiertos", user_id: U[0].user_id, session_id: "s1", metadata: { como: "deslizar" } },
    { event_name: "seguimientos_abiertos", user_id: U[0].user_id, session_id: "s1", metadata: { como: "tocar" } },
    { event_name: "seguimientos_abiertos", user_id: U[1].user_id, session_id: "s2", metadata: { como: "tocar" } },
  ];
  {
    const estado = {
      usuarios: U,
      filas: PERFILES,
      guardados: [],
      eventos: EVENTOS,
      comentariosOcultos: 3,
      // Ficha de Dani: un pedido con su cuenta, otro sin sesión con su correo (en otras mayúsculas) y uno de otra persona.
      pedidosFicha: [
        { id: "p1000000-0000-4000-8000-000000000001", numero: 12, created_at: "2026-10-29T10:00:00Z", estado: "confirmado", entrega: "envio", total_eur: 155, user_id: U[0].user_id, email: "dani@example.com", pedido_items: [{ id: "i1", titulo: "PlayStation 5", precio_eur: 155 }] },
        { id: "p2000000-0000-4000-8000-000000000002", numero: 15, created_at: "2026-10-30T10:00:00Z", estado: "pendiente", entrega: "recogida", total_eur: 30, user_id: null, email: "Dani@Example.com", pedido_items: [{ id: "i2", titulo: "Mando DualSense", precio_eur: 30 }] },
        { id: "p3000000-0000-4000-8000-000000000003", numero: 20, created_at: "2026-10-30T11:00:00Z", estado: "pendiente", entrega: "envio", total_eur: 99, user_id: null, email: "otra@example.com", pedido_items: [] },
      ],
      serviciosFicha: [
        { id: "s1000000-0000-4000-8000-000000000001", created_at: "2026-10-28T10:00:00Z", service_title: "Reparación de mando", status: "nuevo", ciudad: "Zaragoza", seguimiento: "recibido", seguimiento_nota: null, seguimiento_actualizado: null },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-perfiles").waitFor({ timeout: 40000 });
    ok((await p.locator("#perfil-obligatorio").count()) === 0, "E: en el panel de administración no se exige el perfil de cliente");
    const moderacion = (await p.locator("#admin-foro-moderacion").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Moderación del Foro · comentarios de noticias eliminados: 3/.test(moderacion) && !/mensajes eliminados/.test(moderacion), `E: «Moderación del Foro» cuenta los comentarios eliminados con datos de la base de datos (no con la analítica, que no cuenta al administrador) (${moderacion})`);
    const uso = (await p.locator("#admin-uso-seguimientos").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/«Mis seguimientos» \(30 días\): lo abrieron 2 · deslizando 1/.test(uso), `E: cuántos abren «Mis seguimientos» y cuántos deslizando (personas distintas) (${uso})`);
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
    const plano = t.replace(/\n/g, " ");
    ok(/Faltan datos\s*2/.test(plano) && /Con foto\s*1/.test(plano), "E: contadores nuevos: «Faltan datos: 2» (a quienes les sale «Completa tu perfil») y «Con foto: 1»");
    ok(/«Completa tu perfil» \(30 días\): la vieron 2 · la completaron 1 · cerraron sesión 1/.test(plano), `E: seguimiento de «Completa tu perfil» (personas distintas, 30 días): ${(plano.match(/«Completa tu perfil».{0,80}/) ?? [""])[0]}`);
    ok(/Foto de perfil \(30 días\): la encuadraron 1 · dejaron el recorte 1/.test(plano), `E: seguimiento del recorte de la foto (personas distintas, 30 días): ${(plano.match(/Foto de perfil \(30 días\).{0,50}/) ?? [""])[0]}`);
    ok(t.includes("Completo (2)") && t.includes("Faltan datos (2)") && t.includes("Con foto (1)"), "E: chips de estado con su recuento");
    ok(lista.includes("Perfil completo · actualizado 30/10/2026") && lista.includes("Faltan: usuario, nombre, edad") && lista.includes("Aún no ha completado su perfil"), "E: cada fila dice si el perfil está completo (y cuándo se actualizó) o qué le falta");
    ok((await p.locator('img[alt="Foto de Dani"]').count()) === 1, "E: la fila enseña la foto del cliente que la tiene");
    await capturar(p, "E1-admin-perfiles");

    // Filtrar por estado: «Faltan datos» deja solo a quien aún tiene que completar el perfil.
    await p.getByText("Faltan datos (2)").click();
    await p.waitForTimeout(400);
    const pendientes = await p.evaluate(() => document.body.innerText);
    ok(pendientes.includes("luis@example.com") && pendientes.includes("sin-perfil@example.com") && !pendientes.includes("dani@example.com") && !pendientes.includes("ana@example.com"), "E: el chip «Faltan datos» deja solo a los que tienen que completarlo");
    await p.getByText("Quitar filtros").click();
    await p.waitForTimeout(300);
    await p.getByText("Con foto (1)").click();
    await p.waitForTimeout(400);
    const conFoto = await p.evaluate(() => document.body.innerText);
    ok(conFoto.includes("dani@example.com") && !conFoto.includes("ana@example.com"), "E: el chip «Con foto» deja solo a quien tiene foto");
    await p.getByText("Quitar filtros").click();
    await p.waitForTimeout(300);

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
    ok(/Perfil completo · actualizado 30\/10\/2026/.test(tf) && (await f.locator('img[alt="Foto de perfil del cliente"]').count()) === 1, "E: la ficha enseña su foto y «Perfil completo · actualizado …»");
    await capturar(f, "E2-admin-ficha");

    // Etapas desde la ficha (sin ir a Pedidos ni a Servicios).
    let avisosVeoAura = 0;
    f.on("request", (r) => {
      if (r.url().includes("/api/escaparate-retorno") && r.method() === "POST") avisosVeoAura += 1;
    });
    const fp = f.locator("#ficha-pedidos");
    await fp.waitFor({ timeout: 10000 }).catch(() => {});
    const tp = (await fp.innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Pedido nº 12 · 155,00€/.test(tp) && /PlayStation 5/.test(tp), `E: la ficha enseña sus pedidos con número, importe y artículos (${tp.slice(0, 90)})`);
    ok(/Pedido nº 15/.test(tp) && /Hecho sin sesión/.test(tp), "E: también el que hizo sin sesión con su correo (avisando de que no lo ve en «Mis seguimientos»)");
    ok(!/Pedido nº 20/.test(tp), "E: y no los de otras personas");
    ok((await fp.getByRole("button", { name: "Listo para recoger", exact: true }).count()) === 1, "E: con entrega en mano, la etapa se llama «Listo para recoger» (como la ve el cliente)");
    const altos = await fp.getByRole("button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
    ok(altos.length >= 12 && altos.every((h) => h >= 44), `E: los botones de etapa se tocan bien, de 44 px o más (${[...new Set(altos)].join(", ")})`);
    await fp.getByRole("button", { name: "Enviado", exact: true }).click();
    await f.getByText(/Etapa guardada ✓/).waitFor({ timeout: 10000 }).catch(() => {});
    const cp = (estado.cambiosPedido ?? [])[0];
    ok(!!cp && cp.id === "p1000000-0000-4000-8000-000000000001" && cp.cuerpo.estado === "enviado", `E: un toque en «Enviado» cambia la etapa del pedido nº 12 (${JSON.stringify(cp ?? null)})`);
    ok((await f.getByText("Etapa guardada ✓ El cliente la ve en «Mis seguimientos».").count()) === 1, "E: y lo confirma («el cliente la ve en Mis seguimientos»)");
    await f.waitForTimeout(500);
    ok(avisosVeoAura === 1, `E: y avisa al puente de VeoAura, como en Pedidos (${avisosVeoAura})`);

    await f.getByRole("button", { name: "En reparación", exact: true }).click();
    await f.getByLabel("Nota del taller para el cliente").fill("Cambiamos el joystick izquierdo");
    await f.getByRole("button", { name: "Guardar seguimiento" }).click();
    await f.getByText(/Seguimiento guardado ✓/).waitFor({ timeout: 10000 }).catch(() => {});
    const cs = (estado.cambiosServicio ?? [])[0];
    ok(!!cs && cs.id === "s1000000-0000-4000-8000-000000000001" && cs.cuerpo.seguimiento === "reparando" && cs.cuerpo.seguimiento_nota === "Cambiamos el joystick izquierdo" && !!cs.cuerpo.seguimiento_actualizado, `E: la reparación se pasa a «En reparación» con su nota del taller desde la ficha (${JSON.stringify(cs?.cuerpo ?? null)})`);
    ok((await f.getByText("Seguimiento guardado ✓ El cliente lo ve en «Mis seguimientos».").count()) === 1, "E: y lo confirma");
    ok(f.errores.length === 0, `E: la ficha sin errores de JavaScript (${f.errores.length}${f.errores[0] ? ": " + f.errores[0] : ""})`);
    const anchoF = await f.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(anchoF.a <= anchoF.p + 1, `E: la ficha no se ensancha (${anchoF.a}/${anchoF.p})`);
    await capturar(f, "E3-ficha-etapas");
    await ctx.close();
  }

  // ===== K) Blue avisa al administrador de pedidos y reparaciones sin cambios en 48 h ============================
  {
    const estado = { usuarios: U, filas: PERFILES, guardados: [], olvidados: { pedidos: 1, reparaciones: 2 } };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.getByText(/llevan más de 48 h sin cambios/).first().waitFor({ timeout: 45000 }).catch(() => {});
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/1 pedido y 2 reparaciones llevan más de 48 h sin cambios: échales un vistazo\./.test(t), "K: dentro de Administración, Blue le dice al administrador «1 pedido y 2 reparaciones llevan más de 48 h sin cambios»");
    const consultas = estado.consultasOlvidados ?? [];
    const ped = consultas.find((c) => c.startsWith("pedidos?")) ?? "";
    // (la pantalla de Usuarios también cuenta todas las solicitudes de servicio: se busca la consulta de Blue)
    const rep = consultas.find((c) => c.startsWith("service_requests?") && c.includes("updated_at")) ?? "";
    const hace = (c) => {
      const m = /updated_at=lt\.([^&]+)/.exec(c);
      return m ? (Date.now() - new Date(m[1]).getTime()) / 3600000 : 0;
    };
    ok(/estado=in\.\(pendiente,confirmado,preparado,enviado\)/.test(ped) && Math.abs(hace(ped) - 48) < 1, `K: cuenta solo los pedidos en curso sin cambios desde hace 48 h (${ped.slice(0, 120)})`);
    ok(/status=neq\.descartado/.test(rep) && /seguimiento\.not\.in\.\(entregado,cancelado\)/.test(rep) && Math.abs(hace(rep) - 48) < 1, `K: y las reparaciones en curso igual (${rep.slice(0, 140)})`);
    await capturar(p, "K-blue-olvidados");
    ok(p.errores.length === 0, `K: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  await seccionM();

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

  await seccionN();
  await seccionP();
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
