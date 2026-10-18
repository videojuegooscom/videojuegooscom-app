/**
 * pruebas/sql-aislado.mjs — prueba migraciones SQL en una base AISLADA, nunca en producción.
 *
 * Qué hace: en un servidor PostgreSQL local y de usar y tirar crea bases nuevas (vz_aislada_<hora>), les
 * aplica el esqueleto de Supabase (supabase/tests/aislado/00_supabase_stub.sql) y después los archivos
 * SQL que se le pidan, con ON_ERROR_STOP (para en el primer error). NO borra nada: cada ejecución
 * usa una base nueva (o un clon de otra).
 *
 * Seguridad: se niega a trabajar si el servidor no es 127.0.0.1 o localhost, si el nombre del servidor
 * contiene «supabase», o si la base no empieza por vz_aislada_.
 *
 * Uso en línea de comandos:
 *   node pruebas/sql-aislado.mjs <servidor> base                       -> crea la base y escribe BASE=<nombre>
 *   node pruebas/sql-aislado.mjs <servidor> historial                  -> crea la base y repite las migraciones de lecciones del repo
 *   node pruebas/sql-aislado.mjs <servidor> clon <base>                -> copia una base (plantilla) a otra nueva
 *   node pruebas/sql-aislado.mjs <servidor> aplicar <base> <archivo>…  -> aplica archivos SQL en orden
 *   node pruebas/sql-aislado.mjs <servidor> consulta <base> "<sql>"    -> ejecuta una consulta y muestra el resultado
 *   <servidor> = postgresql://postgres@127.0.0.1:55432
 * Como librería: import { conectar } from "./sql-aislado.mjs".
 * Requisitos: el cliente psql y un PostgreSQL local de pruebas (ver docs/pruebas-sql-aisladas.md).
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

// Migraciones de lecciones (y lo que tocan de pasada), en el orden en que se aplicaron en producción.
export const HISTORIAL_LECCIONES = [
  "supabase/migrations/20261012150000_centro_aprendizajes.sql",
  "supabase/migrations/20261014130000_aprendizajes_carga_inicial.sql",
  "supabase/migrations/20261014140100_aprendizajes_veoaura.sql",
  "supabase/migrations/20261014150100_aprendizajes_descripcion_veoaura.sql",
  "supabase/migrations/20261015120000_aprendizajes_hazlo_tu.sql",
  "supabase/migrations/20261015140000_aprendizajes_blue_y_subtitulos.sql",
  "supabase/migrations/20261015180000_aprendizajes_movil_sin_desbordes.sql",
  "supabase/migrations/20261015200000_aprendizajes_pointer_events.sql",
  "supabase/migrations/20261015210000_aprendizajes_probar_en_navegador.sql",
  "supabase/migrations/20261015230000_aprendizajes_medir_y_no_prometer.sql",
  "supabase/migrations/20261016100000_aprendizajes_una_mano.sql",
  "supabase/migrations/20261016120000_aprendizajes_buscador_arriba_y_formularios.sql",
  "supabase/migrations/20261016140000_aprendizajes_probar_formularios.sql",
  "supabase/migrations/20261016160000_aprendizajes_guia_navega.sql",
  "supabase/migrations/20261016180000_aprendizajes_ambicion.sql",
  "supabase/migrations/20261016190000_aprendizajes_ambicion_orden.sql",
  "supabase/migrations/20261016200000_aprendizajes_blue_sitio_instalar.sql",
  "supabase/migrations/20261016220000_aprendizajes_blue_conocimiento.sql",
  "supabase/migrations/20261016230000_aprendizajes_una_vez_catalogo_disco.sql",
  "supabase/migrations/20261017090000_aprendizajes_blue_scroll_vender_chat.sql",
  "supabase/migrations/20261017100000_aprendizajes_brillo_sutil.sql",
  "supabase/tests/aislado/10_tablas_ajenas.sql",
  "supabase/migrations/20261017120000_aprendizajes_revision_calidad_web.sql",
  "supabase/migrations/20261017140000_aprendizajes_revision_resultado.sql",
  "supabase/migrations/20261017160000_auditorias_web.sql",
  "supabase/migrations/20261017170000_aprendizajes_revision_automatica.sql",
  "supabase/migrations/20261017180000_auditoria_primera_registro.sql",
  "supabase/migrations/20261017190000_auditoria_marcas_pendientes.sql",
];

export function conectar(servidorUrl) {
  const u = new URL(servidorUrl);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || /supabase/i.test(servidorUrl)) {
    throw new Error(`RECHAZADO: «${u.hostname}» no es un servidor local de pruebas. Esta herramienta nunca toca producción.`);
  }
  const comprobarBase = (b) => {
    if (!/^vz_aislada_[a-z0-9_]+$/.test(b ?? "")) throw new Error(`RECHAZADO: la base «${b}» no empieza por vz_aislada_.`);
  };
  const argsBase = (base) => ["-h", u.hostname, "-p", u.port || "5432", "-U", u.username || "postgres", "-d", base, "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  let contador = 0;
  const nuevoNombre = () => `vz_aislada_${Date.now()}_${contador++}`;

  // Ejecuta psql y devuelve stdout; si falla, el error lleva stderr (para ver el mensaje de PostgreSQL).
  async function psql(base, args, { env = {} } = {}) {
    try {
      const { stdout } = await execFileP("psql", [...argsBase(base), ...args], { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
      return stdout;
    } catch (e) {
      const err = new Error(String(e.stderr ?? e.message).trim());
      err.stderr = String(e.stderr ?? "");
      throw err;
    }
  }
  return {
    psql,
    async crearBase() {
      const nombre = nuevoNombre();
      await psql("postgres", ["-c", `create database ${nombre}`]);
      await psql(nombre, ["-f", "supabase/tests/aislado/00_supabase_stub.sql"]);
      return nombre;
    },
    async clonar(plantilla) {
      comprobarBase(plantilla);
      const nombre = nuevoNombre();
      await psql("postgres", ["-c", `create database ${nombre} template ${plantilla}`]);
      return nombre;
    },
    async aplicar(base, archivos) {
      comprobarBase(base);
      for (const a of archivos) {
        readFileSync(a); // falla claro si no existe
        await psql(base, ["-f", a]);
      }
    },
    async consulta(base, sql, { env = {} } = {}) {
      comprobarBase(base);
      return (await psql(base, ["-A", "-t", "-c", sql], { env })).trim();
    },
    // Base nueva con el esqueleto de Supabase y todo el historial de lecciones del repo.
    async crearBaseConHistorial() {
      const nombre = await this.crearBase();
      await this.aplicar(nombre, HISTORIAL_LECCIONES);
      return nombre;
    },
  };
}

// --- línea de comandos ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [servidorUrl, comando, ...resto] = process.argv.slice(2);
  try {
    if (!servidorUrl || !comando) throw new Error("Uso: node pruebas/sql-aislado.mjs <servidor> base|historial|clon|aplicar|consulta …");
    const db = conectar(servidorUrl);
    if (comando === "base") console.log(`BASE=${await db.crearBase()}`);
    else if (comando === "historial") console.log(`BASE=${await db.crearBaseConHistorial()}`);
    else if (comando === "clon") console.log(`BASE=${await db.clonar(resto[0])}`);
    else if (comando === "aplicar") {
      const [base, ...archivos] = resto;
      await db.aplicar(base, archivos);
      for (const a of archivos) console.log(`OK   aplicado ${a}`);
    } else if (comando === "consulta") console.log(await db.consulta(resto[0], resto[1]));
    else throw new Error(`Comando desconocido: ${comando}`);
  } catch (e) {
    console.error(`FALLO ${String(e.message).slice(0, 2000)}`);
    process.exit(1);
  }
}
