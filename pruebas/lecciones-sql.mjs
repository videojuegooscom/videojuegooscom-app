/**
 * pruebas/lecciones-sql.mjs — pruebas REALES (en una base aislada) de las migraciones de lecciones.
 *
 * Qué hace: crea una base aislada con el esqueleto de Supabase y TODO el historial de migraciones de
 * lecciones del repo (réplica fiel de producción: coincide en filas, sumas de longitudes y principio y
 * final de cada regla, comprobado el 2026-10-18), y sobre clones de esa base prueba:
 *  A) 20261018090000 lecciones nuevas: aplicar, repetir (idempotencia) y vuelta atrás.
 *  B) 20261018095000 autorización: lo mismo, y que el texto original de las 3 lecciones queda intacto.
 *  C) 20261018096000 Blue pública/Administración: lo mismo.
 *  D) 20261018100000 reorganización sola: cada grupo conserva la prioridad de sus lecciones, no se pierde
 *     ni una palabra, cabe en los límites, idempotencia y vuelta atrás exacta.
 *  E) Secuencia completa 090000 → 095000 → 096000 → 100000 y toda la vuelta atrás en orden inverso.
 *  F) Guarda de prioridades: si una lección P3 se convirtiera en P1 justo antes, la reorganización se
 *     para con error y no cambia nada.
 *  G) Orden distinto: reorganizar primero y aplicar 095000/096000 después.
 * NO toca producción: solo habla con el servidor local de pruebas.
 *
 * Uso: node pruebas/lecciones-sql.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/lecciones-sql.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);

const M = "supabase/migrations/";
const R = "supabase/rollbacks/";
const N090 = M + "20261018090000_aprendizajes_lecciones_nuevas.sql";
const N095 = M + "20261018095000_aprendizajes_autorizacion_expresa.sql";
const N096 = M + "20261018096000_aprendizajes_blue_publico_y_admin.sql";
const N100 = M + "20261018100000_aprendizajes_reorganizar_en_grupos.sql";
const V090 = R + "20261018090000_aprendizajes_lecciones_nuevas_revertir.sql";
const V095 = R + "20261018095000_aprendizajes_autorizacion_expresa_revertir.sql";
const V096 = R + "20261018096000_aprendizajes_blue_publico_y_admin_revertir.sql";
const V100 = R + "20261018100000_aprendizajes_reorganizar_revertir.sql";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};
const q = (base, sql) => db.consulta(base, sql);
const n = async (base, sql) => Number(await q(base, sql));

// Cuántas lecciones originales difieren de la copia hecha antes de aplicar nada (regla, ejemplos,
// prioridad, categoría o activa). Tras una vuelta atrás completa debe ser 0.
const diferenciasConOriginal = (base) =>
  n(base, `select count(*) from public.aprendizajes a join public._orig o on o.id = a.id
            where a.regla is distinct from o.regla or a.ejemplo_mal is distinct from o.ejemplo_mal
               or a.ejemplo_bien is distinct from o.ejemplo_bien or a.prioridad is distinct from o.prioridad
               or a.categoria is distinct from o.categoria or a.activa is distinct from o.activa or a.titulo is distinct from o.titulo`);
const huella = (base) =>
  q(base, `select count(*) || '/' || sum(length(regla)) || '/' || sum(prioridad) || '/' || sum(case when activa then 1 else 0 end) from public.aprendizajes`);
const titulosRepetidos = (base) => n(base, "select count(*) - count(distinct titulo) from public.aprendizajes");

// Invariantes de la reorganización: 0 filas problemáticas en cada una.
async function invariantesGrupos(base, etiqueta) {
  ok((await n(base, `select count(*) from public.aprendizajes g where g.titulo like 'Grupo · %' and g.activa`)) > 0, `${etiqueta}: hay grupos activos`);
  // Cada grupo tiene la misma prioridad que TODAS las lecciones que reúne (las que quedaron inactivas dentro de él).
  const mezcla = await n(base, `select count(*) from public.aprendizajes g join public.aprendizajes o
      on o.titulo not like 'Grupo · %' and not o.activa and position(o.regla in g.regla) > 0
     where g.titulo like 'Grupo · %' and g.prioridad <> o.prioridad`);
  ok(mezcla === 0, `${etiqueta}: ningún grupo mezcla prioridades (filas problemáticas: ${mezcla})`);
  // Ninguna P3 ni P2 dentro de un grupo P1, y la prioridad del grupo es la de sus miembros: comprobado arriba.
  const p3enP1 = await n(base, `select count(*) from public.aprendizajes g join public.aprendizajes o
      on o.titulo not like 'Grupo · %' and not o.activa and o.prioridad = 3 and position(o.regla in g.regla) > 0
     where g.titulo like 'Grupo · %' and g.prioridad < 3`);
  ok(p3enP1 === 0, `${etiqueta}: ninguna preferencia (P3) dentro de un grupo de prioridad más alta (${p3enP1})`);
  // No se pierde ninguna palabra: el texto completo de cada lección desactivada y agrupada está en un grupo,
  // salvo las que se dejaron inactivas a propósito (solo «Blue fuera del panel»).
  const perdidas = await n(base, `select count(*) from public.aprendizajes o
     where not o.activa and o.titulo not like 'Grupo · %' and o.titulo <> 'Blue fuera del panel'
       and not exists (select 1 from public.aprendizajes g where g.titulo like 'Grupo · %' and position(o.regla in g.regla) > 0)`);
  ok(perdidas === 0, `${etiqueta}: el texto completo de cada lección agrupada está dentro de su grupo (perdidas: ${perdidas})`);
  const ejemplosPerdidos = await n(base, `select count(*) from public.aprendizajes o
     where not o.activa and o.titulo not like 'Grupo · %' and o.titulo <> 'Blue fuera del panel' and coalesce(o.ejemplo_mal, '') <> ''
       and not exists (select 1 from public.aprendizajes g where g.titulo like 'Grupo · %' and position(o.ejemplo_mal in g.ejemplo_mal) > 0)`);
  ok(ejemplosPerdidos === 0, `${etiqueta}: el ejemplo_mal de cada lección agrupada está dentro de su grupo (perdidos: ${ejemplosPerdidos})`);
  const maximo = await q(base, `select max(length(regla)) || ' / ' || max(length(ejemplo_mal)) || ' / ' || max(length(ejemplo_bien)) from public.aprendizajes where titulo like 'Grupo · %'`);
  const [mr, mm, mb] = maximo.split(" / ").map(Number);
  ok(mr <= 4000 && mm <= 2000 && mb <= 2000, `${etiqueta}: el grupo más largo mide regla ${mr}/4000, ejemplo_mal ${mm}/2000, ejemplo_bien ${mb}/2000`);
  ok((await titulosRepetidos(base)) === 0, `${etiqueta}: no hay títulos repetidos`);
}

try {
  console.log("Preparando la base aislada con el historial de lecciones del repo…");
  const plantilla = await db.crearBaseConHistorial();
  await db.aplicar(plantilla, []);
  await q(plantilla, "create table public._orig as select * from public.aprendizajes");
  const filas0 = await n(plantilla, "select count(*) from public.aprendizajes");
  ok(filas0 === 55, `réplica: 55 lecciones iguales a producción (${filas0})`);

  // A) 090000
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N090]);
    ok((await n(b, "select count(*) from public.aprendizajes")) === 57, "A: aplicar 090000 crea 2 lecciones (57 en total)");
    const h1 = await huella(b);
    await db.aplicar(b, [N090]);
    ok((await huella(b)) === h1, "A: repetir 090000 no cambia nada (idempotente)");
    await db.aplicar(b, [V090]);
    ok((await n(b, "select count(*) from public.aprendizajes where activa")) === 55, "A: la vuelta atrás deja activas solo las 55 originales");
    ok((await diferenciasConOriginal(b)) === 0, "A: tras la vuelta atrás las originales están idénticas");
  }

  // B) 095000
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N095]);
    ok((await n(b, "select count(*) from public.aprendizajes where titulo like 'Autorización expresa%' and activa and prioridad = 1")) === 1, "B: la lección de autorización existe, activa y de prioridad 1");
    const marcas = await n(b, "select sum((length(regla) - length(replace(regla, 'ACTUALIZADA 2026-10-18', ''))) / length('ACTUALIZADA 2026-10-18')) from public.aprendizajes where titulo in ('Claude ejecuta, el dueño solo da la orden', 'Publicar en cuanto la vista previa esté en verde', 'Supabase lo aplica Claude')");
    ok(marcas === 3, `B: cada una de las 3 lecciones antiguas lleva 1 nota «ACTUALIZADA» (${marcas} en total)`);
    const intactas = await n(b, `select count(*) from public.aprendizajes a join public._orig o on o.id = a.id where a.titulo in ('Claude ejecuta, el dueño solo da la orden', 'Publicar en cuanto la vista previa esté en verde', 'Supabase lo aplica Claude') and left(a.regla, length(o.regla)) = o.regla`);
    ok(intactas === 3, "B: el texto original de las 3 lecciones sigue entero al principio");
    const h1 = await huella(b);
    await db.aplicar(b, [N095]);
    ok((await huella(b)) === h1, "B: repetir 095000 no cambia nada (idempotente)");
    await db.aplicar(b, [V095]);
    ok((await diferenciasConOriginal(b)) === 0, "B: la vuelta atrás deja las 55 originales idénticas");
    ok((await n(b, "select count(*) from public.aprendizajes where titulo like 'Autorización expresa%' and activa")) === 0, "B: la lección nueva queda inactiva");
  }

  // C) 096000
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N096]);
    ok((await n(b, "select count(*) from public.aprendizajes where titulo = 'Blue: interfaz pública y Administración' and activa")) === 1, "C: la lección nueva de Blue está activa");
    ok((await n(b, "select count(*) from public.aprendizajes where titulo = 'Blue fuera del panel' and not activa and regla like '%SUSTITUIDA 2026-10-18%'")) === 1, "C: «Blue fuera del panel» queda inactiva y con la nota de sustituida");
    const original = await n(b, "select count(*) from public.aprendizajes a join public._orig o on o.id = a.id where a.titulo = 'Blue fuera del panel' and left(a.regla, length(o.regla)) = o.regla");
    ok(original === 1, "C: el texto original de «Blue fuera del panel» se conserva entero");
    const h1 = await huella(b);
    await db.aplicar(b, [N096]);
    ok((await huella(b)) === h1, "C: repetir 096000 no cambia nada (idempotente)");
    await db.aplicar(b, [V096]);
    ok((await diferenciasConOriginal(b)) === 0, "C: la vuelta atrás deja las 55 originales idénticas (incluida «Blue fuera del panel» activa)");
  }

  // D) 100000 sola
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N100]);
    await invariantesGrupos(b, "D");
    const grupos = await q(b, "select titulo || ' [P' || prioridad || '] ' || length(regla) from public.aprendizajes where titulo like 'Grupo · %' order by prioridad, titulo");
    console.log("INFO grupos creados:\n" + grupos.split("\n").map((l) => "     " + l).join("\n"));
    const sueltas = await q(b, "select string_agg(titulo || ' [P' || prioridad || ']', ' · ' order by prioridad, titulo) from public.aprendizajes where activa and titulo not like 'Grupo · %'");
    console.log("INFO lecciones activas sin agrupar: " + sueltas);
    const h1 = await huella(b);
    await db.aplicar(b, [N100]);
    ok((await huella(b)) === h1, "D: repetir 100000 no cambia nada (idempotente)");
    await db.aplicar(b, [V100]);
    ok((await diferenciasConOriginal(b)) === 0, "D: la vuelta atrás deja las 55 originales idénticas");
    ok((await n(b, "select count(*) from public.aprendizajes where activa and titulo like 'Grupo · %'")) === 0, "D: tras la vuelta atrás no queda ningún grupo activo");
    // Tras el rollback, repetir la migración NO debe volver a desactivar las sueltas (el grupo existe, inactivo).
    await db.aplicar(b, [N100]);
    ok((await n(b, "select count(*) from public.aprendizajes where activa and titulo not like 'Grupo · %'")) === 55, "D: volver a aplicar tras la vuelta atrás no deja el Centro sin lecciones activas (las 55 siguen activas)");
  }

  // E) Secuencia completa y vuelta atrás en orden inverso
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N090, N095, N096]);
    ok((await n(b, "select count(*) from public.aprendizajes")) === 59, "E: tras 090000, 095000 y 096000 la tabla tiene 59 filas (55 + 4 lecciones nuevas)");
    await db.aplicar(b, [N100]);
    await invariantesGrupos(b, "E");
    const activas = await n(b, "select count(*) from public.aprendizajes where activa");
    const total = await n(b, "select count(*) from public.aprendizajes");
    console.log(`INFO secuencia completa: ${activas} lecciones activas de ${total} filas en la tabla`);
    await db.aplicar(b, [V100, V096, V095, V090]);
    ok((await diferenciasConOriginal(b)) === 0, "E: tras la vuelta atrás completa en orden inverso las 55 originales están idénticas");
    ok((await n(b, "select count(*) from public.aprendizajes where activa")) === 55, "E: quedan activas exactamente las 55 originales");
  }

  // F) Guarda de prioridades
  {
    const b = await db.clonar(plantilla);
    await q(b, "update public.aprendizajes set prioridad = 1 where titulo = 'Archivos de ayuda fuera de app/'");
    let mensaje = "";
    try {
      await db.aplicar(b, [N100]);
    } catch (e) {
      mensaje = String(e.message);
    }
    ok(/mezclaría prioridades/.test(mensaje), `F: con una P3 convertida en P1 la reorganización se para con error (${mensaje.slice(0, 90)})`);
    ok((await n(b, "select count(*) from public.aprendizajes where titulo like 'Grupo · %'")) === 0, "F: y no deja ningún grupo a medias (todo o nada)");
    ok((await n(b, "select count(*) from public.aprendizajes where not activa")) === 0, "F: ni desactiva ninguna lección");
  }

  // G) Orden distinto: reorganizar primero y aplicar 095000 y 096000 después
  {
    const b = await db.clonar(plantilla);
    await db.aplicar(b, [N100, N095, N096]);
    ok((await titulosRepetidos(b)) === 0, "G: en este orden no hay títulos repetidos");
    ok((await n(b, "select count(*) from public.aprendizajes where titulo like 'Autorización expresa%' and activa")) === 1, "G: la lección de autorización queda activa suelta");
    ok((await n(b, "select count(*) from public.aprendizajes where titulo = 'Blue fuera del panel' and not activa and regla like '%SUSTITUIDA 2026-10-18%'")) === 1, "G: «Blue fuera del panel» (ya agrupada) recibe su nota y sigue inactiva");
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.message).slice(0, 600)}`);
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
