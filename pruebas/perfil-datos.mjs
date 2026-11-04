/**
 * pruebas/perfil-datos.mjs — comprueba «Mi cuenta → Tu perfil» (nombre, usuario, país, provincia y edad) y su seguimiento en
 * Administración → Usuarios y en la ficha del cliente, como un iPhone (390×844).
 *
 * Todo con sesión SIMULADA y datos FICTICIOS: las lecturas de la base de datos se responden aquí y las escrituras se interceptan
 * (se comprueba lo que la tienda MANDARÍA guardar); nada llega a ninguna base de datos ni a la cuenta real de nadie.
 *
 * Comprueba:
 *  - Mi perfil (Mi cuenta): cabecera plegable «Mi perfil · @usuario · Completo/Faltan datos» (abierta si faltan datos,
 *    plegada si está completo, y se pliega sola al guardarlo completo); dentro, la cuenta («Tu cuenta está activa» de
 *    subtítulo, el correo de la sesión en su recuadro y «Cerrar sesión»), sin otra tarjeta aparte; se rellena con lo que la persona escribió al registrarse; usuario y «Nombre y
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
 *  - Perfil: deslizar el dedo a la izquierda abre «Mis seguimientos» (y después «Me gusta», la última) y a la derecha
 *    vuelve a la anterior hasta «Mi cuenta» (tocar las
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
 *  - Q) Administración → Chat: arriba, la invitación a registrarse (copiar o WhatsApp); en cada conversación, «Asignar
 *    seguimiento a este cliente» (pedido en la de un artículo, con su título y precio; reparación en las generales; no en
 *    las ventas de clientes), que manda la conversación y la sesión del administrador, avisa al cliente en el chat con el
 *    número y explica los errores sin avisar de nada; Pedidos cuenta y marca lo asignado desde el chat.
 *
 *  - R) Cabecera de «Mi perfil»: el subtítulo «Tu cuenta está activa»; el correo de la sesión en un recuadro más (a lo
 *    ancho, sin poder escribir, entero aunque sea largo); «Cerrar sesión» a mano también plegado y, al administrador,
 *    «Panel de control» a su lado (a la derecha, iguales, enteros también a 360 px) con «Esta cuenta tiene acceso al panel
 *    de administración.» encima. El gesto de las pestañas con toques reales en 14 casos: empezando sobre la cabecera, una
 *    reparación, «Cerrar sesión» (sin cerrarla), los campos, el desplegable y el correo; en diagonal sin mover la página;
 *    rápido y corto; medio y lento; poco y despacio no cambia; hacia donde no hay pestaña no hace nada; en vertical la
 *    página se desplaza. Siempre marca la pestaña buena y el contenido vuelve a su sitio.
 *
 *  - S) Panel de control: el número rojo de novedades en la esquina de cada recuadro (lo nuevo desde que se abrió la
 *    sección; la primera vez, lo de los últimos 7 días; «99+»), solo lo que llega de fuera y sin descargar filas; los
 *    recuadros sin movimiento no llevan número; al entrar (desde el recuadro o por un enlace) se va y vuelve con lo que
 *    llegue después; el chat cuenta lo sin leer; si una consulta falla no se inventa nada; en pantalla ancha va antes de
 *    la flecha; lo que dice el lector de pantalla.
 *
 *  - T) Inicio: TikTok a la izquierda del logo e Instagram a la derecha, con su icono y sus seguidores («1.234», «12,5
 *    mil»), el logo en el centro, de 44 px o más, sin salirse (también a 320 px), lo que dice el lector de pantalla, que
 *    al tocar abre el perfil y se mide, que Blue no las tapa (ni otro botón o campo); sin número o sin la migración,
 *    «Síguenos»; una red desactivada no sale. Debajo del logo, «★ 350 reseñas en todos nuestros canales de venta»
 *    (centrado, antes del título, entero a 320 px; sin número o sin la migración no sale). Administración → Redes
 *    sociales: los seguidores de TikTok e Instagram y las reseñas (solo cifras), cuándo se escribieron, los toques desde
 *    Inicio y lo que se guarda (con y sin la migración, sin peticiones fallidas).
 *
 *  - W) Portadas de las categorías en Inicio: la foto llena el recuadro con el nombre encima y sale al % que eligió el
 *    dueño (sin la migración, al 55 %, sin peticiones fallidas); la categoría sin portada sigue con su icono y la fila
 *    mide lo mismo; con Inicio abierto, un cambio hecho desde otro aparato se ve al volver a la tienda (pasados 15 s).
 *    El editor: «Cómo se ve en Inicio» (vista previa), «−», «+» y la barra (44 px), se guarda y, de vuelta en Inicio
 *    sin recargar, ya sale así; sin la migración avisa y guarda lo demás.
 *
 *  - V) Blue dentro del Panel de control: su número rojo y su ventana («Avisos del panel») solo con lo del panel
 *    (clientes que han escrito, ventas de VeoAura sin confirmar, olvidados) y su Asistente sin las guías de la tienda;
 *    en la tienda, sus avisos de siempre (control).
 *
 *  - X) Blue IA: «Hablar con el equipo» sale una sola vez (encima del recuadro de escribir, 44 px), también cuando Blue
 *    IA no puede ayudar, y cada mensaje de Blue lleva la mascota de Blue (36 px) en vez del icono.
 *
 *  - Y) «Reparación / Limpieza» en Administración → Categorías aunque aún no sea una fila: solo portadas y cuánto se
 *    ven, sin borrar ni ocultar; al guardar se crea con el slug del recuadro de Inicio («reparaciones»). Los toques de
 *    cada recuadro de Inicio (y si tenía portada). Inicio: su portada al % elegido, sigue llevando a Servicios y el
 *    toque se apunta. En el catálogo no sale entre las plataformas.
 *
 *  - Z) Cesta: «Blue, ayúdame a elegir un artículo» (44 px, dentro de la pantalla) lleva a Blue IA con la pregunta ya
 *    enviada, también si Blue IA ya estaba abierta con otra pregunta; se apunta en la analítica y Administración →
 *    Analítica cuenta las sesiones.
 *
 *  - RE) Reseñas: el texto nuevo de Inicio; «Dejar una reseña» con 10 ideas (44 px) que añaden y quitan su frase, el
 *    recuadro que crece con lo escrito hasta los 600 caracteres (y encoge al borrar), emojis según lo escrito; lo que
 *    se publica, la analítica y la línea de Administración → Usuarios.
 *
 *  - EN) Encuadre de las portadas para Inicio: al subir una foto se abre «Encuadra la portada» (forma 6:5 del recuadro,
 *    nombre encima, foto al % elegido) y al aceptar se suben la foto entera y el encuadre (960 × 800, lo elegido);
 *    «Encuadrar» en una portada ya subida; se guardan en el mismo orden. Inicio enseña el encuadre y la cabecera de
 *    dentro de la categoría, la foto entera. Sin la migración no se ofrece y se sube como antes; una foto que no se
 *    puede pedir con permiso se avisa.
 *
 *  - NO) Categorías: buscador arriba de los contadores, fichas en rejilla (2 por fila en el móvil), «+» flotante abajo
 *    a la derecha y «Editar»/«Borrar» con iconos de 44 px. El nombre va ENCIMA de cada recuadro (fuera de la foto),
 *    entero, con los recuadros de una fila alineados y aire entre filas; la vista previa del editor igual (sin «mover
 *    el nombre»); «A otras» (al lado de «Categoría activa») copia la transparencia a las elegidas. Productos en
 *    rejilla con «+» e iconos, y los iconos del resto del panel.
 *
 *  - BU) Blue nunca tapa la barra de búsqueda: dejado encima (fijo) se aparta lo justo en su lado; arrastrado encima,
 *    se aparta al soltarlo; y tampoco tapa la lista de resultados.
 *
 *  - ME) «Mejoras en la tienda»: desde el pie de página, Blue y Mi cuenta (con su sitio), de 3 a 500 letras, el
 *    recuadro crece, el límite del día en español, la analítica propia; sin sesión pide iniciarla; sin la migración
 *    dice «muy pronto» y no pide la tabla al cargar. Administración: Usuarios (sin leer primero, quién y desde dónde,
 *    filtros, marcar como leída, uso de 30 días), la ficha del cliente y el número rojo del Panel.
 *
 *  - CO) «¿Olvidaste tu contraseña?»: pedir el enlace (sin revelar si hay cuenta), abrirlo en el mismo navegador
 *    (?code=), en otro (explica por qué y deja pedir otro allí mismo), el de la plantilla (token_hash, en cualquier
 *    navegador, y se quita de la dirección), caducados o sin enlace, «Mostrar», los errores de Supabase en español, la
 *    analítica propia sin el correo y la línea «Recuperar contraseña» de Administración → Usuarios (con el aviso del SMTP).
 *
 *  - DI) Dirección de envío en «Mi perfil»: 4 campos de 44 px con autocompletar, solo cifras en el código postal, la
 *    provincia por el código postal (y aviso si es de otra), dirección entera o nada, con número de portal; se guarda y
 *    se mide sin la dirección; «Completa tu perfil» no la pide; sin la migración no se ofrece y no pide columnas (sin fila,
 *    guarda lo demás y lo dice); el pago se rellena solo; Usuarios (contador, chip, CP en cada fila, uso) y la ficha.
 *
 *  - SE) Mi perfil → «Inicio de sesión y seguridad»: Blue no aparece con «Mi perfil» desplegado (y vuelve al plegarlo);
 *    cambiar el correo (comprobaciones, enlaces a los dos correos, «cambio pendiente», correo de otra cuenta en español) y
 *    la contraseña (la actual se comprueba, las nuevas coinciden, «Mostrar», «¿No recuerdas la actual?»); la vuelta desde
 *    los enlaces del correo; la analítica sin correos y la línea de Administración → Usuarios.
 *  - BI) Blue IA con una conversación ya empezada: mientras mira si hay una guardada no saluda; al abrirla, el saludo no
 *    se vuelve a escribir; «Nueva conversación» junto a «Hablar con el equipo» (con y sin sesión); al cambiar de pestaña
 *    no se reescribe; la analítica propia y su línea en Administración → Analítica.
 *  - QS) «Quiénes somos» para Google: la ficha de persona de Daniel Gutiérrez en el HTML que recibe Google, título,
 *    descripción, dirección oficial y su nombre como encabezado; los accesos desde Inicio y desde entrar/crear cuenta
 *    (con «Crear cuenta» abierto); la analítica propia y su línea en Administración → Analítica.
 *
 *  - HO) Blue IA y el horario del equipo (reloj fijado): la línea del horario (fuera de horario, en horario y el
 *    domingo por la tarde), el aviso al pulsar «Hablar con el equipo» fuera de horario (no tapa la conversación),
 *    «Seguir con Blue» y «Escribir al equipo igualmente», la analítica propia y su línea en Administración → Analítica.
 *
 *  - AD) Blue en el panel de administración: en sus 20 pantallas, en el móvil y en el ordenador, solo mensajes del panel
 *    (con un aviso de la tienda activo que sí sale en la tienda), también al entrar desde la tienda sin recargar.
 *  - SV) Administración → Servicios: buscador arriba y del mismo alto que en Productos, 4 contadores en una fila, «+»
 *    flotante, sin recuadros, foto en grande con zoom y deslizar entre pestañas en bucle, en el móvil y en el ordenador.
 *
 *  - VA) Ficha de clientes para VeoAura: Escaparate cuenta las fichas enviadas y por enviar sin mezclarlas con las
 *    ventas sin confirmar; Pedidos avisa de qué se manda al marcar «Entregado».
 *
 *  - FS) Ficha de servicio con el formato de la de producto (galería, visor con zoom, botones iguales, pestañas,
 *    «Volver atrás», sin bloques de más) y su uso en Administración → Analítica, en el móvil y en el ordenador.
 *
 *  - MG) «Me gusta»: corazón en la ficha de servicio (sin él si falta la migración), pestaña «Me gusta» de Perfil (los
 *    de la cuenta y los del dispositivo), la lista de Servicios con la tarjeta del Catálogo y su parte en Administración.
 *
 *  - RS) Reseñas de servicios terminados: «Mis seguimientos» pide valorarlos (una vez), la ficha enseña la media y las
 *    opiniones de ese servicio, y Administración y Analítica las ven.
 *
 *  - VP) Ventanas del panel: la X abajo a la derecha del botón principal (sin «Cancelar»), iconos sin burbuja y títulos
 *    enteros en la lista de Servicios, en el móvil y en el ordenador.
 *
 * Uso: node pruebas/perfil-datos.mjs [carpeta_dist] [carpeta_capturas] [N|P|Q|…|BI|QS|HO|AD|SV|VA|FS|MG|RS|VP]
 * Con «N», «P», «Q», «R», «S», «T», «V», «W», «X», «Y», «Z», «RE», «EN», «NO», «BU», «ME», «CO», «DI», «SE», «BI», «QS»,
 * «HO», «AD», «SV», «VA», «FS», «MG», «RS» o «VP» de cuarto argumento solo se ejecuta esa sección (visor, números, chat, cabecera y gesto, novedades del panel,
 * redes junto al logo, Blue en el panel, portadas de las categorías, Blue IA, «Reparación / Limpieza», la Cesta con Blue,
 * las reseñas, el encuadre de las portadas, el panel en rejilla, Blue y el buscador, las mejoras en la tienda, recuperar
 * la contraseña, la dirección del perfil, la seguridad de la cuenta, las conversaciones de Blue IA, «Quiénes somos» o el
 * horario del equipo en Blue IA).
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
  [/^\/servicio\/[^/]+$/, "servicio/[id].html"],
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
// `vista` cambia la ventana (por defecto, un móvil de 390 × 844; p. ej. un ordenador en la sección AD).
async function contexto(navegador, usuario, rol, estado, vista = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES", ...vista });
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
    // Subida de la foto de perfil o de una portada de categoría (nada llega a ningún almacén): se apunta qué se mandaría
    // (y la foto, para mirarla).
    if (/^\/storage\/v1\/object\/(avatares|product-media)\//.test(url.pathname) && metodo === "POST") {
      const cuerpo = peticion.postDataBuffer() ?? Buffer.alloc(0);
      const texto = cuerpo.toString("latin1");
      const inicio = cuerpo.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const fin = cuerpo.lastIndexOf(Buffer.from([0xff, 0xd9]));
      const jpeg = inicio >= 0 && fin > inicio ? cuerpo.subarray(inicio, fin + 2).toString("base64") : "";
      estado.subidas = [...(estado.subidas ?? []), { ruta: decodeURIComponent(url.pathname.slice("/storage/v1/object/".length)), tipo: (texto.match(/Content-Type:\s*(image\/[a-z]+)/i) ?? [null, peticion.headers()["content-type"] ?? ""])[1], jpeg }];
      return json({ Key: url.pathname.slice("/storage/v1/object/".length) });
    }
    // Reseñas de servicios (sección RS), como la base de datos: filtros por servicio, solicitud y persona; una por
    // solicitud. Con `resenasSinColumnas`, la migración aún no está aplicada (no existen esas columnas).
    if (url.pathname.endsWith("/rest/v1/store_reviews") && (estado.resenasServicio || estado.resenasSinColumnas)) {
      if (estado.resenasSinColumnas && /service_/.test(url.search + (peticion.postData() ?? ""))) {
        return json({ code: "42703", message: "column store_reviews.service_request_id does not exist" }, 400);
      }
      if (metodo === "POST") {
        const cuerpo = [].concat(JSON.parse(peticion.postData() ?? "{}"))[0];
        estado.resenasEnviadas = [...(estado.resenasEnviadas ?? []), cuerpo];
        if (cuerpo.service_request_id && estado.resenasServicio.some((r) => r.service_request_id === cuerpo.service_request_id)) {
          return json({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
        }
        const fila = { id: `r${Date.now()}`, created_at: new Date().toISOString(), user_id: usuario.id, display_name: "Ana", ...cuerpo };
        estado.resenasServicio.push(fila);
        return json(/vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? fila : [fila], 201);
      }
      if (metodo === "GET") {
        let filas = estado.resenasServicio;
        for (const [campo, filtro] of url.searchParams) {
          if (["select", "order", "limit"].includes(campo)) continue;
          if (filtro.startsWith("eq.")) filas = filas.filter((r) => String(r[campo]) === filtro.slice(3));
          else if (filtro.startsWith("in.(")) filas = filas.filter((r) => filtro.slice(4, -1).split(",").includes(String(r[campo])));
          else if (filtro === "not.is.null") filas = filas.filter((r) => r[campo] != null);
        }
        return json(filas);
      }
    }
    // «Dejar una reseña» (sección RE): se apunta lo que se publicaría y se devuelve la fila, como la base de datos.
    if (url.pathname.endsWith("/rest/v1/store_reviews") && metodo === "POST" && estado.publicarResenas) {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      estado.resenasEnviadas = [...(estado.resenasEnviadas ?? []), cuerpo];
      const fila = { id: "r0000000-0000-4000-8000-000000000001", created_at: new Date().toISOString(), user_id: usuario.id, display_name: "Ana", ...cuerpo };
      return json(/vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? fila : [fila], 201);
    }
    // «Mejoras en la tienda» (sección ME), como la base de datos: cada cliente ve las suyas y el administrador todas. Sin
    // `estado.mejoras`, la tabla no existe (antes de la migración). Se apunta lo enviado y lo marcado como leído.
    if (url.pathname.endsWith("/rest/v1/mejoras_tienda")) {
      if (!estado.mejoras) {
        estado.mejoras404 = (estado.mejoras404 ?? 0) + 1;
        return json({ code: "PGRST205", message: "Could not find the table 'public.mejoras_tienda' in the schema cache" }, 404);
      }
      if (metodo === "POST") {
        const cuerpo = [].concat(JSON.parse(peticion.postData() ?? "{}"))[0];
        estado.mejorasEnviadas = [...(estado.mejorasEnviadas ?? []), cuerpo];
        if (estado.mejorasLimite) return json({ code: "P0001", message: "Ya nos has enviado 5 ideas hoy. ¡Gracias! Mañana puedes mandarnos más." }, 400);
        estado.mejoras = [{ id: `m${Date.now()}`, user_id: usuario.id, created_at: new Date().toISOString(), leida: false, leida_en: null, ...cuerpo }, ...estado.mejoras];
        return r.fulfill({ status: 201, headers: CORS, body: "" });
      }
      if (metodo === "PATCH") {
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        estado.mejorasMarcadas = [...(estado.mejorasMarcadas ?? []), { id, cuerpo }];
        estado.mejoras = estado.mejoras.map((m) => (m.id === id ? { ...m, ...cuerpo } : m));
        return json([{ id }]);
      }
      const uid = (url.searchParams.get("user_id") ?? "").replace(/^eq\./, "");
      const sinLeer = url.searchParams.get("leida") === "eq.false";
      const desde = (url.searchParams.get("created_at") ?? "").replace(/^gt\./, "");
      const visibles = estado.mejoras.filter(
        (m) => (rol === "admin" || m.user_id === usuario.id) && (!uid || m.user_id === uid) && (!sinLeer || !m.leida) && (!desde || m.created_at > desde)
      );
      if (metodo === "HEAD") return json([], 200, { "content-range": `*/${visibles.length}`, "access-control-expose-headers": "*" });
      return json(visibles);
    }
    // Foro: mensajes ficticios y la función perfiles_publicos (usuario y foto de quien escribe).
    if (url.pathname.endsWith("/rest/v1/chat_messages") && metodo === "GET") return json(estado.mensajes ?? []);
    // Moderación: un administrador elimina un mensaje (la base de datos devuelve lo borrado; [] = no se lo ha permitido).
    if (url.pathname.endsWith("/rest/v1/chat_messages") && metodo === "DELETE") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      estado.borrados = [...(estado.borrados ?? []), id];
      return json(estado.borrarSinPermiso ? [] : [{ id }]);
    }
    // Blue del administrador: ventas de VeoAura sin confirmar (sección V), contadas sin descargar filas.
    if (metodo === "HEAD" && url.pathname.endsWith("/rest/v1/escaparate_salida")) {
      return json([], 200, { "content-range": `*/${estado.salida ?? 0}`, "access-control-expose-headers": "*" });
    }
    // Blue del administrador: pedidos y reparaciones olvidados (48 h sin cambios), contados sin descargar filas.
    if (metodo === "HEAD" && estado.olvidados && /\/rest\/v1\/(pedidos|service_requests)$/.test(url.pathname)) {
      const n = url.pathname.endsWith("/pedidos") ? estado.olvidados.pedidos : estado.olvidados.reparaciones;
      estado.consultasOlvidados = [...(estado.consultasOlvidados ?? []), `${url.pathname.split("/").pop()}?${decodeURIComponent(url.search.slice(1))}`];
      return json([], 200, { "content-range": `*/${n}`, "access-control-expose-headers": "*" });
    }
    // Administración → Chat (sección Q): conversaciones y mensajes ficticios; «Asignar seguimiento» (api) simulado.
    if (estado.chats && url.pathname.endsWith("/rest/v1/product_chats") && metodo === "GET") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      const filas = estado.chats.filter((c) => !id || c.id === id);
      return /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? json(filas[0] ?? null) : json(filas);
    }
    if (estado.chats && url.pathname.endsWith("/rest/v1/product_chat_messages")) {
      if (metodo === "POST") {
        estado.mensajesChatEnviados = [...(estado.mensajesChatEnviados ?? []), JSON.parse(peticion.postData() ?? "{}")];
        return r.fulfill({ status: 201, headers: CORS, body: "" });
      }
      if (metodo === "GET") {
        const chatId = (url.searchParams.get("chat_id") ?? "").replace(/^eq\./, "");
        return json((estado.mensajesChat ?? []).filter((m) => !chatId || m.chat_id === chatId));
      }
    }
    // Historial de Blue IA (sección BI): conversaciones y mensajes guardados ficticios; la lista tarda `retraso` ms (como
    // una red lenta) para ver qué hace la pantalla mientras tanto. Se apunta lo que se guardaría.
    if (estado.blueHistorial && /\/rest\/v1\/blue_ia_(conversaciones|mensajes)$/.test(url.pathname)) {
      const h = estado.blueHistorial;
      const esConversaciones = url.pathname.endsWith("/blue_ia_conversaciones");
      if (metodo === "POST") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        h.guardado = [...(h.guardado ?? []), { tabla: esConversaciones ? "conversaciones" : "mensajes", cuerpo }];
        if (esConversaciones) return json({ id: "c0000000-0000-4000-8000-0000000000b2" }, 201);
        return r.fulfill({ status: 201, headers: CORS, body: "" });
      }
      if (metodo === "GET" && esConversaciones) {
        if (h.retraso) await new Promise((fin) => setTimeout(fin, h.retraso));
        return json(h.conversaciones ?? []);
      }
      if (metodo === "GET") {
        const id = (url.searchParams.get("conversacion_id") ?? "").replace(/^eq\./, "");
        return json((h.mensajes ?? []).filter((m) => m.conversacion_id === id));
      }
    }
    // Blue IA (sección X): respuestas ficticias (nada llega a la IA real); se apunta cuántas preguntas se mandan.
    if (url.pathname === "/api/blue-ia" && estado.blueIa) {
      estado.preguntasBlueIa = (estado.preguntasBlueIa ?? 0) + 1;
      // Lo que se le manda (la última pregunta, para la sección Z).
      try {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        estado.mensajesBlueIa = [...(estado.mensajesBlueIa ?? []), JSON.stringify(cuerpo)];
      } catch {
        // sin cuerpo
      }
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: estado.blueIa(estado.preguntasBlueIa) }) });
    }
    if (url.pathname === "/api/asignar-seguimiento" && estado.asignar) {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      estado.asignaciones = [...(estado.asignaciones ?? []), { cuerpo, auth: peticion.headers()["authorization"] ?? "" }];
      const resp = estado.asignar(cuerpo);
      return r.fulfill({ status: resp.status ?? 200, contentType: "application/json", body: JSON.stringify(resp.cuerpo) });
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
    // Tablas sencillas que solo se leen (sección NO: Blog, Políticas, «Lo que Blue sabe»): las filas de la prueba.
    if (estado.tablas && metodo === "GET") {
      const tabla = url.pathname.split("/").pop();
      if (estado.tablas[tabla]) return json(estado.tablas[tabla], 200, { "content-range": `*/${estado.tablas[tabla].length}` });
    }
    // Administración → Productos (sección NO): la lista, sus fotos (ninguna) y lo que se manda cambiar.
    if (estado.productosAdmin && url.pathname.endsWith("/rest/v1/products")) {
      if (metodo === "GET") return json(estado.productosAdmin, 200, { "content-range": `0-${estado.productosAdmin.length - 1}/${estado.productosAdmin.length}` });
      if (metodo === "PATCH") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        estado.productosCambiados = [...(estado.productosCambiados ?? []), { id, cuerpo }];
        estado.productosAdmin = estado.productosAdmin.map((f) => (f.id === id ? { ...f, ...cuerpo } : f));
        return /return=representation/.test(peticion.headers()["prefer"] ?? "") ? json([estado.productosAdmin.find((f) => f.id === id)]) : r.fulfill({ status: 204, headers: CORS, body: "" });
      }
    }
    if (estado.productosAdmin && url.pathname.endsWith("/rest/v1/product_media") && metodo === "GET") return json([]);
    // Catálogo sin productos (sección Y): sin pedirlos a la base de datos real (que rechaza la sesión de prueba).
    if (estado.productosVacios && url.pathname.endsWith("/rest/v1/products") && metodo === "GET") {
      return json([], 200, { "content-range": "*/0", "access-control-expose-headers": "*" });
    }
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
    // Avisos de la tienda que Blue dice en la tienda (Noticias Flash, sección AD).
    if (url.pathname.endsWith("/rest/v1/flash_news") && metodo === "GET" && estado.flash) return json(estado.flash);
    // Administración → Escaparate (sección VA): avisos a VeoAura, sus artículos y el registro, ficticios.
    if (estado.salidas && url.pathname.endsWith("/rest/v1/escaparate_salida") && metodo === "GET") return json(estado.salidas);
    if (estado.salidas && url.pathname.endsWith("/rest/v1/escaparate_registro") && metodo === "GET") return json([]);
    if (estado.salidas && url.pathname.endsWith("/rest/v1/products") && metodo === "GET" && /id_veoaura=not\.is\.null/.test(url.search)) return json(estado.articulosVeo ?? []);
    // Pestaña «Me gusta» y lista de Servicios (sección MG): productos y servicios ficticios, filtrados por id=in.(…).
    if (estado.megusta && /\/rest\/v1\/(products|services)$/.test(url.pathname) && metodo === "GET") {
      const lista = url.pathname.endsWith("/products") ? estado.megusta.productos : estado.megusta.servicios;
      const ids = (url.searchParams.get("id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
      const filas = ids.length && /^in\./.test(url.searchParams.get("id") ?? "") ? lista.filter((f) => ids.includes(f.id)) : lista;
      return json(filas);
    }
    if (estado.megusta && /\/rest\/v1\/(product_media|service_media)$/.test(url.pathname) && metodo === "GET") return json([]);
    // Ficha de un servicio sin la columna de «me gusta» (migración sin aplicar): PostgREST la rechaza.
    if (estado.servicioSinMeGusta && url.pathname.endsWith("/rest/v1/services") && metodo === "GET" && /like_count/.test(url.searchParams.get("select") ?? "")) {
      return json({ code: "42703", message: "column services.like_count does not exist" }, 400);
    }
    // Ficha de un servicio (sección FS): un servicio ficticio con sus fotos.
    if (estado.servicio && url.pathname.endsWith("/rest/v1/services") && metodo === "GET") {
      return /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? json(estado.servicio) : json([estado.servicio]);
    }
    if (estado.servicio && url.pathname.endsWith("/rest/v1/service_media") && metodo === "GET") return json(estado.fotosServicio ?? []);
    // Administración → Servicios (sección SV): servicios ficticios con sus fotos.
    if (estado.serviciosAdmin && url.pathname.endsWith("/rest/v1/services") && metodo === "GET") return json(estado.serviciosAdmin);
    if (estado.serviciosAdmin && url.pathname.endsWith("/rest/v1/service_media") && metodo === "GET") return json(estado.serviciosMedia ?? []);
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
    // Recuperar contraseña (sección CO), como Supabase: pedir el enlace, canjearlo (el de siempre, ?code= con su código de
    // seguridad, o el de la plantilla, token_hash) y sus errores, que Supabase da en inglés.
    if (url.pathname.endsWith("/auth/v1/recover")) {
      estado.recover = [...(estado.recover ?? []), { redirect_to: url.searchParams.get("redirect_to"), cuerpo: JSON.parse(peticion.postData() ?? "{}") }];
      if (estado.recoverError) return json(estado.recoverError.cuerpo, estado.recoverError.status);
      return json({});
    }
    const sesionDe = () => {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: usuario.id, role: "authenticated", exp, aud: "authenticated", email: usuario.email })}.firma`;
      return { access_token: jwt, refresh_token: "r", expires_in: 3600, expires_at: exp, token_type: "bearer", user: usuario };
    };
    if (url.pathname.endsWith("/auth/v1/verify") && metodo === "POST") {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      estado.verificaciones = [...(estado.verificaciones ?? []), cuerpo];
      if (cuerpo.token_hash !== "hash-bueno" || cuerpo.type !== "recovery") return json({ code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" }, 403);
      return json(sesionDe());
    }
    if (url.pathname.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "pkce") {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      estado.canjes = [...(estado.canjes ?? []), cuerpo];
      if (cuerpo.auth_code !== "codigo-bueno") return json({ code: 400, error_code: "flow_state_not_found", msg: "invalid flow state, no valid flow state found" }, 400);
      return json(sesionDe());
    }
    // «Inicio de sesión y seguridad» (sección SE): entrar con la contraseña actual, renovar la sesión y cambiar correo o
    // contraseña, como Supabase.
    if (url.pathname.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "password") {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      estado.entradas = [...(estado.entradas ?? []), { email: cuerpo.email, ok: cuerpo.password === estado.claveActual }];
      if (cuerpo.password !== estado.claveActual) return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
      return json(sesionDe());
    }
    if (url.pathname.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "refresh_token") {
      estado.renovaciones = (estado.renovaciones ?? 0) + 1;
      return json(sesionDe());
    }
    if (url.pathname.endsWith("/auth/v1/user") && metodo === "PUT" && estado.seguridad) {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      if (cuerpo.email) {
        estado.cambiosCorreo = [...(estado.cambiosCorreo ?? []), { email: cuerpo.email, redirect_to: url.searchParams.get("redirect_to") }];
        if (estado.correoOcupado) return json({ code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" }, 422);
        return json({ ...usuario, new_email: cuerpo.email });
      }
      if (cuerpo.password) {
        estado.clavesNuevas = [...(estado.clavesNuevas ?? []), cuerpo.password];
        return json(usuario);
      }
    }
    if (url.pathname.endsWith("/auth/v1/user") && metodo === "GET" && estado.correoPendiente) {
      return json({ ...usuario, new_email: estado.correoPendiente });
    }
    if (url.pathname.endsWith("/auth/v1/user") && metodo === "PUT" && estado.contrasenaError) {
      estado.cuenta = JSON.parse(peticion.postData() ?? "{}");
      return json(estado.contrasenaError.cuerpo, estado.contrasenaError.status);
    }
    if (url.pathname.endsWith("/auth/v1/user")) {
      if (metodo === "PUT") {
        estado.cuenta = JSON.parse(peticion.postData() ?? "{}");
        return json({ ...usuario, user_metadata: { ...usuario.user_metadata, ...(estado.cuenta.data ?? {}) } });
      }
      return json(usuario);
    }
    // Usuarios nuevos del Panel de control (sección S): se cuentan con HEAD y la fecha «gt», como la base de datos.
    if (url.pathname.endsWith("/rest/v1/profiles") && metodo === "HEAD" && estado.novedades) {
      estado.consultasNovedades = [...(estado.consultasNovedades ?? []), `profiles?${decodeURIComponent(url.search.slice(1))}`];
      const desde = (url.searchParams.get("created_at") ?? "").replace(/^gt\./, "");
      const n = (estado.novedades.profiles ?? []).filter((f) => f > desde).length;
      return json([], 200, { "content-range": `*/${n}`, "access-control-expose-headers": "*" });
    }
    if (url.pathname.endsWith("/rest/v1/profiles")) return json({ id: usuario.id, role: rol });
    if (url.pathname.endsWith("/rest/v1/analytics_events") && metodo === "GET") return json(estado.eventos ?? []);
    if (url.pathname.endsWith("/rpc/get_unread_chat_count")) return json(estado.novedades?.chatsSinLeer ?? 0);
    if (url.pathname.endsWith("/rpc/admin_list_users_with_stats")) return json(estado.usuarios ?? []);
    if (url.pathname.endsWith("/rest/v1/perfiles_cliente")) {
      if (metodo === "POST") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        // Sin la migración de la dirección (sección DI): esas columnas no existen, como la base de datos.
        if (estado.sinColumnasDireccion && ["codigo_postal", "localidad", "direccion", "piso"].some((c) => c in cuerpo)) {
          estado.direccion400 = (estado.direccion400 ?? 0) + 1;
          return json({ code: "PGRST204", message: "Could not find the 'codigo_postal' column of 'perfiles_cliente' in the schema cache" }, 400);
        }
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
    // Redes junto al logo de Inicio (sección T): TikTok e Instagram con sus seguidores, y lo que guarda Administración →
    // Redes sociales. Sin la migración (redesSinColumna), la columna «seguidores» no existe, como la base de datos.
    if (estado.redes && url.pathname.endsWith("/rest/v1/social_links")) {
      if (metodo === "GET") {
        if (estado.redesSinColumna && /seguidores/.test(url.searchParams.get("select") ?? "")) {
          // Se cuenta: la tienda no debe pedir una columna que aún no existe (deja un error 400 en la consola).
          estado.redes400 = (estado.redes400 ?? 0) + 1;
          return json({ code: "42703", message: "column social_links.seguidores does not exist" }, 400);
        }
        const plataformas = (url.searchParams.get("platform") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
        // Como PostgREST: solo las columnas pedidas; con «*», las que existan (sin la migración, sin los seguidores).
        const columnas = (url.searchParams.get("select") ?? "*").split(",");
        const sinSeguidores = (f) => Object.fromEntries(Object.entries(f).filter(([c]) => !c.startsWith("seguidores")));
        const solo = (f) => (columnas.includes("*") ? (estado.redesSinColumna ? sinSeguidores(f) : f) : Object.fromEntries(columnas.map((c) => [c, f[c] ?? null])));
        return json(estado.redes.filter((f) => !plataformas.length || plataformas.includes(f.platform)).map(solo));
      }
      if (metodo === "PATCH") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        if (estado.redesSinColumna && "seguidores" in cuerpo) {
          return json({ code: "PGRST204", message: "Could not find the 'seguidores' column of 'social_links' in the schema cache" }, 400);
        }
        estado.redesGuardadas = [...(estado.redesGuardadas ?? []), { plataforma: (url.searchParams.get("platform") ?? "").replace(/^eq\./, ""), cuerpo }];
        return r.fulfill({ status: 204, headers: CORS, body: "" });
      }
    }
    // Categorías con su portada y cuánto se ve en Inicio (sección W). Sin la migración, sin «portada_opacidad»; se
    // cuentan las peticiones fallidas y se apunta lo que el editor manda guardar (y queda guardado, como la base de datos).
    if (estado.categorias && url.pathname.endsWith("/rest/v1/categories")) {
      const sinColumna = (f) => (estado.categoriasSinColumna ? Object.fromEntries(Object.entries(f).filter(([c]) => c !== "portada_opacidad")) : f);
      if (metodo === "GET") {
        const select = url.searchParams.get("select") ?? "*";
        if (estado.categoriasSinColumna && /portada_opacidad/.test(select)) {
          estado.categorias400 = (estado.categorias400 ?? 0) + 1;
          return json({ code: "42703", message: "column categories.portada_opacidad does not exist" }, 400);
        }
        const activas = url.searchParams.get("is_active") === "eq.true";
        const slug = (url.searchParams.get("slug") ?? "").replace(/^eq\./, "");
        const filas = estado.categorias.filter((f) => (!activas || f.is_active) && (!slug || f.slug === slug)).map(sinColumna);
        const proyecta = (f) => (select.split(",").includes("*") ? f : Object.fromEntries(select.split(",").map((c) => [c, f[c] ?? null])));
        return /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? json(filas[0] ? proyecta(filas[0]) : null) : json(filas.map(proyecta));
      }
      if (metodo === "PATCH") {
        const cuerpo = JSON.parse(peticion.postData() ?? "{}");
        if (estado.categoriasSinColumna && "portada_opacidad" in cuerpo) {
          return json({ code: "PGRST204", message: "Could not find the 'portada_opacidad' column of 'categories' in the schema cache" }, 400);
        }
        if (estado.categoriasSinPosicion && "titulo_posicion" in cuerpo) {
          return json({ code: "PGRST204", message: "Could not find the 'titulo_posicion' column of 'categories' in the schema cache" }, 400);
        }
        // «id=eq.X» (una) o «id=in.(X,Y)» («Aplicar a otras», sección NO).
        const filtroId = url.searchParams.get("id") ?? "";
        const ids = filtroId.startsWith("in.(") ? filtroId.slice(4, -1).split(",").map((s) => s.replace(/"/g, "")) : [filtroId.replace(/^eq\./, "")];
        const id = ids.join(",");
        estado.categoriasGuardadas = [...(estado.categoriasGuardadas ?? []), { id, ids, cuerpo }];
        estado.categorias = estado.categorias.map((f) => (ids.includes(f.id) ? { ...f, ...cuerpo } : f));
        return r.fulfill({ status: 204, headers: CORS, body: "" });
      }
      // Una categoría nueva (sección Y: «Reparación / Limpieza» al guardarle la portada); el slug no se puede repetir.
      if (metodo === "POST") {
        const cuerpo = [].concat(JSON.parse(peticion.postData() ?? "{}"))[0];
        if (estado.categorias.some((f) => f.slug === cuerpo.slug)) {
          return json({ code: "23505", message: 'duplicate key value violates unique constraint "categories_slug_key"' }, 409);
        }
        const ahora = new Date().toISOString();
        const id = `c0000000-0000-4000-8000-${String(estado.categorias.length + 1).padStart(12, "0")}`;
        estado.categoriasCreadas = [...(estado.categoriasCreadas ?? []), cuerpo];
        estado.categorias = [...estado.categorias, { id, image_url: null, imagenes: [], portada_opacidad: null, created_at: ahora, updated_at: ahora, ...cuerpo }];
        return r.fulfill({ status: 201, headers: CORS, body: "" });
      }
    }
    // Ajustes de la tienda (fila única): las reseñas en los canales de venta (sección T). Sin la migración, sin esas columnas.
    if (estado.ajustes && url.pathname.endsWith("/rest/v1/site_settings") && metodo === "GET") {
      const select = url.searchParams.get("select") ?? "*";
      if (estado.redesSinColumna && /resenas/.test(select)) {
        estado.redes400 = (estado.redes400 ?? 0) + 1;
        return json({ code: "42703", message: "column site_settings.resenas_canales does not exist" }, 400);
      }
      const completa = estado.redesSinColumna ? Object.fromEntries(Object.entries(estado.ajustes).filter(([c]) => !c.startsWith("resenas"))) : estado.ajustes;
      const fila = select.split(",").includes("*") ? completa : Object.fromEntries(select.split(",").map((c) => [c, completa[c] ?? null]));
      return /vnd\.pgrst\.object/.test(peticion.headers()["accept"] ?? "") ? json(fila) : json([fila]);
    }
    if (estado.redes && url.pathname.endsWith("/rest/v1/site_settings") && metodo === "PATCH") {
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      if (estado.redesSinColumna && "resenas_canales" in cuerpo) {
        return json({ code: "PGRST204", message: "Could not find the 'resenas_canales' column of 'site_settings' in the schema cache" }, 400);
      }
      estado.ajustesGuardados = [...(estado.ajustesGuardados ?? []), cuerpo];
      return r.fulfill({ status: 204, headers: CORS, body: "" });
    }
    // Novedades del Panel de control (sección S): cuántas filas hay después de la fecha pedida («gt»), como la base de
    // datos; se apunta cada consulta para mirar sus filtros. Sin datos de la prueba, cero (nada llega a la base de datos real).
    if (metodo === "HEAD" && /\/rest\/v1\/(pedidos|service_requests|sell_requests|products|escaparate_registro|store_reviews|auditorias_web)$/.test(url.pathname)) {
      const tabla = url.pathname.split("/").pop();
      if (estado.novedades) {
        estado.consultasNovedades = [...(estado.consultasNovedades ?? []), `${tabla}?${decodeURIComponent(url.search.slice(1))}`];
        if ((estado.novedades.fallan ?? []).includes(tabla)) return json({ code: "XX000", message: "fallo de prueba" }, 500);
        const col = ["created_at", "recibido_en", "ejecutada_en"].find((c) => url.searchParams.get(c));
        const desde = (url.searchParams.get(col) ?? "").replace(/^gt\./, "");
        const n = (estado.novedades[tabla] ?? []).filter((f) => f > desde).length;
        return json([], 200, { "content-range": `*/${n}`, "access-control-expose-headers": "*" });
      }
      if (!estado.olvidados) return json([], 200, { "content-range": "*/0", "access-control-expose-headers": "*" });
    }
    // Lecturas vacías de todo lo demás que pide la tienda con esta sesión (nada de la base de datos real).
    if (metodo === "GET" || metodo === "HEAD") {
      if (/\/rest\/v1\/(pedidos|pedido_items|service_requests|sell_requests|store_reviews|product_sales|customer_notes|avisos_busqueda|chat_message_reactions|services|service_media|seguimiento_intentos|blue_ia_conversaciones|blue_ia_mensajes|blue_conocimiento)$/.test(url.pathname)) {
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

// ===== R) Cabecera de «Mi perfil», la cuenta en sus recuadros y el gesto de las pestañas (toques reales) =============
async function seccionR() {
  const perfilCompleto = (id) => [{ user_id: id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const reparacion = {
    id: "rc000000-0000-4000-8000-000000000001", created_at: "2026-10-28T10:00:00Z", service_id: null, service_title: "Reparación de mando PS5",
    nombre: "Ana", apellido: "", metodo_contacto: null, contacto: "600111222", ciudad: "", direccion: null, disponibilidad: null, comentario: null,
    status: "revisado", seguimiento: "reparando", seguimiento_nota: "Cambiamos el joystick izquierdo", seguimiento_actualizado: "2026-10-30T09:00:00Z",
    customer_user_id: CLIENTE.id, codigo_seguimiento: "VZ-7K3M-9QPD", id_veoaura: null, vinculado_en: null,
  };
  const enFila = (a, b) => !!a && !!b && Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < 3;
  // Líneas de texto de verdad (sin los iconos, que son letras de una fuente de iconos).
  const lineas = async (loc) => (await loc.innerText()).split("\n").map((s) => s.trim()).filter((s) => /[a-zá-ú@]/i.test(s));
  const abrirPerfil = async (p) => {
    if ((await p.locator("#perfil-cabecera").getAttribute("aria-expanded")) !== "true") await p.locator("#perfil-cabecera").click();
    await p.locator('#perfil-datos [aria-label="Nombre"]').waitFor({ timeout: 8000 }).catch(() => {});
  };
  const dentro = (a, b) => !!a && !!b && a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1 && a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1;

  // R1) Cliente con el perfil completo (plegado): «Tu cuenta está activa» bajo «Mi perfil» y «Cerrar sesión» siempre a mano.
  {
    const estado = { filas: perfilCompleto(CLIENTE.id), guardados: [], numeros: { pedidos: [], reparaciones: [{ ...reparacion }] } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 });
    const cab = await lineas(p.locator("#perfil-cabecera"));
    ok(cab[0] === "Mi perfil" && cab[1] === "Tu cuenta está activa" && /@ana_g · Completo/.test(cab.join(" ")), `R: debajo de «Mi perfil», el subtítulo «Tu cuenta está activa» (${cab.join(" | ")})`);
    ok((await p.getByText("Tu cuenta está activa").count()) === 1 && (await p.getByText("SESIÓN ACTUAL").count()) === 0, "R: no hay otro bloque de la cuenta ni «SESIÓN ACTUAL» aparte");
    const salir = p.locator("#perfil-datos").getByRole("button", { name: "Cerrar sesión" });
    ok((await salir.count()) === 1 && (await salir.isVisible()), "R: plegado, «Cerrar sesión» se ve dentro de «Mi perfil» (no hace falta abrirlo)");
    ok((await p.getByText("Panel de control").count()) === 0 && (await p.getByText(/panel de administración/).count()) === 0, "R: un cliente no ve «Panel de control» ni el aviso del panel");
    await capturar(p, "R1-cliente-plegado");

    // Abierto: el correo de la sesión es uno más de los recuadros (a lo ancho, como el nombre) y no se puede escribir.
    await p.locator("#perfil-cabecera").click();
    await p.locator('#perfil-datos [aria-label="Nombre"]').waitFor({ timeout: 8000 }).catch(() => {});
    const correo = p.locator("#perfil-datos #perfil-correo");
    ok((await correo.count()) === 1 && (await correo.innerText()).includes(CLIENTE.email), `R: el correo de la sesión sale en su recuadro, con los datos (${await correo.innerText().catch(() => "no está")})`);
    ok((await correo.getAttribute("aria-label").catch(() => "")) === `Correo de la sesión: ${CLIENTE.email}`, "R: y un lector de pantalla dice qué es («Correo de la sesión: …»)");
    const medidas = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const caja = (s) => { let n = document.querySelector(s); while (n && n.getBoundingClientRect().height < 44) n = n.parentElement; return n?.getBoundingClientRect(); };
      const c = document.querySelector("#perfil-datos #perfil-correo");
      return {
        correo: caja("#perfil-datos #perfil-correo"), nombre: caja('#perfil-datos [aria-label="Nombre"]'), pais: r('#perfil-datos select[aria-label="País"]'),
        editable: !!c && (c.tagName === "INPUT" || c.isContentEditable || !!c.querySelector("input, textarea")),
        cortado: !!c && c.scrollWidth > c.clientWidth + 1,
      };
    });
    ok(!!medidas.correo && !!medidas.nombre && Math.abs(medidas.correo.width - medidas.nombre.width) < 2 && medidas.correo.height >= 44 && medidas.correo.height <= 50, `R: el recuadro del correo mide como los demás (${Math.round(medidas.correo?.width ?? 0)}×${Math.round(medidas.correo?.height ?? 0)} y el nombre ${Math.round(medidas.nombre?.width ?? 0)} de ancho)`);
    ok(!!medidas.pais && !!medidas.correo && medidas.correo.y > medidas.nombre.y && medidas.correo.y < medidas.pais.y,"R: va con los datos de la cuenta, entre el nombre y el país");
    ok(!medidas.editable && !medidas.cortado, `R: no se puede escribir en él y se lee entero (editable: ${medidas.editable}, cortado: ${medidas.cortado})`);
    await capturar(p, "R2-cliente-abierto");

    // El gesto de las pestañas, con toques reales (CDP) desde distintos sitios de las dos pestañas.
    const deslizable = async () => p.locator("#perfil-deslizable").boundingBox();
    const pestana = async () =>
      (await p.getByText("Reparaciones y Mantenimientos").count()) ? "seguimientos" : (await p.locator("#perfil-me-gusta").count()) ? "megusta" : (await p.locator("#perfil-cabecera").count()) ? "cuenta" : "?";
    const NOMBRE_PESTANA = { seguimientos: "Mis seguimientos", megusta: "Me gusta", cuenta: "Mi cuenta" };
    const seleccionada = async () => p.locator('#perfil-pestanas [role="tab"][aria-selected="true"]').innerText().catch(() => "");
    // El contenedor con scroll de la página (el de la tienda, no la ventana).
    const scroll = async () => p.evaluate(() => {
      let n = document.getElementById("perfil-deslizable");
      while (n && !(n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
      return n ? Math.round(n.scrollTop) : -1;
    });
    const desplazamiento = async () => p.evaluate(() => {
      const t = getComputedStyle(document.getElementById("perfil-deslizable")).transform;
      return t === "none" ? 0 : Math.round(Number(t.replace(/^matrix\(|\)$/g, "").split(",")[4]));
    });
    const dedo = async ({ x, y }, dx, dy, pasos = 10, espera = 16) => {
      const cdp = await p.context().newCDPSession(p);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= pasos; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / pasos, y: y + (dy * i) / pasos }] });
        await p.waitForTimeout(espera);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(800);
    };
    // Punto de partida: sobre `loc` (a la vista), en su fila, en la x pedida.
    const sobre = async (loc, x) => {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      return { x: x ?? b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const casos = [];
    const caso = async (nombre, espera, hacer) => {
      const antes = await pestana();
      await hacer();
      const despues = await pestana();
      const tab = await seleccionada();
      const quieto = await desplazamiento();
      const bien = despues === espera && (despues === "?" || tab === NOMBRE_PESTANA[espera]) && Math.abs(quieto) <= 1;
      casos.push(bien);
      ok(bien, `R: ${nombre}: de «${antes}» a «${despues}» (pestaña marcada «${tab}», contenido en su sitio: ${quieto} px)`);
    };
    await p.locator("#perfil-cabecera").click(); // plegado otra vez
    await p.waitForTimeout(300);
    await caso("deslizar a la izquierda sobre la cabecera de «Mi perfil»", "seguimientos", async () => dedo(await sobre(p.locator("#perfil-cabecera"), 300), -200, 4));
    await caso("deslizar a la derecha sobre la tarjeta de una reparación", "cuenta", async () => dedo(await sobre(p.getByText("Reparación de mando PS5").first(), 90), 200, -4));
    await caso("deslizar a la izquierda sobre «Cerrar sesión» (sin cerrar la sesión)", "seguimientos", async () => dedo(await sobre(salir, 300), -200, 2));
    ok(estado.salio !== true, "R: deslizar sobre «Cerrar sesión» no la cierra");
    await caso("deslizar a la derecha sobre el campo del número de seguimiento", "cuenta", async () => dedo(await sobre(p.getByLabel("Número de seguimiento", { exact: true }).first(), 90), 200, 0));
    // Abierto: el dedo empieza encima de los campos (al volver a «Mi cuenta», el perfil completo sale plegado otra vez).
    await abrirPerfil(p);
    await caso("deslizar a la izquierda sobre el campo del nombre", "seguimientos", async () => dedo(await sobre(p.locator('#perfil-datos [aria-label="Nombre"]').first(), 300), -200, 3));
    await p.locator("#perfil-pestanas").getByText("Mi cuenta", { exact: true }).click();
    await abrirPerfil(p);
    await caso("deslizar a la izquierda sobre el desplegable de la provincia", "seguimientos", async () => dedo(await sobre(p.locator('#perfil-datos select[aria-label="Provincia"]'), 300), -200, 0));
    await p.locator("#perfil-pestanas").getByText("Mi cuenta", { exact: true }).click();
    await abrirPerfil(p);
    await caso("deslizar a la izquierda sobre el recuadro del correo", "seguimientos", async () => dedo(await sobre(p.locator("#perfil-datos #perfil-correo"), 300), -200, 0));
    // En diagonal (como se desliza con el pulgar): cambia de pestaña y la página no se mueve hacia arriba o abajo.
    await p.locator("#perfil-pestanas").getByText("Mi cuenta", { exact: true }).click();
    await abrirPerfil(p);
    const inicioDiag = await sobre(p.locator('#perfil-datos [aria-label="Nombre"]').first(), 310);
    const scrollAntes = await scroll();
    await caso("deslizar en diagonal con el pulgar (200 px a la izquierda y 70 hacia arriba)", "seguimientos", async () => dedo(inicioDiag, -200, -70));
    const scrollDiag = await scroll();
    ok(Math.abs(scrollDiag - scrollAntes) <= 4, `R: y mientras tanto la página no se desplaza (de ${scrollAntes} a ${scrollDiag} px)`);
    // Un toque rápido y corto (un «flick») también cambia; arrastrar poco y despacio, no (vuelve a su sitio).
    // (Un solo movimiento: aquí cada toque simulado tarda ~50 ms; en el iPhone un deslizamiento rápido llega así, de golpe.)
    await caso("un deslizamiento rápido y corto (50 px) a la derecha", "cuenta", async () => dedo(await sobre(p.getByText("Reparación de mando PS5").first(), 120), 50, 0, 1, 0));
    // La distancia cuenta desde que el dedo toca: 75 px despacio bastan (antes contaba desde que se reconocía el gesto).
    await caso("un deslizamiento medio y lento (75 px) a la izquierda", "seguimientos", async () => dedo(await sobre(p.locator("#perfil-cabecera"), 300), -75, 0, 10, 40));
    await p.locator("#perfil-pestanas").getByText("Mi cuenta", { exact: true }).click();
    await p.locator("#perfil-cabecera").waitFor({ timeout: 8000 }).catch(() => {});
    await caso("arrastrar poco y despacio (40 px) no cambia", "cuenta", async () => dedo(await sobre(p.locator("#perfil-cabecera"), 300), -40, 0, 10, 30));
    await caso("en «Mi cuenta», deslizar a la derecha no hace nada (no hay otra pestaña)", "cuenta", async () => dedo(await sobre(p.locator("#perfil-cabecera"), 90), 200, 0));
    await p.locator("#perfil-pestanas").getByText("Mis seguimientos", { exact: true }).click();
    await p.getByText("Reparaciones y Mantenimientos").waitFor({ timeout: 8000 }).catch(() => {});
    // Tres pestañas (dueño, 2026-11-03): desde «Mis seguimientos», a la izquierda está «Me gusta», la última.
    await caso("en «Mis seguimientos», deslizar a la izquierda abre «Me gusta»", "megusta", async () => dedo(await sobre(p.getByText("Reparación de mando PS5").first(), 300), -200, 0));
    await p.locator("#perfil-me-gusta").waitFor({ timeout: 8000 }).catch(() => {});
    await caso("en «Me gusta», deslizar a la izquierda no hace nada (es la última)", "megusta", async () => dedo(await sobre(p.locator("#perfil-me-gusta"), 300), -200, 0));
    await caso("y a la derecha vuelve a «Mis seguimientos»", "seguimientos", async () => dedo(await sobre(p.locator("#perfil-me-gusta"), 90), 200, 0));
    await p.getByText("Reparaciones y Mantenimientos").waitFor({ timeout: 8000 }).catch(() => {});
    // Vertical: la página se desplaza como siempre y no cambia de pestaña.
    const zona = await deslizable();
    const s0 = await scroll();
    await caso("deslizar hacia arriba desplaza la página", "seguimientos", async () => dedo({ x: zona.x + zona.width / 2, y: 600 }, 6, -300));
    const s1 = await scroll();
    ok(s1 > s0 + 100, `R: y la página baja (de ${s0} a ${s1} px)`);
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `R: al deslizar la página no se ensancha (${ancho.a}/${ancho.p})`);
    ok(p.errores.length === 0, `R: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    ok(casos.length >= 12 && casos.every(Boolean), `R: el gesto funciona en los ${casos.length} casos`);
    await ctx.close();
  }

  // R3) Un correo largo cabe en su recuadro (letra algo más pequeña) sin salirse.
  {
    const LARGO = { ...CLIENTE, email: "daniel.gutierrez.martinez@example.com" };
    const estado = { filas: [{ ...perfilCompleto(CLIENTE.id)[0], provincia: "" }], guardados: [] };
    const ctx = await contexto(navegador, LARGO, "user", estado);
    const p = await pagina(ctx, "/perfil");
    const correo = p.locator("#perfil-datos #perfil-correo");
    await correo.waitFor({ timeout: 30000 }).catch(() => {});
    const m = await correo.evaluate((c) => ({ cabe: c.scrollWidth <= c.clientWidth + 1, texto: c.innerText, ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) })).catch(() => null);
    ok(!!m && m.cabe && m.texto === LARGO.email && m.ancho <= 391, `R: un correo largo (${LARGO.email.length} letras) se lee entero en su recuadro (${JSON.stringify(m)})`);
    await capturar(p, "R3-correo-largo");
    await ctx.close();
  }

  // R4) Administrador: el aviso del panel junto a sus botones y «Panel de control» al lado de «Cerrar sesión», en la tarjeta.
  {
    const estado = { filas: perfilCompleto(ADMIN.id), guardados: [] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 });
    const panel = p.locator("#perfil-datos").getByRole("button", { name: "Panel de control" });
    await panel.waitFor({ timeout: 10000 }).catch(() => {});
    const salir = p.locator("#perfil-datos").getByRole("button", { name: "Cerrar sesión" });
    const aviso = p.locator("#perfil-datos").getByText("Esta cuenta tiene acceso al panel de administración.", { exact: true });
    ok((await p.getByText("Panel de control", { exact: true }).count()) === 1 && (await panel.count()) === 1, "R: «Panel de control» está dentro de «Mi perfil» (ya no en una tarjeta aparte)");
    ok((await aviso.count()) === 1 && (await p.getByText(/panel de administración/).count()) === 1, "R: el aviso «Esta cuenta tiene acceso al panel de administración.» sale una vez, con sus botones");
    const [bp, bs, ba, tarjeta] = [await panel.boundingBox(), await salir.boundingBox(), await aviso.boundingBox(), await p.locator("#perfil-datos").boundingBox()];
    ok(enFila(bp, bs) && bp.x > bs.x && bp.height >= 44 && bs.height >= 44 && Math.abs(bp.width - bs.width) < 2, `R: los dos botones en la misma fila, iguales y de 44 px o más, «Panel de control» a la derecha (al alcance del pulgar) (${JSON.stringify({ panel: bp, salir: bs })})`);
    ok(!!ba && ba.y + ba.height <= Math.min(bp.y, bs.y) + 1 && Math.min(bp.y, bs.y) - (ba.y + ba.height) < 24, "R: el aviso va justo encima de los botones");
    ok(dentro(bp, tarjeta) && dentro(bs, tarjeta), "R: y todo dentro de la tarjeta de «Mi perfil»");
    // Los textos de los botones se leen enteros (sin «Panel de con…»), también en un móvil estrecho.
    const enteros = () => p.evaluate(() => ["Cerrar sesión", "Panel de control"].map((t) => {
      const b = document.querySelector(`#perfil-datos [aria-label="${t}"]`);
      const n = b && Array.from(b.querySelectorAll("*")).find((e) => e.children.length === 0 && e.textContent.trim() === t);
      return n ? n.scrollWidth <= n.clientWidth + 1 : false;
    }));
    const a390 = await enteros();
    await p.setViewportSize({ width: 360, height: 780 });
    await p.waitForTimeout(500);
    const a360 = await enteros();
    await capturar(p, "R4b-admin-360");
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(500);
    ok(a390.every(Boolean) && a360.every(Boolean), `R: «Cerrar sesión» y «Panel de control» se leen enteros (390 px: ${a390.join("/")}; 360 px: ${a360.join("/")})`);
    const cab = await lineas(p.locator("#perfil-cabecera"));
    ok(cab[1] === "Tu cuenta está activa", `R: el administrador también ve «Tu cuenta está activa» bajo «Mi perfil» (${cab.join(" | ")})`);
    await capturar(p, "R4-admin-plegado");
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(400);
    const ba2 = await aviso.boundingBox();
    const bg = await p.getByRole("button", { name: "Guardar perfil" }).boundingBox();
    ok(!!ba2 && !!bg && ba2.y > bg.y, "R: abierto, el aviso y los botones de la cuenta quedan debajo de «Guardar perfil»");
    await capturar(p, "R5-admin-abierto");
    await panel.click();
    await p.waitForURL(/\/admin(\?|$|\/)/, { timeout: 15000 }).catch(() => {});
    ok(/\/admin(\?|$|\/)/.test(new URL(p.url()).pathname + new URL(p.url()).search) || new URL(p.url()).pathname === "/admin", `R: «Panel de control» abre el panel (${new URL(p.url()).pathname})`);
    ok(p.errores.length === 0, `R: administrador sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== S) Panel de control: el número de novedades de cada recuadro ===============================================
async function seccionS() {
  const hace = (ms) => new Date(Date.now() - ms).toISOString();
  const H = 3600000;
  const D = 24 * H;
  const estado = {
    filas: [{ user_id: ADMIN.id, nombre: "Dani", usuario: "dani", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02" }],
    guardados: [],
    // Administración → Chat sin conversaciones (ficticias: nada se pide a la base de datos real).
    chats: [],
    novedades: {
      // Fechas de cada fila: la primera vez cuenta lo de los últimos 7 días (lo de hace 10 días, no).
      pedidos: [hace(H), hace(2 * D), hace(10 * D)],
      service_requests: [hace(3 * H)],
      sell_requests: [hace(9 * D)],
      products: [hace(H)],
      escaparate_registro: Array.from({ length: 120 }, (_, i) => hace(i * 60000 + 1000)),
      profiles: [hace(H), hace(2 * H), hace(3 * D)],
      store_reviews: [hace(5 * H)],
      auditorias_web: [],
      chatsSinLeer: 2,
    },
  };
  const ctx = await contexto(navegador, ADMIN, "admin", estado);
  const p = await pagina(ctx, "/admin");
  await p.locator("#novedades-pedidos").waitFor({ timeout: 30000 }).catch(() => {});
  // Solo el panel que se ve (al volver desde una sección, el anterior puede seguir montado y oculto).
  const numero = async (s) => ((await p.locator(`#novedades-${s}:visible`).count()) ? (await p.locator(`#novedades-${s}:visible`).first().innerText()).trim() : "");
  // El número aparece con un salto: se mide cuando ya ha terminado.
  await p.waitForFunction(() => (document.getElementById("novedades-pedidos")?.getBoundingClientRect().width ?? 0) >= 25, null, { timeout: 8000 }).catch(() => {});
  const leidos = {};
  for (const s of ["pedidos", "services", "cotizaciones", "chats", "products", "escaparate", "users", "auditorias", "categories", "inventario", "policies"]) leidos[s] = await numero(s);
  ok(leidos.pedidos === "2" && leidos.services === "1" && leidos.chats === "2" && leidos.products === "1" && leidos.users === "4", `S: cada recuadro enseña sus novedades (${JSON.stringify(leidos)})`);
  ok(leidos.escaparate === "99+", `S: más de 99 se lee «99+» (${leidos.escaparate})`);
  ok(!leidos.cotizaciones && !leidos.auditorias, "S: sin nada nuevo (o solo de hace más de 7 días la primera vez) no sale ningún número");
  ok(!leidos.categories && !leidos.inventario && !leidos.policies, "S: los recuadros sin movimiento de fuera (Categorías, Inventario, Políticas) no llevan número");
  const etiqueta = async (t) => p.locator(`[role="button"][aria-label^="${t}"]:visible`).first().getAttribute("aria-label").catch(() => "");
  ok((await etiqueta("Pedidos")) === "Pedidos, 2 pedidos nuevos" && (await etiqueta("Usuarios y participación")) === "Usuarios y participación, 3 usuarios nuevos y 1 reseña nueva" && (await etiqueta("Chat")) === "Chat, 2 conversaciones sin leer", "S: un lector de pantalla dice qué es lo nuevo («Pedidos, 2 pedidos nuevos»)");
  const q = estado.consultasNovedades ?? [];
  const con = (t, re) => q.some((c) => c.startsWith(`${t}?`) && re.test(c));
  ok(con("products", /id_veoaura=not\.is\.null/) && con("escaparate_registro", /or=\(resultado\.eq\.error,evento\.eq\.vendido\)/) && con("profiles", /or=\(role\.is\.null,role\.neq\.admin\)/), "S: cuenta solo lo que llega de fuera (artículos de VeoAura, ventas o errores de VeoAura y usuarios que no son administradores)");
  ok(q.length > 0 && q.every((c) => /select=id/.test(c)), "S: solo pide el número (sin descargar filas)");
  const medidas = await p.evaluate(() => {
    const b = document.getElementById("novedades-pedidos")?.getBoundingClientRect();
    let t = document.getElementById("novedades-pedidos");
    while (t && t.getAttribute("role") !== "button") t = t.parentElement;
    const r = t?.getBoundingClientRect();
    return { b: b && { x: b.x, y: b.y, w: b.width, h: b.height }, t: r && { x: r.x, y: r.y, w: r.width, h: r.height }, ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth };
  });
  const esquina = !!medidas.b && !!medidas.t && medidas.b.x + medidas.b.w <= medidas.t.x + medidas.t.w + 1 && medidas.b.x + medidas.b.w >= medidas.t.x + medidas.t.w - 16 && medidas.b.y >= medidas.t.y - 1 && medidas.b.y <= medidas.t.y + 16;
  ok(esquina && medidas.b.h >= 24, `S: el número va en la esquina de arriba a la derecha de su recuadro, sin salirse (${JSON.stringify(medidas)})`);
  ok(medidas.ancho <= medidas.pantalla + 1, `S: la página no se ensancha (${medidas.ancho}/${medidas.pantalla})`);
  await capturar(p, "S1-panel-novedades");

  // Entrar en Pedidos: al volver, su número ya no está; lo que llegue después sí cuenta.
  await p.locator('[role="button"][aria-label^="Pedidos"]:visible').first().click();
  await p.waitForURL(/\/admin\/pedidos/, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  const guardado = await p.evaluate((id) => JSON.parse(localStorage.getItem(`videojuegoszaragoza:panel_vistos:${id}`) ?? "{}"), ADMIN.id);
  ok(!!guardado.pedidos && Math.abs(Date.parse(guardado.pedidos) - Date.now()) < 120000, `S: al entrar en Pedidos queda apuntado en el móvil que ya están vistos (${guardado.pedidos ?? "nada"})`);
  // Vuelta con su botón (sin recargar): el panel vuelve a contar al aparecer.
  await p.locator('[aria-label="Volver al panel"]:visible').first().click();
  await p.waitForURL(/\/admin\/?$/, { timeout: 15000 }).catch(() => {});
  await p.locator("#novedades-services:visible").first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  ok((await numero("pedidos")) === "" && (await numero("services")) === "1", `S: al volver, Pedidos ya no tiene número y el resto sigue (${await numero("pedidos")}/${await numero("services")})`);
  estado.novedades.pedidos.push(new Date(Date.now() + 60000).toISOString());
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.locator("#novedades-pedidos").waitFor({ timeout: 30000 }).catch(() => {});
  ok((await numero("pedidos")) === "1", `S: un pedido que llega después vuelve a sacar el número («1»: ${await numero("pedidos")})`);

  // Entrar por un enlace (sin tocar el recuadro) también cuenta como visto.
  await p.goto(`${BASE}/admin/services`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.locator("#novedades-pedidos").waitFor({ timeout: 30000 }).catch(() => {});
  ok((await numero("services")) === "", "S: entrar en Servicios por un enlace también los da por vistos");

  // El chat cuenta lo que está sin leer, aunque se haya entrado: se va cuando se leen las conversaciones.
  await p.goto(`${BASE}/admin/chats`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.locator("#novedades-chats").waitFor({ timeout: 30000 }).catch(() => {});
  ok((await numero("chats")) === "2", "S: el chat sigue con su número mientras haya conversaciones sin leer");
  estado.novedades.chatsSinLeer = 0;
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.locator("#novedades-users").waitFor({ timeout: 30000 }).catch(() => {});
  ok((await numero("chats")) === "", "S: leídas, el número del chat se va");

  // Si una consulta falla, ese dato no cuenta (nunca un número inventado) y el resto sigue.
  estado.novedades.fallan = ["store_reviews"];
  await p.goto(`${BASE}/admin`, { waitUntil: "load" });
  await p.locator("#novedades-users").waitFor({ timeout: 30000 }).catch(() => {});
  ok((await numero("users")) === "3" && (await etiqueta("Usuarios y participación")) === "Usuarios y participación, 3 usuarios nuevos", `S: si fallan las reseñas, Usuarios cuenta solo los registros (${await numero("users")})`);

  // Pantalla ancha: el número va antes de la flecha, dentro de su fila.
  await p.setViewportSize({ width: 1100, height: 800 });
  await p.waitForTimeout(600);
  const ancho = await p.evaluate(() => {
    const b = document.getElementById("novedades-users")?.getBoundingClientRect();
    let t = document.getElementById("novedades-users");
    while (t && t.getAttribute("role") !== "button") t = t.parentElement;
    const r = t?.getBoundingClientRect();
    return b && r ? { dentro: b.x >= r.x && b.x + b.width <= r.x + r.width && b.y >= r.y && b.y + b.height <= r.y + r.height, derecha: b.x > r.x + r.width / 2 } : null;
  });
  ok(!!ancho && ancho.dentro && ancho.derecha, `S: en pantalla ancha el número va a la derecha, dentro de la fila (${JSON.stringify(ancho)})`);
  await capturar(p, "S2-panel-ancho");
  ok(p.errores.length === 0, `S: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  await ctx.close();
}

// ===== T) TikTok e Instagram junto al logo de Inicio, con sus seguidores, y su parte en Administración =================
async function seccionT() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const red = (platform, label, sort_order, extra = {}) => ({ platform, label, url: "Videojuegoszaragoza", enabled: true, sort_order, seguidores: null, seguidores_actualizado: null, ...extra });
  const redes = () => [
    red("instagram", "Instagram", 1, { seguidores: 12560, seguidores_actualizado: "2026-10-30T10:00:00Z" }),
    red("tiktok", "TikTok", 2, { seguidores: 1234 }),
    red("whatsapp", "WhatsApp", 3, { url: "627748741" }),
  ];
  // La fila de ajustes de la tienda, con las reseñas en los canales de venta.
  const ajustes = (resenas = 350) => ({ id: 1, seo_title: "Videojuegos Zaragoza", social_links_title: "Síguenos", resenas_canales: resenas, resenas_canales_actualizado: resenas != null ? "2026-10-31T10:00:00Z" : null });
  const medir = (p) => p.evaluate(() => {
    const r = (id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, texto: e.innerText.replace(/\n+/g, " | "), etiqueta: e.getAttribute("aria-label") };
    };
    const titulo = document.querySelector('[role="heading"][aria-level="1"], h1')?.getBoundingClientRect();
    return { tiktok: r("inicio-tiktok"), instagram: r("inicio-instagram"), resenas: r("inicio-resenas"), fila: r("inicio-logo-redes"), titulo: titulo ? { y: titulo.y } : null, ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth };
  });

  // T1) Con los dos números: TikTok a la izquierda del logo, Instagram a la derecha, en su fila y sin salirse.
  {
    const estado = { filas: perfil, guardados: [], aceptaAnalitica: true, redes: redes(), ajustes: ajustes() };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#inicio-instagram").waitFor({ timeout: 30000 }).catch(() => {});
    const m = await medir(p);
    ok(!!m.tiktok && /1\.234 \| seguidores/.test(m.tiktok.texto) && !!m.instagram && /12,5 mil \| seguidores/.test(m.instagram.texto), `T: TikTok enseña «1.234 seguidores» e Instagram «12,5 mil seguidores» (${m.tiktok?.texto} / ${m.instagram?.texto})`);
    const centro = m.fila ? m.fila.x + m.fila.w / 2 : 0;
    const enLaFila = (b) => !!b && !!m.fila && b.y >= m.fila.y - 1 && b.y + b.h <= m.fila.y + m.fila.h + 1;
    ok(!!m.tiktok && !!m.instagram && m.tiktok.x + m.tiktok.w < centro - 50 && m.instagram.x > centro + 50 && enLaFila(m.tiktok) && enLaFila(m.instagram), `T: TikTok a la izquierda del logo e Instagram a la derecha, a su altura (${JSON.stringify({ tiktok: m.tiktok, instagram: m.instagram, fila: m.fila })})`);
    ok(Math.abs(centro - m.pantalla / 2) < 2, `T: el logo sigue en el centro de la pantalla (${Math.round(centro)} de ${m.pantalla})`);
    ok(m.tiktok.x >= 0 && m.instagram.x + m.instagram.w <= m.pantalla && m.tiktok.h >= 44 && m.instagram.h >= 44 && m.ancho <= m.pantalla + 1, `T: dentro de la pantalla, de 44 px o más y sin ensanchar la página (${m.ancho}/${m.pantalla})`);
    ok(m.tiktok.etiqueta === "TikTok: 1.234 seguidores. Abrir el perfil" && m.instagram.etiqueta === "Instagram: 12,5 mil seguidores. Abrir el perfil", `T: un lector de pantalla dice la red, los seguidores y que abre el perfil (${m.tiktok.etiqueta})`);
    // Debajo del logo, las reseñas en los canales de venta: centradas, antes del título.
    await p.locator("#inicio-resenas").waitFor({ timeout: 10000 }).catch(() => {});
    const mr = await medir(p);
    ok(!!mr.resenas && /350 reseñas \| en todos nuestros canales de venta/.test(mr.resenas.texto), `T: debajo del logo, «350 reseñas en todos nuestros canales de venta» (${mr.resenas?.texto})`);
    ok(!!mr.resenas && !!mr.fila && Math.abs(mr.resenas.x + mr.resenas.w / 2 - mr.pantalla / 2) < 3 && mr.resenas.y >= mr.fila.y + mr.fila.h - 2 && (!mr.titulo || mr.resenas.y + mr.resenas.h <= mr.titulo.y + 1), `T: centradas debajo del logo y antes del título (${JSON.stringify({ resenas: mr.resenas, fila: mr.fila, titulo: mr.titulo })})`);
    ok(mr.resenas?.etiqueta === "350 reseñas en todos nuestros canales de venta", `T: un lector de pantalla lo lee seguido (${mr.resenas?.etiqueta})`);
    await capturar(p, "T1-inicio-redes");

    // Al tocar Instagram se abre su perfil y se mide (analítica propia).
    await p.evaluate(() => {
      window.__abiertos = [];
      window.open = (u) => {
        window.__abiertos.push(String(u));
        return null;
      };
    });
    await p.locator("#inicio-instagram").click();
    await p.waitForTimeout(600);
    const abiertos = await p.evaluate(() => window.__abiertos);
    ok(abiertos.includes("https://www.instagram.com/Videojuegoszaragoza/"), `T: tocar Instagram abre su perfil (${abiertos.join(", ")})`);
    for (let i = 0; i < 20 && !(estado.eventosEnviados ?? []).some((e) => e.event_name === "redes_inicio"); i++) await p.waitForTimeout(400);
    const ev = (estado.eventosEnviados ?? []).find((e) => e.event_name === "redes_inicio");
    ok(!!ev && ev.metadata?.red === "instagram", `T: y se apunta en la analítica propia («redes_inicio», red instagram: ${JSON.stringify(ev?.metadata ?? null)})`);

    // Blue no se queda encima de ninguna de las dos.
    await p.locator("#blue-flotante").waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(4500);
    const tapa = await p.evaluate(() => {
      const blue = document.getElementById("blue-flotante");
      if (!blue) return "sin Blue";
      const b = blue.getBoundingClientRect();
      return ["inicio-tiktok", "inicio-instagram"].filter((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (!r) return false;
        return Math.min(b.right, r.right) - Math.max(b.left, r.left) > 12 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 12;
      }).join(", ");
    });
    ok(tapa === "", `T: Blue no tapa TikTok ni Instagram (${tapa || "ninguna"})`);
    // Y, al apartarse, tampoco se pone encima de otra cosa (el buscador, los botones…), como mira pruebas/movil.mjs.
    const tapados = await p.evaluate(() => {
      const blue = document.getElementById("blue-flotante");
      if (!blue) return ["sin Blue"];
      const b = blue.getBoundingClientRect();
      return Array.from(document.querySelectorAll('button,a,input,[role="button"],[role="link"],[role="tab"],[tabindex="0"]'))
        .filter((el) => !el.closest("#blue-flotante"))
        .filter((el) => el.getBoundingClientRect().width < window.innerWidth * 0.95)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return false;
          return Math.min(b.right, r.right) - Math.max(b.left, r.left) > 12 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 12;
        })
        .map((el) => (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || el.tagName).trim().slice(0, 40));
    });
    ok(tapados.length === 0, `T: Blue no se pone encima de ningún botón ni campo (${tapados.join(" · ") || "ninguno"}; Blue en ${JSON.stringify(await p.evaluate(() => { const r = document.getElementById("blue-flotante")?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; }))})`);
    await capturar(p, "T2-inicio-con-blue");
    ok(p.errores.length === 0, `T: Inicio sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);

    // En un móvil de 320 px, las reseñas también caben y se leen enteras.
    await p.setViewportSize({ width: 320, height: 700 });
    await p.waitForTimeout(600);
    const r320 = await p.evaluate(() => {
      const r = document.getElementById("inicio-resenas")?.getBoundingClientRect();
      return {
        dentro: !!r && r.x >= 0 && r.x + r.width <= window.innerWidth,
        cortados: Array.from(document.querySelectorAll("#inicio-resenas *")).filter((n) => n.children.length === 0 && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
        ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      };
    });
    ok(r320.dentro && r320.cortados.length === 0 && r320.ancho <= 321, `T: en 320 px las reseñas caben y se leen enteras (${JSON.stringify(r320)})`);
    await capturar(p, "T2b-inicio-320-resenas");
    await ctx.close();
  }

  // T3) Sin número dice «Síguenos»; una red desactivada no sale y el logo sigue en el centro.
  {
    const lista = redes();
    lista[0].seguidores = null;
    lista[1].enabled = false;
    const estado = { filas: perfil, guardados: [], redes: lista, ajustes: ajustes(null) };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#inicio-instagram").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    const m = await medir(p);
    ok(!!m.instagram && /^Síguenos \| en Instagram$/.test(m.instagram.texto.trim().replace(/^\S+ \| /, "")) && m.instagram.etiqueta === "Síguenos en Instagram. Abrir el perfil", `T: sin número, Instagram dice «Síguenos en Instagram» (${m.instagram?.texto})`);
    ok(!m.tiktok && !!m.fila && Math.abs(m.fila.x + m.fila.w / 2 - m.pantalla / 2) < 2, "T: TikTok desactivado no sale y el logo sigue en el centro");
    ok(!m.resenas, "T: sin número de reseñas, debajo del logo no sale nada");
    await ctx.close();
  }

  // T4) Sin la migración (no existe la columna): «Síguenos» en las dos, sin errores.
  {
    const estado = { filas: perfil, guardados: [], redes: redes(), ajustes: ajustes(), redesSinColumna: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#inicio-tiktok").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    const m = await medir(p);
    ok(!!m.tiktok && /Síguenos \| en TikTok/.test(m.tiktok.texto) && !!m.instagram && /Síguenos \| en Instagram/.test(m.instagram.texto), `T: sin la migración salen las dos con «Síguenos» (${m.tiktok?.texto} / ${m.instagram?.texto})`);
    ok(!m.resenas, "T: y sin la migración de las reseñas, debajo del logo no sale nada");
    ok(p.errores.length === 0, `T: y sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    ok(!estado.redes400, `T: y sin pedir la columna que aún no existe (ninguna petición fallida, 400, en la consola: ${estado.redes400 ?? 0})`);

    // Móvil estrecho (320 px): todo cabe y se lee entero.
    await p.setViewportSize({ width: 320, height: 700 });
    await p.waitForTimeout(600);
    const e = await p.evaluate(() => ({
      ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      cortados: Array.from(document.querySelectorAll("#inicio-tiktok *, #inicio-instagram *")).filter((n) => n.children.length === 0 && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
      dentro: ["inicio-tiktok", "inicio-instagram"].every((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return !!r && r.x >= 0 && r.x + r.width <= window.innerWidth;
      }),
    }));
    ok(e.ancho <= 321 && e.cortados.length === 0 && e.dentro, `T: en un móvil de 320 px todo cabe y se lee entero (${JSON.stringify(e)})`);
    await capturar(p, "T3-inicio-320");
    await ctx.close();
  }

  // T5) Administración → Redes sociales: los seguidores de TikTok e Instagram, cuántos los tocan y lo que se guarda.
  {
    const ahora = new Date().toISOString();
    const estado = {
      filas: [],
      guardados: [],
      redes: redes(),
      ajustes: ajustes(),
      eventos: [
        { event_name: "redes_inicio", session_id: "s1", metadata: { red: "tiktok" }, created_at: ahora },
        { event_name: "redes_inicio", session_id: "s1", metadata: { red: "tiktok" }, created_at: ahora },
        { event_name: "redes_inicio", session_id: "s2", metadata: { red: "tiktok" }, created_at: ahora },
        { event_name: "redes_inicio", session_id: "s2", metadata: { red: "instagram" }, created_at: ahora },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/redes-sociales");
    const tiktok = p.locator('[aria-label="Seguidores de TikTok"]');
    await tiktok.waitFor({ timeout: 30000 }).catch(() => {});
    ok((await tiktok.inputValue().catch(() => "")) === "1234" && (await p.locator('[aria-label="Seguidores de Instagram"]').inputValue().catch(() => "")) === "12560" && (await p.locator('[aria-label="Seguidores de WhatsApp"]').count()) === 0, "T: Administración enseña los seguidores de TikTok e Instagram (y de nadie más)");
    const texto = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/En Inicio: 12,5 mil seguidores · escrito el 30 oct 2026/.test(texto), "T: y cómo se ven en Inicio y cuándo se escribieron («12,5 mil seguidores · escrito el 30 oct 2026»)");
    const toques = await p.locator("#redes-toques-inicio").innerText().catch(() => "");
    ok(/3 toques en TikTok y 1 en Instagram · 2 visitas distintas/.test(toques), `T: cuenta los toques desde Inicio (${toques})`);
    await tiktok.fill("2.500");
    ok((await tiktok.inputValue()) === "2500", "T: el campo solo admite cifras («2.500» queda en 2500)");
    // Reseñas en los canales de venta.
    const resenas = p.locator('[aria-label="Reseñas en los canales de venta"]');
    ok((await resenas.inputValue().catch(() => "")) === "350" && /Debajo del logo de Inicio: «350 reseñas en todos nuestros canales de venta» · escrito el 31 oct 2026/.test(texto), "T: Administración enseña las reseñas en los canales de venta, cómo se ven en Inicio y cuándo se escribieron");
    await resenas.fill("1.200");
    ok((await resenas.inputValue()) === "1200", "T: las reseñas, también solo cifras («1.200» queda en 1200)");
    await capturar(p, "T4-admin-redes");
    await p.getByText("Guardar cambios", { exact: true }).click();
    await p.getByText(/^Guardado\./).waitFor({ timeout: 10000 }).catch(() => {});
    const aj = (estado.ajustesGuardados ?? []).at(-1);
    ok(aj?.resenas_canales === 1200 && !Number.isNaN(Date.parse(aj?.resenas_canales_actualizado ?? "")) && aj?.social_links_title === "Síguenos", `T: guarda las reseñas con la fecha, junto al título (${JSON.stringify(aj)})`);
    const g = (pl) => (estado.redesGuardadas ?? []).find((x) => x.plataforma === pl)?.cuerpo;
    ok(g("tiktok")?.seguidores === 2500 && !Number.isNaN(Date.parse(g("tiktok")?.seguidores_actualizado ?? "")), `T: guarda los seguidores de TikTok con la fecha (${JSON.stringify(g("tiktok"))})`);
    ok(g("instagram")?.seguidores === 12560 && !("seguidores_actualizado" in (g("instagram") ?? {})) && !("seguidores" in (g("whatsapp") ?? { seguidores: 1 })), "T: Instagram sin cambiar no cambia su fecha y WhatsApp no lleva seguidores");
    ok((await p.getByText(/^Guardado\./).count()) === 1, "T: dice «Guardado.»");
    ok(p.errores.length === 0, `T: Administración sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // T6) Administración sin la migración: el campo avisa y lo demás se guarda igual.
  {
    const estado = { filas: [], guardados: [], redes: redes(), ajustes: ajustes(), redesSinColumna: true };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/redes-sociales");
    await p.locator('[aria-label="Seguidores de TikTok"]').waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.getByText(/Se podrá guardar en cuanto se active su parte en la base de datos/).count()) === 3, "T: sin la migración, los campos de seguidores y de reseñas avisan de que aún no se guardan");
    ok(!estado.redes400, `T: y Administración tampoco pide las columnas que aún no existen (${estado.redes400 ?? 0} peticiones fallidas)`);
    await p.getByText("Guardar cambios", { exact: true }).click();
    await p.getByText(/^Guardado\./).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.getByText(/^Guardado\./).count()) === 1 && (estado.redesGuardadas ?? []).length === 3 && (estado.redesGuardadas ?? []).every((x) => !("seguidores" in x.cuerpo)), "T: y los enlaces se guardan igual (sin los seguidores)");
    const aj = (estado.ajustesGuardados ?? []).at(-1);
    ok(!!aj && aj.social_links_title === "Síguenos" && !("resenas_canales" in aj), `T: y el título se guarda sin las reseñas (${JSON.stringify(aj)})`);
    await ctx.close();
  }
}

// ===== V) Blue dentro del Panel de control: solo lo del panel ======================================================
async function seccionV() {
  const estado = {
    filas: [{ user_id: ADMIN.id, nombre: "Dani", usuario: "dani", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02" }],
    guardados: [],
    // Lo del panel: 2 clientes han escrito, 1 venta de VeoAura sin confirmar y 1 pedido olvidado (48 h sin cambios).
    novedades: { chatsSinLeer: 2 },
    salida: 1,
    olvidados: { pedidos: 1, reparaciones: 0 },
    chats: [],
  };
  const ctx = await contexto(navegador, ADMIN, "admin", estado);
  const limpio = (t) => t.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const abrirBlue = async (p) => {
    await p.waitForSelector("#blue-flotante", { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').first().click();
    await p.waitForTimeout(1200);
    return (await p.getByRole("tab").allInnerTexts()).map(limpio).filter((t) => /^(Asistente|Avisos del panel|Noticias y avisos)/.test(t));
  };
  const textoVentana = (p) => p.evaluate(() => document.body.innerText.replace(/\n/g, " "));

  // En la tienda (control): el dueño ve en Blue los avisos de la tienda, como siempre.
  {
    const p = await pagina(ctx, "/");
    const pestanas = await abrirBlue(p);
    await p.getByRole("tab", { name: /Noticias y avisos/ }).first().click().catch(() => {});
    await p.waitForTimeout(600);
    const t = await textoVentana(p);
    ok(pestanas.some((x) => x.startsWith("Noticias y avisos")) && /Hay novedades en el Foro/.test(t) && /MIS AVISOS/i.test(t), `V: en la tienda, Blue enseña sus avisos de siempre (Foro, Mis avisos…) (${pestanas.join(" · ")})`);
    await p.close();
  }

  // En el Panel de control: el número rojo y la ventana solo con lo del panel.
  {
    const p = await pagina(ctx, "/admin");
    await p.waitForSelector("#blue-flotante", { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(3000);
    const numero = await p.evaluate(() => (document.getElementById("blue-flotante")?.innerText ?? "").replace(/\D/g, ""));
    ok(numero === "4", `V: en el panel, el número rojo de Blue solo cuenta lo del panel (2 clientes + 1 venta de VeoAura + 1 olvidado = 4: ${numero || "sin número"})`);
    const pestanas = await abrirBlue(p);
    ok(pestanas.includes("Asistente") && pestanas.some((x) => /^Avisos del panel4$/.test(x)) && !pestanas.some((x) => x.startsWith("Noticias y avisos")), `V: sus pestañas son «Asistente» y «Avisos del panel» (con 4) (${pestanas.join(" · ")})`);
    await p.getByRole("tab", { name: /Avisos del panel/ }).first().click().catch(() => {});
    await p.waitForTimeout(600);
    const avisos = await p.locator("#blue-avisos-panel").innerText().catch(() => "");
    ok(/2 clientes te han escrito/.test(avisos) && /VeoAura aún no se ha confirmado/.test(avisos) && /1 pedido lleva más de 48 h sin cambios/.test(avisos),`V: «Avisos del panel» enseña los clientes que han escrito, la venta de VeoAura y el pedido olvidado (${avisos.replace(/\n/g, " | ")})`);
    const t = await textoVentana(p);
    ok(!/Hay novedades en el Foro/.test(t) && !/MIS AVISOS/i.test(t) && !/Avísame cuando llegue/.test(t) && !/NOTICIAS/.test(t), "V: y ninguno de la tienda (ni el Foro, ni las noticias, ni «Mis avisos»)");
    await p.getByRole("tab", { name: /Asistente/ }).first().click().catch(() => {});
    await p.waitForTimeout(600);
    const asistente = await textoVentana(p);
    ok(/Ir al Panel de control/.test(asistente) && /Lo que Blue sabe/.test(asistente) && /Volver a la tienda/.test(asistente), "V: el Asistente ofrece ir al panel, «Lo que Blue sabe» y volver a la tienda");
    ok(!/Ver la guía de la tienda/.test(asistente) && !/Vender mi consola/.test(asistente) && !/GUÍAS RÁPIDAS/i.test(asistente), "V: sin las guías de la tienda ni «Vender»");
    await capturar(p, "V1-blue-en-el-panel");
    // (el de la ventana de Blue, que va encima del recuadro del panel con el mismo nombre)
    await p.getByText("Lo que Blue sabe", { exact: true }).last().click();
    await p.waitForURL(/\/admin\/conocimiento/, { timeout: 15000 }).catch(() => {});
    ok(/\/admin\/conocimiento/.test(p.url()), `V: «Lo que Blue sabe» lleva a su sección (${new URL(p.url()).pathname})`);
    ok(p.errores.length === 0, `V: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await p.close();
  }
  await ctx.close();

  // Los mensajes que Blue dice solo: en la tienda, los de la tienda; al entrar en el panel (sin recargar), solo los de
  // Administración (el pedido olvidado), nunca uno de la tienda aunque se hubiera quedado esperando turno.
  {
    const estado2 = { ...estado, guardados: [], aceptaAnalitica: true };
    const ctx2 = await contexto(navegador, ADMIN, "admin", estado2);
    const p = await pagina(ctx2, "/");
    // Lo que dice Blue ahora mismo ("" si no dice nada), sin esperar a que aparezca.
    const mensaje = () => p.evaluate(() => document.getElementById("blue-mensaje")?.innerText ?? "").catch(() => "");
    // 20 s en la tienda: lo que diga (si dice algo) no es del panel.
    let enTienda = "";
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(1000);
      enTienda = (await mensaje()).replace(/\n/g, " ") || enTienda;
    }
    ok(!/48 h sin cambios|Lo que Blue sabe|me lo cuentas/.test(enTienda), `V: en la tienda, Blue no dice los mensajes del panel (${enTienda.slice(0, 80) || "no ha dicho nada"})`);
    // Al panel por Perfil → «Panel de control» (sin recargar: Blue sigue montado).
    await p.locator('[data-testid="pestana-perfil"]').first().click();
    await p.locator("#perfil-datos").getByRole("button", { name: "Panel de control" }).click({ timeout: 30000 });
    await p.waitForURL(/\/admin\/?$/, { timeout: 15000 }).catch(() => {});
    const vistos = new Set();
    for (let i = 0; i < 24; i++) {
      await p.waitForTimeout(1000);
      const t = (await mensaje()).replace(/\n/g, " ").trim();
      if (t) vistos.add(t);
    }
    const lista = [...vistos];
    ok(lista.some((t) => /48 h sin cambios/.test(t)), `V: dentro del panel, Blue dice lo del panel (el pedido olvidado: ${lista.join(" / ").slice(0, 120) || "nada"})`);
    ok(!lista.some((t) => t === enTienda || /Foro|Realizamos entregas|instalar|Instala/.test(t)), `V: y ningún mensaje de la tienda (${lista.length} mensajes vistos)`);
    ok(p.errores.length === 0, `V: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx2.close();
  }
}

// ===== W) Portadas de las categorías en Inicio (foto de fondo con el nombre encima) y cuánto se ven (editor) ========
async function seccionW() {
  const foto = "https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/categorias/ps5.jpg";
  const cat = (id, slug, name, extra = {}) => ({
    id, slug, name, sort_order: 0, is_active: true, image_url: null, imagenes: [], portada_opacidad: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
  });
  const categorias = () => [
    cat("c0000000-0000-4000-8000-0000000000a1", "playstation-5", "PlayStation 5", { image_url: foto, imagenes: [foto], portada_opacidad: 40 }),
    cat("c0000000-0000-4000-8000-0000000000a2", "playstation-4", "PlayStation 4", { sort_order: 1 }),
  ];
  const perfil = (id) => [{ user_id: id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const verCategorias = async (p) => {
    await p.locator('[data-testid="seccion-categorias"]').scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('[data-testid="categoria-playstation-5"] img').first().waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
  };
  const medirInicio = (p) => p.evaluate(() => {
    const t = document.querySelector('[data-testid="categoria-playstation-5"]');
    const t4 = document.querySelector('[data-testid="categoria-playstation-4"]');
    if (!t) return null;
    const r = (n) => n?.getBoundingClientRect();
    // El recuadro (la foto o el icono) y, encima, fuera de la foto, el nombre.
    const caja = t.querySelector('[data-recuadro="1"]');
    const caja4 = t4?.querySelector('[data-recuadro="1"]');
    const capa = t.querySelector("#portada-foto");
    const nombre = t.querySelector('[data-categoria-nombre="1"]');
    const [rt, rn, ri] = [r(caja), r(nombre), r(capa)];
    return {
      opacidad: capa ? Number(getComputedStyle(capa).opacity) : null,
      conFoto: !!t.querySelector("img"),
      nombreEncima: !!rn && !!ri && rn.bottom <= ri.top && rn.left >= rt.left - 1 && rn.right <= rt.right + 1 && /PlayStation 5/.test(nombre.textContent),
      fotoLlena: !!ri && !!rt && Math.abs(ri.width - rt.width) <= 3 && Math.abs(ri.height - rt.height) <= 3,
      cortado: !!nombre && nombre.scrollWidth > nombre.clientWidth + 1,
      altoIgual: !!caja4 && !!rt && Math.abs(r(caja4).height - rt.height) <= 1 && Math.abs(r(caja4).top - rt.top) <= 1,
      ps4ConIcono: !!t4 && !t4.querySelector("img") && /PlayStation 4/.test(t4.innerText),
      ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      pantalla: window.innerWidth,
      etiqueta: t.getAttribute("aria-label"),
      // Forma de la portada (ancho / alto): en el móvil, la del encuadre del editor (6:5).
      forma: ri ? ri.width / ri.height : null,
      // «Ver categoría» ya no se ve en ningún recuadro (lo quitó el dueño).
      conVerCategoria: /Ver categoría|Ver servicios/.test(document.querySelector('[data-testid="seccion-categorias"]')?.innerText ?? ""),
    };
  });

  // W1) Inicio: la portada llena el recuadro, el nombre va encima y la foto sale al % elegido (40).
  {
    const estado = { filas: perfil(CLIENTE.id), guardados: [], categorias: categorias() };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await verCategorias(p);
    const m = await medirInicio(p);
    ok(!!m && m.conFoto && m.fotoLlena && m.nombreEncima, `W: en Inicio, la portada de PlayStation 5 llena su recuadro y el nombre va ENCIMA del recuadro, fuera de la foto (${JSON.stringify(m)})`);
    ok(!!m && Math.abs(m.opacidad - 0.4) < 0.01, `W: la foto sale al 40 % que eligió el dueño (${m?.opacidad})`);
    ok(!!m && !m.cortado && m.etiqueta === "PlayStation 5. Ver categoría", `W: el nombre se lee entero y un lector de pantalla dice qué es (${m?.etiqueta})`);
    ok(!!m && m.ps4ConIcono && m.altoIgual, "W: la categoría sin portada sigue con su icono y los dos recuadros de la fila miden lo mismo y empiezan a la misma altura");
    ok(!!m && m.ancho <= m.pantalla + 1, `W: la página no se ensancha (${m?.ancho}/${m?.pantalla})`);
    ok(!!m && !m.conVerCategoria, "W: ningún recuadro de Categorías dice «Ver categoría» ni «Ver servicios»");
    ok(!!m && Math.abs(m.forma - 6 / 5) < 0.03, `W: en el móvil la portada tiene la forma del encuadre del editor, 6:5 (${m?.forma?.toFixed(3)})`);
    await p.locator('[data-testid="seccion-categorias"]').screenshot({ path: SALIDA ? join(SALIDA, "W1-categorias-inicio.png") : undefined }).catch(() => {});
    ok(p.errores.length === 0, `W: Inicio sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // W2) Sin la migración: la foto sale al 55 % y sin peticiones fallidas.
  {
    const estado = { filas: perfil(CLIENTE.id), guardados: [], categorias: categorias(), categoriasSinColumna: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await verCategorias(p);
    const m = await medirInicio(p);
    ok(!!m && m.conFoto && Math.abs(m.opacidad - 0.55) < 0.01 && !estado.categorias400, `W: sin la migración, la foto sale al 55 % y no hay peticiones fallidas (${m?.opacidad}; ${estado.categorias400 ?? 0} fallidas)`);
    await ctx.close();
  }

  // W2b) La portada cambia desde otro aparato (el panel en el ordenador) con Inicio abierto en el móvil: al volver a la
  // tienda pasados 15 s (otra app, el móvil bloqueado…), Inicio la vuelve a pedir y sale como la dejó el dueño, sin
  // cerrar la tienda. Antes seguía con la de cuando se abrió (por eso no se veía la portada nueva en Inicio).
  {
    const estado = { filas: perfil(CLIENTE.id), guardados: [], categorias: categorias() };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await verCategorias(p);
    const antes = await medirInicio(p);
    estado.categorias = estado.categorias.map((f) => (f.slug === "playstation-5" ? { ...f, portada_opacidad: 70 } : f));
    const salirYVolver = () =>
      p.evaluate(() => {
        const poner = (v) => Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
        poner("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        poner("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
    await salirYVolver(); // enseguida: no hace falta pedirlas otra vez
    await p.waitForTimeout(800);
    const pronto = await medirInicio(p);
    await p.waitForTimeout(15500);
    await salirYVolver();
    await p.waitForTimeout(1500);
    const despues = await medirInicio(p);
    ok(
      Math.abs((antes?.opacidad ?? 0) - 0.4) < 0.01 && Math.abs((pronto?.opacidad ?? 0) - 0.4) < 0.01 && Math.abs((despues?.opacidad ?? 0) - 0.7) < 0.01,
      `W: con Inicio abierto, un cambio hecho desde otro aparato se ve al volver a la tienda (antes ${antes?.opacidad}, al momento ${pronto?.opacidad}, pasados 15 s ${despues?.opacidad})`
    );
    ok(p.errores.length === 0, `W: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // W3) El dueño, desde Inicio: Perfil → Panel de control → Categorías → Editar; mueve la barra, guarda y, al volver
  // atrás (sin recargar), Inicio ya enseña la foto como la dejó.
  {
    const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: categorias() };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/");
    await verCategorias(p);
    const antes = await medirInicio(p);
    await p.locator('[data-testid="pestana-perfil"]').first().click();
    await p.locator("#perfil-datos").getByRole("button", { name: "Panel de control" }).click({ timeout: 30000 });
    await p.waitForURL(/\/admin\/?$/, { timeout: 15000 }).catch(() => {});
    await p.locator('[role="button"][aria-label^="Categorías"]:visible').first().click({ timeout: 30000 });
    await p.waitForURL(/\/admin\/categories/, { timeout: 15000 }).catch(() => {});
    await p.getByRole("button", { name: /^Editar/ }).first().click({ timeout: 30000 });
    await p.locator("#categoria-opacidad").waitFor({ timeout: 15000 }).catch(() => {});
    const valor = () => p.locator("#categoria-opacidad-valor").innerText().catch(() => "");
    const previa = () => p.evaluate(() => Number(getComputedStyle(document.querySelector("#categoria-opacidad #portada-foto")).opacity));
    ok((await valor()) === "40" && Math.abs((await previa()) - 0.4) < 0.01 && /Cómo se ve en Inicio/.test(await p.locator("#categoria-opacidad").innerText()), "W: el editor enseña «Cómo se ve en Inicio» con la foto al 40 %");
    await p.getByRole("button", { name: "Foto más suave" }).click();
    ok((await valor()) === "30" && Math.abs((await previa()) - 0.3) < 0.01, `W: «−» la deja más suave de 10 en 10 y la vista previa cambia al momento (${await valor()} %)`);
    await p.getByRole("button", { name: "Foto más fuerte" }).click();
    await p.getByRole("button", { name: "Foto más fuerte" }).click();
    ok((await valor()) === "50" && Math.abs((await previa()) - 0.5) < 0.01, `W: «+» la deja más fuerte de 10 en 10 (${await valor()} %)`);
    await p.evaluate(() => {
      const barra = document.querySelector('#categoria-opacidad input[type="range"]');
      const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      poner.call(barra, "75");
      barra.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await p.waitForTimeout(200);
    ok((await valor()) === "75" && Math.abs((await previa()) - 0.75) < 0.01, `W: la barra la pone al 75 % (${await valor()} %)`);
    const tamanos = await p.evaluate(() =>
      ["Foto más suave", "Foto más fuerte"].map((t) => Math.round(document.querySelector(`[aria-label="${t}"]`)?.getBoundingClientRect().height ?? 0))
        .concat([Math.round(document.querySelector('#categoria-opacidad input[type="range"]')?.getBoundingClientRect().height ?? 0)])
    );
    ok(tamanos.every((h) => h >= 44), `W: «−», «+» y la barra se tocan bien, de 44 px (${tamanos.join(", ")})`);
    await capturar(p, "W2-editor-categoria");
    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-opacidad").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const guardada = (estado.categoriasGuardadas ?? []).at(-1)?.cuerpo;
    ok(guardada?.portada_opacidad === 75, `W: al guardar se manda la foto al 75 % (${JSON.stringify(guardada)})`);
    // Atrás hasta Inicio (sin recargar la página): Inicio se había quedado abierto con la foto al 40 %.
    for (let i = 0; i < 3 && new URL(p.url()).pathname !== "/"; i++) {
      await p.goBack().catch(() => {});
      await p.waitForTimeout(800);
    }
    await verCategorias(p);
    const despues = await medirInicio(p);
    ok(new URL(p.url()).pathname === "/" && Math.abs((antes?.opacidad ?? 0) - 0.4) < 0.01 && Math.abs((despues?.opacidad ?? 0) - 0.75) < 0.01, `W: de vuelta en Inicio (sin recargar), la foto ya sale al 75 % (antes ${antes?.opacidad}, ahora ${despues?.opacidad})`);
    ok(p.errores.length === 0, `W: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // W4) El editor sin la migración: avisa y guarda lo demás sin la transparencia.
  {
    const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: categorias(), categoriasSinColumna: true };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: /^Editar/ }).first().click({ timeout: 30000 });
    await p.locator("#categoria-opacidad").waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Se podrá guardar en cuanto se active su parte en la base de datos; mientras, en Inicio sale al 55 %/.test(await p.locator("#categoria-opacidad").innerText().catch(() => "")), "W: sin la migración, el editor avisa de que la transparencia aún no se guarda");
    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-opacidad").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const guardada = (estado.categoriasGuardadas ?? []).at(-1)?.cuerpo;
    ok(!!guardada && !("portada_opacidad" in guardada) && Array.isArray(guardada.imagenes) && !estado.categorias400, `W: y guarda la categoría con su portada, sin la transparencia ni peticiones fallidas (${JSON.stringify(guardada)})`);
    await ctx.close();
  }
}

// ===== X) Blue IA: un solo «Hablar con el equipo» (junto al recuadro de escribir) y la mascota de Blue en sus respuestas
async function seccionX() {
  const estado = {
    filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
    guardados: [],
    // La segunda respuesta dice que no puede ayudar: antes era cuando salía el botón repetido bajo la respuesta.
    blueIa: (n) => (n === 1 ? "Tenemos varias PS5 de segunda mano revisadas." : "No puedo confirmarte eso: mejor pregúntaselo al equipo."),
  };
  const ctx = await contexto(navegador, CLIENTE, "user", estado);
  const p = await pagina(ctx, "/blue-ia");
  const campo = p.getByPlaceholder("Pregúntale a Blue IA…");
  await campo.waitFor({ timeout: 30000 }).catch(() => {});
  const preguntar = async (texto, n) => {
    await campo.fill(texto);
    await p.getByRole("button", { name: "Enviar la pregunta" }).click();
    await p.waitForFunction((k) => document.querySelectorAll('[data-avatar-blue="1"]').length >= k, n + 1, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
  };
  await preguntar("¿Tenéis PS5?", 1);
  await preguntar("¿Me la guardáis hasta el lunes?", 2);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
  ok(/No puedo confirmarte eso/.test(t) && estado.preguntasBlueIa === 2, `X: Blue IA ha contestado las dos preguntas (${estado.preguntasBlueIa})`);
  const botones = await p.getByRole("button", { name: "Hablar con el equipo" }).count();
  ok(botones === 1 && !/Prefieres que te atienda una persona/.test(t), `X: «Hablar con el equipo» sale una sola vez y ya no «¿Prefieres que te atienda una persona?» (${botones} botones)`);
  const m = await p.evaluate(() => {
    const b = document.querySelector('[aria-label="Hablar con el equipo"]')?.getBoundingClientRect();
    const c = document.querySelector('textarea[placeholder="Pregúntale a Blue IA…"], input[placeholder="Pregúntale a Blue IA…"]')?.getBoundingClientRect();
    const avatares = Array.from(document.querySelectorAll('[data-avatar-blue="1"]'));
    return {
      boton: b ? { y: b.y, h: b.height } : null,
      campo: c ? { y: c.y } : null,
      avatares: avatares.length,
      conMascota: avatares.every((a) => !!a.querySelector("img")),
      tamano: avatares.map((a) => Math.round(a.getBoundingClientRect().width)),
      sinEstrellitas: avatares.every((a) => !a.textContent?.trim()),
    };
  });
  ok(!!m.boton && !!m.campo && m.boton.y < m.campo.y && m.campo.y - (m.boton.y + m.boton.h) < 40 && m.boton.h >= 44, `X: el botón va justo encima del recuadro de escribir y mide 44 px (${JSON.stringify({ boton: m.boton, campo: m.campo })})`);
  // Bienvenida + 2 respuestas = 3 mensajes de Blue, cada uno con la mascota (imagen) y no el icono de antes.
  ok(m.avatares === 3 && m.conMascota && m.sinEstrellitas && m.tamano.every((w) => w === 36), `X: cada respuesta de Blue lleva la mascota de Blue (${m.avatares} mensajes, ${m.tamano.join(", ")} px)`);
  await capturar(p, "X1-blue-ia");
  ok(p.errores.length === 0, `X: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  await ctx.close();
}

// ===== Y) «Reparación / Limpieza» en Administración → Categorías: su portada para el recuadro de Inicio (lleva a
// Servicios), los toques de cada recuadro y que no se cuela como categoría de productos en el catálogo ===============
async function seccionY() {
  const foto = "https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/categorias/ps5.jpg";
  const cat = (id, slug, name, extra = {}) => ({
    id, slug, name, sort_order: 0, is_active: true, image_url: null, imagenes: [], portada_opacidad: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
  });
  const perfil = (id) => [{ user_id: id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const toque = (categoria, portada, n) => ({ event_name: "categoria_inicio", session_id: `s${n}`, metadata: { categoria, portada } });
  // Como la base de datos real: «Reparación / Limpieza» aún no es una fila de categories.
  const estado = {
    filas: perfil(ADMIN.id),
    guardados: [],
    categorias: [
      cat("c0000000-0000-4000-8000-0000000000a1", "playstation-5", "PlayStation 5", { image_url: foto, imagenes: [foto], portada_opacidad: 40 }),
      cat("c0000000-0000-4000-8000-0000000000a2", "playstation-4", "PlayStation 4", { sort_order: 1 }),
    ],
    eventos: [toque("reparaciones", false, 1), toque("reparaciones", false, 2), toque("reparaciones", false, 3), toque("playstation-5", true, 4)],
  };

  // Y1) El dueño le pone portada desde Categorías: sale aunque aún no exista, solo con portadas y cuánto se ven, y al
  // guardar se crea con el slug del recuadro de Inicio.
  {
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    const tarjeta = p.locator("#categoria-servicios");
    await tarjeta.waitFor({ timeout: 30000 }).catch(() => {});
    const texto = (await tarjeta.innerText().catch(() => "")).replace(/\n/g, " | ");
    ok(/Reparación \/ Limpieza/.test(texto) && /Recuadro de Inicio · lleva a Servicios/.test(texto) && /Sin portada/.test(texto), `Y: en Categorías sale «Reparación / Limpieza» (lleva a Servicios), aún sin portada (${texto})`);
    const interruptores = await tarjeta.locator('[role="switch"], input[type="checkbox"]').count();
    const borrar = await tarjeta.getByRole("button", { name: /^Borrar/ }).count();
    ok(borrar === 0 && interruptores === 0, `Y: no se puede borrar ni ocultar: su recuadro de Inicio está siempre (${borrar} botones de borrar, ${interruptores} interruptores)`);
    const toquesServicios = await p.locator("#categoria-toques-reparaciones").innerText().catch(() => "");
    const toquesPs5 = await p.locator("#categoria-toques-playstation-5").innerText().catch(() => "");
    ok(
      /Desde Inicio \(30 días\): 3 toques · con portada: 0/.test(toquesServicios) && /Desde Inicio \(30 días\): 1 toque · con portada: 1/.test(toquesPs5),
      `Y: cada categoría cuenta los toques de su recuadro en Inicio y cuántos tenían portada (${toquesServicios} / ${toquesPs5})`
    );

    await tarjeta.getByRole("button", { name: /^Editar/ }).click();
    await p.locator("#categoria-portadas").waitFor({ timeout: 15000 }).catch(() => {});
    const ventana = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    const campos = (await p.getByPlaceholder("Nombre de la categoría").count()) + (await p.getByPlaceholder("Identificador para la URL").count());
    ok(
      /es el recuadro de Inicio que lleva a Servicios: aquí eliges su portada y cuánto se ve/.test(ventana) && campos === 0 && !/Categoría activa/.test(ventana),
      `Y: su editor solo tiene las portadas y cuánto se ven, sin nombre, slug, orden ni «activa» (${campos} campos)`
    );
    // Una foto horizontal de 1200 × 600 (verde): se reduce y se sube como las demás portadas.
    const png = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 600;
      const x = c.getContext("2d");
      x.fillStyle = "#16A34A";
      x.fillRect(0, 0, 1200, 600);
      return c.toDataURL("image/png").split(",")[1];
    });
    const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.locator("#categoria-subir-portada").click()]);
    await selector.setFiles({ name: "taller.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await p.locator("#categoria-opacidad").waitFor({ timeout: 20000 }).catch(() => {});
    const subida = (estado.subidas ?? []).at(-1);
    ok(!!subida && /^product-media\/categorias\/\d+-[a-z0-9]+\.jpg$/.test(subida.ruta), `Y: la foto se sube reducida a la carpeta de las portadas (${subida?.ruta})`);
    const previa = (await p.locator("#categoria-opacidad").innerText().catch(() => "")).replace(/\n/g, " | ");
    ok(/Reparación \/ Limpieza/.test(previa) && !/Ver servicios/.test(previa), `Y: la vista previa es su recuadro de Inicio, con su nombre y sin «Ver servicios» (${previa})`);
    await p.getByRole("button", { name: "Foto más suave" }).click();
    await capturar(p, "Y1-editor-reparacion");
    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-opacidad").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const creada = (estado.categoriasCreadas ?? []).at(-1);
    ok(
      !!creada && creada.slug === "reparaciones" && creada.name === "Reparación / Limpieza" && creada.is_active === true && creada.portada_opacidad === 45 &&
        Array.isArray(creada.imagenes) && creada.imagenes.length === 1 && /\/product-media\/categorias\//.test(creada.imagenes[0]) && creada.image_url === creada.imagenes[0],
      `Y: al guardar se crea con el slug del recuadro de Inicio y su portada al 45 % (${JSON.stringify(creada)})`
    );
    ok(!(estado.categoriasGuardadas ?? []).length, "Y: y ninguna otra categoría cambia");
    await p.waitForTimeout(800);
    const veces = await p.locator("#categoria-servicios").count();
    const fotos = await p.locator("#categoria-servicios img").count();
    const conFechas = /Actualizada:/.test(await p.locator("#categoria-servicios").innerText().catch(() => ""));
    ok(veces === 1 && fotos > 0 && conFechas, `Y: ya guardada, sale una sola vez en la lista y con su portada (${veces} vez · ${fotos} fotos)`);
    ok(p.errores.length === 0, `Y: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // Y2) Inicio: el recuadro «Reparación / Limpieza» ya sale con su portada (al 45 %), sigue llevando a Servicios y el
  // toque se apunta en la analítica propia.
  {
    const cliente = { filas: perfil(CLIENTE.id), guardados: [], aceptaAnalitica: true, categorias: estado.categorias };
    const ctx = await contexto(navegador, CLIENTE, "user", cliente);
    const p = await pagina(ctx, "/");
    await p.locator('[data-testid="seccion-categorias"]').scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('[data-testid="categoria-reparaciones"] img').first().waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const t = document.querySelector('[data-testid="categoria-reparaciones"]');
      if (!t) return null;
      const capa = t.querySelector("#portada-foto");
      // La foto llena el recuadro (el nombre va encima, fuera).
      const rt = t.querySelector('[data-recuadro="1"]')?.getBoundingClientRect() ?? t.getBoundingClientRect();
      const ri = capa?.getBoundingClientRect();
      return {
        conFoto: !!t.querySelector("img"),
        opacidad: capa ? Number(getComputedStyle(capa).opacity) : null,
        fotoLlena: !!ri && Math.abs(ri.width - rt.width) <= 3 && Math.abs(ri.height - rt.height) <= 3,
        texto: t.innerText.replace(/\n/g, " | "),
        etiqueta: t.getAttribute("aria-label"),
        ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        pantalla: window.innerWidth,
      };
    });
    ok(!!m && m.conFoto && m.fotoLlena && Math.abs(m.opacidad - 0.45) < 0.01, `Y: en Inicio, «Reparación / Limpieza» sale con su portada llenando el recuadro, al 45 % (${JSON.stringify(m)})`);
    ok(!!m && /Reparación \/ Limpieza/.test(m.texto) && !/Ver servicios/.test(m.texto) && m.etiqueta === "Reparación / Limpieza. Ver servicios", `Y: con el nombre encima (sin «Ver servicios →») y un lector de pantalla dice adónde lleva (${m?.etiqueta})`);
    ok(!!m && m.ancho <= m.pantalla + 1, `Y: la página no se ensancha (${m?.ancho}/${m?.pantalla})`);
    await p.locator('[data-testid="seccion-categorias"]').screenshot({ path: SALIDA ? join(SALIDA, "Y2-categorias-inicio.png") : undefined }).catch(() => {});
    await p.locator('[data-testid="categoria-reparaciones"]').click();
    await p.waitForURL(/\/servicios/, { timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 20 && !(cliente.eventosEnviados ?? []).some((e) => e.event_name === "categoria_inicio"); i++) await p.waitForTimeout(300);
    const ev = (cliente.eventosEnviados ?? []).find((e) => e.event_name === "categoria_inicio");
    ok(/\/servicios/.test(p.url()), `Y: tocarlo sigue llevando a Servicios (${new URL(p.url()).pathname})`);
    ok(ev?.metadata?.categoria === "reparaciones" && ev?.metadata?.portada === true, `Y: y se apunta en la analítica propia, con la categoría y si tenía portada (${JSON.stringify(ev?.metadata)})`);
    ok(p.errores.length === 0, `Y: Inicio sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // Y3) En el catálogo no sale entre las plataformas (no es una categoría de productos).
  {
    const cliente = { filas: perfil(CLIENTE.id), guardados: [], categorias: estado.categorias, productosVacios: true };
    const ctx = await contexto(navegador, CLIENTE, "user", cliente);
    const p = await pagina(ctx, "/catalogo");
    await p.getByRole("button", { name: /^Filtros/ }).first().click({ timeout: 30000 });
    await p.getByText("Plataforma", { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " | ");
    await capturar(p, "Y3-catalogo-filtros");
    // Los títulos de los filtros salen en mayúsculas («PLATAFORMA»).
    const plataformas = (t.match(/Plataforma \| (.*?) \| Estado/i) ?? [null, "(no se ven)"])[1];
    ok(/PlayStation 4/.test(plataformas) && !/Reparación \/ Limpieza/.test(t), `Y: en el catálogo, «Reparación / Limpieza» no sale entre las plataformas, no tiene productos (${plataformas})`);
    ok(p.errores.length === 0, `Y: catálogo sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== EN) Encuadre de las portadas para el recuadro de Inicio: se encuadra antes de subir, «Encuadrar» las que ya
// están, Inicio enseña el encuadre y la cabecera de dentro de la categoría la foto entera =============================
async function seccionEN() {
  const foto = "https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/categorias/ps5.jpg";
  const cat = (id, slug, name, extra = {}) => ({
    id, slug, name, sort_order: 0, is_active: true, image_url: null, imagenes: [], portada_opacidad: null, portadas_inicio: [],
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
  });
  const perfil = (id) => [{ user_id: id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const ps5 = (extra = {}) => cat("c0000000-0000-4000-8000-0000000000a1", "playstation-5", "PlayStation 5", { image_url: foto, imagenes: [foto], portadas_inicio: [""], portada_opacidad: 40, ...extra });
  const sinColumna = (f) => Object.fromEntries(Object.entries(f).filter(([c]) => c !== "portadas_inicio"));
  // Lo que se ha subido, mirado en el navegador: tamaño y colores a la izquierda, en el centro y a la derecha.
  const mirarJpeg = (p, b64) =>
    p.evaluate(async (datos) => {
      const bytes = Uint8Array.from(atob(datos), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const color = (u) => {
        const [r, , b] = x.getImageData(Math.round(u), Math.round(bmp.height / 2), 1, 1).data;
        return r > 150 && b < 100 ? "rojo" : b > 150 && r < 100 ? "azul" : `otro(${r},${b})`;
      };
      return { ancho: bmp.width, alto: bmp.height, izquierda: color(8), centro: color(bmp.width / 2), derecha: color(bmp.width - 8) };
    }, b64);

  // EN1) El dueño sube una foto: primero la encuadra (forma del recuadro de Inicio, nombre encima, foto al 40 %) y al
  // aceptar se suben la foto entera y el encuadre; «Encuadrar» cambia el de la que ya estaba; al guardar va todo.
  {
    const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: [ps5(), cat("c0000000-0000-4000-8000-0000000000a2", "playstation-4", "PlayStation 4", { sort_order: 1 })] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: /^Editar/ }).first().click({ timeout: 30000 });
    await p.locator("#categoria-portadas").waitFor({ timeout: 15000 }).catch(() => {});
    const bloque = (await p.locator("#categoria-portadas").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(
      /Al subir una foto la encuadras con la forma del recuadro de Inicio/.test(bloque) && (await p.getByRole("button", { name: "Encuadrar la portada 1 para Inicio" }).count()) === 1 && !/se podrá usar en cuanto/.test(bloque),
      "EN: el editor explica que las fotos se encuadran y cada portada tiene «Encuadrar»"
    );
    // Una foto de 1200 × 600: mitad izquierda roja, mitad derecha azul.
    const png = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 600;
      const x = c.getContext("2d");
      x.fillStyle = "#FF0000";
      x.fillRect(0, 0, 600, 600);
      x.fillStyle = "#0000FF";
      x.fillRect(600, 0, 600, 600);
      return c.toDataURL("image/png").split(",")[1];
    });
    const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.locator("#categoria-subir-portada").click()]);
    await selector.setFiles({ name: "consola.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    const vista = p.locator('#categoria-recorte [aria-label="Arrastra la foto para encuadrarla"]');
    await vista.waitFor({ timeout: 15000 }).catch(() => {});
    const ventana = await p.evaluate(() => {
      const v = document.querySelector('#categoria-recorte [aria-label="Arrastra la foto para encuadrarla"]');
      const r = v?.getBoundingClientRect();
      const img = v?.querySelector("img");
      return {
        texto: (document.querySelector("#categoria-recorte")?.innerText ?? "").replace(/\n/g, " | "),
        forma: r ? r.width / r.height : null,
        nombre: /PlayStation 5/.test(v?.innerText ?? ""),
        opacidad: img ? Number(getComputedStyle(img).opacity) : null,
      };
    });
    ok(/Encuadra la portada/.test(ventana.texto) && /Así se verá en el recuadro de Inicio/.test(ventana.texto) && /Usar este encuadre/.test(ventana.texto), `EN: al elegir la foto se abre «Encuadra la portada» (${ventana.texto.slice(0, 120)})`);
    ok(Math.abs(ventana.forma - 6 / 5) < 0.03 && !ventana.nombre && Math.abs(ventana.opacidad - 0.4) < 0.01, `EN: con la forma del recuadro de Inicio (6:5), la foto al 40 % elegido y sin el nombre encima de la foto, que en Inicio va fuera (${ventana.forma?.toFixed(3)}, ${ventana.opacidad})`);
    ok(!(estado.subidas ?? []).length, "EN: y todavía no se ha subido nada");
    // Arrastrar hacia la izquierda: se ve la parte derecha (azul), sin dejar huecos.
    const caja = await vista.boundingBox();
    await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await p.mouse.down();
    await p.mouse.move(caja.x + caja.width / 2 - 60, caja.y + caja.height / 2, { steps: 6 });
    await p.mouse.move(caja.x + caja.width / 2 - 400, caja.y + caja.height / 2, { steps: 6 });
    await p.mouse.up();
    await capturar(p, "EN1-encuadrar");
    await p.locator("#categoria-recorte").getByText("Usar este encuadre").click();
    await p.getByRole("button", { name: "Encuadrar la portada 2 para Inicio" }).waitFor({ timeout: 15000 }).catch(() => {});
    const subidas = estado.subidas ?? [];
    const encuadre = subidas.find((s) => /^product-media\/categorias\/inicio-\d+-[a-z0-9]+\.jpg$/.test(s.ruta));
    const entera = subidas.find((s) => /^product-media\/categorias\/\d+-[a-z0-9]+\.jpg$/.test(s.ruta));
    ok(subidas.length === 2 && !!encuadre && !!entera, `EN: al aceptar se suben la foto entera y su encuadre (${subidas.map((s) => s.ruta).join(", ")})`);
    const mirado = encuadre?.jpeg ? await mirarJpeg(p, encuadre.jpeg) : null;
    ok(!!mirado && mirado.ancho === 960 && mirado.alto === 800, `EN: el encuadre mide 960 × 800 px (${mirado ? `${mirado.ancho} × ${mirado.alto}` : "sin foto"})`);
    ok(!!mirado && mirado.izquierda === "rojo" && mirado.centro === "azul" && mirado.derecha === "azul", `EN: y es justo lo elegido: la parte derecha de la foto (izquierda ${mirado?.izquierda}, centro ${mirado?.centro}, derecha ${mirado?.derecha})`);
    const miniatura2 = await p.evaluate(() => Array.from(document.querySelectorAll("#categoria-portadas img")).map((i) => i.getAttribute("src") ?? ""));
    const previa = await p.evaluate(() => Array.from(document.querySelectorAll("#categoria-opacidad img")).map((i) => i.getAttribute("src") ?? ""));
    ok(miniatura2.some((s) => /categorias\/inicio-/.test(s)) && previa.some((s) => /categorias\/inicio-/.test(s)), "EN: la miniatura y «Cómo se ve en Inicio» enseñan el encuadre");

    // «Encuadrar» la portada que ya estaba subida (una foto de internet, pedida con permiso).
    await p.getByRole("button", { name: "Encuadrar la portada 1 para Inicio" }).click();
    await vista.waitFor({ timeout: 15000 }).catch(() => {});
    const textoRemota = await p.locator("#categoria-recorte").innerText().catch(() => "");
    await p.locator("#categoria-recorte").getByText("Usar este encuadre").click();
    await p.locator("#categoria-recorte").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 20 && (estado.subidas ?? []).length < 3; i++) await p.waitForTimeout(250);
    const tercera = (estado.subidas ?? [])[2];
    ok(!/no se puede encuadrar/.test(textoRemota) && !!tercera && /categorias\/inicio-/.test(tercera.ruta), `EN: «Encuadrar» en una portada ya subida la abre y sube solo su encuadre (${tercera?.ruta})`);

    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-portadas").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const guardada = (estado.categoriasGuardadas ?? []).at(-1)?.cuerpo;
    ok(
      !!guardada && guardada.imagenes?.length === 2 && guardada.imagenes[0] === foto && !/inicio-/.test(guardada.imagenes[1]) &&
        guardada.image_url === foto && guardada.portadas_inicio?.length === 2 && guardada.portadas_inicio.every((u) => /categorias\/inicio-/.test(u)),
      `EN: al guardar van las fotos enteras y sus encuadres, en el mismo orden (${JSON.stringify({ imagenes: guardada?.imagenes, portadas_inicio: guardada?.portadas_inicio })})`
    );
    ok(p.errores.length === 0, `EN: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // EN2) Inicio enseña el encuadre y la cabecera de dentro de la categoría, la foto entera.
  {
    const encuadreUrl = "https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/categorias/inicio-1-abc.jpg";
    // Sin pedir productos a la base de datos real (rechaza la sesión de prueba y a veces dejaba un error en la consola).
    const estado = { filas: perfil(CLIENTE.id), guardados: [], categorias: [ps5({ portadas_inicio: [encuadreUrl] })], productosVacios: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator('[data-testid="seccion-categorias"]').scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('[data-testid="categoria-playstation-5"] img').first().waitFor({ timeout: 20000 }).catch(() => {});
    const enInicio = await p.evaluate(() => Array.from(document.querySelectorAll('[data-testid="categoria-playstation-5"] img')).map((i) => i.getAttribute("src") ?? ""));
    ok(enInicio.length > 0 && enInicio.every((s) => /inicio-1-abc/.test(s)), `EN: en Inicio, el recuadro enseña el encuadre (${enInicio[0]?.slice(-60)})`);
    await p.goto(BASE + "/catalogo?cat=playstation-5", { waitUntil: "load" });
    await p.locator("#catalogo-portada img").first().waitFor({ timeout: 20000 }).catch(() => {});
    const cabecera = await p.evaluate(() => Array.from(document.querySelectorAll("#catalogo-portada img")).map((i) => i.getAttribute("src") ?? ""));
    ok(cabecera.length > 0 && cabecera.every((s) => /ps5\.jpg/.test(s)), `EN: dentro de la categoría, la cabecera sigue con la foto entera (${cabecera[0]?.slice(-40)})`);
    ok(p.errores.length === 0, `EN: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // EN3) Sin la migración (sin la columna): no se ofrece encuadrar, se avisa y se sube como antes.
  {
    const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: [sinColumna(ps5())] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: /^Editar/ }).first().click({ timeout: 30000 });
    await p.locator("#categoria-portadas").waitFor({ timeout: 15000 }).catch(() => {});
    const bloque = (await p.locator("#categoria-portadas").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/El encuadre para Inicio se podrá usar en cuanto se active su parte en la base de datos/.test(bloque) && (await p.getByRole("button", { name: /^Encuadrar la portada/ }).count()) === 0, "EN: sin la migración no se ofrece encuadrar y se avisa");
    const png = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 600;
      c.getContext("2d").fillRect(0, 0, 800, 600);
      return c.toDataURL("image/png").split(",")[1];
    });
    const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.locator("#categoria-subir-portada").click()]);
    await selector.setFiles({ name: "otra.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    for (let i = 0; i < 30 && !(estado.subidas ?? []).length; i++) await p.waitForTimeout(250);
    ok((await p.locator("#categoria-recorte").count()) === 0 && (estado.subidas ?? []).length === 1, "EN: y la foto se sube tal cual, sin ventana de encuadre");
    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-portadas").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const guardada = (estado.categoriasGuardadas ?? []).at(-1)?.cuerpo;
    ok(!!guardada && !("portadas_inicio" in guardada) && guardada.imagenes?.length === 2, `EN: y se guarda sin los encuadres (${JSON.stringify(guardada?.imagenes)})`);
    await ctx.close();
  }

  // EN4) Una portada que no se puede pedir con permiso: la ventana lo dice (y no se sube nada).
  {
    const sinPermiso = "https://fotos.ejemplo.invalid/sin-permiso/portada.png";
    const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: [ps5({ image_url: sinPermiso, imagenes: [sinPermiso] })] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: /^Editar/ }).first().click({ timeout: 30000 });
    await p.getByRole("button", { name: "Encuadrar la portada 1 para Inicio" }).click({ timeout: 15000 });
    await p.locator("#categoria-recorte").getByText(/no se puede encuadrar aquí/).waitFor({ timeout: 15000 }).catch(() => {});
    const texto = await p.locator("#categoria-recorte").innerText().catch(() => "");
    ok(/Esta foto no se puede encuadrar aquí\. Quítala y vuelve a subirla/.test(texto) && !(estado.subidas ?? []).length, "EN: si una portada no se puede encuadrar, la ventana lo dice y no sube nada");
    await ctx.close();
  }
}

// ===== NO) Categorías: buscador arriba, fichas en rejilla, «+» flotante e iconos; el nombre va encima de cada recuadro
// (en Inicio y en la vista previa, siempre entero) y «A otras» copia la transparencia =================================
async function seccionNO() {
  const foto = "https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/categorias/ps5.jpg";
  const PS5 = "c0000000-0000-4000-8000-0000000000a1";
  const PS4 = "c0000000-0000-4000-8000-0000000000a2";
  const XBOX = "c0000000-0000-4000-8000-0000000000a3";
  const cat = (id, slug, name, extra = {}) => ({
    id, slug, name, sort_order: 0, is_active: true, image_url: foto, imagenes: [foto], portada_opacidad: 40, portadas_inicio: [""],
    titulo_posicion: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
  });
  const categorias = () => [
    cat(PS5, "playstation-5", "PlayStation 5"),
    cat(PS4, "playstation-4", "PlayStation 4", { sort_order: 1, portada_opacidad: 70 }),
    cat(XBOX, "xbox", "Xbox", { sort_order: 2, portada_opacidad: 70 }),
  ];
  const perfil = (id) => [{ user_id: id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const estado = { filas: perfil(ADMIN.id), guardados: [], categorias: categorias() };

  // NO1) La lista: buscador arriba de los contadores, fichas una al lado de otra, «+» flotante e iconos.
  {
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.locator("#categorias-rejilla").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const r = (el) => el?.getBoundingClientRect();
      const buscar = r(document.querySelector("#categorias-buscar"));
      const total = Array.from(document.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent.trim() === "Total");
      const fichas = ["playstation-5", "playstation-4", "xbox"].map((s) => r(document.querySelector(`#categoria-ficha-${s}`)));
      const mas = r(document.querySelector('[aria-label="Nueva categoría"]'));
      const iconos = ["Editar PlayStation 5", "Borrar PlayStation 5"].map((l) => r(document.querySelector(`[aria-label="${l}"]`)));
      return {
        buscadorArriba: !!buscar && !!total && buscar.bottom <= r(total).top,
        fichas: fichas.map((f) => (f ? { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.width) } : null)),
        mas: mas ? { derecha: Math.round(window.innerWidth - mas.right), abajo: Math.round(window.innerHeight - mas.bottom), lado: Math.round(mas.width) } : null,
        iconos: iconos.map((i) => (i ? Math.round(i.height) : 0)),
        textoEditar: /(^|\s)(Editar|Borrar)(\s|$)/.test(document.querySelector("#categorias-rejilla")?.innerText ?? ""),
        botonTexto: /\+ Nueva categoría/.test(document.body.innerText),
        ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        pantalla: window.innerWidth,
      };
    });
    ok(m.buscadorArriba, "NO: el buscador está arriba de Total, Activas y Ocultas");
    const [f5, f4, fx] = m.fichas;
    ok(!!f5 && !!f4 && !!fx && f5.y === f4.y && f4.x > f5.x && fx.y > f5.y && f5.w < m.pantalla / 2, `NO: las fichas van una al lado de otra, 2 por fila en el móvil (${JSON.stringify(m.fichas)})`);
    ok(!!m.mas && m.mas.derecha <= 24 && m.mas.abajo <= 40 && m.mas.lado >= 44 && !m.botonTexto, `NO: «Nueva categoría» es el «+» flotante abajo a la derecha (${JSON.stringify(m.mas)})`);
    ok(m.iconos.every((h) => h >= 44) && !m.textoEditar, `NO: «Editar» y «Borrar» son iconos de 44 px, con su nombre para el lector de pantalla (${m.iconos.join(", ")})`);
    ok(m.ancho <= m.pantalla + 1, `NO: la página no se ensancha (${m.ancho}/${m.pantalla})`);
    await capturar(p, "NO1-categorias-rejilla");
    await p.locator('[aria-label="Nueva categoría"]').click();
    const nueva = await p.getByText("Nueva categoría", { exact: true }).count();
    ok(nueva >= 1 && (await p.getByPlaceholder("Nombre de la categoría").count()) === 1, "NO: el «+» abre «Nueva categoría»");
    // Se cierra con la X de abajo a la derecha (dueño, 2026-11-04: ya no hay «Cancelar» en las ventanas del panel).
    await p.locator('[aria-label="Cerrar"]').last().click();
    await p.waitForTimeout(400);
    ok((await p.getByPlaceholder("Nombre de la categoría").count()) === 0, "NO: la X de abajo cierra «Nueva categoría»");
    ok(p.errores.length === 0, `NO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // NO2) El editor: «Cómo se ve en Inicio» enseña el nombre ENCIMA del recuadro (fuera de la foto), como Inicio, sin
  // «mover el nombre» (ya no hace falta), y guardar no manda ninguna posición del nombre.
  {
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: "Editar PlayStation 5" }).click({ timeout: 30000 });
    await p.locator("#categoria-vista-previa").waitFor({ timeout: 15000 }).catch(() => {});
    const m = await p.evaluate(() => {
      const n = document.querySelector('#categoria-vista-previa [data-categoria-nombre="1"]')?.getBoundingClientRect();
      const f = document.querySelector("#categoria-vista-previa #portada-foto")?.getBoundingClientRect();
      return { encima: !!n && !!f && n.bottom <= f.top, mover: /Mantén pulsado el nombre/.test(document.body.innerText) };
    });
    ok(m.encima && !m.mover && (await p.getByRole("button", { name: "Centrar el nombre" }).count()) === 0, "NO: la vista previa del editor pone el nombre encima del recuadro, como Inicio, y ya no se ofrece moverlo");
    await capturar(p, "NO2-vista-previa");
    await p.getByText("Guardar cambios", { exact: true }).last().click();
    await p.locator("#categoria-vista-previa").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    const guardada = (estado.categoriasGuardadas ?? []).at(-1);
    ok(guardada?.id === PS5 && !("titulo_posicion" in (guardada?.cuerpo ?? {})), `NO: al guardar no se manda ninguna posición del nombre (${JSON.stringify(guardada?.cuerpo)})`);
    ok(p.errores.length === 0, `NO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // NO3) Inicio: cada nombre va ENCIMA de su recuadro, entero y sin tocar la foto; los recuadros de una fila empiezan a
  // la misma altura y entre una fila y el nombre de la siguiente hay aire (no se confunden).
  {
    const cliente = { filas: perfil(CLIENTE.id), guardados: [], categorias: estado.categorias };
    const ctx = await contexto(navegador, CLIENTE, "user", cliente);
    const p = await pagina(ctx, "/");
    await p.locator('[data-testid="seccion-categorias"]').scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('[data-testid="categoria-playstation-5"] [data-categoria-nombre="1"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const fichas = Array.from(document.querySelectorAll('[data-testid^="categoria-"]')).map((t) => {
        const n = t.querySelector('[data-categoria-nombre="1"]');
        const c = t.querySelector('[data-recuadro="1"]');
        const rn = n?.getBoundingClientRect();
        const rc = c?.getBoundingClientRect();
        return {
          nombre: n?.textContent?.trim() ?? "",
          encima: !!rn && !!rc && rn.bottom <= rc.top + 0.5,
          entero: !!n && n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1,
          nombreArriba: rn ? rn.top : 0,
          cajaArriba: rc ? Math.round(rc.top) : 0,
          cajaAbajo: rc ? rc.bottom : 0,
        };
      });
      return { fichas, ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth };
    });
    const f = m.fichas;
    ok(f.length === 6 && f.every((x) => x.nombre && x.encima && x.entero), `NO: en Inicio cada nombre va encima de su recuadro, entero y fuera de la foto (${f.map((x) => `${x.nombre}:${x.encima ? "encima" : "NO"}`).join(", ")})`);
    const filas = [f.slice(0, 2), f.slice(2, 4), f.slice(4, 6)];
    ok(filas.every((fila) => fila.length === 2 && fila[0].cajaArriba === fila[1].cajaArriba), `NO: los recuadros de cada fila empiezan a la misma altura (${filas.map((fila) => fila.map((x) => x.cajaArriba).join("/")).join(", ")})`);
    const aire = Math.min(f[2].nombreArriba - Math.max(f[0].cajaAbajo, f[1].cajaAbajo), f[4].nombreArriba - Math.max(f[2].cajaAbajo, f[3].cajaAbajo));
    ok(aire >= 16, `NO: entre una fila y los nombres de la siguiente hay aire (${Math.round(aire)} px)`);
    ok(m.ancho <= m.pantalla + 1, `NO: Inicio no se ensancha (${m.ancho}/${m.pantalla})`);
    await p.locator('[data-testid="seccion-categorias"]').screenshot({ path: SALIDA ? join(SALIDA, "NO3-inicio-nombres.png") : undefined }).catch(() => {});
    ok(p.errores.length === 0, `NO: Inicio sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // NO4) «A otras»: el desplegable deja elegir a cuáles y copia la transparencia de la foto.
  {
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/categories");
    await p.getByRole("button", { name: "Editar PlayStation 5" }).click({ timeout: 30000 });
    await p.locator("#categoria-aplicar-otras").waitFor({ timeout: 15000 }).catch(() => {});
    const alLado = await p.evaluate(() => {
      const b = document.querySelector("#categoria-aplicar-otras")?.getBoundingClientRect();
      const s = Array.from(document.querySelectorAll('[role="switch"], input[type="checkbox"]')).map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0).at(-1);
      return !!b && !!s && Math.abs(b.y + b.height / 2 - (s.y + s.height / 2)) < 30 && b.height >= 44;
    });
    ok(alLado, "NO: «Aplicar a otras» está al lado de «Categoría activa» (44 px)");
    await p.locator("#categoria-aplicar-otras").click();
    const lista = (await p.locator("#categoria-aplicar-lista").innerText().catch(() => "")).replace(/\n/g, " | ");
    ok(/PlayStation 4/.test(lista) && /Xbox/.test(lista) && /Todas/.test(lista) && !/PlayStation 5/.test(lista.replace(/^.*?a:/, "")), `NO: el desplegable enseña las demás categorías y «Todas» (${lista.slice(0, 120)})`);
    await p.getByRole("checkbox", { name: "PlayStation 4" }).click();
    const marcada = await p.getByRole("checkbox", { name: "PlayStation 4" }).getAttribute("aria-checked");
    await p.getByText("Aplicar a 1 categoría", { exact: true }).click();
    await p.getByText(/^Copiado a 1 categoría/).waitFor({ timeout: 15000 }).catch(() => {});
    const copia = (estado.categoriasGuardadas ?? []).at(-1);
    ok(
      marcada === "true" && JSON.stringify(copia?.ids) === JSON.stringify([PS4]) && JSON.stringify(copia?.cuerpo) === JSON.stringify({ portada_opacidad: 40 }),
      `NO: «Aplicar a 1 categoría» copia a PlayStation 4 la transparencia de la foto, 40 % (${JSON.stringify(copia)})`
    );
    ok((await p.getByText(/^Copiado a 1 categoría: la transparencia \(40 %\)\./).count()) === 1, "NO: y lo confirma");
    await capturar(p, "NO4-aplicar-a-otras");
    ok(p.errores.length === 0, `NO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // NO6) Productos: lo mismo que Categorías (buscador arriba, fichas en rejilla, «+» flotante y acciones con iconos).
  {
    const prod = (n, extra = {}) => ({
      id: `p0000000-0000-4000-8000-00000000000${n}`, title: `Mando DualSense ${n}`, description: "Revisado.", price_eur: 49.9 + n,
      status: "PUBLISHED", is_active: true, category_id: PS5, images: [], condition: "USED", reference: null, is_featured_home: false,
      created_at: "2026-10-30T10:00:00Z", updated_at: "2026-10-30T10:00:00Z", ...extra,
    });
    const estadoP = { filas: perfil(ADMIN.id), guardados: [], categorias: categorias(), productosAdmin: [prod(1), prod(2, { status: "DRAFT" }), prod(3)] };
    const ctx = await contexto(navegador, ADMIN, "admin", estadoP);
    const p = await pagina(ctx, "/admin/products");
    await p.locator("#productos-rejilla").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const r = (el) => el?.getBoundingClientRect();
      const buscar = r(document.querySelector("#productos-buscar"));
      const total = Array.from(document.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent.trim() === "Total");
      const fichas = [1, 2, 3].map((n) => r(document.querySelector(`#producto-ficha-p0000000-0000-4000-8000-00000000000${n}`)));
      const mas = r(document.querySelector('[aria-label="Nuevo producto"]'));
      const etiquetas = ["Editar Mando DualSense 2", "Publicar Mando DualSense 2", "Destacar Mando DualSense 2 en portada", "Marcar Mando DualSense 2 como vendido", "Borrar Mando DualSense 2"];
      return {
        buscadorArriba: !!buscar && !!total && buscar.bottom <= r(total).top,
        fichas: fichas.map((f) => (f ? { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.width) } : null)),
        mas: mas ? { derecha: Math.round(window.innerWidth - mas.right), abajo: Math.round(window.innerHeight - mas.bottom) } : null,
        iconos: etiquetas.map((l) => Math.round(r(document.querySelector(`[aria-label="${l}"]`))?.height ?? 0)),
        conTexto: /(^|\s)(Editar|Borrar|Publicar|Marcar vendido|Destacar en portada)(\s|$)/.test(document.querySelector("#productos-rejilla")?.innerText ?? ""),
        botonTexto: /\+ Nuevo producto/.test(document.body.innerText),
        ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        pantalla: window.innerWidth,
      };
    });
    const [a, b, c] = m.fichas;
    ok(m.buscadorArriba, "NO: en Productos, el buscador también está arriba de los contadores");
    ok(!!a && !!b && !!c && a.y === b.y && b.x > a.x && c.y > a.y && a.w < m.pantalla / 2, `NO: los productos van uno al lado de otro, 2 por fila en el móvil (${JSON.stringify(m.fichas)})`);
    ok(!!m.mas && m.mas.derecha <= 24 && m.mas.abajo <= 40 && !m.botonTexto, `NO: «Nuevo producto» es el «+» flotante abajo a la derecha (${JSON.stringify(m.mas)})`);
    ok(m.iconos.every((h) => h >= 44) && !m.conTexto, `NO: editar, publicar, destacar, vendido y borrar son iconos de 44 px con su nombre (${m.iconos.join(", ")})`);
    ok(m.ancho <= m.pantalla + 1, `NO: Productos no se ensancha (${m.ancho}/${m.pantalla})`);
    await capturar(p, "NO6-productos-rejilla");
    await p.locator('[aria-label="Destacar Mando DualSense 1 en portada"]').click();
    for (let i = 0; i < 20 && !(estadoP.productosCambiados ?? []).length; i++) await p.waitForTimeout(250);
    const cambio = (estadoP.productosCambiados ?? [])[0];
    ok(cambio?.id === "p0000000-0000-4000-8000-000000000001" && cambio?.cuerpo?.is_featured_home === true, `NO: la estrella destaca el producto en portada (${JSON.stringify(cambio)})`);
    await p.locator('[aria-label="Editar Mando DualSense 1"]').click();
    await p.getByText("Guardar cambios", { exact: true }).last().waitFor({ timeout: 15000 }).catch(() => {});
    ok((await p.getByText("Guardar cambios", { exact: true }).count()) >= 1, "NO: el lápiz abre su ficha para editarla");
    ok(p.errores.length === 0, `NO: Productos sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // NO7) El resto del panel: Editar y Borrar también son iconos (con su nombre) en Blog, Políticas y «Lo que Blue sabe».
  {
    const fecha = "2026-10-30T10:00:00Z";
    const estado7 = {
      filas: perfil(ADMIN.id),
      guardados: [],
      // Las políticas ya tienen su propia simulación (estado.politicas).
      politicas: [{ id: "pp1", slug: "envios", title: "Envíos", intro: "Cómo enviamos.", sections: [], is_active: true, sort_order: 0, created_at: fecha, updated_at: fecha }],
      tablas: {
        blog_posts: [{ id: "b1", slug: "cuidar-consola", title: "Cómo cuidar tu consola", excerpt: "Consejos.", body: "Texto.", status: "PUBLISHED", sort_order: 0, created_at: fecha, updated_at: fecha }],
        blue_conocimiento: [{ id: "k1", tema: "Horario", respuesta: "De 10 a 20 h.", activo: true, created_at: fecha, updated_at: fecha }],
      },
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado7);
    const pantallas = [
      ["/admin/blog", ["Editar Cómo cuidar tu consola", "Borrar Cómo cuidar tu consola"]],
      ["/admin/policies", ["Editar Envíos", "Borrar Envíos"]],
      ["/admin/conocimiento", ["Editar «Horario»", "Borrar «Horario»"]],
    ];
    const resultado = [];
    for (const [ruta, etiquetas] of pantallas) {
      const p = await pagina(ctx, ruta);
      await p.locator(`[aria-label="${etiquetas[0]}"]`).first().waitFor({ timeout: 30000 }).catch(() => {});
      const altos = await p.evaluate((ls) => ls.map((l) => Math.round(document.querySelector(`[aria-label="${l}"]`)?.getBoundingClientRect().height ?? 0)), etiquetas);
      const conTexto = await p.evaluate(() => Array.from(document.querySelectorAll('[role="button"]')).some((b) => /^(Editar|Borrar)$/.test(b.textContent.trim())));
      resultado.push({ ruta, altos, conTexto, errores: p.errores.length });
      await p.close();
    }
    ok(resultado.every((x) => x.altos.every((h) => h >= 44) && !x.conTexto && !x.errores), `NO: en Blog, Políticas y «Lo que Blue sabe», Editar y Borrar son iconos de 44 px con su nombre (${JSON.stringify(resultado)})`);
    await ctx.close();
  }
}

// ===== RE) Reseñas: el texto nuevo de Inicio y «Dejar una reseña» con 10 ideas, un recuadro que crece y emojis =====
async function seccionRE() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const estado = { filas: perfil, guardados: [], aceptaAnalitica: true, resenas: [], publicarResenas: true };
  const ctx = await contexto(navegador, CLIENTE, "user", estado);
  const p = await pagina(ctx, "/");
  const boton = p.getByText("Dejar una reseña", { exact: true }).first();
  await boton.scrollIntoViewIfNeeded({ timeout: 30000 }).catch(() => {});
  const inicio = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
  ok(
    /Lo que importa no es lo que decimos nosotros, sino lo que opinan nuestros clientes\./.test(inicio) && !/lo que opina la gente/.test(inicio),
    "RE: en Inicio, «Lo que importa no es lo que decimos nosotros, sino lo que opinan nuestros clientes.»"
  );
  await boton.click();
  const ideas = p.locator("#resena-sugerencias [role='button']");
  await ideas.first().waitFor({ timeout: 20000 }).catch(() => {});
  // La ventana entra creciendo desde el 90 %: se mide cuando ya está a su tamaño.
  await p.waitForTimeout(900);
  const campo = p.locator("#resena-comentario");
  const valor = () => campo.inputValue().catch(() => "");
  const medida = () =>
    p.evaluate(() => {
      const el = document.querySelector("#resena-comentario");
      return el ? { alto: Math.round(el.getBoundingClientRect().height), contenido: el.scrollHeight, visible: el.clientHeight } : null;
    });

  const botones = await p.evaluate(() =>
    Array.from(document.querySelectorAll("#resena-sugerencias [role='button']")).map((b) => {
      const r = b.getBoundingClientRect();
      return { texto: b.textContent.trim(), alto: Math.round(r.height), dentro: r.left >= 0 && r.right <= window.innerWidth };
    })
  );
  ok(botones.length === 10, `RE: «Dejar una reseña» propone 10 ideas (${botones.map((b) => b.texto).join(" · ")})`);
  ok(botones.length === 10 && botones.every((b) => b.alto >= 44 && b.dentro), `RE: se tocan bien (44 px o más) y no se salen de la pantalla (${botones.map((b) => b.alto).join(", ")})`);

  // Tocar una idea añade su frase; otra se añade detrás; tocar la primera otra vez la quita.
  await p.getByRole("button", { name: /^Añadir: La atención fue de 10/ }).click();
  await p.getByRole("button", { name: /^Añadir: El envío fue rapidísimo/ }).click();
  const conDos = await valor();
  await p.getByRole("button", { name: /^Quitar: La atención fue de 10/ }).click();
  const conUna = await valor();
  ok(
    conDos === "La atención fue de 10: amables y rápidos en responder. El envío fue rapidísimo y llegó muy bien embalado." &&
      conUna === "El envío fue rapidísimo y llegó muy bien embalado.",
    `RE: tocar una idea añade su frase, otra va detrás y tocarla otra vez la quita («${conUna}»)`
  );
  const marcada = await p.getByRole("button", { name: /^Quitar: El envío fue rapidísimo/ }).getAttribute("aria-pressed").catch(() => null);
  ok(marcada === "true", "RE: la idea puesta se ve marcada (y un lector de pantalla lo dice)");

  // Emojis según lo escrito: envío → 📦 y rápido → 🚀, en ese orden; tocar uno lo añade al final.
  const emojis = async () => (await p.locator("#resena-emojis [role='button']").allTextContents().catch(() => [])).map((t) => t.trim());
  const propuestos = await emojis();
  ok(propuestos[0] === "📦" && propuestos.includes("🚀") && propuestos.length <= 4, `RE: propone emojis de lo escrito (envío y rápido: ${propuestos.join(" ")})`);
  await p.getByRole("button", { name: "Añadir el emoji 🚀" }).click();
  const conEmoji = await valor();
  ok(conEmoji.endsWith(" 🚀") && !(await emojis()).includes("🚀"), `RE: tocar un emoji lo añade al final y deja de proponerse («${conEmoji}»)`);
  await campo.fill("Me reparasteis el mando de la PS5 en un día, gracias");
  const otros = await emojis();
  ok(otros.includes("🔧") && otros.includes("🎮") && otros.includes("🙏"), `RE: con otro texto, otros emojis (reparación, consola y gracias: ${otros.join(" ")})`);

  // El recuadro crece con lo escrito (sin desplazarse dentro), hasta los 600 caracteres, y encoge al borrar.
  const vacio = (await campo.fill(""), await medida());
  const frase = "La consola llegó perfecta y funciona de maravilla, el trato fue genial y todo muy rápido. ";
  await campo.fill(frase.repeat(5));
  const largo = await medida();
  await campo.fill(frase.repeat(9));
  const alLimite = await medida();
  const caracteres = (await valor()).length;
  await campo.fill("Muy bien.");
  const corto = await medida();
  ok(!!vacio && !!largo && vacio.alto === 112 && vacio.contenido <= vacio.visible + 2 && largo.alto > vacio.alto + 60 && largo.contenido <= largo.visible + 2, `RE: el recuadro (vacío, con el ejemplo entero) crece con lo escrito y no hay que desplazarse dentro (${vacio?.alto} → ${largo?.alto} px)`);
  ok(!!alLimite && caracteres === 600 && alLimite.alto >= largo.alto && alLimite.contenido <= alLimite.visible + 2, `RE: llega hasta los 600 caracteres entero a la vista (${caracteres} caracteres, ${alLimite?.alto} px)`);
  ok(!!corto && corto.alto === 112, `RE: al borrar, vuelve a su tamaño (${corto?.alto} px)`);
  const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
  ok(ancho.a <= ancho.p + 1, `RE: la página no se ensancha (${ancho.a}/${ancho.p})`);

  // Publicar: se manda la reseña y la analítica apunta las ideas usadas y los emojis propuestos que se quedaron.
  await campo.fill("");
  await p.getByRole("button", { name: /^Añadir: El envío fue rapidísimo/ }).click();
  await p.getByRole("button", { name: "Añadir el emoji 📦" }).click();
  await capturar(p, "RE1-resena");
  await p.getByText("Publicar", { exact: true }).click();
  await p.getByText("¡Gracias por tu reseña!").waitFor({ timeout: 15000 }).catch(() => {});
  const enviada = (estado.resenasEnviadas ?? [])[0];
  ok(enviada?.rating === 5 && enviada?.comment === "El envío fue rapidísimo y llegó muy bien embalado. 📦", `RE: se publica la reseña con su texto (${JSON.stringify(enviada)})`);
  for (let i = 0; i < 20 && !(estado.eventosEnviados ?? []).some((e) => e.event_name === "resena_publicada"); i++) await p.waitForTimeout(300);
  const ev = (estado.eventosEnviados ?? []).find((e) => e.event_name === "resena_publicada");
  ok(
    ev?.metadata?.estrellas === 5 && JSON.stringify(ev?.metadata?.sugerencias) === '["envio"]' && ev?.metadata?.emojis === 1,
    `RE: la analítica propia apunta las estrellas, la idea usada y el emoji (${JSON.stringify(ev?.metadata)})`
  );
  ok(p.errores.length === 0, `RE: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  await ctx.close();

  // Administración → Usuarios: cuántas reseñas usan las ideas y los emojis, y la idea más usada.
  {
    const ev = (sugerencias, emojis) => ({ event_name: "resena_publicada", user_id: null, session_id: `s${Math.random()}`, metadata: { estrellas: 5, sugerencias, emojis } });
    const admin = {
      filas: [],
      guardados: [],
      usuarios: [],
      eventos: [ev(["envio", "atencion"], 1), ev(["atencion"], 0), ev([], 2), ev([], 0)],
    };
    const ctxAdmin = await contexto(navegador, ADMIN, "admin", admin);
    const pa = await pagina(ctxAdmin, "/admin/users");
    await pa.locator("#usuarios-resenas-uso").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await pa.locator("#usuarios-resenas-uso").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Reseñas \(30 días\): 4 publicadas · con ideas sugeridas: 2 · con emoji: 2 · la idea más usada: «Atención de 10»/.test(t), `RE: Administración → Usuarios cuenta las reseñas con ideas y con emoji, y la idea más usada (${t})`);
    ok(pa.errores.length === 0, `RE: Usuarios sin errores de JavaScript (${pa.errores.length}${pa.errores[0] ? ": " + pa.errores[0] : ""})`);
    await ctxAdmin.close();
  }
}

// ===== Z) Cesta: «Blue, ayúdame a elegir un artículo» lleva a Blue IA con la pregunta ya enviada (y se cuenta) ========
async function seccionZ() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const preguntoElegir = (estado) => (estado.mensajesBlueIa ?? []).some((m) => /Ayúdame a elegir un artículo/.test(m));

  // Z1) Con la cesta vacía: el botón está, se toca bien y abre la conversación con la pregunta enviada.
  {
    const estado = { filas: perfil, guardados: [], aceptaAnalitica: true, blueIa: () => "Claro. ¿Qué presupuesto tienes y para qué lo quieres?" };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/cesta");
    const boton = p.locator("#cesta-blue-elegir");
    await boton.waitFor({ timeout: 30000 }).catch(() => {});
    const m = await p.evaluate(() => {
      const b = document.querySelector("#cesta-blue-elegir")?.getBoundingClientRect();
      return {
        boton: b ? { x: Math.round(b.x), ancho: Math.round(b.width), alto: Math.round(b.height) } : null,
        texto: document.querySelector("#cesta-blue-elegir")?.textContent?.trim() ?? "",
        vacia: /Tu cesta está vacía/.test(document.body.innerText),
        pantalla: window.innerWidth,
        pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      };
    });
    ok(m.vacia && /Blue, ayúdame a elegir un artículo/.test(m.texto), `Z: con la cesta vacía sale «Blue, ayúdame a elegir un artículo» (${m.texto})`);
    ok(!!m.boton && m.boton.alto >= 44 && m.boton.x >= 0 && m.boton.x + m.boton.ancho <= m.pantalla && m.pagina <= m.pantalla + 1, `Z: se toca bien (44 px o más) y no se sale de la pantalla (${JSON.stringify(m.boton)})`);
    await capturar(p, "Z1-cesta-blue");
    await boton.click();
    await p.waitForURL(/\/blue-ia/, { timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 30 && !preguntoElegir(estado); i++) await p.waitForTimeout(300);
    await p.waitForTimeout(800);
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(/\/blue-ia/.test(p.url()) && preguntoElegir(estado), `Z: lleva a la conversación con Blue IA y la pregunta se manda sola (${new URL(p.url()).pathname}, ${estado.preguntasBlueIa ?? 0} preguntas)`);
    ok(/Ayúdame a elegir un artículo/.test(t) && /¿Qué presupuesto tienes/.test(t), "Z: en la conversación se ven la pregunta y la respuesta de Blue IA");
    for (let i = 0; i < 20 && !(estado.eventosEnviados ?? []).some((e) => e.event_name === "cesta_blue_elegir"); i++) await p.waitForTimeout(300);
    const ev = (estado.eventosEnviados ?? []).find((e) => e.event_name === "cesta_blue_elegir");
    ok(ev?.step_label === "Cesta: Blue, ayúdame a elegir" && ev?.metadata?.con_articulos === false, `Z: se apunta en la analítica propia, con la cesta vacía (${JSON.stringify(ev?.metadata)})`);
    ok(p.errores.length === 0, `Z: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // Z2) Blue IA ya abierta antes con otra pregunta (una pregunta frecuente de Inicio): la de la Cesta también se manda.
  // Antes, tras la primera pregunta por la URL, la pestaña no mandaba ninguna más.
  {
    const estado = { filas: perfil, guardados: [], blueIa: (n) => (n === 1 ? "Enviamos a toda España en 1-2 días." : "Claro. ¿Qué presupuesto tienes?") };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, `/blue-ia?q=${encodeURIComponent("¿Hacéis envíos?")}`);
    for (let i = 0; i < 30 && (estado.preguntasBlueIa ?? 0) < 1; i++) await p.waitForTimeout(300);
    // Por la pestaña (sin recargar): Blue IA se queda montada, como en el móvil.
    await p.locator('[data-testid="pestana-cesta"]').first().click({ timeout: 30000 });
    await p.locator("#cesta-blue-elegir").click({ timeout: 30000 });
    await p.waitForURL(/\/blue-ia/, { timeout: 15000 }).catch(() => {});
    for (let i = 0; i < 30 && !preguntoElegir(estado); i++) await p.waitForTimeout(300);
    ok((estado.preguntasBlueIa ?? 0) === 2 && preguntoElegir(estado), `Z: con Blue IA ya abierta con otra pregunta, la de la Cesta también se manda (${estado.preguntasBlueIa ?? 0} preguntas)`);
    ok(p.errores.length === 0, `Z: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // Z3) Administración → Analítica cuenta las sesiones que lo tocan (y no se cuela como producto ni paso del recorrido).
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Producto Nintendo Switch OLED", sessions: 6 },
        { step_label: "Cesta: Blue, ayúdame a elegir", sessions: 5 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-cesta-blue").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-cesta-blue").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Cesta → «Blue, ayúdame a elegir un artículo»: 5 sesiones/.test(t), `Z: Administración → Analítica cuenta las sesiones que lo tocan (${t})`);
    const resto = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(!/Cesta: Blue/.test(resto), "Z: y no se cuela como producto ni paso del recorrido");
    ok(p.errores.length === 0, `Z: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== BU) Blue nunca tapa la barra de búsqueda (dueño, 2026-11-01) =================================================
// Desde 2026-11-04 Blue va fijo arriba a la derecha: en Inicio, justo debajo de la barra (aunque hubiera un sitio antiguo
// guardado encima de ella), no se arrastra y se esconde mientras la lista de resultados está abierta. Se mide la capa
// visible de Blue y la barra de verdad (el hijo de #buscador-flotante, cuya capa ocupa todo el ancho), solo cuando las
// dos se ven.
async function seccionBU() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const medir = (p, otro = null) => p.evaluate((idOtro) => {
    const capaBlue = document.getElementById("blue-flotante")?.firstElementChild;
    const capaBarra = document.getElementById("buscador-flotante");
    const barra = idOtro ? document.getElementById(idOtro) : capaBarra?.firstElementChild;
    if (!capaBlue || !barra) return null;
    const b = capaBlue.getBoundingClientRect();
    const r = barra.getBoundingClientRect();
    const se = (el) => Number(getComputedStyle(el).opacity) > 0.3;
    const solape = Math.min(b.right, r.right) - Math.max(b.left, r.left) > 0 && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 0;
    return {
      tapa: solape && se(capaBlue) && (!capaBarra || se(capaBarra)),
      seVe: se(capaBlue),
      hueco: Math.round(b.top >= r.bottom ? b.top - r.bottom : r.top - b.bottom),
      blue: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      barra: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    };
  }, otro);
  const esperarBlue = async (p) => {
    for (let i = 0; i < 70 && !(await medir(p))?.seVe; i++) await p.waitForTimeout(400);
  };
  // Mira varias veces seguidas (Blue se mueve con un muelle): ninguna vez puede taparla.
  const vigilar = async (p, ms, otro = null) => {
    const vistas = [];
    for (let t = 0; t < ms; t += 150) {
      vistas.push(await medir(p, otro));
      await p.waitForTimeout(150);
    }
    return { tapada: vistas.filter((v) => v?.tapa).length, ultima: vistas[vistas.length - 1] };
  };
  const estado = { filas: perfil, guardados: [], productosVacios: true };
  const ctx = await contexto(navegador, CLIENTE, "user", estado);
  const p = await pagina(ctx, "/");
  await p.locator("#buscador-flotante").waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1200);

  // BU1) Aunque hubiera guardado un sitio antiguo justo encima de la barra (cuando se podía arrastrar), Blue sale fijo
  // arriba a la derecha, justo debajo de la barra.
  const barra = await p.evaluate(() => {
    const r = document.getElementById("buscador-flotante")?.firstElementChild?.getBoundingClientRect();
    return r ? { arriba: r.top, abajo: r.bottom, alto: window.innerHeight } : null;
  });
  ok(!!barra, `BU: Inicio tiene la barra de búsqueda (${JSON.stringify(barra)})`);
  await p.evaluate(() => {
    localStorage.setItem("videojuegoszaragoza:campanita_corner", JSON.stringify({ lado: "l", fy: 0.05 }));
    sessionStorage.setItem("videojuegoszaragoza:blue_fijo", "1");
  });
  await p.reload({ waitUntil: "load" });
  await esperarBlue(p);
  const fijo = await vigilar(p, 2400);
  const ancho = await p.evaluate(() => window.innerWidth);
  const derecha = fijo.ultima ? ancho - (fijo.ultima.blue[0] + fijo.ultima.blue[2]) : null;
  ok(!!fijo.ultima?.seVe && fijo.tapada === 0, `BU: Blue no tapa la barra (${fijo.tapada} veces encima; Blue ${JSON.stringify(fijo.ultima?.blue)}, barra ${JSON.stringify(fijo.ultima?.barra)})`);
  ok(derecha !== null && derecha >= 2 && derecha <= 10 && fijo.ultima.hueco >= 0 && fijo.ultima.hueco <= 12, `BU: fijo arriba a la derecha, justo debajo de la barra, sin hacer caso del sitio antiguo guardado (a ${derecha} px del borde y ${fijo.ultima?.hueco} px de la barra)`);
  await capturar(p, "BU1-blue-junto-al-buscador");

  // BU2) Arrastrarlo con el dedo ya no lo mueve: se queda en su sitio fijo.
  const caja = await p.locator("#blue-flotante").boundingBox();
  const b2 = await p.evaluate(() => document.getElementById("buscador-flotante")?.firstElementChild?.getBoundingClientRect().toJSON());
  if (caja && b2) {
    const cdp = await ctx.newCDPSession(p);
    const [x0, y0] = [caja.x + caja.width / 2, caja.y + caja.height / 2];
    const [x1, y1] = [b2.x + 40, y0 + 220];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y: y0 + ((y1 - y0) * i) / 12 }] });
      await p.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const arrastrado = await vigilar(p, 2000);
  const cajaDespues = await p.locator("#blue-flotante").boundingBox();
  const movido = caja && cajaDespues ? Math.round(Math.max(Math.abs(cajaDespues.x - caja.x), Math.abs(cajaDespues.y - caja.y))) : null;
  ok(!!caja && !!b2 && movido !== null && movido <= 2, `BU: arrastrarlo con el dedo no lo mueve (se movió ${movido} px)`);
  ok(arrastrado.tapada === 0 && !!arrastrado.ultima?.seVe, `BU: y sigue sin tapar la barra (${arrastrado.tapada} vistas encima)`);
  await capturar(p, "BU2-blue-no-se-arrastra");

  // BU3) La barra recibe el toque (nada la tapa) y, al escribir, sale la lista de resultados: Blue se esconde mientras
  // está abierta y vuelve a su sitio al cerrarla.
  const recibe = await p.evaluate(() => {
    const campo = document.querySelector("#buscador-flotante input");
    const r = campo?.getBoundingClientRect();
    if (!r) return "sin campo";
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (e && e.closest("#buscador-flotante")) return "sí";
    const tocable = e?.closest("[aria-label],[tabindex]");
    return `tapada por ${e?.closest("#blue-flotante") ? "Blue" : "otra cosa"}: ${(tocable?.getAttribute("aria-label") ?? tocable?.outerHTML ?? e?.outerHTML ?? "").slice(0, 160)}`;
  });
  ok(recibe === "sí", `BU: la barra recibe el toque, nada la tapa (${recibe})`);
  await p.locator("#buscador-flotante input").first().click({ timeout: 8000 }).catch(() => {});
  await p.keyboard.type("ps", { delay: 60 });
  await p.locator("#buscador-resultados").waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
  const lista = await vigilar(p, 2400, "buscador-resultados");
  const conLista = !!(await p.evaluate(() => document.getElementById("buscador-resultados")));
  ok(conLista && lista.tapada <= 3 && !lista.ultima?.tapa, `BU: con la lista de resultados abierta, Blue no la tapa (${lista.tapada} vistas encima mientras se esconde; Blue ${JSON.stringify(lista.ultima?.blue)}, lista ${JSON.stringify(lista.ultima?.barra)})`);
  await capturar(p, "BU3-blue-y-resultados");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const cerrada = !(await p.evaluate(() => document.getElementById("buscador-resultados")));
  await esperarBlue(p);
  const vuelve = await vigilar(p, 1200);
  ok(cerrada && !!vuelve.ultima?.seVe && vuelve.tapada === 0 && vuelve.ultima.hueco >= 0 && vuelve.ultima.hueco <= 12, `BU: al cerrar la lista, Blue vuelve a su sitio bajo la barra (lista cerrada: ${cerrada}; a ${vuelve.ultima?.hueco} px de la barra)`);
  ok(p.errores.length === 0, `BU: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  await ctx.close();
}

// ===== BF) Blue solo en Inicio, las fichas y el panel, y fijo arriba a la derecha (dueño, 2026-11-04) ================
// En móvil y ordenador: dónde sale y dónde no (también navegando sin recargar), su sitio fijo (a 6 px del borde derecho,
// 52 px; en las fichas dentro de la cabecera, en Inicio bajo el buscador y, en el móvil, bajo Instagram), que Blue no
// tapa ningún botón (arriba ni con la pantalla desplazada: si queda uno debajo, se esconde), que su mensaje no tapa el
// buscador y que tocarlo abre su panel. Con su «prueba de la prueba»: un botón puesto debajo de Blue tiene que salir
// como tapado.
async function seccionBF() {
  const PRODUCTO = "b7c1d2e3-0000-4000-8000-0000000000b1";
  const SERVICIO = "5e000000-0000-4000-8000-0000000000b2";
  const AVISO = "Esta semana, mandos revisados con un 20 % menos";
  const estadoBase = (usuario) => ({
    filas: [{ user_id: usuario.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
    guardados: [],
    aceptaAnalitica: true,
    flash: [{ message: AVISO, sort_order: 0 }],
    olvidados: { pedidos: 1, reparaciones: 0 },
    servicio: { id: SERVICIO, title: "Mantenimiento Consola Playstation 5", description: "Limpieza completa y cambio de pasta térmica.", price_eur: 45 },
    fotosServicio: [],
    producto: {
      id: PRODUCTO, title: "Nintendo Switch OLED", description: "Consola revisada.", price_eur: 249.99, status: "PUBLISHED", is_active: true,
      category_id: null, images: [], updated_at: "2026-10-30T10:00:00Z", created_at: "2026-10-30T10:00:00Z", condition: "USED",
      like_count: 0, reference: null, caracteristicas: null, mantenimiento: null, category: null,
    },
    fotosProducto: [],
  });
  // Dónde está Blue y qué botones tapa: en varios puntos de cada botón, si el toque lo recibe Blue y sin Blue lo recibiría
  // el botón. Como pruebas/blue-regresion.mjs. `tapados`: los que tapa Blue (su sitio de 52 px); `bajoMensaje`: los que
  // tapan su mensaje o su saludo, que salen a su izquierda y se cierran con la X (se cuentan aparte).
  const medir = (p) =>
    p.evaluate(() => {
      const blue = document.getElementById("blue-flotante");
      if (!blue) return null;
      const b = blue.getBoundingClientRect();
      const capa = blue.firstElementChild;
      const SEL = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[tabindex="0"]';
      const tapados = [];
      const bajoMensaje = [];
      for (const el of document.querySelectorAll(SEL)) {
        if (el.closest("#blue-flotante")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.width >= window.innerWidth * 0.95) continue;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) continue;
        let porBlue = false;
        let porMensaje = false;
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
          const tope = document.elementFromPoint(x, y);
          if (!tope || !tope.closest("#blue-flotante")) continue;
          const antes = blue.style.visibility;
          blue.style.visibility = "hidden";
          const sinBlue = document.elementFromPoint(x, y);
          blue.style.visibility = antes;
          if (!sinBlue || !el.contains(sinBlue)) continue;
          const enSuSitio = x >= b.left && x <= b.right && y >= b.top && y <= b.bottom && !tope.closest("#blue-mensaje");
          if (enSuSitio) porBlue = true;
          else porMensaje = true;
        }
        const nombre = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
        if (porBlue) tapados.push(nombre);
        if (porMensaje) bajoMensaje.push(nombre);
      }
      const solape = (r) => (r ? Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) * Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)) : 0);
      const msj = document.getElementById("blue-mensaje")?.getBoundingClientRect();
      const barra = document.getElementById("buscador-flotante")?.firstElementChild?.getBoundingClientRect();
      const mensajeSobreBuscador = msj && barra ? Math.max(0, Math.min(msj.right, barra.right) - Math.max(msj.left, barra.left)) * Math.max(0, Math.min(msj.bottom, barra.bottom) - Math.max(msj.top, barra.top)) : 0;
      return {
        derecha: Math.round(window.innerWidth - b.right),
        arriba: Math.round(b.top),
        lado: Math.round(b.width),
        seVe: !!capa && Number(getComputedStyle(capa).opacity) > 0.3,
        mensaje: (document.getElementById("blue-mensaje")?.innerText ?? "").replace(/\s+/g, " ").trim(),
        mensajeDentro: !msj || (msj.left >= 0 && msj.right <= window.innerWidth),
        mensajeSobreBuscador: Math.round(mensajeSobreBuscador),
        tapados,
        bajoMensaje,
        solapeVolver: Math.round(solape(document.querySelector('[aria-label="Volver atrás"]')?.getBoundingClientRect())),
      };
    });
  const esperarBlue = async (p, veces = 70) => {
    for (let i = 0; i < veces && !(await medir(p))?.seVe; i++) await p.waitForTimeout(400);
    await p.waitForTimeout(1500); // que acabe de entrar (rebote y saludo)
    return medir(p);
  };
  const enSuSitio = (m, maxArriba) => !!m && m.seVe && m.derecha >= 2 && m.derecha <= 10 && m.arriba >= 0 && m.arriba <= maxArriba && Math.abs(m.lado - 52) <= 3;
  const desc = (m) => (m ? `a ${m.derecha} px del borde derecho y ${m.arriba} px de arriba, ${m.lado} px${m.tapados.length ? `; tapa: ${m.tapados.join(" · ")}` : ""}` : "sin Blue");
  // Baja la página (la de la ventana o la del contenedor que se desplaza) y espera a que Blue vuelva al parar.
  const bajar = async (p, px) => {
    await p.evaluate((d) => {
      const caja = [...document.querySelectorAll("div")].find((e) => e.scrollHeight > e.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      if (caja) caja.scrollTop += d;
      else window.scrollBy(0, d);
    }, px);
    await p.waitForTimeout(2600);
  };

  for (const [nombre, vista] of [
    ["móvil", {}],
    ["ordenador", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }],
  ]) {
    // BF1) Cliente: Inicio, la ficha de producto y la de servicio. Blue fijo arriba a la derecha y sin tapar nada.
    const estado = estadoBase(CLIENTE);
    const ctx = await contexto(navegador, CLIENTE, "user", estado, vista);
    const p = await pagina(ctx, "/");
    const inicio = await esperarBlue(p);
    ok(enSuSitio(inicio, 260) && inicio.tapados.length === 0, `BF (${nombre}): en Inicio, Blue fijo arriba a la derecha bajo el buscador y sin tapar nada (${desc(inicio)})`);
    await capturar(p, `BF1-${nombre}-inicio`);
    // Su mensaje (el aviso de la tienda) sale a su izquierda, dentro de la pantalla, y no tapa el buscador. Lo que quede
    // debajo hasta que se cierre con la X se apunta (no es un fallo: Blue ya no se mueve para dejarle sitio).
    let conMensaje = inicio;
    for (let i = 0; i < 60 && !conMensaje?.mensaje; i++) {
      await p.waitForTimeout(500);
      conMensaje = await medir(p);
    }
    ok(/mandos revisados/.test(conMensaje?.mensaje ?? "") && conMensaje.tapados.length === 0 && conMensaje.mensajeDentro && conMensaje.mensajeSobreBuscador === 0, `BF (${nombre}): en Inicio, con su mensaje a la vista Blue sigue sin tapar nada y el mensaje no tapa el buscador («${(conMensaje?.mensaje ?? "").slice(0, 60)}»; encima del buscador: ${conMensaje?.mensajeSobreBuscador ?? "?"} px²)`);
    console.log(`INFO  BF (${nombre}): en Inicio, bajo el mensaje de Blue queda: ${conMensaje?.bajoMensaje.join(" · ") || "nada que se toque"}`);
    await capturar(p, `BF1-${nombre}-inicio-mensaje`);
    await p.locator('[aria-label="Cerrar mensaje de Blue"]').first().click({ timeout: 5000 }).catch(() => {});
    // Con la pantalla desplazada, ni encima de una tarjeta ni de un botón: si hay uno debajo de su sitio, se esconde (sin
    // moverse) y vuelve a verse cuando queda libre.
    const tapadosBajando = [];
    let escondido = 0;
    let quieto = true;
    for (let i = 0; i < 4; i++) {
      await bajar(p, 380);
      const m = await medir(p);
      if (m?.seVe && m.tapados.length) tapadosBajando.push(...m.tapados);
      if (m && !m.seVe) escondido++;
      if (m?.seVe && (m.derecha !== inicio.derecha || m.arriba !== inicio.arriba)) quieto = false;
    }
    ok(tapadosBajando.length === 0, `BF (${nombre}): en Inicio, bajando la página Blue no se queda encima de ningún botón (${tapadosBajando.join(" · ") || "ninguno"}; escondido en ${escondido} de 4 paradas)`);
    ok(quieto, `BF (${nombre}): y no se mueve de su sitio al desplazar la página`);
    await capturar(p, `BF1-${nombre}-inicio-bajado`);
    // Arriba del todo otra vez (Inicio se desplaza dentro de su contenedor, no la ventana).
    await bajar(p, -100000);

    // Navegando sin recargar: en la Cesta y en Perfil no sale; al volver a Inicio, sí y en su sitio.
    const sinBlueEn = [];
    for (const pestana of ["pestana-cesta", "pestana-perfil"]) {
      await p.locator(`[data-testid="${pestana}"]`).first().click({ timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(1500);
      if ((await p.locator("#blue-flotante").count()) === 0) sinBlueEn.push(pestana);
    }
    ok(sinBlueEn.length === 2, `BF (${nombre}): navegando, en la Cesta y en Perfil Blue no sale (${sinBlueEn.join(", ") || "sale en las dos"})`);
    await p.locator('[data-testid="pestana-index"]').first().click({ timeout: 15000 }).catch(() => {});
    const vuelta = await esperarBlue(p, 20);
    ok(enSuSitio(vuelta, 260) && vuelta.arriba === inicio.arriba, `BF (${nombre}): al volver a Inicio, Blue vuelve a su sitio fijo (${desc(vuelta)})`);

    // Tocarlo abre su panel.
    await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').first().click({ timeout: 10000 }).catch(() => {});
    const panel = await p.getByRole("tab", { name: /Asistente/ }).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
    ok(panel, `BF (${nombre}): tocar a Blue abre su panel`);
    const abierto = () => (estado.eventosEnviados ?? []).filter((e) => e.event_name === "blue_flotante_abierto");
    for (let i = 0; i < 20 && !abierto().length; i++) await p.waitForTimeout(300);
    ok(abierto()[0]?.step_label === "Blue flotante: abierto en Inicio" && abierto()[0]?.metadata?.pantalla === "Inicio", `BF (${nombre}): y se apunta en la analítica propia en qué pantalla («${abierto()[0]?.step_label ?? "nada"}»)`);
    await p.close();

    // Las dos fichas: dentro de la cabecera (arriba del todo), sin tocar «Volver atrás» ni otro botón, también bajando.
    for (const [cual, ruta] of [
      ["producto", `/producto/${PRODUCTO}`],
      ["servicio", `/servicio/${SERVICIO}`],
    ]) {
      const f = await pagina(ctx, ruta);
      const m = await esperarBlue(f);
      ok(enSuSitio(m, 20) && m.tapados.length === 0 && m.solapeVolver === 0, `BF (${nombre}): en la ficha de ${cual}, Blue fijo arriba a la derecha, en la cabecera, sin tapar nada (${desc(m)}; con «Volver atrás»: ${m?.solapeVolver ?? "?"} px²)`);
      await capturar(f, `BF2-${nombre}-ficha-${cual}`);
      // Con su mensaje a la vista (la ficha de producto saca uno), la flecha «Volver atrás» de la cabecera sigue
      // recibiendo el toque: el mensaje sale debajo de Blue, no encima de la cabecera (lo pilló pruebas/guia-blue.mjs).
      if (cual === "producto") {
        await f.locator("#blue-mensaje").waitFor({ timeout: 40000 }).catch(() => {});
        await f.waitForTimeout(800);
        const mm = await medir(f);
        const volverLibre = await f.evaluate(() => {
          const b = document.querySelector('[aria-label="Volver atrás"]');
          const r = b?.getBoundingClientRect();
          if (!r) return "sin botón";
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return e && b.contains(e) ? "sí" : e?.closest("#blue-flotante") ? "tapado por Blue" : "tapado";
        });
        ok(!!mm?.mensaje && volverLibre === "sí" && mm.bajoMensaje.length === 0, `BF (${nombre}): con el mensaje de Blue a la vista en la ficha, «Volver atrás» recibe el toque y el mensaje no tapa ningún botón («${(mm?.mensaje ?? "sin mensaje").slice(0, 50)}»; «Volver atrás»: ${volverLibre}${mm?.bajoMensaje.length ? `; bajo el mensaje: ${mm.bajoMensaje.join(" · ")}` : ""})`);
        await capturar(f, `BF2-${nombre}-ficha-${cual}-mensaje`);
      }
      const bajando = [];
      for (let i = 0; i < 3; i++) {
        await bajar(f, 320);
        const mb = await medir(f);
        if (mb?.seVe && mb.tapados.length) bajando.push(...mb.tapados);
      }
      ok(bajando.length === 0, `BF (${nombre}): en la ficha de ${cual}, bajando la página Blue no se queda encima de ningún botón (${bajando.join(" · ") || "ninguno"})`);
      ok(f.errores.length === 0, `BF (${nombre}): ficha de ${cual} sin errores de JavaScript (${f.errores[0] ?? "ninguno"})`);
      await f.close();
    }

    // Las demás pantallas de la tienda, cargadas de cero: Blue no sale (aparece a los 10 s; se espera más).
    const conBlue = [];
    await Promise.all(
      ["/catalogo", "/servicios", "/cesta", "/perfil", "/quienes-somos", "/blog", "/politicas/envios"].map(async (ruta) => {
        const q = await pagina(ctx, ruta);
        await q.waitForTimeout(13000);
        if ((await q.locator("#blue-flotante").count()) > 0) conBlue.push(ruta);
        await q.close();
      })
    );
    ok(conBlue.length === 0, `BF (${nombre}): en Catálogo, Servicios, Cesta, Perfil, Quiénes somos, Blog y Políticas Blue no sale (${conBlue.join(", ") || "en ninguna"})`);

    // La prueba de la prueba: un botón de la página puesto justo debajo de Blue (junto a su capa y por debajo de ella, para
    // que Blue quede encima, como con el contenido de la tienda) tiene que salir como tapado si Blue no se escondiera; y
    // Blue, de verdad, se esconde.
    const c = await pagina(ctx, "/");
    await esperarBlue(c);
    await c.evaluate(() => {
      const blue = document.getElementById("blue-flotante");
      const e = blue.getBoundingClientRect();
      const b = document.createElement("button");
      b.textContent = "Botón de control";
      b.style.cssText = `position:fixed;left:${e.left + 4}px;top:${e.top + 4}px;width:${e.width - 8}px;height:${e.height - 8}px;z-index:0;`;
      const capa = blue.parentElement;
      capa.parentElement.insertBefore(b, capa);
    });
    const control = await medir(c);
    ok(!!control && control.tapados.includes("Botón de control"), `BF (${nombre}): control: la medida sí detecta un botón tapado por Blue (${control?.tapados.join(" · ") || "no lo detecta"})`);
    let seEsconde = false;
    for (let i = 0; i < 12 && !seEsconde; i++) {
      await c.waitForTimeout(250);
      seEsconde = (await medir(c))?.seVe === false;
    }
    ok(seEsconde, `BF (${nombre}): con un botón debajo de su sitio, Blue se esconde en menos de 3 s (sin moverse)`);
    await c.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Botón de control")?.remove());
    let vuelveAVerse = false;
    for (let i = 0; i < 16 && !vuelveAVerse; i++) {
      await c.waitForTimeout(250);
      vuelveAVerse = (await medir(c))?.seVe === true;
    }
    ok(vuelveAVerse, `BF (${nombre}): y al quitar el botón vuelve a verse en su sitio`);
    await c.close();
    await ctx.close();

    // BF3) El dueño, en el panel: Blue sale en sus pantallas, fijo arriba a la derecha y sin tapar nada.
    const estadoAdmin = estadoBase(ADMIN);
    const ctxA = await contexto(navegador, ADMIN, "admin", estadoAdmin, vista);
    const malos = [];
    let vistas = 0;
    await Promise.all(
      ["/admin", "/admin/products", "/admin/services", "/admin/users", "/admin/pedidos", "/admin/analytics"].map(async (ruta) => {
        const q = await pagina(ctxA, ruta);
        const m = await esperarBlue(q);
        if (m?.seVe) vistas++;
        if (!enSuSitio(m, 20) || m.tapados.length) malos.push(`${ruta}: ${desc(m)}`);
        if (ruta === "/admin") await capturar(q, `BF3-${nombre}-panel`);
        await q.close();
      })
    );
    ok(vistas === 6 && malos.length === 0, `BF (${nombre}): en el panel, Blue sale para el dueño fijo arriba a la derecha y sin tapar nada (${vistas}/6${malos.length ? `; ${malos.join(" | ")}` : ""})`);
    // El dueño abriendo Blue en el panel no cuenta en la analítica de la tienda.
    const a = await pagina(ctxA, "/admin");
    await esperarBlue(a);
    await a.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').first().click({ timeout: 10000 }).catch(() => {});
    await a.waitForTimeout(1500);
    ok(!(estadoAdmin.eventosEnviados ?? []).some((e) => e.event_name === "blue_flotante_abierto"), `BF (${nombre}): abrir a Blue en el panel no se cuenta como uso de la tienda`);
    await a.close();
    await ctxA.close();
  }

  // BF4) Administración → Analítica: en qué pantalla abren a Blue (sesiones), sin colarse en el recorrido.
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Blue flotante: abierto en Inicio", sessions: 7 },
        { step_label: "Blue flotante: abierto en la ficha de producto", sessions: 4 },
        { step_label: "Blue flotante: abierto en la ficha de servicio", sessions: 2 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-blue-flotante").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-blue-flotante").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok(/en Inicio 7 · en la ficha de producto 4 · en la ficha de servicio 2/.test(t), `BF: Administración → Analítica cuenta en qué pantalla abren a Blue (${t})`);
    const resto = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(!/Blue flotante: abierto/.test(resto), "BF: y no se cuela como paso del recorrido");
    ok(p.errores.length === 0, `BF: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== ME) «Mejoras en la tienda»: la cajita de ideas (pie de página, Blue y Mi cuenta) y su parte en Administración ===
async function seccionME() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const ventana = (p) => p.evaluate(() => (document.getElementById("mejoras-ventana")?.innerText ?? "").replace(/\n+/g, " | "));
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const esperar = async (p, cond, veces = 30) => {
    for (let i = 0; i < veces && !cond(); i++) await p.waitForTimeout(250);
  };

  // ME1) Con sesión: desde el pie de página, Blue y Mi cuenta.
  {
    const estado = { filas: perfil, guardados: [], aceptaAnalitica: true, productosVacios: true, mejoras: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    const pie = p.locator("#pie-mejoras");
    await pie.waitFor({ timeout: 30000 }).catch(() => {});
    await pie.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    const medidaPie = await pie.boundingBox({ timeout: 5000 }).catch(() => null);
    ok(!!medidaPie && medidaPie.height >= 44 && /Mejoras en la tienda/.test((await pie.innerText().catch(() => "")) ?? ""), `ME: el pie de página tiene «Mejoras en la tienda» a la vista, de 44 px (${medidaPie?.height})`);
    await pie.click();
    await p.locator("#mejoras-texto").waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Mejoras en la tienda/.test(await ventana(p)) && (await p.locator("#mejoras-texto").count()) === 1, `ME: se abre la cajita con su recuadro para escribir (${(await ventana(p)).slice(0, 90)})`);
    const campo = p.locator("#mejoras-texto");
    await campo.fill("ab");
    await p.getByText("Enviar idea", { exact: true }).click({ force: true });
    await p.waitForTimeout(500);
    ok(!(estado.mejorasEnviadas ?? []).length, "ME: con menos de 3 letras no se envía");
    const altoAntes = (await campo.boundingBox())?.height ?? 0;
    await campo.fill("Una idea:\npoder filtrar por precio\nen el catálogo\ny ver las consolas\npor marca\ncon fotos más grandes");
    await p.waitForTimeout(400);
    const altoDespues = (await campo.boundingBox())?.height ?? 0;
    ok(altoDespues > altoAntes + 10, `ME: el recuadro crece con lo escrito (${Math.round(altoAntes)} → ${Math.round(altoDespues)} px)`);
    await campo.fill("x".repeat(620));
    ok((await campo.inputValue()).length === 500, `ME: como mucho 500 letras (${(await campo.inputValue()).length})`);
    await campo.fill("Poder filtrar por precio en el catálogo");
    await p.getByText("Enviar idea", { exact: true }).click();
    await esperar(p, () => (estado.mejorasEnviadas ?? []).length > 0);
    await p.getByText("¡Gracias! La hemos recibido").waitFor({ timeout: 10000 }).catch(() => {});
    const enviada = (estado.mejorasEnviadas ?? [])[0];
    ok(enviada?.texto === "Poder filtrar por precio en el catálogo" && enviada?.origen === "pie" && !("user_id" in (enviada ?? {})), `ME: se guarda el texto y que vino del pie de página (quién lo pone la base de datos) (${JSON.stringify(enviada)})`);
    ok(/¡Gracias! La hemos recibido/.test(await ventana(p)), "ME: y da las gracias");
    await capturar(p, "ME1-mejora-enviada");
    await esperar(p, () => evento(estado, "mejora_enviada").length > 0);
    ok(
      evento(estado, "mejora_abierta")[0]?.metadata?.origen === "pie" && evento(estado, "mejora_abierta")[0]?.metadata?.con_sesion === true && evento(estado, "mejora_enviada")[0]?.metadata?.origen === "pie",
      `ME: la analítica propia apunta que se abrió y se envió, y desde dónde (${JSON.stringify(evento(estado, "mejora_abierta")[0]?.metadata)})`
    );
    await p.locator("#mejoras-ventana").getByText("Cerrar", { exact: true }).click().catch(() => {});
    await p.waitForTimeout(500);

    // Desde Blue (pestaña Asistente). Arriba del todo otra vez: Inicio se desplaza dentro de su contenedor, no la ventana
    // (abajo, con el pie, Blue tiene botones debajo de su sitio y se esconde, como debe).
    await p.evaluate(() => {
      window.scrollTo(0, 0);
      for (const e of document.querySelectorAll("div")) if (e.scrollTop > 0) e.scrollTop = 0;
    });
    await p.waitForTimeout(1500);
    await p.waitForSelector("#blue-flotante", { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').first().click();
    // Con avisos pendientes el panel se abre en «Noticias y avisos»: se pasa al Asistente.
    await p.getByRole("tab", { name: /Asistente/ }).first().click({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(500);
    // La ventana de Blue va al final de la página: su «Mejoras en la tienda» es el último (el primero es el del pie).
    const enBlue = p.getByText("Mejoras en la tienda", { exact: true }).last();
    await enBlue.click({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(800);
    if (!(await p.locator("#mejoras-texto").count())) await capturar(p, "ME1-panel-blue-sin-cajita");
    await p.locator("#mejoras-texto").waitFor({ timeout: 15000 }).catch(() => {});
    await p.locator("#mejoras-texto").fill("Que Blue me avise de las ofertas");
    await p.getByText("Enviar idea", { exact: true }).click();
    await esperar(p, () => (estado.mejorasEnviadas ?? []).length > 1);
    ok((estado.mejorasEnviadas ?? [])[1]?.origen === "blue", `ME: desde Blue (Asistente) también, y se sabe que vino de Blue (${(estado.mejorasEnviadas ?? [])[1]?.origen})`);
    ok(p.errores.length === 0, `ME: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);

    // Desde Perfil → Mi cuenta; y el límite diario lo dice con el mensaje de la base de datos.
    const pp = await pagina(ctx, "/perfil");
    await pp.locator("#perfil-mejoras").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await pp.locator("#perfil-mejoras").count()) === 1, "ME: Mi cuenta tiene «Mejoras en la tienda»");
    await pp.locator("#perfil-mejoras").click();
    await pp.locator("#mejoras-texto").waitFor({ timeout: 15000 }).catch(() => {});
    await pp.locator("#mejoras-texto").fill("Más fotos de cada consola");
    await pp.getByText("Enviar idea", { exact: true }).click();
    await esperar(pp, () => (estado.mejorasEnviadas ?? []).length > 2);
    ok((estado.mejorasEnviadas ?? [])[2]?.origen === "perfil", `ME: desde Mi cuenta, con su sitio (${(estado.mejorasEnviadas ?? [])[2]?.origen})`);
    await pp.locator("#mejoras-ventana").getByText("Cerrar", { exact: true }).click().catch(() => {});
    await pp.waitForTimeout(500);
    estado.mejorasLimite = true;
    await pp.locator("#perfil-mejoras").click();
    await pp.locator("#mejoras-texto").waitFor({ timeout: 15000 }).catch(() => {});
    await pp.locator("#mejoras-texto").fill("La sexta idea de hoy");
    await pp.getByText("Enviar idea", { exact: true }).click();
    await pp.locator("#mejoras-error").waitFor({ timeout: 10000 }).catch(() => {});
    const limite = (await pp.locator("#mejoras-error").innerText().catch(() => "")).trim();
    ok(/Ya nos has enviado 5 ideas hoy/.test(limite), `ME: pasado el límite del día, lo dice en español (${limite})`);
    ok(pp.errores.length === 0, `ME: Mi cuenta sin errores de JavaScript (${pp.errores.length}${pp.errores[0] ? ": " + pp.errores[0] : ""})`);
    await ctx.close();
  }

  // ME2) Sin sesión: la cajita pide iniciar sesión y no envía nada.
  {
    const estado = { filas: [], guardados: [], productosVacios: true, mejoras: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await ctx.addInitScript(() => {
      try {
        localStorage.removeItem("videojuegoos.supabase.auth");
      } catch {
        // sin almacenamiento
      }
    });
    const p = await pagina(ctx, "/");
    const pie = p.locator("#pie-mejoras");
    await pie.waitFor({ timeout: 30000 }).catch(() => {});
    await pie.scrollIntoViewIfNeeded().catch(() => {});
    await pie.click();
    await p.getByText("Iniciar sesión", { exact: true }).last().waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Inicia sesión para mandarnos tus ideas/.test(await ventana(p)) && (await p.locator("#mejoras-texto").count()) === 0, `ME: sin sesión pide iniciarla y no deja escribir (${(await ventana(p)).slice(0, 80)})`);
    await p.locator("#mejoras-ventana").getByText("Iniciar sesión", { exact: true }).click();
    await p.waitForURL(/\/perfil/, { timeout: 10000 }).catch(() => {});
    ok(/\/perfil\?acceso=entrar/.test(p.url()) && !(estado.mejorasEnviadas ?? []).length, `ME: «Iniciar sesión» lleva a entrar en la cuenta (${new URL(p.url()).pathname}${new URL(p.url()).search})`);
    await ctx.close();
  }

  // ME3) Sin la migración: dice que muy pronto y no deja escribir; el resto funciona (sin errores de JavaScript).
  {
    const estado = { filas: perfil, guardados: [], productosVacios: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-mejoras").waitFor({ timeout: 30000 }).catch(() => {});
    ok(!estado.mejoras404, "ME: sin la migración, la tienda no pide la tabla hasta que alguien abre la cajita");
    await p.locator("#perfil-mejoras").click();
    await p.getByText(/Muy pronto podrás mandarnos tus ideas/).waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Muy pronto podrás mandarnos tus ideas/.test(await ventana(p)) && (await p.locator("#mejoras-texto").count()) === 0, "ME: sin la migración dice que muy pronto se podrá y no deja escribir");
    ok(p.errores.length === 0, `ME: y sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // ME4) Administración → Usuarios, la ficha del cliente y el Panel.
  {
    const hace = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
    const estado = {
      guardados: [],
      filas: perfil,
      usuarios: [{ user_id: CLIENTE.id, email: CLIENTE.email, role: "user", created_at: "2026-10-01T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 }],
      mejoras: [
        { id: "m1", user_id: CLIENTE.id, created_at: hace(2), texto: "Filtrar por precio en el catálogo", origen: "pie", leida: false, leida_en: null },
        { id: "m2", user_id: CLIENTE.id, created_at: hace(5), texto: "Que Blue avise de las ofertas", origen: "blue", leida: false, leida_en: null },
        { id: "m3", user_id: CLIENTE.id, created_at: hace(30), texto: "Más fotos de cada consola", origen: "perfil", leida: true, leida_en: hace(20) },
      ],
      eventos: [
        { event_name: "mejora_abierta", user_id: CLIENTE.id, session_id: "s1", metadata: { origen: "blue" } },
        { event_name: "mejora_abierta", user_id: CLIENTE.id, session_id: "s1", metadata: { origen: "blue" } },
        { event_name: "mejora_abierta", user_id: null, session_id: "s2", metadata: { origen: "pie" } },
      ],
      novedades: {},
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-mejoras").waitFor({ timeout: 30000 }).catch(() => {});
    const t = (await p.locator("#admin-mejoras").innerText().catch(() => "")).replace(/\n+/g, " | ");
    ok(/Ideas de mejora · 2 sin leer/.test(t), `ME: Usuarios enseña «Ideas de mejora · 2 sin leer» (${t.slice(0, 60)})`);
    ok(/Filtrar por precio/.test(t) && /Que Blue avise/.test(t) && !/Más fotos de cada consola/.test(t), "ME: primero solo las que no se han leído");
    ok(/Ana · @ana_g/.test(t) && /desde Pie de página/.test(t) && /desde Blue/.test(t), "ME: con quién la manda (nombre y usuario) y desde dónde");
    const uso = (await p.locator("#admin-mejoras-uso").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/3 ideas enviadas/.test(uso) && /abrieron la cajita 3 veces \(2 personas\)/.test(uso) && /Blue 2 · pie de página 1 · Mi cuenta 0/.test(uso), `ME: cuenta las enviadas y cuántas veces se abrió la cajita y desde dónde (${uso})`);
    await p.getByText("Todas (3)", { exact: true }).click();
    await p.waitForTimeout(300);
    ok(/Más fotos de cada consola/.test(await p.locator("#admin-mejoras").innerText()), "ME: «Todas» enseña también las leídas");
    await p.getByText("Blue (1)", { exact: true }).click();
    await p.waitForTimeout(300);
    const soloBlue = await p.locator("#admin-mejoras").innerText();
    ok(/Que Blue avise/.test(soloBlue) && !/Filtrar por precio/.test(soloBlue), "ME: los contadores filtran por sitio (solo las de Blue)");
    await p.getByText("Blue (1)", { exact: true }).click();
    await p.getByText("Sin leer (2)", { exact: true }).click();
    await p.waitForTimeout(300);
    const boton = p.locator("#mejora-m1").getByRole("button", { name: "Marcar como leída" });
    const lado = await boton.boundingBox();
    await boton.click();
    await p.waitForTimeout(600);
    const marcada = (estado.mejorasMarcadas ?? [])[0];
    ok(marcada?.id === "m1" && marcada?.cuerpo?.leida === true && !!marcada?.cuerpo?.leida_en && (lado?.height ?? 0) >= 44, `ME: el botón de 44 px la marca como leída, con la fecha (${JSON.stringify(marcada)})`);
    ok(/1 sin leer/.test(await p.locator("#admin-mejoras").innerText()), "ME: y el contador baja a 1 sin leer");
    ok(p.errores.length === 0, `ME: Usuarios sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await capturar(p, "ME4-admin-ideas");
    await p.locator("#mejora-m2").getByRole("link").first().click();
    await p.waitForURL(/\/admin\/cliente\//, { timeout: 15000 }).catch(() => {});
    await p.locator("#ficha-mejoras").waitFor({ timeout: 20000 }).catch(() => {});
    const ficha = (await p.locator("#ficha-mejoras").innerText().catch(() => "")).replace(/\n+/g, " | ");
    ok(new URL(p.url()).pathname === `/admin/cliente/${CLIENTE.id}` && /Ideas de mejora/.test(ficha) && /Que Blue avise/.test(ficha) && /Más fotos de cada consola/.test(ficha), `ME: el nombre lleva a la ficha del cliente, que enseña sus ideas (${ficha.slice(0, 80)})`);
    await p.locator("#ficha-mejoras").getByText("Marcar como leída", { exact: true }).first().click();
    await p.waitForTimeout(600);
    ok((estado.mejorasMarcadas ?? []).some((m) => m.id === "m2" && m.cuerpo.leida === true), "ME: desde la ficha también se marca como leída");

    await ctx.close();

    // Panel (en un móvil que aún no ha abierto Usuarios: al entrar, lo de antes queda visto): las ideas nuevas sin leer
    // suman en el número rojo de «Usuarios y participación»; las leídas no.
    estado.mejoras = [...estado.mejoras, { id: "m4", user_id: CLIENTE.id, created_at: hace(1), texto: "Envío gratis a partir de 50 €", origen: "pie", leida: false, leida_en: null }];
    const sinLeerAhora = estado.mejoras.filter((m) => !m.leida).length;
    const ctxPanel = await contexto(navegador, ADMIN, "admin", estado);
    const panel = await pagina(ctxPanel, "/admin");
    await panel.locator("#novedades-users").waitFor({ timeout: 30000 }).catch(() => {});
    const etiqueta = await panel.locator('[aria-label^="Usuarios y participación"]').first().getAttribute("aria-label").catch(() => "");
    ok(new RegExp(`${sinLeerAhora} ideas? de mejora nuevas?`).test(etiqueta ?? ""), `ME: el Panel suma las ideas nuevas sin leer en «Usuarios y participación» (${sinLeerAhora} sin leer: ${etiqueta})`);
    await ctxPanel.close();
  }

  // ME5) Administración sin la migración: una línea dice que falta y el resto de Usuarios funciona.
  {
    const estado = { guardados: [], filas: perfil, usuarios: [] };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-mejoras").waitFor({ timeout: 30000 }).catch(() => {});
    ok(/falta aplicar en Supabase la migración 20261101200000_mejoras_tienda/.test(await p.locator("#admin-mejoras").innerText().catch(() => "")), "ME: sin la migración, Usuarios dice qué falta");
    ok(p.errores.length === 0, `ME: y sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== CO) «¿Olvidaste tu contraseña?»: el enlace en el mismo navegador y en otro, el de la plantilla (token_hash), los
// que no sirven, los errores de Supabase en español y su parte en Administración → Usuarios ============================
async function seccionCO() {
  const sinSesion = async (ctx) =>
    ctx.addInitScript(() => {
      try {
        localStorage.removeItem("videojuegoos.supabase.auth");
      } catch {
        // sin almacenamiento
      }
    });
  const texto = (p) => p.evaluate(() => document.body.innerText.replace(/\n+/g, " "));
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const esperar = async (p, cond, veces = 40) => {
    for (let i = 0; i < veces && !cond(); i++) await p.waitForTimeout(250);
  };
  const correoPerfil = (p) => p.locator('input[placeholder="tu@email.com"]').first();
  const olvido = (p) => p.getByText("¿Olvidaste tu contraseña?", { exact: true });

  // CO1) Pedir el enlace en Perfil y abrirlo en el MISMO navegador (el enlace de siempre, ?code=).
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true, productosVacios: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    const p = await pagina(ctx, "/perfil?acceso=entrar");
    await correoPerfil(p).waitFor({ timeout: 30000 }).catch(() => {});
    await olvido(p).click();
    await p.waitForTimeout(500);
    ok(/Escribe tu email arriba y pulsa de nuevo/.test(await texto(p)) && !(estado.recover ?? []).length, "CO: sin correo, pide escribirlo y no manda nada");
    await correoPerfil(p).fill("Cliente@Example.com ");
    await olvido(p).click();
    await esperar(p, () => (estado.recover ?? []).length > 0);
    await p.waitForTimeout(600);
    const pedido = (estado.recover ?? [])[0];
    ok(pedido?.cuerpo?.email === "cliente@example.com" && pedido?.redirect_to === `${BASE}/reset-password`, `CO: pide el enlace para ese correo y vuelve a /reset-password de la tienda (${pedido?.cuerpo?.email}, ${pedido?.redirect_to})`);
    ok(/Si ese email tiene una cuenta, te hemos enviado un enlace/.test(await texto(p)), "CO: dice que se ha enviado, sin revelar si el correo tiene cuenta");
    await esperar(p, () => evento(estado, "contrasena_enlace_pedido").length > 0);
    ok(evento(estado, "contrasena_enlace_pedido")[0]?.metadata?.desde === "perfil" && !JSON.stringify(estado.eventosEnviados ?? []).includes("example.com"), "CO: la analítica propia lo cuenta, sin el correo");

    await p.goto(`${BASE}/reset-password?code=codigo-bueno`, { waitUntil: "load" });
    await p.getByText("Contraseña nueva", { exact: true }).waitFor({ timeout: 15000 }).catch(() => {});
    const campos = p.locator('input[placeholder="Mínimo 6 caracteres"], input[placeholder="Repite la contraseña"]');
    ok((estado.canjes ?? [])[0]?.auth_code === "codigo-bueno" && (await campos.count()) === 2, "CO: en el mismo navegador el enlace sirve y pide la contraseña nueva dos veces");
    await campos.nth(0).fill("nueva123");
    await campos.nth(1).fill("nueva124");
    await p.getByText("Guardar contraseña", { exact: true }).click({ force: true });
    await p.waitForTimeout(500);
    ok(!estado.cuenta, "CO: si no coinciden, no se guarda");
    const tipoAntes = await campos.nth(0).getAttribute("type");
    await p.getByRole("button", { name: "Mostrar las contraseñas" }).click({ timeout: 5000 }).catch(() => {});
    const tipoDespues = await campos.nth(0).getAttribute("type");
    ok(tipoAntes === "password" && tipoDespues !== "password", `CO: «Mostrar» deja ver lo escrito (${tipoAntes} → ${tipoDespues})`);
    await campos.nth(1).fill("nueva123");
    await p.getByText("Guardar contraseña", { exact: true }).click();
    await p.getByText(/Contraseña actualizada correctamente/).waitFor({ timeout: 10000 }).catch(() => {});
    ok(estado.cuenta?.password === "nueva123" && /Contraseña actualizada correctamente/.test(await texto(p)), "CO: guarda la contraseña nueva y lo confirma");
    await esperar(p, () => evento(estado, "contrasena_cambiada").length > 0);
    ok(evento(estado, "contrasena_enlace_abierto")[0]?.metadata?.via === "codigo" && evento(estado, "contrasena_cambiada").length === 1, "CO: la analítica cuenta el enlace abierto (de siempre) y la contraseña cambiada");
    ok(p.errores.length === 0, `CO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await capturar(p, "CO1-contrasena-cambiada");
    await ctx.close();
  }

  // CO2) El enlace de siempre abierto en OTRO navegador (sin su código de seguridad): explica por qué y deja pedir otro.
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    const p = await pagina(ctx, "/reset-password?code=codigo-bueno");
    await p.locator("#contrasena-enlace-no-sirve").waitFor({ timeout: 15000 }).catch(() => {});
    const t = await texto(p);
    ok(/abrirlo en el mismo navegador donde lo pediste/.test(t), `CO: en otro navegador dice que hay que abrirlo en el mismo donde se pidió (${t.slice(0, 120)})`);
    await esperar(p, () => evento(estado, "contrasena_enlace_invalido").length > 0);
    ok(evento(estado, "contrasena_enlace_invalido")[0]?.metadata?.motivo === "otro_navegador", "CO: y lo cuenta como «otro navegador»");
    const otro = p.getByText("Enviarme otro enlace", { exact: true });
    await otro.click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);
    ok(/Escribe el correo de tu cuenta/.test(await texto(p)) && !(estado.recover ?? []).length, "CO: sin correo no pide nada");
    await p.locator("#contrasena-correo").fill("cliente@example.com", { timeout: 5000 }).catch(() => {});
    await otro.click({ timeout: 5000 }).catch(() => {});
    await esperar(p, () => (estado.recover ?? []).length > 0);
    await p.locator("#contrasena-pedido").waitFor({ timeout: 10000 }).catch(() => {});
    ok(
      (estado.recover ?? [])[0]?.cuerpo?.email === "cliente@example.com" && /te hemos enviado un enlace nuevo/.test(await texto(p)),
      "CO: y desde ahí mismo se pide otro enlace (para abrirlo en este navegador)"
    );
    await capturar(p, "CO2-otro-navegador");
    await ctx.close();
  }

  // CO3) El enlace de la plantilla de la tienda (token_hash) sirve en cualquier navegador y se quita de la dirección.
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    const p = await pagina(ctx, "/reset-password?token_hash=hash-bueno&type=recovery");
    await p.getByText("Contraseña nueva", { exact: true }).waitFor({ timeout: 15000 }).catch(() => {});
    await p.locator('input[placeholder="Repite la contraseña"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok((estado.verificaciones ?? [])[0]?.token_hash === "hash-bueno" && (await p.locator('input[placeholder="Repite la contraseña"]').count()) === 1, "CO: con el enlace de la plantilla sirve en cualquier navegador (sin código de seguridad)");
    ok(!/token_hash/.test(p.url()), `CO: y el enlace se quita de la dirección (${new URL(p.url()).pathname}${new URL(p.url()).search})`);
    estado.contrasenaError = { status: 422, cuerpo: { code: 422, error_code: "same_password", msg: "New password should be different from the old password." } };
    await p.locator('input[placeholder="Mínimo 6 caracteres"]').fill("vieja123", { timeout: 5000 }).catch(() => {});
    await p.locator('input[placeholder="Repite la contraseña"]').fill("vieja123", { timeout: 5000 }).catch(() => {});
    await p.getByText("Guardar contraseña", { exact: true }).click({ timeout: 5000 }).catch(() => {});
    await p.locator("#contrasena-error").waitFor({ timeout: 10000 }).catch(() => {});
    const error = (await p.locator("#contrasena-error").innerText().catch(() => "")).trim();
    ok(/tiene que ser distinta de la anterior/.test(error) && !/different/i.test(error), `CO: los errores de Supabase salen en español (${error})`);
    await esperar(p, () => evento(estado, "contrasena_enlace_abierto").length > 0);
    ok(evento(estado, "contrasena_enlace_abierto")[0]?.metadata?.via === "token", "CO: la analítica cuenta el enlace de la plantilla");
    ok(p.errores.length === 0, `CO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // CO4) Enlaces que no sirven: caducado (token_hash viejo), con el error de Supabase en la dirección y sin enlace.
  {
    const estado = { filas: [], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    const casos = [
      ["/reset-password?token_hash=hash-viejo&type=recovery", /ha caducado o ya se ha usado/],
      ["/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", /ha caducado o ya se ha usado/],
      ["/reset-password", /hace falta el enlace que te enviamos por correo/],
    ];
    const vistos = [];
    for (const [ruta, esperado] of casos) {
      const p = await pagina(ctx, ruta);
      await p.locator("#contrasena-enlace-no-sirve").waitFor({ timeout: 15000 }).catch(() => {});
      const t = await texto(p);
      vistos.push(esperado.test(t) && !/invalid|expired/i.test(t.replace(/Nueva contraseña/, "")) ? "ok" : t.slice(0, 80));
      await p.close();
    }
    ok(vistos.every((v) => v === "ok"), `CO: caducado, con el error de Supabase o sin enlace, lo explica en español y deja pedir otro (${vistos.join(" | ")})`);
    await ctx.close();
  }

  // CO5) Si Supabase no deja enviar el correo, el cliente lo lee en español (y se cuenta el motivo).
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true, productosVacios: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    const p = await pagina(ctx, "/perfil?acceso=entrar");
    await correoPerfil(p).waitFor({ timeout: 30000 }).catch(() => {});
    await correoPerfil(p).fill("cliente@example.com");
    const casos = [
      [{ status: 429, cuerpo: { code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" } }, /no podemos enviar más correos/],
      [{ status: 429, cuerpo: { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 37 seconds." } }, /espera 37 segundos/],
      [{ status: 400, cuerpo: { code: 400, error_code: "email_address_not_authorized", msg: 'Email address "cliente@example.com" cannot be used as it is not authorized' } }, /No hemos podido enviar el correo a esa dirección/],
    ];
    const vistos = [];
    for (const [error, esperado] of casos) {
      estado.recoverError = error;
      const antes = (estado.recover ?? []).length;
      await olvido(p).click();
      await esperar(p, () => (estado.recover ?? []).length > antes);
      await p.waitForTimeout(500);
      const t = await texto(p);
      vistos.push(esperado.test(t) && !/rate limit|security purposes|not authorized/i.test(t) ? "ok" : t.slice(0, 100));
    }
    ok(vistos.every((v) => v === "ok"), `CO: los errores al pedir el enlace salen en español (${vistos.join(" | ")})`);
    await esperar(p, () => evento(estado, "contrasena_enlace_error").length >= 3);
    const motivos = evento(estado, "contrasena_enlace_error").map((e) => e.metadata?.motivo);
    ok(motivos[0] === "limite" && motivos[2] === "correo", `CO: y la analítica cuenta por qué (${motivos.join(", ")})`);
    await capturar(p, "CO5-errores-en-espanol");
    await ctx.close();
  }

  // CO6) Administración → Usuarios: cuántos enlaces se piden, se abren, no sirven y terminan en contraseña nueva; y el aviso
  // si Supabase frena los correos.
  {
    const ev = (event_name, metadata = {}) => ({ event_name, user_id: null, session_id: `s${Math.random()}`, metadata });
    const estado = {
      guardados: [],
      filas: [],
      usuarios: [],
      eventos: [
        ev("contrasena_enlace_pedido", { desde: "perfil" }),
        ev("contrasena_enlace_pedido", { desde: "perfil" }),
        ev("contrasena_enlace_pedido", { desde: "enlace" }),
        ev("contrasena_enlace_abierto", { via: "token" }),
        ev("contrasena_enlace_abierto", { via: "codigo" }),
        ev("contrasena_enlace_invalido", { motivo: "otro_navegador" }),
        ev("contrasena_enlace_invalido", { motivo: "caducado" }),
        ev("contrasena_enlace_error", { desde: "perfil", motivo: "limite" }),
        ev("contrasena_cambiada"),
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-contrasenas").waitFor({ timeout: 30000 }).catch(() => {});
    const t = (await p.locator("#admin-contrasenas").innerText().catch(() => "")).replace(/\n+/g, " ");
    ok(
      /enlaces pedidos 3 · abiertos 2 · contraseñas cambiadas 1/.test(t) && /no sirvieron 2 \(en otro navegador 1, caducados o ya usados 1\)/.test(t) && /no se pudieron pedir 1/.test(t),
      `CO: Usuarios cuenta los enlaces pedidos, abiertos, los que no sirvieron y las contraseñas cambiadas (${t.slice(0, 200)})`
    );
    ok(/Supabase ha frenado 1 correo/.test(t) && /SMTP/.test(t), "CO: y avisa si Supabase frena correos por su límite (hace falta el correo propio)");
    ok(p.errores.length === 0, `CO: Usuarios sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== DI) Dirección de envío en «Mi perfil» (como en Amazon), el pago relleno solo y su parte en Administración =====
async function seccionDI() {
  const base = { user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02", foto_url: null };
  const sinDir = { codigo_postal: null, localidad: null, direccion: null, piso: null };
  const conDir = { codigo_postal: "50410", localidad: "Cuarte de Huerva", direccion: "Calle Mayor 5", piso: "3º B" };
  const abrirPerfil = async (p) => {
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 }).catch(() => {});
    if ((await p.locator("#perfil-cabecera").getAttribute("aria-expanded").catch(() => "true")) !== "true") await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(400);
  };
  const texto = (p) => p.evaluate(() => (document.getElementById("perfil-datos")?.innerText ?? "").replace(/\n+/g, " | "));
  const guardar = (p) => p.getByRole("button", { name: "Guardar perfil" });
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);

  // DI1) Con la migración: el apartado, sus comprobaciones, la provincia por el código postal y guardar.
  {
    const estado = { filas: [{ ...base, ...sinDir }], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await abrirPerfil(p);
    await p.locator("#perfil-direccion-envio").waitFor({ timeout: 15000 }).catch(() => {});
    const medidas = await p.evaluate(() =>
      ["codigoPostal", "localidad", "direccion", "piso"].map((c) => {
        const caja = document.getElementById(`perfil-${c}`)?.parentElement?.parentElement?.getBoundingClientRect();
        return caja ? Math.round(caja.height) : 0;
      })
    );
    const t0 = await texto(p);
    ok(/Dirección de envío/.test(t0) && /Opcional/.test(t0) && medidas.every((h) => h >= 44), `DI: «Mi perfil» tiene «Dirección de envío» (opcional) con 4 campos de 44 px o más (${medidas.join(", ")})`);
    const placeholders = await p.evaluate(() => ["codigoPostal", "localidad", "direccion", "piso"].map((c) => document.getElementById(`perfil-${c}`)?.getAttribute("placeholder")));
    ok(
      placeholders.join("|") === "Código postal|Localidad|Calle o avenida y número|Piso, puerta y letra (opcional)",
      `DI: código postal, localidad, «calle o avenida y número» y «piso, puerta y letra» (${placeholders.join(" · ")})`
    );
    const autocompletar = await p.evaluate(() => ["codigoPostal", "direccion", "piso"].map((c) => document.getElementById(`perfil-${c}`)?.getAttribute("autocomplete")));
    ok(autocompletar.join("|") === "postal-code|address-line1|address-line2", `DI: el navegador puede rellenarlos solo (autocomplete: ${autocompletar.join(", ")})`);

    await p.locator("#perfil-codigoPostal").fill("50a41");
    ok((await p.locator("#perfil-codigoPostal").inputValue()) === "5041", "DI: en el código postal solo entran cifras");
    ok(/tiene 5 cifras/.test(await texto(p)) && (await guardar(p).getAttribute("aria-disabled")) === "true", "DI: con 4 cifras avisa de que tiene 5 y no deja guardar");
    await p.locator("#perfil-codigoPostal").fill("22001");
    ok(/Ese código postal es de Huesca y tu provincia es Zaragoza/.test(await texto(p)), "DI: si el código postal es de otra provincia, avisa");
    await p.locator("#perfil-codigoPostal").fill("50410");
    const t1 = await texto(p);
    ok(/Código postal de Zaragoza/.test(t1) && /Falta la localidad/.test(t1), `DI: reconoce la provincia por el código postal y pide la dirección entera (${(t1.match(/Falta[^|]*/) ?? [""])[0]})`);
    await p.locator("#perfil-localidad").fill("Cuarte de Huerva");
    const entera = await p.evaluate(() => {
      const e = document.getElementById("perfil-localidad");
      return e ? { cabe: e.scrollWidth <= e.clientWidth + 1, ancho: e.clientWidth, texto: e.scrollWidth } : null;
    });
    ok(!!entera?.cabe, `DI: una localidad larga se lee entera («Cuarte de Huerva»: ${entera?.texto}/${entera?.ancho} px)`);
    await p.locator("#perfil-direccion").fill("Calle Mayor");
    ok(/Añade el número del portal/.test(await texto(p)), "DI: sin número de portal lo pide (o «s/n»)");
    await p.locator("#perfil-direccion").fill("Calle Mayor 5");
    await p.locator("#perfil-piso").fill("3º B");
    await capturar(p, "DI1-perfil-direccion");
    await guardar(p).click();
    for (let i = 0; i < 30 && !estado.guardados.length; i++) await p.waitForTimeout(200);
    const cuerpo = estado.guardados[0]?.cuerpo ?? {};
    ok(
      cuerpo.codigo_postal === "50410" && cuerpo.localidad === "Cuarte de Huerva" && cuerpo.direccion === "Calle Mayor 5" && cuerpo.piso === "3º B",
      `DI: al guardar se mandan el código postal, la localidad, la dirección y el piso (${JSON.stringify({ cp: cuerpo.codigo_postal, l: cuerpo.localidad, d: cuerpo.direccion, p: cuerpo.piso })})`
    );
    await p.getByText("Perfil guardado.").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok((await p.getByText("Perfil guardado.").count()) >= 1, "DI: y dice «Perfil guardado.»");
    for (let i = 0; i < 20 && !evento(estado, "perfil_direccion_guardada").length; i++) await p.waitForTimeout(250);
    const ev = evento(estado, "perfil_direccion_guardada")[0];
    ok(ev?.metadata?.nueva === true && !JSON.stringify(estado.eventosEnviados ?? []).includes("Calle Mayor"), `DI: la analítica propia cuenta que la guardó (sin la dirección) (${JSON.stringify(ev?.metadata ?? null)})`);
    ok(p.errores.length === 0, `DI: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `DI: Mi cuenta no se ensancha (${ancho.a}/${ancho.p})`);
    await ctx.close();
  }

  // DI2) «Completa tu perfil» no pide ni enseña la dirección (es opcional) y no la manda.
  {
    const estado = { filas: [{ ...base, provincia: null, ...sinDir }], guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#perfil-obligatorio").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.locator("#perfil-obligatorio").count()) === 1 && (await p.locator("#perfil-direccion-envio").count()) === 0, "DI: «Completa tu perfil» no enseña la dirección (es opcional)");
    await ctx.close();
  }

  // DI3) Sin la migración: con fila (sin esas columnas) no se ofrece; sin fila, si se escribe, se guarda lo demás.
  {
    const estado = { filas: [{ ...base }], guardados: [], sinColumnasDireccion: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await abrirPerfil(p);
    await p.waitForTimeout(600);
    ok((await p.locator("#perfil-direccion-envio").count()) === 0, "DI: sin la migración no se ofrece la dirección");
    await p.locator('#perfil-datos [aria-label="Nombre"]').first().fill("Ana María");
    await guardar(p).click();
    for (let i = 0; i < 30 && !estado.guardados.length; i++) await p.waitForTimeout(200);
    ok(estado.guardados.length === 1 && !("codigo_postal" in (estado.guardados[0]?.cuerpo ?? {})) && !estado.direccion400, "DI: y se guarda sin pedir columnas que no existen (0 peticiones fallidas)");
    await ctx.close();

    const estado2 = { filas: [], guardados: [], sinColumnasDireccion: true };
    const ctx2 = await contexto(navegador, CLIENTE, "user", estado2);
    const p2 = await pagina(ctx2, "/perfil");
    await abrirPerfil(p2);
    await p2.locator("#perfil-direccion-envio").waitFor({ timeout: 15000 }).catch(() => {});
    await p2.locator("#perfil-codigoPostal").fill("50410");
    await p2.locator("#perfil-localidad").fill("Cuarte de Huerva");
    await p2.locator("#perfil-direccion").fill("Calle Mayor 5");
    await guardar(p2).click();
    for (let i = 0; i < 30 && !estado2.guardados.length; i++) await p2.waitForTimeout(200);
    await p2.waitForTimeout(500);
    const t = await texto(p2);
    ok(
      estado2.direccion400 === 1 && estado2.guardados.length === 1 && !("codigo_postal" in (estado2.guardados[0]?.cuerpo ?? {})) && /la dirección todavía no se puede guardar/.test(t),
      `DI: sin fila y sin la migración, guarda lo demás y lo dice (${estado2.direccion400 ?? 0} intento fallido, ${estado2.guardados.length} guardado)`
    );
    ok((await p2.locator("#perfil-direccion-envio").count()) === 0 && p2.errores.length === 0, "DI: y deja de ofrecer la dirección, sin errores de JavaScript");
    await ctx2.close();
  }

  // DI4) El pago se rellena solo con los datos de la cuenta y la dirección del perfil.
  {
    const estado = { filas: [{ ...base, ...conDir }], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await ctx.addInitScript(() => {
      try {
        if (!localStorage.getItem("videojuegoos_cart_v1")) {
          localStorage.setItem(
            "videojuegoos_cart_v1",
            JSON.stringify([{ id: "00000000-0000-4000-8000-0000000000a1", title: "Producto de prueba", priceEUR: 100, qty: 1, imageUrl: null, reservedUntil: Date.now() + 20 * 60000 }])
          );
        }
      } catch {
        // sin almacenamiento
      }
    });
    const p = await pagina(ctx, "/checkout");
    await p.getByRole("radio", { name: /Envío a domicilio/ }).click({ timeout: 30000 }).catch(() => {});
    await p.locator("#pago-direccion-perfil").waitFor({ timeout: 15000 }).catch(() => {});
    const valor = (ph) => p.locator(`input[placeholder="${ph}"], textarea[placeholder="${ph}"]`).first().inputValue().catch(() => "");
    const v = { nombre: await valor("Nombre completo"), correo: await valor("tu@email.com"), dir: await valor("Calle, número, piso..."), cp: await valor("50001"), ciudad: await valor("Zaragoza") };
    ok(v.nombre === "Ana" && v.correo === CLIENTE.email, `DI: el pago trae el nombre del perfil y el correo de la cuenta (${v.nombre}, ${v.correo})`);
    ok(v.dir === "Calle Mayor 5, 3º B" && v.cp === "50410" && v.ciudad === "Cuarte de Huerva", `DI: y la dirección del perfil (${v.dir} · ${v.cp} · ${v.ciudad})`);
    ok(/Con la dirección de tu perfil/.test(await p.locator("#pago-direccion-perfil").innerText().catch(() => "")), "DI: y avisa de que viene del perfil (se puede cambiar ahí mismo)");
    await capturar(p, "DI4-pago-relleno");
    for (let i = 0; i < 20 && !evento(estado, "pago_direccion_perfil").length; i++) await p.waitForTimeout(250);
    ok(evento(estado, "pago_direccion_perfil").length === 1, "DI: la analítica propia cuenta el pago con la dirección del perfil");
    ok(p.errores.length === 0, `DI: el pago sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // DI5) Administración → Usuarios y la ficha del cliente.
  {
    const OTRO = { ...CLIENTE, id: "33333333-3333-4333-8333-333333333333", email: "otro@example.com" };
    const ev = (event_name, user_id) => ({ event_name, user_id, session_id: `s-${user_id}`, metadata: {} });
    const estado = {
      guardados: [],
      filas: [
        { ...base, ...conDir, updated_at: "2026-11-02T10:00:00Z" },
        { ...base, user_id: OTRO.id, usuario: "otro", nombre: "Otro", ...sinDir, updated_at: "2026-11-02T10:00:00Z" },
      ],
      usuarios: [
        { user_id: CLIENTE.id, email: CLIENTE.email, role: "user", created_at: "2026-10-01T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 },
        { user_id: OTRO.id, email: OTRO.email, role: "user", created_at: "2026-10-02T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 },
      ],
      eventos: [ev("perfil_direccion_guardada", CLIENTE.id), ev("perfil_direccion_guardada", OTRO.id), ev("pago_direccion_perfil", CLIENTE.id)],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-perfiles").waitFor({ timeout: 30000 }).catch(() => {});
    const t = (await p.locator("#admin-perfiles").innerText().catch(() => "")).replace(/\n+/g, " | ");
    ok(/Con dirección \| 1/.test(t), `DI: Usuarios cuenta quién tiene dirección de envío (${(t.match(/Con dirección[^|]*\|[^|]*/) ?? [""])[0]})`);
    ok(/la guardaron 2 · pagaron con ella ya rellenada 1/.test((await p.locator("#admin-perfiles-direccion").innerText().catch(() => "")).replace(/\n/g, " ")), "DI: y cuántos la guardan y pagan con ella ya rellenada (30 días)");
    const todo = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " ");
    ok(/CP 50410 Cuarte de Huerva/.test(todo), "DI: cada fila enseña su código postal y localidad (zona de reparto)");
    await p.getByText("Con dirección (1)", { exact: true }).click();
    await p.waitForTimeout(400);
    const filtrado = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " ");
    ok(filtrado.includes(CLIENTE.email) && !filtrado.includes(OTRO.email), "DI: el chip «Con dirección» filtra la lista");
    ok(p.errores.length === 0, `DI: Usuarios sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    const f = await pagina(ctx, `/admin/cliente/${CLIENTE.id}?email=${encodeURIComponent(CLIENTE.email)}`);
    await f.getByText("Dirección de envío", { exact: true }).waitFor({ timeout: 30000 }).catch(() => {});
    const tf = (await f.evaluate(() => document.body.innerText)).replace(/\n+/g, " ");
    ok(/Dirección de envío Calle Mayor 5, 3º B · 50410 Cuarte de Huerva/.test(tf), "DI: la ficha del cliente enseña su dirección de envío entera");
    ok(f.errores.length === 0, `DI: la ficha sin errores de JavaScript (${f.errores.length}${f.errores[0] ? ": " + f.errores[0] : ""})`);
    await ctx.close();
  }

  // DI6) Administración sin la migración: nada de la dirección y sin errores.
  {
    const estado = {
      guardados: [],
      filas: [{ ...base, updated_at: "2026-11-02T10:00:00Z" }],
      usuarios: [{ user_id: CLIENTE.id, email: CLIENTE.email, role: "user", created_at: "2026-10-01T10:00:00Z", chat_messages_count: 0, product_chats_count: 0, store_reviews_count: 0 }],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-perfiles").waitFor({ timeout: 30000 }).catch(() => {});
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " ");
    ok(!/Con dirección/.test(t) && p.errores.length === 0, "DI: sin la migración, Usuarios no enseña nada de la dirección y sin errores");
    await ctx.close();
  }
}

// ===== SE) Mi perfil → «Inicio de sesión y seguridad»: cambiar el correo y la contraseña; Blue no aparece con «Mi
// perfil» desplegado; su parte en Administración → Usuarios =======================================================
async function seccionSE() {
  const perfilCompleto = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-05-02", foto_url: null }];
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const aviso = (p) => p.evaluate(() => (document.getElementById("perfil-seguridad-aviso")?.innerText ?? "").trim());
  const abrirPerfil = async (p) => {
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 }).catch(() => {});
    if ((await p.locator("#perfil-cabecera").getAttribute("aria-expanded").catch(() => "true")) !== "true") await p.locator("#perfil-cabecera").click();
    await p.locator("#perfil-seguridad").waitFor({ timeout: 15000 }).catch(() => {});
  };
  const esperar = async (p, cond, veces = 30) => {
    for (let i = 0; i < veces && !cond(); i++) await p.waitForTimeout(250);
  };

  // SE1) Blue no aparece en Mi cuenta (desde 2026-11-04 solo sale en Inicio y en las fichas), ni con «Mi perfil»
  // desplegado ni al plegarlo.
  {
    const estado = { filas: perfilCompleto, guardados: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await abrirPerfil(p);
    await p.waitForTimeout(12500); // Blue aparece a los 10 s de entrar
    ok((await p.locator("#blue-flotante").count()) === 0, "SE: con «Mi perfil» desplegado, Blue no aparece");
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(3000);
    ok((await p.locator("#blue-flotante").count()) === 0, "SE: y al plegarlo tampoco (Blue ya no sale en Mi cuenta)");
    ok(p.errores.length === 0, `SE: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // SE1b) Como lo usa el dueño: Blue ya a la vista en Inicio (cliente y administrador) y entonces se entra por la pestaña
  // Perfil: Blue se va, no vuelve ni con «Mi perfil» desplegado ni plegado, y sale otra vez al volver a Inicio.
  for (const [usuario, rol] of [
    [CLIENTE, "user"],
    [ADMIN, "admin"],
  ]) {
    const estado = { filas: [{ ...perfilCompleto[0], user_id: usuario.id }], guardados: [] };
    const ctx = await contexto(navegador, usuario, rol, estado);
    const p = await pagina(ctx, "/");
    await p.locator("#blue-flotante").waitFor({ timeout: 20000 }).catch(() => {});
    const antes = await p.locator("#blue-flotante").count();
    await p.locator('[data-testid="pestana-perfil"]').first().click({ timeout: 30000 });
    await p.locator("#perfil-cabecera").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    const enPerfil = await p.locator("#blue-flotante").count();
    const plegado = (await p.locator("#perfil-cabecera").getAttribute("aria-expanded").catch(() => "")) !== "true";
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(800);
    const abierto = await p.locator("#blue-flotante").count();
    await p.locator("#perfil-cabecera").click();
    await p.waitForTimeout(3000);
    const plegadoOtraVez = await p.locator("#blue-flotante").count();
    ok(antes === 1 && enPerfil === 0 && plegado && abierto === 0 && plegadoOtraVez === 0, `SE: ${rol === "admin" ? "administrador" : "cliente"}: Blue, a la vista en Inicio, se va al entrar en Mi cuenta y no vuelve ni con «Mi perfil» desplegado ni plegado (${JSON.stringify({ antes, enPerfil, plegado, abierto, plegadoOtraVez })})`);
    await p.locator('[data-testid="pestana-index"]').first().click({ timeout: 15000 }).catch(() => {});
    await p.locator("#blue-flotante").waitFor({ timeout: 8000 }).catch(() => {});
    ok((await p.locator("#blue-flotante").count()) === 1, `SE: ${rol === "admin" ? "administrador" : "cliente"}: al volver a Inicio, Blue vuelve`);
    ok(p.errores.length === 0, `SE: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // SE2) Cambiar el correo: comprobaciones, enlaces a los dos correos y «cambio pendiente».
  {
    const estado = { filas: perfilCompleto, guardados: [], aceptaAnalitica: true, seguridad: true, claveActual: "vieja123" };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await abrirPerfil(p);
    const t0 = (await p.locator("#perfil-seguridad").innerText().catch(() => "")).replace(/\n+/g, " | ");
    ok(/Inicio de sesión y seguridad/.test(t0) && /Correo electrónico/.test(t0) && /Contraseña/.test(t0) && t0.includes(CLIENTE.email), `SE: «Mi perfil» tiene «Inicio de sesión y seguridad» con el correo y la contraseña (${t0.slice(0, 120)})`);
    const altos = await p.evaluate(() => ["perfil-seguridad-correo", "perfil-seguridad-contrasena"].map((id) => Math.round(document.getElementById(id)?.getBoundingClientRect().height ?? 0)));
    ok(altos.every((h) => h >= 44), `SE: las dos filas se tocan bien (${altos.join(", ")} px)`);
    await p.locator("#perfil-seguridad-correo").click();
    await p.locator("#perfil-correo-nuevo").waitFor({ timeout: 8000 }).catch(() => {});
    await p.locator("#perfil-correo-nuevo").fill("abc");
    await p.locator("#perfil-correo-enviar").click();
    await p.waitForTimeout(300);
    ok(/Escribe un correo válido/.test(await aviso(p)) && !(estado.cambiosCorreo ?? []).length, "SE: un correo mal escrito no se manda");
    await p.locator("#perfil-correo-nuevo").fill(CLIENTE.email.toUpperCase());
    await p.locator("#perfil-correo-enviar").click();
    await p.waitForTimeout(300);
    ok(/Ese ya es tu correo/.test(await aviso(p)) && !(estado.cambiosCorreo ?? []).length, "SE: el mismo correo tampoco");
    await p.locator("#perfil-correo-nuevo").fill("Nuevo@Example.com");
    await p.locator("#perfil-correo-enviar").click();
    await esperar(p, () => (estado.cambiosCorreo ?? []).length > 0);
    await p.waitForTimeout(500);
    const cambio = (estado.cambiosCorreo ?? [])[0];
    ok(cambio?.email === "nuevo@example.com" && cambio?.redirect_to === `${BASE}/perfil?cuenta=correo`, `SE: pide el cambio al correo nuevo y los enlaces vuelven a Mi perfil (${cambio?.email}, ${cambio?.redirect_to})`);
    ok(/Te hemos enviado un enlace a cliente@example\.com y otro a nuevo@example\.com/.test(await aviso(p)), "SE: explica que hay que confirmar en los dos correos");
    ok(/Cambio pendiente a nuevo@example\.com/.test(await p.locator("#perfil-seguridad-correo").innerText()), "SE: y la fila dice «Cambio pendiente»");
    await esperar(p, () => evento(estado, "perfil_correo_cambio_pedido").length > 0);
    ok(evento(estado, "perfil_correo_cambio_pedido").length === 1 && !JSON.stringify(estado.eventosEnviados ?? []).includes("nuevo@example.com"), "SE: la analítica lo cuenta, sin el correo");
    await capturar(p, "SE2-cambiar-correo");

    // Correo de otra cuenta: en español.
    estado.correoOcupado = true;
    await p.locator("#perfil-seguridad-correo").click();
    await p.locator("#perfil-correo-nuevo").fill("otra@example.com");
    await p.locator("#perfil-correo-enviar").click();
    await esperar(p, () => (estado.cambiosCorreo ?? []).length > 1);
    await p.waitForTimeout(400);
    ok(/Ya hay otra cuenta con ese correo/.test(await aviso(p)), `SE: si el correo ya es de otra cuenta, lo dice en español (${await aviso(p)})`);
    ok(p.errores.length === 0, `SE: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // SE3) Cambiar la contraseña: la actual se comprueba, la nueva dos veces, errores en español y «¿No recuerdas la actual?».
  {
    const estado = { filas: perfilCompleto, guardados: [], aceptaAnalitica: true, seguridad: true, claveActual: "vieja123" };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil");
    await abrirPerfil(p);
    await p.locator("#perfil-seguridad-contrasena").click();
    await p.locator("#perfil-clave-actual").waitFor({ timeout: 8000 }).catch(() => {});
    ok((await p.locator("#perfil-clave-actual").getAttribute("type")) === "password", "SE: las contraseñas salen ocultas");
    await p.locator("#perfil-clave-actual").fill("mala123");
    await p.locator("#perfil-clave-nueva").fill("nueva123");
    await p.locator("#perfil-clave-repite").fill("nueva124");
    await p.locator("#perfil-clave-guardar").click();
    await p.waitForTimeout(400);
    ok(/no coinciden/.test(await aviso(p)) && !(estado.entradas ?? []).length, "SE: si las nuevas no coinciden, no se manda nada");
    await p.locator("#perfil-clave-repite").fill("nueva123");
    await p.locator("#perfil-clave-guardar").click();
    await esperar(p, () => (estado.entradas ?? []).length > 0);
    await p.waitForTimeout(500);
    ok(/La contraseña actual no es correcta/.test(await aviso(p)) && !(estado.clavesNuevas ?? []).length, "SE: con la actual equivocada no se cambia y lo dice en español");
    await esperar(p, () => evento(estado, "perfil_contrasena_error").length > 0);
    ok(evento(estado, "perfil_contrasena_error")[0]?.metadata?.motivo === "actual", "SE: y se cuenta como «contraseña actual equivocada»");
    await p.getByRole("button", { name: "Mostrar las contraseñas" }).click();
    ok((await p.locator("#perfil-clave-actual").getAttribute("type")) !== "password", "SE: «Mostrar» deja ver lo escrito");
    await p.locator("#perfil-clave-actual").fill("vieja123");
    await p.locator("#perfil-clave-guardar").click();
    await esperar(p, () => (estado.clavesNuevas ?? []).length > 0);
    await p.waitForTimeout(500);
    ok((estado.entradas ?? []).some((e) => e.ok && e.email === CLIENTE.email) && (estado.clavesNuevas ?? [])[0] === "nueva123", "SE: comprueba la actual volviendo a entrar y guarda la nueva");
    ok(/Contraseña cambiada/.test(await aviso(p)) && (await p.locator("#perfil-clave-actual").count()) === 0, "SE: lo confirma y cierra el formulario");
    await esperar(p, () => evento(estado, "perfil_contrasena_cambiada").length > 0);
    ok(evento(estado, "perfil_contrasena_cambiada").length === 1, "SE: la analítica cuenta la contraseña cambiada");
    await p.locator("#perfil-seguridad-contrasena").click();
    await p.locator("#perfil-clave-olvidada").click();
    await esperar(p, () => (estado.recover ?? []).length > 0);
    await p.waitForTimeout(400);
    ok((estado.recover ?? [])[0]?.cuerpo?.email === CLIENTE.email && /Te hemos enviado un enlace/.test(await aviso(p)), "SE: «¿No recuerdas la actual?» manda el enlace de recuperar");
    await capturar(p, "SE3-cambiar-contrasena");
    ok(p.errores.length === 0, `SE: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // SE4) Al volver de los enlaces del correo: la tarjeta se abre y dice cómo va, en español; la dirección se limpia.
  {
    const casos = [
      ["/perfil?cuenta=correo&message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email", /Primer enlace confirmado/],
      ["/perfil?cuenta=correo#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", /ha caducado o ya se ha usado/],
      ["/perfil?cuenta=correo", /Tu correo ya está cambiado/],
    ];
    const vistos = [];
    for (const [ruta, esperado] of casos) {
      const estado = { filas: perfilCompleto, guardados: [], aceptaAnalitica: true, seguridad: true };
      const ctx = await contexto(navegador, CLIENTE, "user", estado);
      const p = await pagina(ctx, ruta);
      await p.locator("#perfil-seguridad-aviso").waitFor({ timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(800);
      const t = await aviso(p);
      await capturar(p, `SE4-vuelta-${vistos.length + 1}`);
      vistos.push({ ok: esperado.test(t) && !/invalid|expired|Confirmation/i.test(t), limpia: !/cuenta=correo/.test(p.url()), t: t.slice(0, 60), ev: evento(estado, "perfil_correo_cambiado").length });
      await ctx.close();
    }
    ok(vistos.every((v) => v.ok), `SE: al volver de los enlaces lo explica en español (${vistos.map((v) => v.t).join(" | ")})`);
    ok(vistos.every((v) => v.limpia), "SE: y quita el enlace de la dirección");
    ok(vistos[2].ev === 1 && vistos[0].ev === 0, "SE: la analítica cuenta el correo cambiado solo cuando termina");
  }

  // SE5) Administración → Usuarios: cuántos cambian el correo y la contraseña (30 días).
  {
    const ev = (event_name, metadata = {}) => ({ event_name, user_id: null, session_id: `s${Math.random()}`, metadata });
    const estado = {
      guardados: [],
      filas: [],
      usuarios: [],
      eventos: [
        ev("perfil_correo_cambio_pedido"),
        ev("perfil_correo_cambio_pedido"),
        ev("perfil_correo_cambiado"),
        ev("perfil_contrasena_cambiada"),
        ev("perfil_contrasena_error", { motivo: "actual" }),
        ev("perfil_contrasena_error", { motivo: "contrasena" }),
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/users");
    await p.locator("#admin-seguridad").waitFor({ timeout: 30000 }).catch(() => {});
    const t = (await p.locator("#admin-seguridad").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(
      /cambios de correo pedidos 2 · terminados 1/.test(t) && /contraseñas cambiadas desde Mi perfil 1/.test(t) && /intentos fallidos 2 \(contraseña actual equivocada 1\)/.test(t),
      `SE: Usuarios cuenta los cambios de correo y de contraseña (${t})`
    );
    ok(p.errores.length === 0, `SE: Usuarios sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== BI) Blue IA con una conversación ya empezada: el saludo no se vuelve a escribir y sale «Nueva conversación»
// (dueño, 2026-11-03); su parte en Administración → Analítica ======================================================
async function seccionBI() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const texto = async (p) => (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
  const cursores = (p) => p.evaluate(() => window.__cursores ?? 0);
  // Cuenta las veces que se ve el cursor «▍» del saludo escribiéndose (desde que carga la página).
  const vigilarCursor = (ctx) =>
    ctx.addInitScript(() => {
      window.__cursores = 0;
      const mirar = () => {
        if ((document.body?.textContent ?? "").includes("▍")) window.__cursores++;
      };
      const empezar = () => new MutationObserver(mirar).observe(document.body, { childList: true, subtree: true, characterData: true });
      if (document.body) empezar();
      else document.addEventListener("DOMContentLoaded", empezar);
    });
  const conv = { id: "c0000000-0000-4000-8000-0000000000b1", titulo: "¿Tenéis PS5?", contexto: null, updated_at: "2026-11-02T10:00:00Z" };
  const mensajes = [
    { id: "d0000000-0000-4000-8000-000000000001", conversacion_id: conv.id, rol: "user", texto: "¿Tenéis PS5?" },
    { id: "d0000000-0000-4000-8000-000000000002", conversacion_id: conv.id, rol: "assistant", texto: "Sí, tenemos varias PS5 revisadas." },
  ];

  // BI1–BI3) Con sesión y una conversación guardada (que tarda en llegar).
  {
    const estado = {
      filas: perfil,
      guardados: [],
      aceptaAnalitica: true,
      blueHistorial: { conversaciones: [conv], mensajes, retraso: 2500 },
      blueIa: () => "Claro: enviamos a toda España en 1-2 días.",
    };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await vigilarCursor(ctx);
    const p = await pagina(ctx, "/blue-ia");
    await p.waitForTimeout(900);
    const cargando = await p.evaluate(() => ({ rueda: !!document.getElementById("blue-ia-cargando"), sugerencias: /Quiero vender/.test(document.body.innerText) }));
    ok(cargando.rueda && !cargando.sugerencias, `BI: mientras mira si hay una conversación guardada, espera sin saludar ni sugerir (${JSON.stringify(cargando)})`);
    await p.getByText("Sí, tenemos varias PS5 revisadas.").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const t = await texto(p);
    ok(/¿Tenéis PS5\?/.test(t) && /Sí, tenemos varias PS5 revisadas/.test(t), "BI: al entrar se abre la última conversación");
    ok((await cursores(p)) === 0, `BI: con una conversación ya empezada, el saludo no se vuelve a escribir (${await cursores(p)} veces se vio el cursor)`);
    ok((t.match(/Hola, soy Blue IA/g) ?? []).length === 1 && !/Quiero vender/.test(t), "BI: el saludo sale una vez, quieto y entero, y sin sugerencias");
    const m = await p.evaluate(() => {
      const caja = (sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
      };
      return { nueva: caja("#blue-ia-nueva"), equipo: caja('[aria-label="Hablar con el equipo"]'), campo: caja('textarea[placeholder="Pregúntale a Blue IA…"]'), ancho: window.innerWidth };
    });
    const dentro = (c) => !!c && c.x >= 0 && c.x + c.w <= m.ancho && c.h >= 44;
    ok(dentro(m.nueva) && dentro(m.equipo) && !!m.campo && m.nueva.y < m.campo.y, `BI: «Nueva conversación» sale junto a «Hablar con el equipo», encima del recuadro, y se toca bien (${JSON.stringify(m)})`);
    for (let i = 0; i < 20 && !evento(estado, "blue_ia_conversacion_retomada").length; i++) await p.waitForTimeout(250);
    ok(evento(estado, "blue_ia_conversacion_retomada").length === 1, "BI: la analítica propia cuenta la conversación retomada");
    await capturar(p, "BI1-conversacion-retomada");

    // BI2) «Nueva conversación»: pantalla limpia, sugerencias y saludo nuevo (escribiéndose).
    const antes = await cursores(p);
    await p.locator("#blue-ia-nueva").click();
    await p.waitForTimeout(3000);
    const t2 = await texto(p);
    // («¿Tenéis PS5?» también es una sugerencia: se mira la respuesta guardada.)
    ok(!/Sí, tenemos varias PS5 revisadas/.test(t2) && /Quiero vender/.test(t2), "BI: «Nueva conversación» deja la pantalla como recién abierta, con las sugerencias");
    ok((await cursores(p)) > antes, "BI: y Blue IA saluda de nuevo");
    ok((await p.locator("#blue-ia-nueva").count()) === 0, "BI: sin conversación, el botón no sale");
    for (let i = 0; i < 20 && !evento(estado, "blue_ia_conversacion_nueva").length; i++) await p.waitForTimeout(250);
    ok(evento(estado, "blue_ia_conversacion_nueva")[0]?.metadata?.desde === "boton", `BI: la analítica propia cuenta la nueva y desde dónde (${JSON.stringify(evento(estado, "blue_ia_conversacion_nueva")[0]?.metadata ?? null)})`);
    await capturar(p, "BI2-nueva-conversacion");

    // BI3) Se pregunta en la nueva; al cambiar de pestaña y volver, la conversación sigue y el saludo no se reescribe.
    await p.getByPlaceholder("Pregúntale a Blue IA…").fill("¿Hacéis envíos?");
    await p.getByRole("button", { name: "Enviar la pregunta" }).click();
    await p.getByText("Claro: enviamos a toda España en 1-2 días.").waitFor({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    const guardadas = (estado.blueHistorial.guardado ?? []).filter((g) => g.tabla === "conversaciones");
    ok(guardadas.length === 1 && /Hacéis envíos/.test(guardadas[0].cuerpo?.titulo ?? ""), "BI: la nueva se guarda aparte (la anterior sigue en el Historial)");
    const antes3 = await cursores(p);
    await p.locator('[data-testid="pestana-cesta"]').first().click({ timeout: 30000 });
    await p.waitForTimeout(1000);
    await p.locator('[data-testid="pestana-blue-ia"]').first().click({ timeout: 30000 });
    await p.waitForTimeout(2500);
    const t3 = await texto(p);
    ok((await cursores(p)) === antes3 && /¿Hacéis envíos\?/.test(t3) && (await p.locator("#blue-ia-nueva").count()) === 1, "BI: al cambiar de pestaña y volver, la conversación sigue y el saludo no se reescribe");
    ok(p.errores.length === 0, `BI: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // BI4) Sin sesión: no hay nada guardado que esperar; saluda escribiendo y «Nueva conversación» sale al preguntar.
  {
    const estado = { filas: [], guardados: [], blueIa: () => "Claro, dime qué buscas." };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await ctx.addInitScript(() => {
      try {
        localStorage.removeItem("videojuegoos.supabase.auth");
      } catch {
        // sin almacenamiento
      }
    });
    await vigilarCursor(ctx);
    const p = await pagina(ctx, "/blue-ia");
    await p.waitForTimeout(3000);
    ok((await cursores(p)) > 0 && (await p.locator("#blue-ia-nueva").count()) === 0 && /Quiero vender/.test(await texto(p)), "BI: sin sesión, Blue IA saluda escribiendo, con sugerencias y sin «Nueva conversación»");
    await p.getByPlaceholder("Pregúntale a Blue IA…").fill("Busco una Switch");
    await p.getByRole("button", { name: "Enviar la pregunta" }).click();
    await p.getByText("Claro, dime qué buscas.").waitFor({ timeout: 15000 }).catch(() => {});
    await p.locator("#blue-ia-nueva").click({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(800);
    ok(!/Busco una Switch/.test(await texto(p)), "BI: sin sesión, «Nueva conversación» también empieza de cero");
    ok(p.errores.length === 0, `BI: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // BI6) Red muy lenta (la conversación tarda 6 s): a los 4 s saluda igual y, cuando llega, se abre con el saludo quieto.
  {
    const estado = { filas: perfil, guardados: [], blueHistorial: { conversaciones: [conv], mensajes, retraso: 6000 } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/blue-ia");
    await p.waitForTimeout(5200);
    const antes = await p.evaluate(() => ({ rueda: !!document.getElementById("blue-ia-cargando"), sugerencias: /Quiero vender/.test(document.body.innerText) }));
    ok(!antes.rueda && antes.sugerencias, `BI: con la red muy lenta no se queda esperando: a los 4 s saluda igual (${JSON.stringify(antes)})`);
    await p.getByText("Sí, tenemos varias PS5 revisadas.").waitFor({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const t = await texto(p);
    ok(
      /Sí, tenemos varias PS5 revisadas/.test(t) && !t.includes("▍") && (t.match(/Hola, soy Blue IA/g) ?? []).length === 1 && (await p.locator("#blue-ia-nueva").count()) === 1,
      "BI: y cuando llega la conversación, se abre con el saludo quieto y «Nueva conversación»"
    );
    ok(p.errores.length === 0, `BI: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // BI5) Administración → Analítica: cuántas sesiones siguen su conversación y cuántas empiezan una nueva.
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Blue IA: conversación retomada", sessions: 4 },
        { step_label: "Blue IA: nueva conversación", sessions: 2 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-blue-conversaciones").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-blue-conversaciones").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/siguen su última conversación: 4 sesiones · empiezan una nueva: 2/.test(t), `BI: Administración → Analítica lo cuenta (${t})`);
    ok(p.errores.length === 0, `BI: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== QS) «Quiénes somos» para Google («Daniel Gutiérrez») y sus accesos desde Inicio y desde entrar/crear cuenta
// (dueño, 2026-11-03); su parte en Administración → Analítica ======================================================
async function seccionQS() {
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02", foto_url: null }];
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const esperar = async (p, cond, veces = 30) => {
    for (let i = 0; i < veces && !cond(); i++) await p.waitForTimeout(250);
  };
  const caja = (p, sel) =>
    p.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), ancho: window.innerWidth } : null;
    }, sel);
  const dentro = (c) => !!c && c.h >= 44 && c.x >= 0 && c.x + c.w <= c.ancho;

  // QS1) El HTML que recibe Google (antes de ejecutar nada) ya lleva la ficha de Daniel Gutiérrez como fundador.
  {
    const ctx = await contexto(navegador, CLIENTE, "user", { filas: perfil, guardados: [] });
    const p = await ctx.newPage();
    const html = await (await p.request.get(`${BASE}/quienes-somos`)).text();
    const json = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) ?? [])[1] ?? "{}";
    const grafo = JSON.parse(json)["@graph"] ?? [];
    const persona = grafo.find((n) => n["@type"] === "Person");
    const tienda = grafo.find((n) => n["@type"] === "OnlineStore");
    const pagina = grafo.find((n) => n["@type"] === "AboutPage");
    ok(
      persona?.name === "Daniel Gutiérrez" && persona?.alternateName === "Daniel Enrique Gutiérrez Mejía" && persona?.url === "https://videojuegoszaragoza.com/quienes-somos" && /Fundador/.test(persona?.jobTitle ?? ""),
      `QS: el HTML lleva la ficha de persona de Daniel Gutiérrez, fundador (${JSON.stringify(persona ?? null).slice(0, 160)})`
    );
    ok(!!persona && tienda?.founder?.["@id"] === persona["@id"] && pagina?.mainEntity?.["@id"] === persona["@id"] && pagina?.url === persona.url, "QS: la tienda la nombra fundador y «Quiénes somos» es su página");
    ok(!/"birthDate"|"address"|Miguel Servet/.test(json), "QS: sin fecha de nacimiento ni dirección en los datos para Google");
    ok(/fundada en 2022 por Daniel Gutiérrez/.test(html) && /Quiénes somos: Daniel Gutiérrez y el equipo/.test(html), "QS: el resumen sin JavaScript también lo dice y enlaza a la página");
    await ctx.close();
  }

  // QS2) Inicio: «Quiénes somos» con su nombre y el paso a la página; la página con título, descripción, dirección oficial
  // y su nombre como encabezado; la analítica cuenta de dónde llega.
  {
    const estado = { filas: perfil, guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/");
    await p.locator("#inicio-quienes-somos").waitFor({ timeout: 30000 }).catch(() => {});
    await p.locator("#inicio-quienes-somos").scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(600);
    const t = (await p.locator("#inicio-quienes-somos").innerText().catch(() => "")).replace(/\n+/g, " ");
    ok(/Quiénes somos/.test(t) && /Daniel Gutiérrez fundó Videojuegoszaragoza\.com en 2022/.test(t) && /Conoce nuestra historia/.test(t), `QS: Inicio tiene «Quiénes somos» con su nombre (${t.slice(0, 120)})`);
    const c = await caja(p, "#inicio-quienes-somos-enlace");
    ok(dentro(c), `QS: el enlace de Inicio se toca bien y no se sale (${JSON.stringify(c)})`);
    ok((await p.evaluate(() => document.querySelector('link[rel="canonical"]')?.getAttribute("href"))) === "https://videojuegoszaragoza.com/", "QS: Inicio tiene su dirección oficial");
    await capturar(p, "QS1-inicio");
    await p.locator("#inicio-quienes-somos-enlace").click();
    await p.waitForURL(/\/quienes-somos/, { timeout: 15000 }).catch(() => {});
    await p.locator("#quienes-somos-fundador").waitFor({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    const cabeza = await p.evaluate(() => ({
      titulo: document.title,
      descripcion: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      canonica: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
      encabezado: (() => {
        const e = document.getElementById("quienes-somos-fundador");
        return e ? `${e.tagName}|${e.getAttribute("role") ?? ""}|${e.getAttribute("aria-level") ?? ""}|${e.textContent}` : "";
      })(),
    }));
    ok(/^Daniel Gutiérrez, fundador · Quiénes somos \| /.test(cabeza.titulo) && /^Daniel Gutiérrez fundó Videojuegoszaragoza\.com en 2022/.test(cabeza.descripcion), `QS: título y descripción con su nombre (${cabeza.titulo} · ${cabeza.descripcion.slice(0, 50)})`);
    ok(cabeza.canonica === "https://videojuegoszaragoza.com/quienes-somos", `QS: dirección oficial de la página (${cabeza.canonica})`);
    ok(
      (cabeza.encabezado.startsWith("H3|") || /\|heading\|3\|/.test(cabeza.encabezado)) && cabeza.encabezado.endsWith("|Daniel Gutiérrez"),
      `QS: «Daniel Gutiérrez» es un encabezado de la página (${cabeza.encabezado})`
    );
    await esperar(p, () => evento(estado, "quienes_somos_visto").length > 0 && evento(estado, "quienes_somos_abierto").length > 0);
    ok(evento(estado, "quienes_somos_abierto")[0]?.metadata?.desde === "inicio" && evento(estado, "quienes_somos_abierto")[0]?.step_label === "Quiénes somos: desde Inicio", "QS: la analítica propia cuenta que llegó desde Inicio");
    ok(evento(estado, "quienes_somos_visto").length === 1, "QS: y la visita a la página");
    await capturar(p, "QS2-quienes-somos");
    ok(p.errores.length === 0, `QS: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // QS3) Entrar / crear cuenta (sin sesión): el acceso se ve con los formularios cerrados y con «Crear cuenta» abierto.
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await ctx.addInitScript(() => {
      try {
        localStorage.removeItem("videojuegoos.supabase.auth");
      } catch {
        // sin almacenamiento
      }
    });
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-acceso").waitFor({ timeout: 30000 }).catch(() => {});
    await p.locator("#perfil-quienes-somos").waitFor({ timeout: 10000 }).catch(() => {});
    const t = (await p.locator("#perfil-quienes-somos").innerText().catch(() => "")).replace(/\n+/g, " ");
    const c1 = await caja(p, "#perfil-quienes-somos");
    ok(/Conoce a Daniel Gutiérrez y al equipo/.test(t) && dentro(c1), `QS: entrar/crear cuenta tiene el acceso a «Quiénes somos» y se toca bien (${t}; ${JSON.stringify(c1)})`);
    await p.locator("#perfil-acceso").getByText("Crear cuenta").click();
    await p.waitForTimeout(700);
    const c2 = await caja(p, "#perfil-quienes-somos");
    ok(dentro(c2), `QS: con «Crear cuenta» abierto sigue ahí (${JSON.stringify(c2)})`);
    await capturar(p, "QS3-crear-cuenta");
    await p.locator("#perfil-quienes-somos").click();
    await p.waitForURL(/\/quienes-somos/, { timeout: 15000 }).catch(() => {});
    await esperar(p, () => evento(estado, "quienes_somos_abierto").length > 0);
    const ev = evento(estado, "quienes_somos_abierto")[0];
    ok(/\/quienes-somos/.test(p.url()) && ev?.metadata?.desde === "acceso" && ev?.metadata?.modo === "signup", `QS: lleva a «Quiénes somos» y se cuenta desde el acceso (${JSON.stringify(ev?.metadata ?? null)})`);
    ok(p.errores.length === 0, `QS: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // QS4) Administración → Analítica: cuántas sesiones la ven y desde dónde llegan.
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Quiénes somos: vista", sessions: 7 },
        { step_label: "Quiénes somos: desde Inicio", sessions: 3 },
        { step_label: "Quiénes somos: desde el acceso", sessions: 2 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-quienes-somos").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-quienes-somos").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/la ven 7 sesiones · llegan desde Inicio: 3 · desde entrar o crear cuenta: 2/.test(t), `QS: Administración → Analítica lo cuenta (${t})`);
    ok(p.errores.length === 0, `QS: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== HO) Blue IA y el horario del equipo (dueño, 2026-11-03): siempre a la vista junto a «Hablar con el equipo»;
// fuera de horario, aviso que recomienda esperar y ofrece seguir con Blue; su parte en Administración → Analítica =====
async function seccionHO() {
  const evento = (estado, nombre) => (estado.eventosEnviados ?? []).filter((e) => e.event_name === nombre);
  const sinSesion = (ctx) =>
    ctx.addInitScript(() => {
      try {
        localStorage.removeItem("videojuegoos.supabase.auth");
      } catch {
        // sin almacenamiento
      }
    });
  const texto = (p, sel) => p.evaluate((s) => (document.querySelector(s)?.innerText ?? "").replace(/\n+/g, " | "), sel);
  const caja = (p, sel) =>
    p.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), ancho: window.innerWidth } : null;
    }, sel);
  const HORARIO = "Lunes a sábado 10:00–14:00 y 17:00–19:00 · Domingos 10:00–13:00";

  // HO1) Fuera de horario (martes 08:15 en España): la línea lo dice; «Hablar con el equipo» enseña antes el aviso;
  // «Seguir con Blue» vuelve al recuadro; «Escribir al equipo igualmente» sigue como siempre (sin sesión, a entrar).
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true, blueIa: () => "Claro, te ayudo. ¿Qué le pasa a tu consola?" };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    // Reloj falso de Playwright que empieza a esa hora. Con él, el saludo de Blue IA no termina de escribirse en la captura
    // (sus temporizadores van con ese reloj); sin reloj falso se escribe entero (sección BI).
    await ctx.clock.install({ time: new Date("2026-11-03T07:15:00Z") });
    const p = await pagina(ctx, "/blue-ia");
    await p.locator("#blue-ia-horario").waitFor({ timeout: 30000 }).catch(() => {});
    const linea = await texto(p, "#blue-ia-horario");
    ok(/Equipo fuera de horario · vuelve hoy a las 10:00/.test(linea) && linea.includes(HORARIO), `HO: fuera de horario, la línea lo dice y enseña el horario (${linea})`);
    // Una pregunta primero: el aviso no debe tapar la conversación.
    await p.getByPlaceholder("Pregúntale a Blue IA…").fill("Mi consola no enciende");
    await p.getByRole("button", { name: "Enviar la pregunta" }).click();
    await p.getByText("Claro, te ayudo.").waitFor({ timeout: 15000 }).catch(() => {});
    await p.locator('[aria-label="Hablar con el equipo"]').click();
    await p.locator("#blue-ia-aviso-horario").waitFor({ timeout: 8000 }).catch(() => {});
    const aviso = await texto(p, "#blue-ia-aviso-horario");
    ok(/fuera del horario de atención\. El equipo vuelve hoy a las 10:00/.test(aviso) && /esperar a ese horario/.test(aviso) && /Blue puede intentar ayudarte/.test(aviso), `HO: «Hablar con el equipo» fuera de horario avisa, recomienda esperar y ofrece seguir con Blue (${aviso.slice(0, 160)})`);
    const b1 = await caja(p, "#blue-ia-seguir-blue");
    const b2 = await caja(p, "#blue-ia-escribir-igualmente");
    ok([b1, b2].every((b) => !!b && b.h >= 44 && b.x >= 0 && b.x + b.w <= b.ancho), `HO: sus dos botones se tocan bien y no se salen (${JSON.stringify([b1, b2])})`);
    ok(/\/blue-ia/.test(p.url()), "HO: y todavía no se va a ningún sitio");
    // Con el aviso a la vista, la conversación se puede bajar hasta el final sin que el compositor la tape.
    const tapa = await p.evaluate(() => {
      const burbujas = Array.from(document.querySelectorAll('[data-avatar-blue="1"]'));
      const ultima = burbujas.at(-1)?.parentElement?.getBoundingClientRect();
      const scroll = Array.from(document.querySelectorAll("div")).find((d) => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY !== "visible");
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
      const aviso = document.getElementById("blue-ia-aviso-horario")?.getBoundingClientRect();
      const ult = burbujas.at(-1)?.parentElement?.getBoundingClientRect();
      return { antes: ultima ? Math.round(ultima.bottom) : null, despues: ult ? Math.round(ult.bottom) : null, aviso: aviso ? Math.round(aviso.top) : null };
    });
    ok(tapa.despues !== null && tapa.aviso !== null && tapa.despues <= tapa.aviso + 2, `HO: el aviso no tapa la última respuesta (respuesta hasta ${tapa.despues}, aviso desde ${tapa.aviso})`);
    await capturar(p, "HO1-aviso-fuera-de-horario");
    await p.locator("#blue-ia-seguir-blue").click();
    await p.waitForTimeout(400);
    const tras = await p.evaluate(() => ({ aviso: !!document.getElementById("blue-ia-aviso-horario"), foco: document.activeElement?.getAttribute("placeholder") ?? "" }));
    ok(!tras.aviso && /Pregúntale a Blue IA/.test(tras.foco), `HO: «Seguir con Blue» quita el aviso y deja escribir a Blue (${JSON.stringify(tras)})`);
    await p.locator('[aria-label="Hablar con el equipo"]').click();
    await p.locator("#blue-ia-escribir-igualmente").click({ timeout: 8000 }).catch(() => {});
    await p.waitForURL(/\/perfil/, { timeout: 15000 }).catch(() => {});
    ok(/\/perfil/.test(p.url()), `HO: «Escribir al equipo igualmente» sigue como siempre (sin sesión, a entrar: ${new URL(p.url()).pathname})`);
    for (let i = 0; i < 20 && evento(estado, "blue_ia_equipo_fuera_horario").length < 4; i++) await p.waitForTimeout(250);
    const acciones = evento(estado, "blue_ia_equipo_fuera_horario").map((e) => e.metadata?.accion).join(",");
    ok(acciones === "aviso,seguir_blue,aviso,escribir", `HO: la analítica propia cuenta el aviso y lo que hace cada uno (${acciones})`);
    ok(p.errores.length === 0, `HO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // HO2) En horario (martes 12:00): la línea dice hasta cuándo y «Hablar con el equipo» va directo, sin aviso.
  {
    const estado = { filas: [], guardados: [], aceptaAnalitica: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await sinSesion(ctx);
    await ctx.clock.install({ time: new Date("2026-11-03T11:00:00Z") });
    const p = await pagina(ctx, "/blue-ia");
    await p.locator("#blue-ia-horario").waitFor({ timeout: 30000 }).catch(() => {});
    const linea = await texto(p, "#blue-ia-horario");
    ok(/Equipo atendiendo hasta las 14:00/.test(linea) && linea.includes(HORARIO), `HO: en horario, la línea dice hasta cuándo (${linea})`);
    await capturar(p, "HO2-en-horario");
    await p.locator('[aria-label="Hablar con el equipo"]').click();
    await p.waitForURL(/\/perfil/, { timeout: 15000 }).catch(() => {});
    ok(/\/perfil/.test(p.url()) && evento(estado, "blue_ia_equipo_fuera_horario").length === 0, "HO: en horario, «Hablar con el equipo» va directo, sin aviso");
    ok(p.errores.length === 0, `HO: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // HO3) Domingo por la tarde: vuelve el lunes («mañana a las 10:00»).
  {
    const ctx = await contexto(navegador, CLIENTE, "user", { filas: [], guardados: [] });
    await sinSesion(ctx);
    await ctx.clock.install({ time: new Date("2026-11-08T15:00:00Z") });
    const p = await pagina(ctx, "/blue-ia");
    await p.locator("#blue-ia-horario").waitFor({ timeout: 30000 }).catch(() => {});
    ok(/vuelve mañana a las 10:00/.test(await texto(p, "#blue-ia-horario")), "HO: el domingo por la tarde dice que vuelve mañana a las 10:00");
    await ctx.close();
  }

  // HO4) Administración → Analítica: cuántos pulsan «Hablar con el equipo» fuera de horario y qué hacen.
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Blue IA: fuera de horario, aviso", sessions: 6 },
        { step_label: "Blue IA: fuera de horario, sigue con Blue", sessions: 4 },
        { step_label: "Blue IA: fuera de horario, escribe al equipo", sessions: 1 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-blue-horario").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-blue-horario").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/fuera de horario: 6 sesiones · siguen con Blue: 4 · escriben igualmente: 1/.test(t), `HO: Administración → Analítica lo cuenta (${t})`);
    ok(p.errores.length === 0, `HO: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== AD) Blue en el panel de administración (dueño, 2026-11-03): en TODAS sus pantallas, en el móvil y en el
// ordenador, Blue solo dice mensajes del panel (pedidos olvidados, «Lo que Blue sabe»…); los de la tienda (avisos,
// ficha, envíos, instalar, reservas, seguimientos) nunca, tampoco al entrar desde la tienda sin recargar. Con el reloj
// simulado de Playwright (cada pantalla «vive» 44 s en pocos segundos de verdad).
async function seccionAD() {
  const AVISO = "Esta semana, mandos revisados con un 20 % menos";
  const RUTAS_PANEL = [
    "/admin", "/admin/products", "/admin/pedidos", "/admin/services", "/admin/users", `/admin/cliente/${CLIENTE.id}`,
    "/admin/chats", "/admin/inventario", "/admin/escaparate", "/admin/cotizaciones", "/admin/categories", "/admin/blog",
    "/admin/flash-news", "/admin/policies", "/admin/redes-sociales", "/admin/marca-seo", "/admin/analytics",
    "/admin/auditorias", "/admin/aprendizajes", "/admin/conocimiento",
  ];
  const DE_LA_TIENDA = /mandos revisados con un 20|Realizamos entregas|Instala la tienda|Tu reserva de|seguimiento|Pregúntame por|Foro/i;
  const DEL_PANEL = /48 h sin cambios|me lo cuentas para responder mejor|¡Guardado!|clientes? te ha/;
  const VISTAS = [
    ["móvil", {}],
    ["ordenador", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }],
  ];
  const mensaje = (p) => p.evaluate(() => (document.getElementById("blue-mensaje")?.innerText ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
  // Adelanta el reloj simulado de 2 en 2 s (dejando llegar las respuestas) y apunta todo lo que dice Blue.
  const correr = async (p, segundos, vistos) => {
    for (let s = 0; s < segundos; s += 2) {
      await p.clock.runFor(2000);
      await p.waitForTimeout(120);
      const t = await mensaje(p);
      if (t) vistos.add(t);
    }
  };
  for (const [nombre, vista] of VISTAS) {
    const estado = {
      filas: [{ user_id: ADMIN.id, nombre: "Daniel", usuario: "daniel", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "2003-08-01", foto_url: null }],
      guardados: [],
      aceptaAnalitica: true,
      flash: [{ message: AVISO, sort_order: 0 }],
      olvidados: { pedidos: 1, reparaciones: 0 },
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado, vista);
    await ctx.clock.install({ time: new Date("2026-11-03T10:00:00Z") }); // martes, 11:00 en España (Blue propone temas de 9 a 21 h)

    // AD1) En la tienda, Blue SÍ dice el aviso de la tienda: la prueba provoca de verdad un mensaje de la tienda.
    const p = await pagina(ctx, "/");
    const enTienda = new Set();
    await correr(p, 40, enTienda);
    ok([...enTienda].some((t) => t.includes(AVISO)), `AD (${nombre}): en la tienda Blue dice el aviso de la tienda (${[...enTienda].join(" / ").slice(0, 120) || "nada"})`);

    // AD2) Con el aviso a la vista, al panel sin recargar (Perfil → «Panel de control»): se va y no vuelve.
    await p.locator('[data-testid="pestana-perfil"]').first().click({ timeout: 30000 });
    await p.locator("#perfil-datos").getByRole("button", { name: "Panel de control" }).click({ timeout: 30000 });
    await p.waitForURL(/\/admin\/?$/, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(300);
    const nadaMasEntrar = await mensaje(p);
    const trasEntrar = new Set();
    await correr(p, 40, trasEntrar);
    const deTienda = [...trasEntrar].filter((t) => DE_LA_TIENDA.test(t) || !DEL_PANEL.test(t));
    ok(/\/admin\/?$/.test(new URL(p.url()).pathname) && !DE_LA_TIENDA.test(nadaMasEntrar) && deTienda.length === 0, `AD (${nombre}): al entrar en el panel desde la tienda, el aviso de la tienda se va y solo salen los del panel (${[...trasEntrar].join(" / ").slice(0, 140) || "nada"})`);
    await p.close();

    // AD3) Todas las pantallas del panel, cargadas de cero.
    const fugas = [];
    const fallosJs = [];
    let conPanel = 0;
    for (const ruta of RUTAS_PANEL) {
      const q = await pagina(ctx, ruta);
      const vistos = new Set();
      await correr(q, 44, vistos);
      const malos = [...vistos].filter((t) => DE_LA_TIENDA.test(t) || !DEL_PANEL.test(t));
      if (malos.length) fugas.push(`${ruta}: ${malos.join(" / ").slice(0, 100)}`);
      if ([...vistos].some((t) => DEL_PANEL.test(t))) conPanel++;
      const js = q.errores.filter((e) => e.startsWith("error JS"));
      if (js.length) fallosJs.push(`${ruta}: ${js[0]}`);
      if (ruta === "/admin/products") await capturar(q, `AD-${nombre}-productos`);
      await q.close();
    }
    ok(fugas.length === 0, `AD (${nombre}): en las ${RUTAS_PANEL.length} pantallas del panel Blue no dice ningún mensaje de la tienda (${fugas.join(" | ") || "ninguno"})`);
    ok(conPanel >= 1, `AD (${nombre}): y los mensajes del panel siguen saliendo (en ${conPanel} pantallas)`);
    ok(fallosJs.length === 0, `AD (${nombre}): ninguna pantalla del panel da errores de JavaScript (${fallosJs.join(" | ") || "ninguno"})`);
    await ctx.close();
  }
}

// ===== SV) Administración → Servicios (dueño, 2026-11-03): buscador arriba y del mismo alto que en Productos, los
// cuatro contadores en una fila, «Nuevo servicio» como «+» flotante, sin recuadros alrededor, la foto se abre en grande
// con zoom y deslizando el dedo se cambia de pestaña en bucle; en el móvil y en el ordenador ===========================
async function seccionSV() {
  const foto = (n) => `https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/servicios/${n}.jpg`;
  const servicio = (n, title, extra = {}) => ({
    id: `5e000000-0000-4000-8000-00000000000${n}`, title, description: `Descripción de ${title}`, price_eur: 20 + n * 5, status: "PUBLISHED",
    is_active: true, view_count: n * 5, created_at: `2026-10-0${n}T10:00:00Z`, updated_at: `2026-10-0${n}T10:00:00Z`, ...extra,
  });
  const serviciosAdmin = [
    servicio(1, "Mantenimiento PlayStation 5"),
    servicio(2, "Mantenimiento Consola PlayStation 4"),
    servicio(3, "Sustitución de joysticks"),
  ];
  const serviciosMedia = [
    { id: "5f000000-0000-4000-8000-000000000011", service_id: serviciosAdmin[0].id, storage_path: "servicios/1.jpg", public_url: foto(1), file_name: "1.jpg", sort_order: 0, is_cover: true },
    { id: "5f000000-0000-4000-8000-000000000012", service_id: serviciosAdmin[0].id, storage_path: "servicios/2.jpg", public_url: foto(2), file_name: "2.jpg", sort_order: 1, is_cover: false },
    { id: "5f000000-0000-4000-8000-000000000021", service_id: serviciosAdmin[1].id, storage_path: "servicios/3.jpg", public_url: foto(3), file_name: "3.jpg", sort_order: 0, is_cover: true },
    { id: "5f000000-0000-4000-8000-000000000031", service_id: serviciosAdmin[2].id, storage_path: "servicios/4.jpg", public_url: foto(4), file_name: "4.jpg", sort_order: 0, is_cover: true },
  ];
  const estadoBase = () => ({ guardados: [], filas: [], serviciosAdmin, serviciosMedia });
  const caja = (p, sel) =>
    p.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), ancho: window.innerWidth, alto: window.innerHeight } : null;
    }, sel);
  const pestanaActiva = (p) =>
    p.evaluate(() => [...document.querySelectorAll('#servicios-pestanas [role="tab"]')].find((t) => t.getAttribute("aria-selected") === "true")?.innerText.trim() ?? "");

  // SV1–SV5) En el móvil.
  {
    const estado = estadoBase();
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/services");
    await p.getByText("Sustitución de joysticks").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);

    // SV1) Buscador arriba de los contadores y del mismo alto que el de Productos.
    const buscar = await caja(p, "#servicios-buscar");
    const contadores = await caja(p, "#servicios-contadores");
    const q = await ctx.newPage();
    await q.goto(`${BASE}/admin/products`, { waitUntil: "load", timeout: 60000 });
    await q.locator("#productos-buscar").waitFor({ timeout: 30000 }).catch(() => {});
    const buscarProductos = await caja(q, "#productos-buscar");
    await q.close();
    ok(!!buscar && !!contadores && buscar.y < contadores.y, `SV: el buscador va arriba de los contadores (${buscar?.y} < ${contadores?.y})`);
    ok(!!buscar && !!buscarProductos && Math.abs(buscar.h - buscarProductos.h) <= 1 && buscar.w >= buscarProductos.w - 2, `SV: y mide lo mismo que el de Productos (${buscar?.h} y ${buscarProductos?.h} px de alto)`);

    // SV2) Los cuatro contadores en una sola fila, sin cortarse ni salirse.
    const tarjetas = await p.evaluate(() =>
      [...(document.getElementById("servicios-contadores")?.children ?? [])].map((t) => {
        const r = t.getBoundingClientRect();
        const cortados = [...t.querySelectorAll("div")].filter((d) => d.childElementCount === 0 && d.scrollWidth > d.clientWidth + 1).length;
        return { y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), cortados, texto: t.innerText.replace(/\n/g, " ") };
      })
    );
    ok(
      tarjetas.length === 4 && tarjetas.every((t) => t.y === tarjetas[0].y) && tarjetas.every((t) => t.x >= 0 && t.x + t.w <= 390) && tarjetas.every((t) => t.cortados === 0),
      `SV: los 4 contadores van en una fila y no se cortan (${tarjetas.map((t) => `${t.texto}@${t.x},${t.y}`).join(" | ")})`
    );

    // SV3) Sin «+ Nuevo servicio» grande: el «+» flotante abajo a la derecha, que abre el formulario.
    const mas = await caja(p, "#servicio-nuevo");
    ok((await p.getByText("+ Nuevo servicio").count()) === 0 && !!mas && mas.w >= 44 && mas.h >= 44 && mas.ancho - (mas.x + mas.w) <= 20 && mas.alto - (mas.y + mas.h) <= 24, `SV: «Nuevo servicio» es el «+» flotante abajo a la derecha (${JSON.stringify(mas)})`);
    await capturar(p, "SV1-servicios-movil");

    // SV4) Sin recuadros alrededor: ni cápsulas en las pestañas ni tarjeta en cada servicio.
    const fondos = await p.evaluate(() => ({
      filas: [...(document.getElementById("servicios-lista")?.children ?? [])].map((f) => getComputedStyle(f).backgroundColor),
      pestanas: [...document.querySelectorAll('#servicios-pestanas [role="tab"]')].map((t) => getComputedStyle(t).backgroundColor),
    }));
    const transparente = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
    ok(fondos.filas.length === 3 && fondos.filas.every(transparente) && fondos.pestanas.every(transparente), `SV: sin recuadros alrededor de los servicios ni de las pestañas (${JSON.stringify(fondos)})`);

    // SV5) Tocar la foto la abre en grande, con zoom.
    await p.getByRole("button", { name: "Ver las fotos de Mantenimiento PlayStation 5" }).click();
    await p.locator("#visor-fotos").waitFor({ timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const visor = await p.evaluate(() => {
      const img = document.querySelector("#visor-fotos-capa img");
      return {
        abierto: !!document.getElementById("visor-fotos"),
        texto: document.getElementById("visor-fotos")?.innerText.replace(/\n/g, " ") ?? "",
        cargada: !!img && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 200,
      };
    });
    ok(visor.abierto && /1 \/ 2/.test(visor.texto) && visor.cargada, `SV: tocar la foto abre el visor en la 1 de 2 y la foto se ve (${visor.texto.slice(0, 40)}, cargada: ${visor.cargada})`);
    const cv = await p.locator("#visor-fotos").boundingBox();
    const cdp = await ctx.newCDPSession(p);
    const tocar = async (x, y) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await tocar(cv.x + cv.width / 2, cv.y + cv.height / 2);
    await p.waitForTimeout(80);
    await tocar(cv.x + cv.width / 2, cv.y + cv.height / 2);
    await p.waitForTimeout(500);
    const zoom = await p.evaluate(() => /scale\(([\d.]+)\)/.exec(document.getElementById("visor-fotos-capa")?.style.transform ?? "")?.[1] ?? "1");
    ok(Number(zoom) > 2, `SV: con doble toque se acerca (zoom ×${zoom})`);
    await capturar(p, "SV2-visor-servicio");
    await p.getByRole("button", { name: "Cerrar el visor de fotos" }).click();
    await p.waitForTimeout(400);
    ok((await p.locator("#visor-fotos").count()) === 0, "SV: y se cierra");
    await cdp.detach();

    // SV6) Deslizar el dedo cambia de pestaña, en bucle.
    const deslizar = async (dx, dy) => {
      const zona = await p.locator("#servicios-pestanas").boundingBox();
      const x = 195;
      const y = zona.y + zona.height + 60;
      const c = await ctx.newCDPSession(p);
      await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) {
        await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
        await p.waitForTimeout(16);
      }
      await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await c.detach();
      await p.waitForTimeout(700);
    };
    const recorrido = [await pestanaActiva(p)];
    await deslizar(-200, 6);
    recorrido.push(await pestanaActiva(p));
    await deslizar(-200, 4);
    recorrido.push(await pestanaActiva(p));
    await deslizar(200, -4);
    recorrido.push(await pestanaActiva(p));
    await deslizar(6, -200);
    recorrido.push(await pestanaActiva(p));
    ok(recorrido.join(",") === "Catálogo,Solicitudes,Catálogo,Solicitudes,Solicitudes", `SV: deslizar cambia de pestaña en bucle y un gesto vertical no (${recorrido.join(" → ")})`);
    ok((await p.locator("#servicio-nuevo").count()) === 0, "SV: en «Solicitudes» no sale el «+» de crear servicio");
    await p.locator("#servicios-pestanas").getByText("Catálogo", { exact: true }).click();
    await p.waitForTimeout(400);
    ok((await pestanaActiva(p)) === "Catálogo", "SV: tocar la pestaña sigue funcionando");
    const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
    ok(ancho.a <= ancho.p + 1, `SV: la página no se ensancha (${ancho.a}/${ancho.p})`);

    await p.locator("#servicio-nuevo").click();
    await p.getByText("Nuevo servicio", { exact: true }).first().waitFor({ timeout: 8000 }).catch(() => {});
    ok((await p.getByText("Nuevo servicio", { exact: true }).count()) >= 1, "SV: el «+» abre el formulario de «Nuevo servicio»");
    ok(p.errores.filter((e) => e.startsWith("error JS")).length === 0, `SV: sin errores de JavaScript (${p.errores.join(" | ").slice(0, 160)})`);
    await ctx.close();
  }

  // SV7) En el ordenador: los contadores en una fila y el «+» abajo a la derecha.
  {
    const ctx = await contexto(navegador, ADMIN, "admin", estadoBase(), { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    const p = await pagina(ctx, "/admin/services");
    await p.getByText("Sustitución de joysticks").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    const filas = await p.evaluate(() => [...(document.getElementById("servicios-contadores")?.children ?? [])].map((t) => Math.round(t.getBoundingClientRect().y)));
    const mas = await caja(p, "#servicio-nuevo");
    const buscar = await caja(p, "#servicios-buscar");
    const contadores = await caja(p, "#servicios-contadores");
    ok(filas.length === 4 && filas.every((y) => y === filas[0]) && !!mas && mas.ancho - (mas.x + mas.w) <= 20 && buscar.y < contadores.y, `SV: en el ordenador también (contadores ${filas.join(",")}; «+» ${JSON.stringify(mas)})`);
    await p.getByRole("button", { name: "Ver las fotos de Sustitución de joysticks" }).click();
    await p.locator("#visor-fotos").waitFor({ timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const fotoOrdenador = await p.evaluate(() => {
      const img = document.querySelector("#visor-fotos-capa img");
      const r = img?.getBoundingClientRect();
      return img ? { cargada: img.complete && img.naturalWidth > 0, w: Math.round(r.width), h: Math.round(r.height), src: (img.getAttribute("src") ?? "").slice(0, 90) } : null;
    });
    ok(!!fotoOrdenador && fotoOrdenador.cargada && fotoOrdenador.w > 200 && fotoOrdenador.h > 200, `SV: en el ordenador la foto también se abre en grande y se ve (${JSON.stringify(fotoOrdenador)})`);
    await capturar(p, "SV3-servicios-ordenador");
    ok(p.errores.filter((e) => e.startsWith("error JS")).length === 0, `SV: sin errores de JavaScript en el ordenador (${p.errores.join(" | ").slice(0, 160)})`);
    await ctx.close();
  }
}

// ===== FS) Ficha de servicio con el formato de la de producto (dueño, 2026-11-03): galería con posición, foto en
// grande con zoom, precio, «Contratar servicio ahora» y «Preguntar por este servicio» como los botones de producto, ficha
// con pestañas «Características» y «Descripción», «Volver atrás» al final (sin el «Volver» flotante) y sin los bloques
// que la de producto no tiene; su uso en Administración → Analítica. En el móvil y en el ordenador ====================
async function seccionFS() {
  const ID = "5e000000-0000-4000-8000-0000000000f1";
  const PRODUCTO = "b7c1d2e3-0000-4000-8000-0000000000f2";
  const foto = (n) => `https://fotos.ejemplo.invalid/storage/v1/object/public/product-media/servicios/fs${n}.jpg`;
  const estadoBase = () => ({
    filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
    guardados: [],
    aceptaAnalitica: true,
    servicio: { id: ID, title: "Mantenimiento Consola Playstation 5", description: "¿Nunca has realizado mantenimiento a tu consola?", price_eur: 45 },
    fotosServicio: [1, 2, 3].map((n) => ({ id: `fs${n}`, public_url: foto(n), is_cover: n === 1, sort_order: n - 1 })),
    producto: {
      id: PRODUCTO, title: "Forza Horizon PS4", description: "Juego revisado.", price_eur: 9, status: "PUBLISHED", is_active: true,
      category_id: null, images: [], updated_at: "2026-10-30T10:00:00Z", created_at: "2026-10-30T10:00:00Z", condition: "GOOD",
      like_count: 0, reference: null, caracteristicas: [{ etiqueta: "Plataforma", valor: "PS4" }], mantenimiento: null, category: null,
    },
    fotosProducto: [],
  });
  const caja = (p, sel) =>
    p.evaluate((s) => {
      const el = typeof s === "string" ? document.querySelector(s) : null;
      const r = el?.getBoundingClientRect();
      if (!r) return null;
      const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), radio: cs.borderRadius, fondo: cs.backgroundColor };
    }, sel);
  const botonConTexto = (p, texto) =>
    p.evaluate((t) => {
      // El icono de dentro también es texto: se compara solo con letras, números y espacios.
      const el = [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText.replace(/[^\p{L}\p{N} ]/gu, "").trim() === t);
      const r = el?.getBoundingClientRect();
      if (!r) return null;
      const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), radio: cs.borderRadius, fondo: cs.backgroundColor, borde: cs.borderTopColor };
    }, texto);

  for (const [nombre, vista] of [
    ["móvil", {}],
    ["ordenador", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }],
  ]) {
    const estado = estadoBase();
    const ctx = await contexto(navegador, CLIENTE, "user", estado, vista);
    const p = await pagina(ctx, `/servicio/${ID}`);
    await p.locator("#servicio-ficha-carrusel").waitFor({ timeout: 40000 }).catch(() => {});
    await p.waitForTimeout(700);
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");

    // FS1) Título como h1, subtítulo, posición de la galería y miniaturas.
    const h1 = await p.evaluate(() => document.querySelector('h1, [role="heading"][aria-level="1"]')?.innerText.trim() ?? "");
    ok(h1 === "Mantenimiento Consola Playstation 5" && /Servicio profesional · Reparación y limpieza/.test(t), `FS (${nombre}): título como h1 y subtítulo (${h1})`);
    const pos = await p.locator("#galeria-posicion").innerText().catch(() => "");
    ok(pos.trim() === "1 / 3" && (await p.locator("#galeria-miniaturas").count()) === 1, `FS (${nombre}): la galería dice en qué foto está y lleva miniaturas (${pos.trim()})`);

    // FS2) El orden de la ficha de producto: precio, botón principal, preguntar, ficha con pestañas y «Volver atrás».
    const orden = await p.evaluate(() => {
      const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
      const precio = [...document.querySelectorAll("div")].find((d) => d.childElementCount === 0 && d.innerText.trim() === "45,00€");
      return [precio ? precio.getBoundingClientRect().top : -1, y("#servicio-contratar"), y("#servicio-preguntar"), y("#servicio-ficha-carrusel"), y("#servicio-volver")];
    });
    ok(orden.every((v) => v >= 0) && orden.every((v, i) => i === 0 || v > orden[i - 1]), `FS (${nombre}): precio, «Contratar», «Preguntar», ficha y «Volver atrás», en ese orden (${orden.map(Math.round).join(" < ")})`);

    // FS3) Pestañas «Características» y «Descripción», con lo que contaba «Información del servicio».
    const pestanas = await p.evaluate(() => [...document.querySelectorAll('#servicio-ficha-carrusel [role="tab"]')].map((x) => x.innerText.trim()));
    const ficha = (await p.locator("#servicio-caracteristicas").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(pestanas.join("|") === "Características|Descripción", `FS (${nombre}): pestañas «Características» y «Descripción» (${pestanas.join(", ")})`);
    ok(/Tipo\s*Reparación \/ Limpieza/.test(ficha) && /Precio\s*45,00€/.test(ficha) && /Contratación\s*Disponible ahora/.test(ficha), `FS (${nombre}): «Características» con tipo, precio y contratación (${ficha})`);

    // FS4) Sin lo que la ficha de producto no tiene: bloques de confianza, WhatsApp y el «Volver» flotante.
    const whatsapps = await p.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((b) => /WhatsApp/.test(b.innerText)).length);
    ok(!/Contrata con tranquilidad|¿Tienes dudas antes de contratar\?|Volver a servicios/.test(t) && whatsapps === 0, `FS (${nombre}): sin bloques de confianza ni WhatsApp (${whatsapps} botones de WhatsApp)`);
    ok((await p.locator('[aria-label="Volver"]').count()) === 0, `FS (${nombre}): sin el «Volver» flotante (lleva «Volver atrás» al final, como producto)`);

    // FS5) Los botones, iguales que los de la ficha de producto (alto, forma y color).
    const contratar = await caja(p, "#servicio-contratar");
    const preguntar = await caja(p, "#servicio-preguntar");
    const volver = await caja(p, "#servicio-volver");
    const q = await pagina(ctx, `/producto/${PRODUCTO}`);
    await q.locator("#producto-ficha-carrusel").waitFor({ timeout: 40000 }).catch(() => {});
    await q.waitForTimeout(500);
    const comprar = await botonConTexto(q, "Comprar ya");
    const preguntarProducto = await botonConTexto(q, "Preguntar por este producto");
    const volverProducto = await botonConTexto(q, "Volver atrás");
    const igual = (a, b) => !!a && !!b && a.h === b.h && a.w === b.w && a.radio === b.radio && a.fondo === b.fondo;
    const sinPos = (a) => a && { w: a.w, h: a.h, radio: a.radio, fondo: a.fondo };
    ok(igual(contratar, comprar), `FS (${nombre}): «Contratar servicio ahora» mide y se ve como «Comprar ya» (${JSON.stringify([sinPos(contratar), sinPos(comprar)])})`);
    ok(igual(preguntar, preguntarProducto), `FS (${nombre}): «Preguntar por este servicio» como «Preguntar por este producto» (${JSON.stringify([sinPos(preguntar), sinPos(preguntarProducto)])})`);
    ok(igual(volver, volverProducto), `FS (${nombre}): «Volver atrás» como el de producto (${JSON.stringify([sinPos(volver), sinPos(volverProducto)])})`);
    ok((await q.locator("#producto-caracteristicas").count()) === 1 && q.errores.length === 0, `FS (${nombre}): la ficha de producto sigue con sus pestañas y sin errores (${q.errores[0] ?? "ninguno"})`);
    await q.close();

    // FS6) Nada se sale por los lados.
    const anchos = await p.evaluate(() => ({ pagina: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    ok(anchos.pagina <= anchos.ventana, `FS (${nombre}): nada se sale por los lados (${anchos.pagina} de ${anchos.ventana} px)`);
    await capturar(p, `FS1-servicio-${nombre === "móvil" ? "movil" : "ordenador"}`);

    // FS7) En el ordenador, flechas para pasar de foto; tocar la foto la abre en grande (con zoom) y se cuenta.
    if (nombre === "ordenador") {
      await p.locator('[aria-label="Foto siguiente"]').first().click();
      await p.waitForTimeout(300);
      ok((await p.locator("#galeria-posicion").innerText().catch(() => "")).trim() === "2 / 3", "FS (ordenador): la flecha pasa a la foto siguiente (2 / 3)");
    }
    const f = await caja(p, "#servicio-foto");
    if (!f) {
      ok(false, `FS (${nombre}): no se encuentra la foto principal`);
      await ctx.close();
      continue;
    }
    if (nombre === "móvil") {
      const cdp = await ctx.newCDPSession(p);
      const toque = (tipo, puntos) => cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: puntos.map(([x, y]) => ({ x, y, id: 0 })) });
      await toque("touchStart", [[f.x + f.w / 2, f.y + f.h / 2]]);
      await toque("touchEnd", []);
    } else {
      await p.mouse.click(f.x + f.w / 2, f.y + f.h / 2);
    }
    await p.locator("#visor-fotos").waitFor({ timeout: 5000 }).catch(() => {});
    const visor = await p.locator("#visor-fotos").isVisible().catch(() => false);
    ok(visor, `FS (${nombre}): al tocar la foto se abre en grande con el visor de zoom`);
    if (visor) await capturar(p, `FS2-visor-${nombre === "móvil" ? "movil" : "ordenador"}`);
    await p.locator('[aria-label="Cerrar el visor de fotos"]').click().catch(() => {});
    await p.waitForTimeout(400);

    // FS8) «Contratar servicio ahora» abre su formulario; los dos botones se cuentan en la analítica.
    await p.locator("#servicio-contratar").click();
    const formulario = await p.getByText("Contratar: Mantenimiento Consola Playstation 5").first().isVisible({ timeout: 5000 }).catch(() => false);
    ok(formulario, `FS (${nombre}): «Contratar servicio ahora» abre su formulario`);
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(300);
    const etiquetas = (estado.eventosEnviados ?? []).map((e) => e.step_label);
    ok(etiquetas.includes("Servicio: foto ampliada") && etiquetas.includes("Servicio: Contratar servicio ahora"), `FS (${nombre}): la foto ampliada y «Contratar» se cuentan (${etiquetas.filter((e) => /^Servicio/.test(e)).join(", ")})`);
    ok(p.errores.length === 0, `FS (${nombre}): sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }

  // FS9) «Preguntar por este servicio» abre Blue IA con el servicio como contexto (como en producto; desde ahí,
  // «Hablar con el equipo» abre el chat de la tienda) y se cuenta. Nada de WhatsApp.
  {
    const estado = estadoBase();
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const aWhatsApp = [];
    await ctx.route(/wa\.me|whatsapp\.com/, (r) => {
      aWhatsApp.push(r.request().url());
      return r.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp</p>" });
    });
    const p = await pagina(ctx, `/servicio/${ID}`);
    await p.locator("#servicio-preguntar").waitFor({ timeout: 40000 }).catch(() => {});
    await p.locator("#servicio-preguntar").click();
    await p.waitForURL(/\/blue-ia\?servicio=/, { timeout: 15000 }).catch(() => {});
    await p.getByText(/el servicio Mantenimiento Consola Playstation 5, 45,00€/).first().waitFor({ timeout: 20000 }).catch(() => {});
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(p.url().includes(`/blue-ia?servicio=${ID}`) && /el servicio Mantenimiento Consola Playstation 5, 45,00€/.test(t), `FS: «Preguntar por este servicio» abre Blue IA con el servicio (${p.url().replace(BASE, "")})`);
    ok(aWhatsApp.length === 0, `FS: y no abre WhatsApp (${aWhatsApp.length})`);
    await capturar(p, "FS3-blue-ia-servicio");
    ok((estado.eventosEnviados ?? []).some((e) => e.step_label === "Servicio: Preguntar por este servicio"), "FS: y se cuenta en la analítica");
    await ctx.close();
  }

  // FS10) Administración → Analítica lo cuenta.
  {
    const estado = {
      guardados: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Servicio: foto ampliada", sessions: 4 },
        { step_label: "Servicio: Contratar servicio ahora", sessions: 2 },
        { step_label: "Servicio: Preguntar por este servicio", sessions: 3 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/analytics");
    await p.locator("#analitica-ficha-servicio").waitFor({ timeout: 40000 }).catch(() => {});
    const t = (await p.locator("#analitica-ficha-servicio").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/fotos ampliadas 4 · «Contratar servicio ahora» 2 · «Preguntar por este servicio» 3/.test(t), `FS: Administración → Analítica lo cuenta (${t})`);
    ok(p.errores.length === 0, `FS: Analítica sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await ctx.close();
  }
}

// ===== MG) «Me gusta» (dueño, 2026-11-03): corazón en la ficha de servicio (y sin él si falta la migración), pestaña
// «Me gusta» en Perfil con los de la cuenta y los del dispositivo, la lista de Servicios con la tarjeta del Catálogo,
// «me gusta» por servicio en Administración → Servicios y su uso en Analítica ======================================
async function seccionMG() {
  const SERV = "5e000000-0000-4000-8000-0000000000c1";
  const SERV2 = "5e000000-0000-4000-8000-0000000000c2";
  const SERV3 = "5e000000-0000-4000-8000-0000000000c3";
  const PROD_LOCAL = "b7c1d2e3-0000-4000-8000-0000000000c4";
  const PROD_CUENTA = "b7c1d2e3-0000-4000-8000-0000000000c5";
  const servicio = (id, title, extra = {}) => ({ id, title, description: `Descripción de ${title}`, price_eur: 45, ...extra });
  const producto = (id, title, price_eur) => ({ id, title, price_eur });
  // api/interaccion.ts falso: apunta lo que se le pide y contesta como el de verdad.
  const interaccion = async (ctx, estado) =>
    ctx.route(/\/api\/interaccion$/, (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? "{}");
      estado.interacciones = [...(estado.interacciones ?? []), cuerpo];
      const responde = (b) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
      if (cuerpo.accion === "mis_me_gusta") return responde({ ok: true, productos: estado.cuentaProductos ?? [], servicios: estado.cuentaServicios ?? [] });
      if (cuerpo.accion === "apoyo_servicio") return responde({ ok: true, total: cuerpo.activo ? 4 : 3 });
      return responde({ ok: true, contado: false });
    });
  const conMeGusta = (ctx, productos, servicios) =>
    ctx.addInitScript(([pr, se]) => {
      try {
        localStorage.setItem("videojuegoszaragoza:liked_products", JSON.stringify(pr));
        localStorage.setItem("videojuegoszaragoza:liked_services", JSON.stringify(se));
      } catch {
        // sin almacenamiento
      }
    }, [productos, servicios]);

  // MG1) Ficha de servicio: corazón con su número; al tocarlo suma, se recuerda en el dispositivo y se cuenta.
  {
    // Perfil completo: sin la ventana obligatoria de «Completa tu perfil» encima.
    const estado = {
      guardados: [],
      filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
      aceptaAnalitica: true,
      servicio: servicio(SERV, "Limpieza PS5", { like_count: 3 }),
      fotosServicio: [],
    };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await interaccion(ctx, estado);
    const p = await pagina(ctx, `/servicio/${SERV}`);
    await p.locator("#servicio-me-gusta").waitFor({ timeout: 30000 }).catch(() => {});
    const antes = (await p.locator("#servicio-me-gusta").innerText().catch(() => "")).trim();
    const encima = await p.evaluate(() => {
      const r = document.getElementById("servicio-me-gusta")?.getBoundingClientRect();
      if (!r) return "sin corazón";
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (el?.closest("#servicio-me-gusta")) return "el corazón";
      const cadena = [];
      for (let n = el; n && cadena.length < 6; n = n.parentElement) cadena.push(`${n.tagName}${n.id ? "#" + n.id : ""}[${getComputedStyle(n).position},z${getComputedStyle(n).zIndex}]`);
      return `${cadena.join(" < ")} ${(el?.outerHTML ?? "").slice(0, 160)}`;
    });
    if (encima !== "el corazón") console.log(`MG (aviso): encima del corazón hay ${encima}`);
    await p.locator("#servicio-me-gusta").click().catch((e) => console.log(`MG (aviso): ${String(e.message).slice(0, 200)}`));
    await p.waitForTimeout(700);
    const despues = (await p.locator("#servicio-me-gusta").innerText().catch(() => "")).trim();
    const guardado = await p.evaluate(() => localStorage.getItem("videojuegoszaragoza:liked_services") ?? "");
    const pedido = (estado.interacciones ?? []).find((i) => i.accion === "apoyo_servicio");
    ok(/3$/.test(antes) && /4$/.test(despues) && pedido?.id === SERV && pedido?.activo === true, `MG: la ficha de servicio tiene «me gusta» y al tocarlo suma (${antes} → ${despues})`);
    ok(guardado.includes(SERV), "MG: y el dispositivo lo recuerda (para la pestaña «Me gusta»)");
    ok((estado.eventosEnviados ?? []).some((e) => e.step_label === "Servicio: me gusta"), "MG: y se cuenta en la analítica");
    ok(p.errores.length === 0, `MG: ficha sin errores de JavaScript (${p.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }

  // MG2) Sin la migración (no existe services.like_count): la ficha sale igual, sin corazón.
  {
    const estado = { guardados: [], filas: [], servicio: servicio(SERV, "Limpieza PS5"), fotosServicio: [], servicioSinMeGusta: true };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, `/servicio/${SERV}`);
    await p.locator("#servicio-contratar").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.locator("#servicio-contratar").count()) === 1 && (await p.locator("#servicio-me-gusta").count()) === 0, "MG: sin la migración la ficha funciona y no enseña el corazón");
    await ctx.close();
  }

  // MG3) Perfil → «Me gusta»: los de la cuenta (servidor) primero y luego los de este dispositivo, con la tarjeta del
  // Catálogo; tocar uno abre su ficha. Tres pestañas que caben en 360 px.
  {
    const estado = {
      guardados: [],
      filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }],
      aceptaAnalitica: true,
      megusta: {
        productos: [producto(PROD_LOCAL, "Mando DualSense", 59), producto(PROD_CUENTA, "Juego Forza Horizon", 9)],
        servicios: [servicio(SERV, "Limpieza PS5"), servicio(SERV2, "Cambio de joysticks")],
      },
      cuentaProductos: [PROD_CUENTA],
      cuentaServicios: [SERV2],
    };
    const ctx = await contexto(navegador, CLIENTE, "user", estado, { viewport: { width: 360, height: 780 } });
    await interaccion(ctx, estado);
    await conMeGusta(ctx, [PROD_LOCAL], [SERV]);
    const p = await pagina(ctx, "/perfil");
    await p.locator("#perfil-pestanas").waitFor({ timeout: 30000 }).catch(() => {});
    const pestanas = await p.evaluate(() =>
      [...document.querySelectorAll('#perfil-pestanas [role="tab"]')].map((t) => {
        const r = t.getBoundingClientRect();
        return { texto: t.innerText.trim(), x: Math.round(r.x), fin: Math.round(r.x + r.width) };
      })
    );
    ok(pestanas.map((t) => t.texto).join("|") === "Mi cuenta|Mis seguimientos|Me gusta" && pestanas.every((t) => t.x >= 0 && t.fin <= 360), `MG: tres pestañas en Perfil y caben en 360 px (${pestanas.map((t) => `${t.texto}@${t.x}-${t.fin}`).join(", ")})`);
    await p.locator("#perfil-pestanas").getByText("Me gusta", { exact: true }).click();
    await p.locator("#perfil-me-gusta-productos").waitFor({ timeout: 15000 }).catch(() => {});
    const orden = async (id) => p.evaluate((s) => [...document.querySelectorAll(`#${s} [role="link"]`)].map((a) => a.getAttribute("aria-label") ?? ""), id);
    const prods = await orden("perfil-me-gusta-productos");
    const servs = await orden("perfil-me-gusta-servicios");
    ok(prods.length === 2 && /^Juego Forza Horizon/.test(prods[0]) && /^Mando DualSense/.test(prods[1]), `MG: productos: primero el de la cuenta y luego el del dispositivo (${prods.join(" | ")})`);
    ok(servs.length === 2 && /^Cambio de joysticks/.test(servs[0]) && /^Limpieza PS5/.test(servs[1]), `MG: servicios igual (${servs.join(" | ")})`);
    const tarjeta = await p.evaluate(() => {
      const t = document.querySelector('#perfil-me-gusta-productos [role="link"]');
      const cs = t ? getComputedStyle(t) : null;
      return cs ? { radio: cs.borderRadius, fondo: cs.backgroundColor, borde: cs.borderTopWidth } : null;
    });
    ok(tarjeta?.radio === "16px" && tarjeta?.fondo === "rgb(246, 250, 253)" && tarjeta?.borde === "0px", `MG: con la tarjeta del Catálogo (sin borde, fondo suave) (${JSON.stringify(tarjeta)})`);
    ok((estado.interacciones ?? []).some((i) => i.accion === "mis_me_gusta"), "MG: pide al servidor los «me gusta» de la cuenta");
    ok((estado.eventosEnviados ?? []).some((e) => e.step_label === "Perfil: Me gusta"), "MG: abrir la pestaña se cuenta en la analítica");
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= 360, `MG: nada se sale por los lados a 360 px (${ancho})`);
    await capturar(p, "MG1-perfil-me-gusta");
    await p.locator('#perfil-me-gusta-servicios [role="link"]').first().click();
    await p.waitForURL(new RegExp(`/servicio/${SERV2}`), { timeout: 15000 }).catch(() => {});
    ok(p.url().includes(`/servicio/${SERV2}`), "MG: tocar un servicio abre su ficha");
    ok(p.errores.length === 0, `MG: Perfil sin errores de JavaScript (${p.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }

  // MG4) Sin ningún «me gusta»: lo explica y lleva al catálogo.
  {
    const estado = { guardados: [], filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }], megusta: { productos: [], servicios: [] } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    await interaccion(ctx, estado);
    const p = await pagina(ctx, "/perfil?tab=megusta");
    await p.getByText(/Aún no tienes «me gusta»/).waitFor({ timeout: 20000 }).catch(() => {});
    ok((await p.getByText(/Aún no tienes «me gusta»/).count()) === 1 && (await p.getByText("Ver el catálogo").count()) === 1, "MG: sin «me gusta», lo explica y ofrece ver el catálogo (?tab=megusta abre la pestaña)");
    await ctx.close();
  }

  // MG5) La lista de Servicios con la misma tarjeta que el Catálogo: 2 columnas en el móvil, sin descripción ni «Ver
  // servicio →».
  {
    const estado = { guardados: [], filas: [], megusta: { productos: [], servicios: [servicio(SERV, "Limpieza PS5"), servicio(SERV2, "Cambio de joysticks"), servicio(SERV3, "Reparación HDMI")] } };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/servicios");
    await p.locator("#servicios-lista").waitFor({ timeout: 30000 }).catch(() => {});
    const tarjetas = await p.evaluate(() =>
      [...document.querySelectorAll('[role="link"]')]
        .filter((a) => /€/.test(a.getAttribute("aria-label") ?? ""))
        .map((a) => {
          const r = a.getBoundingClientRect();
          const cs = getComputedStyle(a);
          return { y: Math.round(r.y), x: Math.round(r.x), radio: cs.borderRadius, fondo: cs.backgroundColor, borde: cs.borderTopWidth };
        })
    );
    const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
    ok(tarjetas.length === 3 && tarjetas[0].y === tarjetas[1].y && tarjetas[2].y > tarjetas[0].y, `MG: Servicios en 2 columnas en el móvil (${tarjetas.map((c) => `${c.x},${c.y}`).join(" | ")})`);
    ok(tarjetas.every((c) => c.radio === "16px" && c.fondo === "rgb(246, 250, 253)" && c.borde === "0px"), `MG: con la tarjeta del Catálogo (${JSON.stringify(tarjetas[0])})`);
    ok(!/Ver servicio →|Descripción de Limpieza PS5/.test(t), "MG: sin descripción ni «Ver servicio →» de adorno");
    await capturar(p, "MG2-servicios-tarjetas");
    ok(p.errores.length === 0, `MG: Servicios sin errores de JavaScript (${p.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }

  // MG6) Administración: «me gusta» de cada servicio y uso en Analítica.
  {
    const estado = {
      guardados: [],
      filas: [],
      serviciosAdmin: [{ id: SERV, title: "Limpieza PS5", description: "", price_eur: 45, status: "PUBLISHED", is_active: true, view_count: 12, like_count: 3, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }],
      serviciosMedia: [],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Perfil: Me gusta", sessions: 5 },
        { step_label: "Servicio: me gusta", sessions: 2 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/services");
    await p.getByText("Limpieza PS5").first().waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.getByText(/12 visitas · 3 me gusta/).count()) === 1, "MG: Administración → Servicios enseña los «me gusta» de cada servicio");
    const q = await pagina(ctx, "/admin/analytics");
    await q.locator("#analitica-me-gusta").waitFor({ timeout: 40000 }).catch(() => {});
    const a = (await q.locator("#analitica-me-gusta").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/abren su pestaña de Perfil 5 sesiones · dan «me gusta» a un servicio 2/.test(a), `MG: Analítica cuenta la pestaña «Me gusta» y los «me gusta» a servicios (${a})`);
    ok(p.errores.length === 0 && q.errores.length === 0, `MG: Administración sin errores de JavaScript (${p.errores[0] ?? q.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }
}

// ===== RS) Reseñas de los servicios terminados (dueño, 2026-11-03): «Mis seguimientos» pide valorar el servicio
// entregado (una vez), la ficha del servicio enseña la media y las opiniones, y Administración las ve =================
async function seccionRS() {
  const SERV = "5e000000-0000-4000-8000-0000000000d1";
  const SR1 = "5f000000-0000-4000-8000-0000000000d1";
  const SR2 = "5f000000-0000-4000-8000-0000000000d2";
  const perfil = [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02" }];
  const solicitud = (id, seguimiento, extra = {}) => ({
    id, created_at: "2026-10-20T10:00:00Z", service_id: SERV, service_title: "Limpieza PS5", nombre: "Ana", apellido: "G", metodo_contacto: null,
    contacto: "Chat de la tienda", ciudad: "Zaragoza", direccion: null, disponibilidad: null, comentario: null, status: "contactado",
    seguimiento, seguimiento_nota: null, seguimiento_actualizado: "2026-11-02T10:00:00Z", customer_user_id: CLIENTE.id, codigo_seguimiento: null, ...extra,
  });

  // RS1) «Mis seguimientos»: el entregado pide valoración (el otro no); se publica unida a su solicitud y se ve.
  {
    const estado = { guardados: [], filas: perfil, aceptaAnalitica: true, serviciosFicha: [solicitud(SR1, "entregado"), solicitud(SR2, "reparando")], resenasServicio: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil?tab=seguimientos");
    await p.locator(`#valorar-${SR1}`).waitFor({ timeout: 30000 }).catch(() => {});
    ok((await p.locator(`#valorar-${SR1}`).count()) === 1 && (await p.locator(`#valorar-${SR2}`).count()) === 0, "RS: «Mis seguimientos» pide valorar el servicio entregado (y no el que sigue en reparación)");
    await capturar(p, "RS1-valorar-servicio");
    await p.locator(`#valorar-${SR1}`).click();
    await p.getByText("¿Qué tal el servicio?").waitFor({ timeout: 10000 }).catch(() => {});
    const titulo = await p.locator("#resena-servicio-titulo").innerText().catch(() => "");
    ok(titulo.trim() === "Limpieza PS5", `RS: la ventana dice qué servicio se valora (${titulo.trim()})`);
    await p.getByText("Publicar", { exact: true }).click();
    await p.getByText("¡Gracias por tu reseña!").waitFor({ timeout: 10000 }).catch(() => {});
    const enviada = (estado.resenasEnviadas ?? [])[0];
    ok(enviada?.service_request_id === SR1 && enviada?.rating === 5 && !("service_id" in enviada), `RS: se publica unida a SU solicitud (el servicio lo pone la base de datos) (${JSON.stringify(enviada)})`);
    await p.keyboard.press("Escape").catch(() => {});
    await p.getByText("Cerrar", { exact: true }).click({ timeout: 3000 }).catch(() => {});
    await p.locator(`#valorado-${SR1}`).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await p.locator(`#valorado-${SR1}`).innerText().catch(() => "")).includes("★★★★★") && (await p.locator(`#valorar-${SR1}`).count()) === 0, "RS: y en su lugar sale «Tu valoración: ★★★★★» (no se puede valorar dos veces)");
    const etiquetas = (estado.eventosEnviados ?? []).map((e) => e.step_label);
    ok(etiquetas.includes("Seguimientos: valorar el servicio") && etiquetas.includes("Reseña de servicio publicada"), `RS: se cuenta en la analítica (${etiquetas.filter((e) => /valorar|Reseña/.test(e)).join(", ")})`);
    ok(p.errores.length === 0, `RS: sin errores de JavaScript (${p.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }

  // RS2) Sin la migración: «Mis seguimientos» funciona igual y no ofrece valorar.
  {
    const estado = { guardados: [], filas: perfil, serviciosFicha: [solicitud(SR1, "entregado")], resenasSinColumnas: true, resenasServicio: [] };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, "/perfil?tab=seguimientos");
    await p.getByText("Reparaciones y Mantenimientos").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(600);
    ok((await p.getByText(/Limpieza PS5/).count()) >= 1 && (await p.locator(`#valorar-${SR1}`).count()) === 0, "RS: sin la migración, «Mis seguimientos» sale igual y sin el botón de valorar");
    await ctx.close();
  }

  // RS3) La ficha del servicio enseña la media junto al precio y las opiniones; sin reseñas, nada.
  {
    const resenas = [
      { id: "r1", created_at: "2026-11-02T10:00:00Z", user_id: CLIENTE.id, display_name: "Ana García", rating: 5, comment: "Mi PS5 ya no hace ruido.", service_id: SERV, service_request_id: SR1 },
      { id: "r2", created_at: "2026-11-01T10:00:00Z", user_id: "otro", display_name: "Luis", rating: 4, comment: "Rápidos y amables.", service_id: SERV, service_request_id: SR2 },
      { id: "r3", created_at: "2026-11-01T09:00:00Z", user_id: "otro2", display_name: "Marta", rating: 1, comment: "Reseña de la tienda", service_id: null, service_request_id: null },
    ];
    const estado = { guardados: [], filas: perfil, servicio: { id: SERV, title: "Limpieza PS5", description: "Limpieza a fondo.", price_eur: 45 }, fotosServicio: [], resenasServicio: resenas };
    const ctx = await contexto(navegador, CLIENTE, "user", estado);
    const p = await pagina(ctx, `/servicio/${SERV}`);
    await p.locator("#servicio-resenas").waitFor({ timeout: 30000 }).catch(() => {});
    const media = (await p.locator("#servicio-valoracion").innerText().catch(() => "")).replace(/\n/g, " ");
    const lista = (await p.locator("#servicio-resenas").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/★ 4,5 · 2 reseñas de clientes/.test(media), `RS: la ficha enseña la media y cuántas reseñas tiene (${media})`);
    ok(/Ana García/.test(lista) && /Mi PS5 ya no hace ruido/.test(lista) && /Rápidos y amables/.test(lista) && !/Reseña de la tienda/.test(lista), "RS: y las opiniones de ESE servicio (no las de la tienda)");
    await p.locator("#servicio-resenas").scrollIntoViewIfNeeded().catch(() => {});
    await capturar(p, "RS2-ficha-resenas");
    ok(p.errores.length === 0, `RS: ficha sin errores de JavaScript (${p.errores[0] ?? "ninguno"})`);
    await ctx.close();
    const estado2 = { ...estado, resenasServicio: [] };
    const ctx2 = await contexto(navegador, CLIENTE, "user", estado2);
    const q = await pagina(ctx2, `/servicio/${SERV}`);
    await q.locator("#servicio-contratar").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await q.locator("#servicio-resenas").count()) === 0 && (await q.locator("#servicio-valoracion").count()) === 0, "RS: sin reseñas no sale ni la media ni el bloque");
    await ctx2.close();
  }

  // RS4) Administración: la media de cada servicio y la valoración de cada solicitud; Analítica lo cuenta.
  {
    const estado = {
      guardados: [],
      filas: [],
      serviciosAdmin: [{ id: SERV, title: "Limpieza PS5", description: "", price_eur: 45, status: "PUBLISHED", is_active: true, view_count: 12, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }],
      serviciosMedia: [],
      serviciosFicha: [solicitud(SR1, "entregado"), solicitud(SR2, "entregado", { nombre: "Luis" })],
      resenasServicio: [
        { id: "r1", created_at: "2026-11-02T10:00:00Z", user_id: CLIENTE.id, display_name: "Ana", rating: 5, comment: "Genial", service_id: SERV, service_request_id: SR1 },
        { id: "r2", created_at: "2026-11-01T10:00:00Z", user_id: "otro", display_name: "Luis", rating: 4, comment: "", service_id: SERV, service_request_id: SR2 },
      ],
      embudo: [
        { step_label: "Inicio", sessions: 10 },
        { step_label: "Seguimientos: valorar el servicio", sessions: 2 },
        { step_label: "Reseña de servicio publicada", sessions: 1 },
      ],
    };
    const ctx = await contexto(navegador, ADMIN, "admin", estado);
    const p = await pagina(ctx, "/admin/services");
    await p.getByText("Limpieza PS5").first().waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(500);
    ok((await p.getByText(/★ 4,5 \(2\)/).count()) === 1, "RS: Administración → Servicios enseña la media de cada servicio");
    await p.getByText("Solicitudes", { exact: true }).first().click();
    await p.locator(`#solicitud-resena-${SR1}`).waitFor({ timeout: 15000 }).catch(() => {});
    const r1 = (await p.locator(`#solicitud-resena-${SR1}`).innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/Valoración del cliente: ★★★★★ «Genial»/.test(r1), `RS: y en cada solicitud, la valoración de su cliente (${r1})`);
    const q = await pagina(ctx, "/admin/analytics");
    await q.locator("#analitica-ficha-servicio").waitFor({ timeout: 40000 }).catch(() => {});
    const a = (await q.locator("#analitica-ficha-servicio").innerText().catch(() => "")).replace(/\n/g, " ");
    ok(/«Valorar el servicio» 2 · reseñas publicadas 1/.test(a), `RS: Analítica cuenta quién pulsa «Valorar el servicio» y las reseñas publicadas (${a})`);
    ok(p.errores.length === 0 && q.errores.length === 0, `RS: Administración sin errores de JavaScript (${p.errores[0] ?? q.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }
}

// ===== VP) Ventanas del panel (dueño, 2026-11-04): la X para cerrar abajo a la derecha, a la altura del botón principal
// (en vez de arriba o de «Cancelar»), iconos sin burbuja alrededor y títulos y datos enteros en las listas ==============
async function seccionVP() {
  const SERV = "5e000000-0000-4000-8000-0000000000e1";
  const LARGO = "Mantenimiento Consola Playstation 5 con limpieza a fondo y cambio de pasta térmica";
  const perfilAdmin = [{ user_id: ADMIN.id, nombre: "Dani", usuario: "dani_vz", pais: "España", provincia: "Zaragoza", fecha_nacimiento: "1990-01-01" }];
  const estadoBase = () => ({
    guardados: [],
    filas: perfilAdmin,
    serviciosAdmin: [{ id: SERV, title: LARGO, description: "", price_eur: 45, status: "PUBLISHED", is_active: true, view_count: 13, like_count: 2, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" }],
    serviciosMedia: [],
    // Productos y categorías ficticios (sin ellos, la pantalla de Productos iría a la base de datos real).
    categorias: [],
    productosAdmin: [
      {
        id: "p0000000-0000-4000-8000-0000000000e1", title: "Mando DualSense", description: "Revisado.", price_eur: 49.9, status: "PUBLISHED", is_active: true,
        category_id: null, images: [], condition: "USED", reference: null, is_featured_home: false, created_at: "2026-10-30T10:00:00Z", updated_at: "2026-10-30T10:00:00Z",
      },
    ],
  });
  const rect = (p, sel) =>
    p.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fondo: cs.backgroundColor, borde: cs.borderTopWidth };
    }, sel);
  // El botón que lleva ese texto: se sube desde el texto hasta el último contenedor que solo dice eso.
  const botonConTexto = (p, texto) =>
    p.evaluate((t) => {
      let el = [...document.querySelectorAll("div")].find((d) => d.childElementCount === 0 && d.innerText.trim() === t);
      while (el?.parentElement && el.parentElement.innerText.trim() === t) el = el.parentElement;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }, texto);
  const sinBurbuja = (c) => !!c && (c.fondo === "rgba(0, 0, 0, 0)" || c.fondo === "transparent") && c.borde === "0px";
  const misma = (a, b) => !!a && !!b && Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= 6 && b.x >= a.x + a.w;

  for (const [nombre, vista] of [
    ["móvil", {}],
    ["ordenador", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }],
  ]) {
    const estado = estadoBase();
    const ctx = await contexto(navegador, ADMIN, "admin", estado, vista);
    const p = await pagina(ctx, "/admin/services");
    await p.locator(`#servicio-fila-${SERV}`).waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(400);

    // VP1) Título y datos enteros, sin «…».
    const fila = await p.evaluate((id) => {
      const textos = [...(document.getElementById(id)?.children ?? [])];
      return textos.map((t) => ({ texto: t.innerText.replace(/\n/g, " "), nowrap: getComputedStyle(t).whiteSpace === "nowrap", corta: t.scrollWidth > t.clientWidth + 1 }));
    }, `servicio-fila-${SERV}`);
    ok(fila.length === 2 && fila[0].texto === LARGO && /13 visitas · 2 me gusta/.test(fila[1].texto) && fila.every((f) => !f.nowrap && !f.corta), `VP (${nombre}): el título y los datos del servicio se leen enteros (${JSON.stringify(fila.map((f) => ({ nowrap: f.nowrap, corta: f.corta })))})`);

    // VP2) Editar y borrar: solo el icono, sin burbuja.
    const editar = await rect(p, `[aria-label="Editar ${LARGO}"]`);
    const borrar = await rect(p, `[aria-label="Borrar ${LARGO}"]`);
    ok(sinBurbuja(editar) && sinBurbuja(borrar) && editar.w >= 44 && editar.h >= 44, `VP (${nombre}): editar y borrar son solo el icono, sin burbuja, y de 44 px para el dedo (${JSON.stringify([editar, borrar])})`);
    await capturar(p, `VP1-servicios-${nombre === "móvil" ? "movil" : "ordenador"}`);

    // VP3) «Nuevo servicio»: la X abajo, a la derecha de «Crear servicio» (y ninguna arriba).
    await p.locator("#servicio-nuevo").click();
    await p.locator("#servicio-ventana-pie").waitFor({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(600); // la ventana aparece con un fundido
    const crear = await botonConTexto(p, "Crear servicio");
    const cerrar = await rect(p, '[aria-label="Cerrar"]');
    const titulo = await p.evaluate(() => {
      const t = [...document.querySelectorAll("div")].find((d) => d.childElementCount === 0 && d.innerText.trim() === "Nuevo servicio");
      return t ? Math.round(t.getBoundingClientRect().y) : -1;
    });
    ok(misma(crear, cerrar) && cerrar.y > titulo, `VP (${nombre}): la X va abajo, a la derecha y a la altura de «Crear servicio» (${JSON.stringify({ crear, cerrar, titulo })})`);
    ok(sinBurbuja(cerrar) && (await p.locator('[aria-label="Cerrar"]').count()) === 1, `VP (${nombre}): una sola X, sin burbuja`);
    await capturar(p, `VP2-nuevo-servicio-${nombre === "móvil" ? "movil" : "ordenador"}`);
    await p.locator('[aria-label="Cerrar"]').click();
    await p.waitForTimeout(400);
    ok((await p.getByText("Nuevo servicio", { exact: true }).count()) === 0, `VP (${nombre}): la X cierra la ventana`);

    // VP4) Confirmar el borrado: «Borrar» con la X a su derecha, sin «Cancelar».
    await p.locator(`[aria-label="Borrar ${LARGO}"]`).click();
    await p.getByText("¿Borrar este servicio?").waitFor({ timeout: 10000 }).catch(() => {});
    const borrarBoton = await botonConTexto(p, "Borrar");
    const cerrar2 = await rect(p, '[aria-label="Cerrar"]');
    ok(misma(borrarBoton, cerrar2) && (await p.getByText("Cancelar", { exact: true }).count()) === 0, `VP (${nombre}): al confirmar el borrado, «Borrar» y la X a su derecha, sin «Cancelar»`);
    await p.locator('[aria-label="Cerrar"]').click();
    await p.waitForTimeout(400);
    ok((await p.getByText("¿Borrar este servicio?").count()) === 0 && (await p.locator(`#servicio-fila-${SERV}`).count()) === 1, `VP (${nombre}): la X cierra sin borrar nada (el servicio sigue en la lista)`);

    // VP5) Productos: lo mismo con «Crear producto».
    const q = await pagina(ctx, "/admin/products");
    await q.locator('[aria-label="Nuevo producto"]').waitFor({ timeout: 30000 }).catch(() => {});
    await q.locator('[aria-label="Nuevo producto"]').click();
    await q.locator("#producto-ventana-pie").waitFor({ timeout: 10000 }).catch(() => {});
    const crearP = await botonConTexto(q, "Crear producto");
    const cerrarP = await rect(q, '[aria-label="Cerrar"]');
    ok(misma(crearP, cerrarP) && sinBurbuja(cerrarP), `VP (${nombre}): en Productos, la X a la derecha de «Crear producto», sin burbuja (${JSON.stringify({ crearP, cerrarP })})`);
    await capturar(q, `VP3-nuevo-producto-${nombre === "móvil" ? "movil" : "ordenador"}`);
    await q.locator('[aria-label="Cerrar"]').click();
    await q.waitForTimeout(400);
    ok((await q.locator("#producto-ventana-pie").count()) === 0, `VP (${nombre}): y la X la cierra`);
    ok(p.errores.length === 0 && q.errores.length === 0, `VP (${nombre}): sin errores de JavaScript (${p.errores[0] ?? q.errores[0] ?? "ninguno"})`);
    await ctx.close();
  }
}

// ===== VA) Ficha de clientes para VeoAura (dueño, 2026-11-03): Administración → Escaparate cuenta las fichas de
// cliente (nombre, correo y teléfono de pedidos entregados) enviadas y por enviar, sin mezclarlas con las ventas sin
// confirmar; Pedidos avisa de que «Entregado» las manda =============================================================
async function seccionVA() {
  const salida = (n, evento, estado) => ({
    id: `0e000000-0000-4000-8000-00000000000${n}`, creado_en: `2026-11-03T1${n}:00:00Z`, evento, id_veoaura: "0a000000-0000-4000-8000-000000000001",
    pedido_id: `0b000000-0000-4000-8000-00000000000${n}`, estado, intentos: estado === "enviado" ? 1 : 0, enviado_en: estado === "enviado" ? `2026-11-03T1${n}:05:00Z` : null, detalle: null,
  });
  const estado = {
    guardados: [],
    filas: [],
    salidas: [salida(1, "pedido", "pendiente"), salida(2, "pedido_pagado", "enviado"), salida(3, "pedido_pagado", "pendiente"), salida(4, "pedido", "enviado")],
    articulosVeo: [{ id: "0c000000-0000-4000-8000-000000000001", id_veoaura: "0a000000-0000-4000-8000-000000000001", title: "PS5 Slim", price_eur: 399, is_active: true, vendido_en: null, retirado_en: null, view_count: 5, like_count: 1 }],
  };
  const ctx = await contexto(navegador, ADMIN, "admin", estado);
  const p = await pagina(ctx, "/admin/escaparate");
  await p.locator("#escaparate-fichas-clientes").waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  const fichas = (await p.locator("#escaparate-fichas-clientes").innerText().catch(() => "")).replace(/\n/g, " ");
  ok(/Fichas de cliente enviadas a VeoAura: 1 · por enviar: 1 · solo de pedidos entregados \(nombre, correo y teléfono\)/.test(fichas), `VA: Escaparate cuenta las fichas de cliente enviadas y por enviar (${fichas})`);
  const t = (await p.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
  ok(/1 ventas sin confirmar a VeoAura/.test(t), "VA: las fichas por enviar no cuentan como «ventas sin confirmar» (solo 1, la del pedido)");
  ok((t.match(/Pedido entregado · ficha del cliente \(nombre, correo y teléfono\)/g) ?? []).length === 2, "VA: cada aviso de ficha de cliente se ve con su nombre en la lista");
  await capturar(p, "VA1-escaparate-fichas");
  ok(p.errores.length === 0, `VA: Escaparate sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  const q = await pagina(ctx, "/admin/pedidos");
  await q.locator("#pedidos-veoaura-cliente").waitFor({ timeout: 30000 }).catch(() => {});
  const aviso = (await q.locator("#pedidos-veoaura-cliente").innerText().catch(() => "")).replace(/\n/g, " ");
  ok(/Al marcar «Entregado» un pedido con artículos de VeoAura, se envían a VeoAura el nombre, el correo y el teléfono del cliente \(nunca su dirección\)/.test(aviso), `VA: Pedidos avisa de qué se manda al marcar «Entregado» (${aviso.slice(0, 80)})`);
  ok(q.errores.length === 0, `VA: Pedidos sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);
  await ctx.close();
}

// ===== Q) Administración → Chat: asignar el seguimiento al cliente de la conversación e invitar a registrarse ========
async function seccionQ() {
  const PRODUCTO = "b7c1d2e3-0000-4000-8000-0000000000bb";
  const CHAT_PRODUCTO = "c0000000-0000-4000-8000-000000000001";
  const CHAT_GENERAL = "c0000000-0000-4000-8000-000000000002";
  const CHAT_VENTA = "c0000000-0000-4000-8000-000000000003";
  const ahora = new Date().toISOString();
  const chat = (id, extra, vista) => ({
    id, product_id: null, sell_request_id: null, customer_user_id: CLIENTE.id, last_message_at: ahora, last_message_preview: vista,
    customer_last_read_at: ahora, admin_last_read_at: ahora, ...extra,
  });
  const estado = {
    usuarios: [],
    filas: [],
    guardados: [],
    producto: { id: PRODUCTO, title: "Nintendo Switch OLED", images: [], price_eur: 249.99, status: "PUBLISHED", is_active: true },
    fotosProducto: [],
    chats: [
      chat(CHAT_PRODUCTO, { product_id: PRODUCTO }, "¿Sigue disponible la Switch?"),
      chat(CHAT_GENERAL, {}, "Tengo un mando que no carga"),
      chat(CHAT_VENTA, { sell_request_id: "d0000000-0000-4000-8000-000000000001" }, "Os vendo mi PS4"),
    ],
    mensajesChat: [
      { id: "mq1", created_at: ahora, chat_id: CHAT_PRODUCTO, sender_user_id: CLIENTE.id, sender_role: "customer", sender_name: "Ana", body: "¿Sigue disponible la Switch?" },
      { id: "mq2", created_at: ahora, chat_id: CHAT_GENERAL, sender_user_id: CLIENTE.id, sender_role: "customer", sender_name: "Ana", body: "Tengo un mando que no carga" },
      { id: "mq3", created_at: ahora, chat_id: CHAT_VENTA, sender_user_id: CLIENTE.id, sender_role: "customer", sender_name: "Ana", body: "Os vendo mi PS4" },
    ],
    asignar: (cuerpo) =>
      cuerpo.tipo === "pedido"
        ? { cuerpo: { ok: true, tipo: "pedido", titulo: cuerpo.titulo, codigo_seguimiento: "VZ-AB2C-D3EF", numero_pedido: 31 } }
        : cuerpo.titulo === "Falla"
          ? { status: 503, cuerpo: { ok: false, error: "falta activar los números de seguimiento" } }
          : { cuerpo: { ok: true, tipo: "reparacion", titulo: cuerpo.titulo, codigo_seguimiento: "VZ-7K3M-9QPD" } },
  };
  const ctx = await contexto(navegador, ADMIN, "admin", estado);
  const p = await pagina(ctx, "/admin/chats");
  await p.getByText("¿Te escriben por WhatsApp o Instagram?").waitFor({ timeout: 30000 }).catch(() => {});
  const copiar = p.getByRole("button", { name: "Copiar la invitación a registrarse" });
  const whatsapp = p.getByRole("button", { name: "Enviar la invitación por WhatsApp" });
  const altos = [await copiar.boundingBox(), await whatsapp.boundingBox()].map((b) => Math.round(b?.height ?? 0));
  ok((await copiar.count()) === 1 && (await whatsapp.count()) === 1 && altos.every((h) => h >= 44), `Q: arriba de la lista, la invitación a registrarse para WhatsApp o Instagram (copiar o enviar; ${altos.join(", ")} px)`);
  await capturar(p, "Q1-chats-invitacion");

  // Conversación de un artículo: pedido, con el título y el precio del artículo ya puestos.
  await p.getByText("¿Sigue disponible la Switch?").first().click();
  const boton = p.getByRole("button", { name: "Asignar seguimiento a este cliente" });
  await boton.waitFor({ timeout: 15000 }).catch(() => {});
  ok((await boton.count()) === 1, "Q: en la conversación sale «Asignar seguimiento a este cliente»");
  await boton.click();
  const titulo = p.getByLabel("Título del seguimiento");
  ok((await titulo.inputValue().catch(() => "")) === "Nintendo Switch OLED" && (await p.getByLabel("Importe del pedido").inputValue().catch(() => "")) === "249,99", "Q: en la de un artículo se propone un pedido con su título y su precio");
  await capturar(p, "Q2-asignar-pedido");
  await p.getByRole("button", { name: "Asignar y avisar al cliente" }).click();
  await p.getByText(/Asignado ✓ Nº VZ-AB2C-D3EF/).waitFor({ timeout: 10000 }).catch(() => {});
  const a1 = (estado.asignaciones ?? [])[0];
  ok(!!a1 && a1.cuerpo.chat_id === CHAT_PRODUCTO && a1.cuerpo.tipo === "pedido" && a1.cuerpo.etapa === "confirmado" && a1.cuerpo.total_eur === 249.99 && a1.cuerpo.entrega === "envio" && /^Bearer .+/.test(a1.auth) && !("customer_user_id" in a1.cuerpo), `Q: manda la conversación (no el cliente), el pedido confirmado, el importe y la sesión del administrador (${JSON.stringify(a1?.cuerpo ?? null)})`);
  const m1 = (estado.mensajesChatEnviados ?? [])[0];
  ok(!!m1 && m1.chat_id === CHAT_PRODUCTO && /pedido nº 31/.test(m1.body) && /VZ-AB2C-D3EF/.test(m1.body) && /Mis seguimientos/.test(m1.body), `Q: y le avisa en el chat con el número (${m1?.body?.slice(0, 90)})`);
  ok((await p.getByText(/Asignado ✓ Nº VZ-AB2C-D3EF\. El cliente ya lo ve en «Mis seguimientos» y se lo hemos dicho en el chat\./).count()) === 1, "Q: y confirma que el cliente ya lo ve");

  // Consulta general: reparación; sin título no se puede; con un error se explica.
  await p.getByRole("button", { name: "Volver a las conversaciones" }).click();
  await p.getByText("Tengo un mando que no carga").first().click();
  await p.getByRole("button", { name: "Asignar seguimiento a este cliente" }).click();
  const asignarBoton = p.getByRole("button", { name: "Asignar y avisar al cliente" });
  ok((await p.getByLabel("Título del seguimiento").inputValue().catch(() => "x")) === "" && (await asignarBoton.getAttribute("aria-disabled")) === "true", "Q: en una consulta general se propone una reparación y sin título no se puede asignar");
  await p.getByLabel("Título del seguimiento").fill("Falla");
  await asignarBoton.click();
  await p.getByText("Falta activar los números de seguimiento en la base de datos.").waitFor({ timeout: 10000 }).catch(() => {});
  ok((await p.getByText("Falta activar los números de seguimiento en la base de datos.").count()) === 1 && (estado.mensajesChatEnviados ?? []).length === 1, "Q: si no se puede, se explica y no se avisa al cliente de nada");
  await p.getByLabel("Título del seguimiento").fill("Reparación de mando PS5");
  await p.getByRole("button", { name: "En reparación" }).click();
  await p.getByLabel("Nota para el cliente").fill("Cambiamos el joystick");
  await asignarBoton.click();
  await p.getByText(/Asignado ✓ Nº VZ-7K3M-9QPD/).waitFor({ timeout: 10000 }).catch(() => {});
  const a3 = (estado.asignaciones ?? []).at(-1);
  const m3 = (estado.mensajesChatEnviados ?? []).at(-1);
  ok(a3?.cuerpo.tipo === "reparacion" && a3?.cuerpo.etapa === "reparando" && a3?.cuerpo.nota === "Cambiamos el joystick" && /«Reparación de mando PS5»/.test(m3?.body ?? "") && /VZ-7K3M-9QPD/.test(m3?.body ?? ""), `Q: la reparación se asigna con su etapa y su nota, y se avisa al cliente (${m3?.body?.slice(0, 80)})`);
  await capturar(p, "Q3-asignada-reparacion");

  // Venta de un cliente (nos vende él): sin seguimiento.
  await p.getByRole("button", { name: "Volver a las conversaciones" }).click();
  await p.getByText("Os vendo mi PS4").first().click();
  await p.waitForTimeout(800);
  ok((await p.getByRole("button", { name: "Asignar seguimiento a este cliente" }).count()) === 0, "Q: en una venta de un cliente (nos vende él) no se ofrece");
  ok(p.errores.length === 0, `Q: sin errores de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  const ancho = await p.evaluate(() => ({ a: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), p: window.innerWidth }));
  ok(ancho.a <= ancho.p + 1, `Q: la página no se ensancha (${ancho.a}/${ancho.p})`);
  await ctx.close();

  // Pedidos y Servicios cuentan lo asignado desde el chat.
  const estadoN = {
    usuarios: [],
    filas: [],
    guardados: [],
    numeros: {
      pedidos: [
        {
          id: "pq000000-0000-4000-8000-000000000031", numero: 31, created_at: ahora, estado: "confirmado", entrega: "envio", total_eur: 249.99,
          user_id: CLIENTE.id, codigo_seguimiento: "VZ-AB2C-D3EF", id_veoaura: null, vinculado_en: null, nota_admin: "Asignado desde el chat",
          nombre: "Ana", email: "ana@example.com", telefono: "sin teléfono", direccion: null, codigo_postal: null, ciudad: null, notas: null,
          pedido_items: [{ id: "itq", product_id: PRODUCTO, titulo: "Nintendo Switch OLED", precio_eur: 249.99 }],
        },
      ],
      reparaciones: [],
      items: [],
      intentos: [],
    },
  };
  const ctxN = await contexto(navegador, ADMIN, "admin", estadoN);
  const pp = await pagina(ctxN, "/admin/pedidos");
  await pp.locator("#pedidos-numeros").waitFor({ timeout: 30000 }).catch(() => {});
  const resumen = (await pp.locator("#pedidos-numeros").innerText().catch(() => "")).replace(/\n/g, " ");
  const tp = (await pp.evaluate(() => document.body.innerText)).replace(/\n/g, " ");
  ok(/asignados desde el chat: 1/.test(resumen) && /Asignado desde el chat: ya está en la cuenta del cliente/.test(tp), `Q: Pedidos cuenta y marca los asignados desde el chat (${resumen})`);

  // En todas las pantallas del panel, «Volver al panel» recibe el toque (en Chat, el título de la cabecera lo tapaba).
  const tapados = [];
  const pantallas = [
    ...["analytics", "aprendizajes", "auditorias", "blog", "chats", "conocimiento", "escaparate", "flash-news", "marca-seo", "pedidos", "policies", "redes-sociales", "users"].map((r) => [`/admin/${r}`, "Volver al panel"]),
    [`/admin/cliente/${CLIENTE.id}?email=cliente%40example.com`, "Volver a usuarios"],
  ];
  for (const [ruta, etiqueta] of pantallas) {
    const pa = await pagina(ctxN, ruta);
    await pa.locator(`[aria-label="${etiqueta}"]`).first().waitFor({ timeout: 30000 }).catch(() => {});
    const recibe = await pa.evaluate((et) => {
      const b = document.querySelector(`[aria-label="${et}"]`);
      if (!b) return "sin botón";
      const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return e && b.contains(e) ? "sí" : "tapado";
    }, etiqueta);
    if (recibe !== "sí") tapados.push(`${ruta}: ${recibe}`);
    await pa.close();
  }
  ok(tapados.length === 0, `Q: en las ${pantallas.length} pantallas del panel el botón de volver recibe el toque${tapados.length ? ` (falla en ${tapados.join(", ")})` : ""}`);
  await ctxN.close();
}

const navegador = await lanzarNavegador(ok);
try {
  if (SOLO === "N") await seccionN();
  if (SOLO === "P") await seccionP();
  if (SOLO === "Q") await seccionQ();
  if (SOLO === "R") await seccionR();
  if (SOLO === "S") await seccionS();
  if (SOLO === "T") await seccionT();
  if (SOLO === "V") await seccionV();
  if (SOLO === "W") await seccionW();
  if (SOLO === "X") await seccionX();
  if (SOLO === "Y") await seccionY();
  if (SOLO === "Z") await seccionZ();
  if (SOLO === "RE") await seccionRE();
  if (SOLO === "EN") await seccionEN();
  if (SOLO === "NO") await seccionNO();
  if (SOLO === "BU") await seccionBU();
  if (SOLO === "BF") await seccionBF();
  if (SOLO === "ME") await seccionME();
  if (SOLO === "CO") await seccionCO();
  if (SOLO === "DI") await seccionDI();
  if (SOLO === "SE") await seccionSE();
  if (SOLO === "BI") await seccionBI();
  if (SOLO === "QS") await seccionQS();
  if (SOLO === "HO") await seccionHO();
  if (SOLO === "AD") await seccionAD();
  if (SOLO === "SV") await seccionSV();
  if (SOLO === "VA") await seccionVA();
  if (SOLO === "FS") await seccionFS();
  if (SOLO === "MG") await seccionMG();
  if (SOLO === "RS") await seccionRS();
  if (SOLO === "VP") await seccionVP();
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
    ok(/Tu cuenta está activa/.test(await p.locator("#perfil-cabecera").innerText()) && t.includes(CLIENTE.email) && (await p.locator("#perfil-datos").getByText("Cerrar sesión", { exact: true }).count()) === 1, "A: la cuenta («Tu cuenta está activa» bajo «Mi perfil», el correo en su recuadro y «Cerrar sesión») va DENTRO de «Mi perfil»");
    ok((await p.getByText("SESIÓN ACTUAL").count()) === 0 && (await p.getByText("Tu cuenta está activa").count()) === 1, "A: y no hay otra tarjeta de la cuenta aparte");
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
      // La cabecera plegable aparte: tiene tres líneas («Mi perfil», «Tu cuenta está activa» y «@usuario · Completo»).
      const botones = Array.from(document.querySelectorAll('#perfil-datos [role="button"]:not(#perfil-cabecera)')).map((b) => Math.round(b.getBoundingClientRect().height));
      const cabecera = Math.round(document.getElementById("perfil-cabecera")?.getBoundingClientRect().height ?? 0);
      const nativos = Array.from(document.querySelectorAll("#perfil-datos select, #perfil-datos input[type=date]")).map((e) => Math.round(e.getBoundingClientRect().height));
      return { ancho: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), pantalla: window.innerWidth, caja: Math.round(caja.width), botones, cabecera, nativos };
    });
    ok(medidas.ancho <= medidas.pantalla + 1, `A: la página no se ensancha (${medidas.ancho}/${medidas.pantalla})`);
    ok(medidas.botones.length >= 3 && medidas.botones.every((h) => h >= 44), `A: los botones se tocan bien, de 44 px o más (${medidas.botones.join(", ")})`);
    ok(medidas.botones.filter((h) => h < 100).every((h) => h <= 64), `A: y son compactos (ninguno pasa de 64 px salvo la foto: ${medidas.botones.join(", ")})`);
    ok(medidas.cabecera >= 44 && medidas.cabecera <= 76, `A: la cabecera de «Mi perfil», con sus tres líneas, sigue compacta (${medidas.cabecera} px, de 44 a 76)`);
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
    ok((await p.getByText("SESIÓN ACTUAL").count()) === 0 && (await p.locator("#perfil-datos").getByText("Cerrar sesión", { exact: true }).count()) === 1, "C: plegada, la cuenta también queda dentro («Cerrar sesión» a mano, sin una tarjeta aparte)");
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
    // Como la base de datos real (con «*» vienen todas las columnas, también las vacías): la tienda sabe por la fila que
    // existe la columna de la foto.
    const estado = { filas: [{ user_id: CLIENTE.id, nombre: "Ana", usuario: "ana_g", pais: "España", provincia: "Huesca", fecha_nacimiento: "1990-05-02", foto_url: null }], guardados: [] };
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
    const c = await pagina(ctx, "/catalogo");
    await c.locator("#perfil-obligatorio").waitFor({ timeout: 30000 }).catch(() => {});
    ok((await c.locator("#perfil-obligatorio").count()) === 1, "G: también en el catálogo (en cualquier pantalla de la tienda)");
    await c.close();
    // En Inicio, donde Blue sí sale (desde 2026-11-04 solo en Inicio y en las fichas).
    const p = await pagina(ctx, "/");
    await p.locator("#perfil-obligatorio").waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(11500);
    ok((await p.locator("#perfil-obligatorio").count()) === 1 && (await p.locator("#blue-flotante").count()) === 0, "G: en Inicio, pasados 10 s, Blue no aparece encima");
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
  await seccionQ();
  await seccionR();
  await seccionS();
  await seccionT();
  await seccionV();
  await seccionW();
  await seccionX();
  await seccionY();
  await seccionZ();
  await seccionRE();
  await seccionEN();
  await seccionNO();
  await seccionBU();
  await seccionBF();
  await seccionME();
  await seccionCO();
  await seccionDI();
  await seccionSE();
  await seccionBI();
  await seccionQS();
  await seccionHO();
  await seccionAD();
  await seccionSV();
  await seccionVA();
  await seccionFS();
  await seccionMG();
  await seccionRS();
  await seccionVP();
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
