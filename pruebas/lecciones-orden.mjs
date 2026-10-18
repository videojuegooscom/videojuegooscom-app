/**
 * pruebas/lecciones-orden.mjs — ¿importa el orden en que se apliquen las migraciones de lecciones?
 *
 * Qué hace: en una base aislada con las 55 lecciones actuales (el historial de migraciones del repo, igual que
 * producción), aplica las cinco migraciones de lecciones de 2026-10-18 (090000 nuevas, 095000 autorización,
 * 096000 Blue público/Administración, 097000 pruebas y permisos, 100000 reorganización en grupos) en TODOS los
 * órdenes posibles (120). Cada orden se prueba dentro de una transacción que se deshace, así que la base de
 * partida nunca cambia. Después comprueba:
 *  1) Seguridad en cualquier orden: las 55 originales siguen (mismo título, prioridad, categoría, fecha de
 *     creación y su texto y ejemplos al principio), no hay títulos repetidos y ningún grupo mezcla prioridades.
 *  2) Qué orden es el correcto: hay un orden que deja textos obsoletos activos (p. ej. si se agrupa ANTES de
 *     añadir la nota «ACTUALIZADA», el grupo conserva la regla antigua que contradice la nueva). El resultado
 *     se resume como restricciones («100000 debe ir después de 095000») y se exige que el orden numérico las
 *     cumpla y que todos los órdenes que las cumplen den exactamente el mismo estado final.
 *  3) Cadena completa dos veces (idempotente), vuelta atrás completa en orden inverso (las 55 originales
 *     idénticas y activas, lo nuevo inactivo), vuelta atrás repetida, y qué pasa al volver a aplicar tras la
 *     vuelta atrás (no deja el Centro sin lecciones).
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/lecciones-orden.mjs postgresql://postgres@127.0.0.1:55432
 * Requisitos: pruebas/sql-aislado.mjs y las migraciones de lecciones (llegan con las PR #75, #78, #79 y #84).
 * Sale con código 1 si algo falla, y con 2 si falta algún archivo.
 */
import { existsSync } from "node:fs";
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/lecciones-orden.mjs <servidor local de pruebas>");
  process.exit(2);
}

const M = "supabase/migrations/";
const R = "supabase/rollbacks/";
// En orden numérico (el de aplicación correcto). `v` es la vuelta atrás de cada una.
const MIGRACIONES = [
  { id: "090", n: `${M}20261018090000_aprendizajes_lecciones_nuevas.sql`, v: `${R}20261018090000_aprendizajes_lecciones_nuevas_revertir.sql` },
  { id: "095", n: `${M}20261018095000_aprendizajes_autorizacion_expresa.sql`, v: `${R}20261018095000_aprendizajes_autorizacion_expresa_revertir.sql` },
  { id: "096", n: `${M}20261018096000_aprendizajes_blue_publico_y_admin.sql`, v: `${R}20261018096000_aprendizajes_blue_publico_y_admin_revertir.sql` },
  { id: "097", n: `${M}20261018097000_aprendizajes_pruebas_y_permisos.sql`, v: `${R}20261018097000_aprendizajes_pruebas_y_permisos_revertir.sql` },
  { id: "100", n: `${M}20261018100000_aprendizajes_reorganizar_en_grupos.sql`, v: `${R}20261018100000_aprendizajes_reorganizar_revertir.sql` },
];
const faltan = MIGRACIONES.flatMap((m) => [m.n, m.v]).filter((f) => !existsSync(f));
if (faltan.length) {
  console.error(`Faltan archivos (llegan con otras PR): ${faltan.join(", ")}`);
  process.exit(2);
}
const porId = Object.fromEntries(MIGRACIONES.map((m) => [m.id, m]));
const NUMERICO = MIGRACIONES.map((m) => m.id);

const db = conectar(servidor);
const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

// Todas las ordenaciones de una lista.
const permutaciones = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

// Consulta de evaluación: una línea «clave=valor» por medida. Los textos «obsoletos» son los de las 4 lecciones
// que las migraciones corrigen (la nota ACTUALIZADA/SUSTITUIDA debe ir detrás del texto antiguo en cualquier
// lección ACTIVA que lo contenga, grupos incluidos).
const EVALUAR = `
with estado as (
  select string_agg(titulo || '|' || prioridad || '|' || categoria || '|' || activa || '|' || regla || '|' || coalesce(ejemplo_mal, '') || '|' || coalesce(ejemplo_bien, ''), E'\\n' order by titulo) as t
    from public.aprendizajes
)
select 'huella=' || encode(sha256(convert_to(t, 'UTF8')), 'hex') from estado
union all select 'filas=' || count(*) from public.aprendizajes
union all select 'activas=' || count(*) from public.aprendizajes where activa
union all select 'originales_ok=' || count(*) from public.aprendizajes a join public._orig o on o.id = a.id
  where a.titulo = o.titulo and a.prioridad = o.prioridad and a.categoria = o.categoria and a.created_at = o.created_at
    and left(a.regla, length(o.regla)) = o.regla
    and left(coalesce(a.ejemplo_mal, ''), length(coalesce(o.ejemplo_mal, ''))) = coalesce(o.ejemplo_mal, '')
    and left(coalesce(a.ejemplo_bien, ''), length(coalesce(o.ejemplo_bien, ''))) = coalesce(o.ejemplo_bien, '')
union all select 'repetidos=' || (count(*) - count(distinct titulo)) from public.aprendizajes
union all select 'mezcla=' || count(*) from public.aprendizajes g join public.aprendizajes o
  on o.titulo not like 'Grupo · %' and not o.activa and position(o.regla in g.regla) > 0
  where g.titulo like 'Grupo · %' and g.prioridad <> o.prioridad
union all select 'obsoletas=' || count(*) from public.aprendizajes g join public._orig o
  on o.titulo in ('Claude ejecuta, el dueño solo da la orden', 'Publicar en cuanto la vista previa esté en verde', 'Supabase lo aplica Claude', 'Blue fuera del panel')
  where g.activa and position(o.regla in g.regla) > 0
    and position(case when o.titulo = 'Blue fuera del panel' then 'SUSTITUIDA 2026-10-18' else 'ACTUALIZADA 2026-10-18' end
                 in substr(g.regla, position(o.regla in g.regla) + length(o.regla))) = 0
union all select 'diferencias=' || count(*) from public.aprendizajes a join public._orig o on o.id = a.id
  where a.regla is distinct from o.regla or a.ejemplo_mal is distinct from o.ejemplo_mal or a.ejemplo_bien is distinct from o.ejemplo_bien
     or a.prioridad is distinct from o.prioridad or a.categoria is distinct from o.categoria or a.activa is distinct from o.activa or a.titulo is distinct from o.titulo
`;
const leer = (salida) => Object.fromEntries(salida.split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

// Aplica las migraciones en ese orden dentro de una transacción, mide y deshace.
async function probarOrden(base, orden, { rollbacks = false } = {}) {
  const archivos = orden.flatMap((id) => ["-f", rollbacks ? porId[id].v : porId[id].n]);
  try {
    return leer(await db.psql(base, ["-A", "-t", "-c", "begin", ...archivos, "-c", EVALUAR, "-c", "rollback"]));
  } catch (e) {
    return { error: String(e.message).slice(0, 300) };
  }
}
const medir = async (base) => leer(await db.consulta(base, EVALUAR));
const aplicar = (base, orden, rollbacks = false) => db.aplicar(base, orden.map((id) => (rollbacks ? porId[id].v : porId[id].n)));

try {
  console.log("Preparando la base aislada con el historial de lecciones del repo…");
  const plantilla = await db.crearBaseConHistorial();
  await db.consulta(plantilla, "create table public._orig as select * from public.aprendizajes");
  const originales = Number(await db.consulta(plantilla, "select count(*) from public.aprendizajes"));
  ok(originales === 55, `réplica: 55 lecciones iguales a producción (${originales})`);

  // --- 1) y 2) las 120 ordenaciones ------------------------------------------------------------------
  const todas = permutaciones(NUMERICO);
  ok(todas.length === 120, `se prueban las ${todas.length} ordenaciones posibles de 5 migraciones`);
  const trabajadores = 6;
  const bases = [];
  for (let i = 0; i < trabajadores; i++) bases.push(await db.clonar(plantilla)); // clones en serie: CREATE DATABASE copia la plantilla
  const cola = [...todas];
  const resultado = new Map();
  await Promise.all(
    bases.map(async (base) => {
      for (let orden = cola.shift(); orden; orden = cola.shift()) resultado.set(orden.join(">"), await probarOrden(base, orden));
    })
  );

  const claveNumerica = NUMERICO.join(">");
  const referencia = resultado.get(claveNumerica);
  ok(!referencia.error, `orden numérico (${claveNumerica}) se aplica sin errores${referencia.error ? `: ${referencia.error}` : ""}`);
  const conError = [...resultado].filter(([, r]) => r.error);
  ok(conError.length === 0, `ninguna de las 120 ordenaciones da error (${conError.length}${conError[0] ? `, p. ej. ${conError[0][0]}: ${conError[0][1].error}` : ""})`);
  const validas = [...resultado].filter(([, r]) => !r.error);

  const noSeguras = validas.filter(([, r]) => r.originales_ok !== "55" || r.repetidos !== "0" || r.mezcla !== "0");
  ok(noSeguras.length === 0, `en las ${validas.length} ordenaciones se conservan las 55 originales, no hay títulos repetidos ni grupos que mezclen prioridades (incumplen: ${noSeguras.length}${noSeguras[0] ? `, p. ej. ${noSeguras[0][0]}` : ""})`);

  const sinObsoletas = validas.filter(([, r]) => r.obsoletas === "0");
  const mismaHuella = validas.filter(([, r]) => r.huella === referencia.huella);
  ok(referencia.obsoletas === "0", "el orden numérico no deja ninguna regla antigua activa sin su nota de actualización");
  console.log(`INFO ordenaciones sin textos obsoletos: ${sinObsoletas.length}/120 · con el mismo estado final que el orden numérico: ${mismaHuella.length}/120`);

  // Restricciones inferidas: «a antes que b» es obligatoria (para una propiedad) si TODAS las ordenaciones con b
  // antes que a la incumplen. Dos propiedades: «sin reglas antiguas activas» y «mismo estado final».
  const antes = (k, a, b) => k.split(">").indexOf(a) < k.split(">").indexOf(b);
  const inferir = (buena) => {
    const rs = [];
    for (const a of NUMERICO) {
      for (const b of NUMERICO) {
        if (a === b) continue;
        const alReves = validas.filter(([k]) => antes(k, b, a));
        if (alReves.length && alReves.every(([, r]) => !buena(r))) rs.push([a, b]);
      }
    }
    return rs;
  };
  const texto = (rs) => rs.map(([a, b]) => `${a} antes que ${b}`).join(", ") || "ninguna";
  const seguridad = inferir((r) => r.obsoletas === "0");
  const estado = inferir((r) => r.huella === referencia.huella);
  console.log(`INFO restricciones para no dejar reglas antiguas activas: ${texto(seguridad)}`);
  console.log(`INFO restricciones para llegar al mismo estado final: ${texto(estado)}`);
  ok(seguridad.length > 0, "hay al menos una restricción de orden real (si no, esta prueba no estaría comprobando nada)");
  const cumple = (rs) => (k) => rs.every(([a, b]) => antes(k, a, b));
  ok(cumple(seguridad)(claveNumerica) && cumple(estado)(claveNumerica), "el orden numérico cumple todas las restricciones");
  const seguras = validas.filter(([k]) => cumple(seguridad)(k));
  ok(seguras.every(([, r]) => r.obsoletas === "0") && validas.filter(([k]) => !cumple(seguridad)(k)).every(([, r]) => r.obsoletas !== "0"),
    `${seguras.length} ordenaciones cumplen las restricciones de seguridad y NO dejan reglas antiguas activas; las otras ${validas.length - seguras.length} sí las dejan`);
  const iguales = validas.filter(([k]) => cumple(estado)(k));
  ok(iguales.every(([, r]) => r.huella === referencia.huella) && validas.filter(([k]) => !cumple(estado)(k)).every(([, r]) => r.huella !== referencia.huella),
    `${iguales.length} ordenaciones cumplen las restricciones de estado y dan exactamente el mismo estado final que el orden numérico; las otras ${validas.length - iguales.length} no`);

  // --- 3) cadena completa: dos veces, vuelta atrás, vuelta atrás repetida, reaplicar ---------------------
  const cadena = await db.clonar(plantilla);
  await aplicar(cadena, NUMERICO);
  const una = await medir(cadena);
  ok(una.huella === referencia.huella, "la cadena aplicada de verdad (sin transacción de prueba) da el mismo estado que en la prueba");
  await aplicar(cadena, NUMERICO);
  ok((await medir(cadena)).huella === una.huella, "aplicar la cadena completa dos veces no cambia nada (idempotente)");

  const inverso = [...NUMERICO].reverse();
  await aplicar(cadena, inverso, true);
  const atras = await medir(cadena);
  ok(atras.diferencias === "0", `tras la vuelta atrás en orden inverso las 55 originales están idénticas (diferencias: ${atras.diferencias})`);
  ok(atras.activas === "55", `y quedan activas exactamente las 55 originales (activas: ${atras.activas})`);
  ok(atras.repetidos === "0", "sin títulos repetidos tras la vuelta atrás");
  await aplicar(cadena, inverso, true);
  ok((await medir(cadena)).huella === atras.huella, "repetir la vuelta atrás completa no cambia nada");
  // «Aplicar, deshacer, aplicar»: las 7 lecciones nuevas vuelven a estar activas y «Blue fuera del panel» queda
  // sustituida por la nueva (antes, la nueva se quedaba inactiva y el Centro perdía la regla de Blue). Los
  // grupos, ya creados e inactivos, no se vuelven a activar solos: las 55 originales quedan sueltas y activas.
  await aplicar(cadena, NUMERICO);
  const reaplicada = await medir(cadena);
  const nuevasActivas = Number(await db.consulta(cadena, `select count(*) from public.aprendizajes where activa and titulo in (
    'Mínimo 10 recomendaciones de mejoría en cada respuesta', 'Comprobar los límites de la tabla antes de añadir texto',
    'Autorización expresa del dueño antes de fusionar, desplegar o migrar', 'Blue: interfaz pública y Administración',
    'Una prueba debe fallar sin la corrección', 'Quitar permisos de una función: revisar también PUBLIC', 'npm audit no equivale a «llega al navegador»')`));
  ok(nuevasActivas === 7, `volver a aplicar tras la vuelta atrás reactiva las 7 lecciones nuevas (activas: ${nuevasActivas})`);
  ok(reaplicada.activas === "61" && reaplicada.repetidos === "0", `y quedan 61 activas (55 originales - la de Blue sustituida + 7 nuevas) sin títulos repetidos (activas: ${reaplicada.activas})`);
  const blueAntigua = await db.consulta(cadena, "select count(*) from public.aprendizajes where titulo = 'Blue fuera del panel' and not activa and regla like '%SUSTITUIDA 2026-10-18%'");
  ok(blueAntigua === "1", "y «Blue fuera del panel» queda sustituida una sola vez");
  console.log(`INFO tras «aplicar, deshacer, aplicar» el estado ${reaplicada.huella === una.huella ? "es el mismo" : "NO es el mismo"} que la primera vez (los grupos creados se conservan inactivos y no se vuelven a activar solos)`);

  console.log(`INFO estado final de referencia: filas ${referencia.filas}, activas ${referencia.activas}, huella ${referencia.huella.slice(0, 12)}`);
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 600)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
