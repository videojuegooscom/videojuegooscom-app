/**
 * Archivo: scripts/mover-declaraciones.mjs
 * Función: herramienta de línea de órdenes para partir un archivo grande moviendo declaraciones enteras (funciones,
 *          componentes, constantes, tipos) a un archivo nuevo, con el motor de TypeScript.
 * Para qué sirve: la tanda 6 de «ordenar el proyecto» (partir los archivos de más de 1.500 líneas) sin copiar y pegar a
 *          mano: mueve el texto exacto de cada declaración (con sus comentarios), pone en el archivo nuevo los import que
 *          necesita, exporta lo que el archivo de origen sigue usando y se lo importa, y quita del origen los import que
 *          ya no usa. No cambia nada de lo que hace el código.
 * Conectado con: el paquete typescript (ts.createProgram y el comprobador de tipos, para saber a qué declaración se
 *          refiere cada nombre) y tsconfig.json (qué archivos forman el proyecto).
 * Utilizado por: la persona que mantiene el proyecto, a mano (node scripts/mover-declaraciones.mjs …). No lo usa la app.
 * Dependencias: typescript (ya instalado como dependencia de desarrollo), node:fs y node:path.
 * Estado: ACTIVO
 *
 * Uso:
 *   node scripts/mover-declaraciones.mjs <plan.json> [--probar]
 *
 *   <plan.json>:
 *     {
 *       "origen": "app/(tabs)/chat-global.tsx",
 *       "destino": "components/foro/NoticiasForo.tsx",
 *       "lineas": [3617, 5852],                 // las declaraciones de primer nivel que caen DENTRO de estas líneas…
 *       "nombres": ["COLORS", "AvatarCircle"],  // …y/o estas, por su nombre (se puede usar una cosa, la otra o las dos)
 *       "cabecera": "/**\n * Archivo: …\n *\/"  // el comentario de cabecera del archivo nuevo (obligatorio)
 *     }
 *   --probar: no cambia nada; dice qué movería, qué import pondría y qué exportaría.
 *
 * Seguridad (por qué es fiable):
 *   1. Solo mueve declaraciones de primer nivel completas (function, const/let, class, type, interface, enum), con su
 *      texto exacto y los comentarios que llevan encima. Nunca expresiones sueltas ni import.
 *   2. Usa el comprobador de tipos de TypeScript para saber a qué se refiere cada nombre (no por parecido de texto):
 *      así distingue una variable local con el mismo nombre que una declaración del archivo.
 *   3. Si lo que se mueve usa algo que se QUEDA en el origen, no hace nada y lo dice (importarlo de vuelta crearía una
 *      dependencia circular): hay que moverlo también (a este archivo o a uno de piezas comunes, antes).
 *   4. Si otro archivo del proyecto importa del origen algo que se mueve, el origen lo vuelve a exportar
 *      (export { … } from "…") para que ese archivo siga funcionando igual.
 *   5. El archivo de destino no puede existir (nunca pisa nada). El origen solo pierde lo movido y los import que ya no
 *      usa (React se deja siempre).
 *   Después de usarla: npx tsc --noEmit, npm run lint, npm run build y las pruebas de la pantalla.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const RAIZ = process.cwd();
const argumentos = process.argv.slice(2);
const soloProbar = argumentos.includes("--probar");
const rutaPlan = argumentos.find((a) => !a.startsWith("--"));
const fallar = (msg) => {
  console.error(`NO   ${msg}`);
  process.exit(1);
};
if (!rutaPlan) fallar("Uso: node scripts/mover-declaraciones.mjs <plan.json> [--probar]");

const plan = JSON.parse(fs.readFileSync(path.resolve(RAIZ, rutaPlan), "utf8"));
if (!plan.origen || !plan.destino || !plan.cabecera || (!plan.lineas && !plan.nombres?.length)) {
  fallar("el plan necesita origen, destino, cabecera y lineas y/o nombres");
}
const origenAbs = path.resolve(RAIZ, plan.origen);
const destinoAbs = path.resolve(RAIZ, plan.destino);
if (!fs.existsSync(origenAbs)) fallar(`no existe ${plan.origen}`);
if (fs.existsSync(destinoAbs)) fallar(`${plan.destino} ya existe: esta herramienta nunca pisa un archivo`);

// Proyecto según tsconfig.json (los mismos archivos que comprueba «npx tsc --noEmit»).
const config = ts.readConfigFile(path.join(RAIZ, "tsconfig.json"), ts.sys.readFile);
const proyecto = ts.parseJsonConfigFileContent(config.config, ts.sys, RAIZ);
const programa = ts.createProgram(proyecto.fileNames, proyecto.options);
const comprobador = programa.getTypeChecker();
const fuente = programa.getSourceFile(origenAbs);
if (!fuente) fallar(`${plan.origen} no forma parte del proyecto (tsconfig.json)`);
const texto = fuente.getFullText();
const lineaDe = (pos) => fuente.getLineAndCharacterOfPosition(pos).line + 1;

// --- 1) Declaraciones de primer nivel y cuáles se mueven -----------------------------------------------------------
const esDeclaracion = (st) =>
  ts.isFunctionDeclaration(st) || ts.isVariableStatement(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st);
const nombresDe = (st) => {
  if (ts.isVariableStatement(st)) {
    return st.declarationList.declarations.map((d) => {
      if (!ts.isIdentifier(d.name)) fallar(`la línea ${lineaDe(d.getStart(fuente))} declara con desestructuración: no se mueve automáticamente`);
      return d.name.text;
    });
  }
  return st.name ? [st.name.text] : [];
};
const tieneExport = (st) => !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const esDefault = (st) => !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

const pedidos = new Set(plan.nombres ?? []);
const [desde, hasta] = plan.lineas ?? [0, -1];
const movidas = [];
for (const st of fuente.statements) {
  const ini = lineaDe(st.getStart(fuente));
  const fin = lineaDe(st.end);
  const enRango = plan.lineas && ini >= desde && fin <= hasta;
  if (plan.lineas && !enRango && ini <= hasta && fin >= desde) fallar(`la declaración de las líneas ${ini}-${fin} cruza el límite ${desde}-${hasta}: ajusta las líneas`);
  const nombres = esDeclaracion(st) ? nombresDe(st) : [];
  const porNombre = nombres.some((n) => pedidos.has(n));
  if (!enRango && !porNombre) continue;
  if (!esDeclaracion(st)) fallar(`en la línea ${ini} hay algo que no es una declaración (${ts.SyntaxKind[st.kind]}): no se mueve automáticamente`);
  if (esDefault(st)) fallar(`la línea ${ini} es un «export default»: no se mueve automáticamente`);
  if (porNombre && !nombres.every((n) => pedidos.has(n) || enRango)) fallar(`la línea ${ini} declara varias cosas (${nombres.join(", ")}): pide todas o ninguna`);
  movidas.push({ st, nombres, ini, fin });
  nombres.forEach((n) => pedidos.delete(n));
}
if (pedidos.size) fallar(`no se encuentran en ${plan.origen} como declaraciones de primer nivel: ${[...pedidos].join(", ")}`);
if (!movidas.length) fallar("no hay nada que mover");
const declMovidas = new Set(movidas.map((m) => m.st));

// --- 2) A qué declaración de primer nivel se refiere cada nombre --------------------------------------------------
// Devuelve la sentencia de primer nivel del origen (o la declaración de import) a la que apunta un identificador.
const sentenciaDe = (decl) => {
  let n = decl;
  while (n && n.parent && n.parent !== fuente) n = n.parent;
  return n && n.parent === fuente ? n : null;
};
const simboloDe = (id) => {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) return comprobador.getShorthandAssignmentValueSymbol(id.parent);
  return comprobador.getSymbolAtLocation(id);
};
// Para un identificador: { sentencia, especificador } si apunta a algo de primer nivel del origen.
const referencia = (id) => {
  const s = simboloDe(id);
  const d = s?.declarations?.[0];
  if (!d || d.getSourceFile() !== fuente) return null;
  const st = sentenciaDe(d);
  if (!st) return null;
  // Solo la declaración de primer nivel en sí (no una propiedad de su objeto, p. ej. COLORS.accent, ni algo de dentro).
  if (ts.isImportDeclaration(st)) return ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d) ? { st, importacion: d } : null;
  if (!esDeclaracion(st)) return null;
  const esLaDeclaracion = d === st || (ts.isVariableDeclaration(d) && d.parent?.parent === st);
  return esLaDeclaracion ? { st } : null;
};
const recorrer = (nodo, fn) => {
  const visitar = (n) => {
    if (ts.isIdentifier(n)) fn(n);
    ts.forEachChild(n, visitar);
  };
  visitar(nodo);
};

// Lo que usa lo que se mueve.
const importsNecesarios = new Map(); // ImportDeclaration → Set(nombre local)
const seQuedanUsados = new Map(); // nombre → línea
for (const { st } of movidas) {
  recorrer(st, (id) => {
    const r = referencia(id);
    if (!r || declMovidas.has(r.st)) return;
    if (r.importacion) {
      if (!importsNecesarios.has(r.st)) importsNecesarios.set(r.st, new Set());
      importsNecesarios.get(r.st).add(id.text);
    } else {
      seQuedanUsados.set(id.text, lineaDe(r.st.getStart(fuente)));
    }
  });
}
if (seQuedanUsados.size) {
  fallar(
    `lo que se mueve usa cosas que se quedan en ${plan.origen} (crearía una dependencia circular); muévelas también o antes a un archivo de piezas comunes:\n` +
      [...seQuedanUsados].map(([n, l]) => `       ${n} (línea ${l})`).join("\n")
  );
}

// Lo que el resto del origen sigue usando de lo movido, y lo que el resto del origen sigue usando de sus import.
const usadosPorElOrigen = new Set();
const importsQueSiguen = new Map(); // ImportDeclaration → Set(nombre local)
for (const st of fuente.statements) {
  if (declMovidas.has(st) || ts.isImportDeclaration(st)) continue;
  recorrer(st, (id) => {
    const r = referencia(id);
    if (!r) return;
    if (r.importacion) {
      if (!importsQueSiguen.has(r.st)) importsQueSiguen.set(r.st, new Set());
      importsQueSiguen.get(r.st).add(id.text);
    } else if (declMovidas.has(r.st)) usadosPorElOrigen.add(id.text);
  });
}

// Una variable «let» que se mueve y a la que el resto del origen le da otro valor no puede moverse (una variable
// importada no se puede reasignar): hay que convertirla antes en un objeto (const x = { valor }) o moverla con todo lo
// que la cambia.
const reasignadas = new Set();
for (const st of fuente.statements) {
  if (declMovidas.has(st) || ts.isImportDeclaration(st)) continue;
  const visitar = (n) => {
    const destinoDe = (e) => (ts.isIdentifier(e) ? e : null);
    let id = null;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) id = destinoDe(n.left);
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) id = destinoDe(n.operand);
    if (id) {
      const r = referencia(id);
      if (r && declMovidas.has(r.st)) reasignadas.add(`${id.text} (línea ${lineaDe(n.getStart(fuente))})`);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(st);
}
if (reasignadas.size) fallar(`el resto de ${plan.origen} cambia el valor de variables que se moverían (no se puede reasignar algo importado):\n${[...reasignadas].map((r) => `       ${r}`).join("\n")}`);

// Otros archivos que importan del origen algo que se mueve: el origen lo reexporta.
const reexportar = new Set();
const nombresMovidos = new Set(movidas.flatMap((m) => m.nombres));
for (const sf of programa.getSourceFiles()) {
  if (sf === fuente || sf.isDeclarationFile || sf.fileName.includes("/node_modules/")) continue;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith(".")) continue;
    const resuelto = path.resolve(path.dirname(sf.fileName), spec);
    if (resuelto !== origenAbs.replace(/\.(tsx?|jsx?)$/, "") && resuelto !== origenAbs) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) {
      const original = (e.propertyName ?? e.name).text;
      if (nombresMovidos.has(original)) reexportar.add(original);
    }
  }
}

// --- 3) Textos nuevos -------------------------------------------------------------------------------------------
const sinExtension = (p) => p.replace(/\.(tsx?|jsx?)$/, "");
const relativo = (desdeDir, abs) => {
  let r = path.relative(desdeDir, sinExtension(abs)).split(path.sep).join("/");
  if (!r.startsWith(".")) r = `./${r}`;
  return r;
};
// Rehace un import con solo los nombres locales pedidos (o null si no queda ninguno).
const textoImport = (decl, nombres, especificador) => {
  const c = decl.importClause;
  if (!c) return null;
  const partes = [];
  if (c.name && nombres.has(c.name.text)) partes.push(c.name.text);
  const nb = c.namedBindings;
  if (nb && ts.isNamespaceImport(nb) && nombres.has(nb.name.text)) partes.push(`* as ${nb.name.text}`);
  if (nb && ts.isNamedImports(nb)) {
    const elegidos = nb.elements.filter((e) => nombres.has(e.name.text)).map((e) => e.getText(fuente));
    if (elegidos.length) partes.push(`{ ${elegidos.join(", ")} }`);
  }
  if (!partes.length) return null;
  return `import ${c.isTypeOnly ? "type " : ""}${partes.join(", ")} from "${especificador}";`;
};
const especificadorDesde = (decl, dirNuevo) => {
  const spec = decl.moduleSpecifier.text;
  if (!spec.startsWith(".")) return spec;
  return relativo(dirNuevo, path.resolve(path.dirname(origenAbs), spec));
};

// Archivo nuevo: cabecera, import y las declaraciones (exportando lo que el origen o otros archivos siguen usando).
const necesitaExport = new Set([...usadosPorElOrigen, ...reexportar]);
const importsDestino = [...importsNecesarios]
  .sort((a, b) => a[0].pos - b[0].pos)
  .map(([decl, nombres]) => textoImport(decl, nombres, especificadorDesde(decl, path.dirname(destinoAbs))))
  .filter(Boolean);
const cuerpo = movidas
  .map(({ st, nombres }) => {
    let t = texto.slice(st.getFullStart(), st.end);
    if (!tieneExport(st) && nombres.some((n) => necesitaExport.has(n))) {
      const corte = st.getStart(fuente) - st.getFullStart();
      t = `${t.slice(0, corte)}export ${t.slice(corte)}`;
    }
    return t;
  })
  .join("")
  .replace(/^\s*\n/, "");
const nuevo = `${plan.cabecera.trimEnd()}\n${importsDestino.join("\n")}\n\n${cuerpo.trimEnd()}\n`;

// Origen: sin lo movido, con sus import podados, el import del archivo nuevo y las reexportaciones.
const cambios = []; // { ini, fin, texto } sobre el texto original
for (const { st } of movidas) cambios.push({ ini: st.getFullStart(), fin: st.end, texto: "" });
const importsOrigen = fuente.statements.filter(ts.isImportDeclaration);
for (const decl of importsOrigen) {
  const c = decl.importClause;
  if (!c) continue; // import solo por sus efectos: se queda
  const siguen = new Set(importsQueSiguen.get(decl) ?? []);
  if (c.name?.text === "React") siguen.add("React");
  const todos = [];
  if (c.name) todos.push(c.name.text);
  if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) todos.push(c.namedBindings.name.text);
  if (c.namedBindings && ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach((e) => todos.push(e.name.text));
  if (todos.every((n) => siguen.has(n))) continue;
  const rehecho = textoImport(decl, siguen, decl.moduleSpecifier.text);
  // Si el import desaparece entero, se quita también su salto de línea (para no dejar una línea en blanco).
  const fin = rehecho === null && texto[decl.end] === "\n" ? decl.end + 1 : decl.end;
  cambios.push({ ini: decl.getStart(fuente), fin, texto: rehecho ?? "" });
}
const especNuevo = relativo(path.dirname(origenAbs), destinoAbs);
const importados = [...usadosPorElOrigen].sort();
const reexportados = [...reexportar].sort();
const lineasNuevas = [];
if (importados.length) lineasNuevas.push(`import { ${importados.join(", ")} } from "${especNuevo}";`);
// Los tipos se reexportan con «export type» (una reexportación de valor de algo que solo es un tipo no es correcta).
const esTipo = (n) => movidas.some((m) => m.nombres.includes(n) && (ts.isInterfaceDeclaration(m.st) || ts.isTypeAliasDeclaration(m.st)));
const reexValores = reexportados.filter((n) => !esTipo(n));
const reexTipos = reexportados.filter(esTipo);
if (reexValores.length) lineasNuevas.push(`export { ${reexValores.join(", ")} } from "${especNuevo}";`);
if (reexTipos.length) lineasNuevas.push(`export type { ${reexTipos.join(", ")} } from "${especNuevo}";`);
const ultimoImport = importsOrigen[importsOrigen.length - 1];
if (lineasNuevas.length) cambios.push({ ini: ultimoImport.end, fin: ultimoImport.end, texto: `\n${lineasNuevas.join("\n")}` });

cambios.sort((a, b) => b.ini - a.ini || b.fin - a.fin);
let origenNuevo = texto;
for (const c of cambios) origenNuevo = origenNuevo.slice(0, c.ini) + c.texto + origenNuevo.slice(c.fin);
// Un import que se queda vacío deja una línea en blanco: se quitan las líneas vacías dobles que haya dejado.
origenNuevo = origenNuevo.replace(/\n{3,}/g, "\n\n");

// --- 4) Informe y escritura -------------------------------------------------------------------------------------
const lineasMovidas = movidas.reduce((a, m) => a + (m.fin - m.ini + 1), 0);
console.log(`${soloProbar ? "PROBAR" : "HECHO"} ${plan.origen} → ${plan.destino}`);
console.log(`  ${movidas.length} declaraciones (${lineasMovidas} líneas): ${movidas.flatMap((m) => m.nombres).join(", ")}`);
console.log(`  import en el archivo nuevo: ${importsDestino.length}`);
console.log(`  el origen importa del nuevo: ${importados.join(", ") || "nada"}`);
if (reexportados.length) console.log(`  el origen reexporta (otros archivos lo importan de ahí): ${reexportados.join(", ")}`);
console.log(`  líneas: origen ${texto.split("\n").length} → ${origenNuevo.split("\n").length}; nuevo ${nuevo.split("\n").length}`);
if (soloProbar) process.exit(0);
fs.mkdirSync(path.dirname(destinoAbs), { recursive: true });
fs.writeFileSync(destinoAbs, nuevo, "utf8");
fs.writeFileSync(origenAbs, origenNuevo, "utf8");
console.log("Terminado. Ahora: npx tsc --noEmit, npm run lint, npm run build y las pruebas.");
