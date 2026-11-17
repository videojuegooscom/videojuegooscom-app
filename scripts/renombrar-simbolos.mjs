/**
 * Archivo: scripts/renombrar-simbolos.mjs
 * Función: herramienta de línea de órdenes para renombrar símbolos (funciones, componentes, tipos, constantes y
 *          variables) con el motor de TypeScript, nunca con buscar y reemplazar.
 * Para qué sirve: cambia el nombre de un símbolo y TODOS sus usos reales a la vez (también los import y export de
 *          otros archivos), como el «rename» de un editor. Es la herramienta de la tanda 3 de «ordenar el proyecto».
 * Conectado con: el paquete typescript (ts.createLanguageService y findRenameLocations) y tsconfig.json (qué archivos
 *          forman el proyecto).
 * Utilizado por: la persona que mantiene el proyecto, a mano (node scripts/renombrar-simbolos.mjs …). No lo usa la app.
 * Dependencias: typescript (ya instalado como dependencia de desarrollo), node:fs y node:path.
 * Estado: ACTIVO
 *
 * Uso:
 *   node scripts/renombrar-simbolos.mjs <lista.json> [--probar]
 *
 *   <lista.json> es un archivo con una lista de cambios:
 *     [
 *       { "archivo": "components/ImagenInteligente.tsx", "antes": "SmartImage", "despues": "ImagenInteligente" },
 *       { "archivo": "lib/envio.ts", "antes": "fmt", "despues": "formatearEuros", "linea": 120 }
 *     ]
 *   - «archivo»: donde se DECLARA el símbolo (ruta relativa a la raíz del proyecto).
 *   - «linea» (opcional): la línea de la declaración, si en ese archivo hay varias declaraciones con el mismo nombre.
 *   --probar: no cambia nada; solo dice cuántos cambios haría y en qué archivos.
 *
 * Seguridad (por qué es fiable):
 *   1. Usa findRenameLocations del servicio de lenguaje de TypeScript: solo cambia los usos REALES del símbolo (no
 *      textos, ni comentarios, ni otros símbolos con el mismo nombre en otro sitio).
 *   2. Antes de cada cambio comprueba que el nombre nuevo NO existe ya como nombre en el código de ningún archivo del
 *      proyecto (identificadores; no cuenta comentarios, textos ni rutas de import); si existe, no lo hace y lo dice
 *      (elige otro, p. ej. con un sufijo). Además, antes de cada tanda se revisa con grep -w.
 *   3. Objetos abreviados: con providePrefixAndSuffixTextForRename, si un objeto se escribe { nombre } la clave se
 *      conserva («nombre: nombreNuevo»), para no cambiar datos.
 *   4. Solo renombra declaraciones de funciones, clases, interfaces, tipos, enumeraciones, variables y constantes,
 *      parámetros e importaciones con nombre; NUNCA propiedades de objetos (pueden ser datos guardados o enviados).
 *   5. Si el símbolo está en node_modules o el motor dice que no se puede renombrar, no hace nada y lo dice.
 *   6. Aplica los cambios de atrás hacia delante dentro de cada archivo (las posiciones no se descolocan) y, tras cada
 *      símbolo, vuelve a leer el proyecto antes del siguiente.
 *   No cambia valores (textos, nombres de tablas, eventos, claves guardadas): solo nombres de símbolos.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RAIZ = process.cwd();
const argumentos = process.argv.slice(2);
const soloProbar = argumentos.includes("--probar");
const rutaLista = argumentos.find((a) => !a.startsWith("--"));

if (!rutaLista) {
  console.error("Uso: node scripts/renombrar-simbolos.mjs <lista.json> [--probar]");
  process.exit(2);
}

const lista = JSON.parse(fs.readFileSync(path.resolve(RAIZ, rutaLista), "utf8"));
if (!Array.isArray(lista)) {
  console.error("La lista tiene que ser un array de { archivo, antes, despues, linea? }.");
  process.exit(2);
}

// Proyecto según tsconfig.json (los mismos archivos que comprueba «npx tsc --noEmit»).
const config = ts.readConfigFile(path.join(RAIZ, "tsconfig.json"), ts.sys.readFile);
if (config.error) {
  console.error("No se pudo leer tsconfig.json.");
  process.exit(2);
}
const proyecto = ts.parseJsonConfigFileContent(config.config, ts.sys, RAIZ);
const archivosProyecto = proyecto.fileNames.filter((f) => !f.includes("/node_modules/"));

// Textos en memoria y su versión (el servicio de lenguaje vuelve a leer lo que cambia).
const textos = new Map();
const versiones = new Map();
const leerTexto = (f) => {
  if (textos.has(f)) return textos.get(f);
  if (!fs.existsSync(f)) return undefined;
  const t = fs.readFileSync(f, "utf8");
  textos.set(f, t);
  return t;
};

const anfitrion = {
  getScriptFileNames: () => archivosProyecto,
  getScriptVersion: (f) => String(versiones.get(f) ?? 0),
  getScriptSnapshot: (f) => {
    const t = leerTexto(f);
    return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
  },
  getCurrentDirectory: () => RAIZ,
  getCompilationSettings: () => proyecto.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const servicio = ts.createLanguageService(anfitrion, ts.createDocumentRegistry());

// Declaraciones que se pueden renombrar (nunca propiedades de objetos: pueden ser datos).
const esDeclaracionPermitida = (nodo) => {
  const padre = nodo.parent;
  if (!padre || padre.name !== nodo) return false;
  return (
    ts.isFunctionDeclaration(padre) ||
    ts.isClassDeclaration(padre) ||
    ts.isInterfaceDeclaration(padre) ||
    ts.isTypeAliasDeclaration(padre) ||
    ts.isEnumDeclaration(padre) ||
    ts.isVariableDeclaration(padre) ||
    ts.isParameter(padre) ||
    ts.isBindingElement(padre)
  );
};

// Todas las declaraciones permitidas con ese nombre en el archivo (para avisar si hay varias).
const buscarDeclaraciones = (fuente, nombre) => {
  const halladas = [];
  const recorrer = (nodo) => {
    if (ts.isIdentifier(nodo) && nodo.text === nombre && esDeclaracionPermitida(nodo)) halladas.push(nodo);
    ts.forEachChild(nodo, recorrer);
  };
  recorrer(fuente);
  return halladas;
};

// ¿Hay ya algún símbolo con ese nombre en el código? Se miran los identificadores del código (no los comentarios, los
// textos ni las rutas de los import: que el componente se llame como su archivo es lo correcto).
const palabraExiste = (palabra) => {
  const programa = servicio.getProgram();
  const conElNombre = [];
  for (const f of archivosProyecto) {
    const sf = programa?.getSourceFile(f);
    if (!sf || !(leerTexto(f) ?? "").includes(palabra)) continue;
    let hallado = false;
    const recorrer = (nodo) => {
      if (hallado) return;
      if ((ts.isIdentifier(nodo) || ts.isPrivateIdentifier(nodo)) && nodo.text === palabra) hallado = true;
      else ts.forEachChild(nodo, recorrer);
    };
    recorrer(sf);
    if (hallado) conElNombre.push(f);
  }
  return conElNombre;
};

const relativa = (f) => path.relative(RAIZ, f);
let errores = 0;
let totalCambios = 0;

for (const cambio of lista) {
  const { archivo, antes, despues, linea } = cambio ?? {};
  const etiqueta = `${archivo}: ${antes} → ${despues}`;
  if (!archivo || !antes || !despues || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(despues)) {
    console.log(`NO   ${etiqueta}: faltan datos o el nombre nuevo no es un identificador válido`);
    errores++;
    continue;
  }
  const absoluto = path.resolve(RAIZ, archivo);
  const fuente = servicio.getProgram()?.getSourceFile(absoluto);
  if (!fuente) {
    console.log(`NO   ${etiqueta}: el archivo no forma parte del proyecto (tsconfig.json)`);
    errores++;
    continue;
  }

  // 1) Que el nombre nuevo no exista ya en el proyecto.
  const yaEsta = palabraExiste(despues);
  if (yaEsta.length) {
    console.log(`NO   ${etiqueta}: «${despues}» ya existe en ${yaEsta.slice(0, 5).map(relativa).join(", ")}${yaEsta.length > 5 ? "…" : ""} (elige otro nombre)`);
    errores++;
    continue;
  }

  // 2) Encontrar SU declaración.
  let declaraciones = buscarDeclaraciones(fuente, antes);
  if (linea) declaraciones = declaraciones.filter((n) => fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1 === Number(linea));
  if (declaraciones.length !== 1) {
    const lineas = buscarDeclaraciones(fuente, antes).map((n) => fuente.getLineAndCharacterOfPosition(n.getStart(fuente)).line + 1);
    console.log(`NO   ${etiqueta}: ${declaraciones.length ? "hay varias declaraciones" : "no se encuentra la declaración"}${lineas.length ? ` (líneas: ${lineas.join(", ")}; indica «linea»)` : ""}`);
    errores++;
    continue;
  }
  const posicion = declaraciones[0].getStart(fuente);

  // 3) Preguntar al motor.
  const info = servicio.getRenameInfo(absoluto, posicion, { allowRenameOfImportPath: false });
  if (!info.canRename) {
    console.log(`NO   ${etiqueta}: el motor de TypeScript no deja renombrarlo (${info.localizedErrorMessage ?? "sin motivo"})`);
    errores++;
    continue;
  }
  const lugares = servicio.findRenameLocations(absoluto, posicion, false, false, { providePrefixAndSuffixTextForRename: true }) ?? [];
  if (!lugares.length || lugares.some((l) => l.fileName.includes("/node_modules/"))) {
    console.log(`NO   ${etiqueta}: ${lugares.length ? "toca archivos de node_modules" : "no hay usos"}`);
    errores++;
    continue;
  }

  // 4) Agrupar por archivo y contar.
  const porArchivo = new Map();
  for (const l of lugares) {
    if (!porArchivo.has(l.fileName)) porArchivo.set(l.fileName, []);
    porArchivo.get(l.fileName).push(l);
  }
  const resumen = [...porArchivo].map(([f, ls]) => `${relativa(f)} (${ls.length})`).join(", ");
  totalCambios += lugares.length;
  if (soloProbar) {
    console.log(`PROBAR ${etiqueta}: ${lugares.length} cambios en ${porArchivo.size} archivos: ${resumen}`);
    continue;
  }

  // 5) Aplicar de atrás hacia delante en cada archivo.
  for (const [f, ls] of porArchivo) {
    let texto = leerTexto(f);
    for (const l of [...ls].sort((a, b) => b.textSpan.start - a.textSpan.start)) {
      const nuevo = `${l.prefixText ?? ""}${despues}${l.suffixText ?? ""}`;
      texto = texto.slice(0, l.textSpan.start) + nuevo + texto.slice(l.textSpan.start + l.textSpan.length);
    }
    textos.set(f, texto);
    versiones.set(f, (versiones.get(f) ?? 0) + 1);
    fs.writeFileSync(f, texto, "utf8");
  }
  console.log(`HECHO ${etiqueta}: ${lugares.length} cambios en ${porArchivo.size} archivos: ${resumen}`);
}

console.log(`${soloProbar ? "Probado" : "Terminado"}: ${totalCambios} cambios${errores ? `, ${errores} sin hacer (ver «NO»)` : ""}.`);
process.exit(errores ? 1 : 0);
