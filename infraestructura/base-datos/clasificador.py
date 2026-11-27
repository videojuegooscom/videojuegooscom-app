#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/clasificador.py
#                 (copia adaptada de VeoAura, commit eb5f74fc, autorizada por su propietario el 2026-11-27;
#                 diferencia aprobada por el dueño el 2026-11-27: INSERT y UPDATE limitados en las tablas
#                 de la tienda, ver _regla_datos)
#                 (se instala en /opt/vz-sql/ con instalar-sql.sh)
# Función:        Clasifica cada sentencia SQL con el parser real de PostgreSQL (pglast) como
#                 «permitida» o «requiere_accion_manual». Solo deja pasar lo demostrablemente
#                 aditivo o de lectura; todo lo destructivo, sensible o no reconocido se bloquea
#                 (falla cerrado). Analiza también los cuerpos de funciones SQL y PL/pgSQL y solo
#                 deja llamar a funciones del sistema de una lista segura o a funciones creadas y
#                 analizadas por el propio vz-sql (nunca a RPC existentes de la aplicación).
# Para qué sirve: Que vz-sql pueda trabajar solo contra Supabase sin poder borrar, vaciar,
#                 renombrar, ampliar permisos, ejecutar SQL dinámico ni llamar a funciones
#                 existentes que escriban datos o se salten D1/D2.
# Conectado con:  broker.py (lo usa antes de ejecutar nada; CatalogoPG responde a sus preguntas),
#                 test_clasificador.py.
# Utilizado por:  vz-sql-broker (servicio systemd) y sus pruebas.
# Dependencias:   python3, pglast 7.23 (parser de PostgreSQL 17; ver requisitos.txt).
# Estado:         ACTIVO
# ============================================================================
"""Reglas (CLAUDE.md §9 y decisiones D1–D6 de F1.2):

- Lectura: SELECT, EXPLAIN sin ANALYZE y SHOW de ajustes sin secretos.
- Funciones: solo las del sistema de FUNCIONES_SEGURAS_SISTEMA (calculan o leen metadatos) y las
  creadas por el propio agente (analizadas por este clasificador, sin SECURITY DEFINER). Cualquier
  función o RPC existente de la aplicación, o no demostrablemente segura → acción manual.
- Operadores: solo los de OPERADORES_SEGUROS y sin redefinir por la aplicación.
- Datos (D1/D2): INSERT y UPDATE en tablas vz_ops_*, creadas por el propio agente o, solo como
  sentencia principal de «aplicar», en las tablas de la tienda de public (dueño, 2026-11-27).
  UPDATE siempre con WHERE (el límite de 100 filas lo aplica el broker al ejecutar). En las tablas
  de la tienda: nada de INSERT … ON CONFLICT DO UPDATE (sobrescribe sin WHERE) ni de INSERT/UPDATE
  dentro de CTEs o de cuerpos de función (el límite de filas no se podría medir).
- Estructura: CREATE TABLE/INDEX/VIEW/FUNCTION/TYPE/DOMAIN/SEQUENCE nuevos, COMMENT,
  ALTER TYPE … ADD VALUE y ALTER TABLE solo con subcomandos aditivos. CREATE TRIGGER solo en
  tablas del sistema y con una función del agente.
- D3: CREATE POLICY solo en tablas del sistema, sin USING/WITH CHECK (true) ni roles anon/public.
- D4: CREATE OR REPLACE sobre algo existente, sobrecargar una función ajena y SECURITY DEFINER
  → acción manual.
- D5: GRANT que amplíe acceso (anon, authenticated, public u otros roles) → acción manual.
- Todo lo demás (DELETE, DROP, TRUNCATE, MERGE, RENAME, DO, COPY, SET ROLE, SQL dinámico,
  transacciones manuales, sentencias desconocidas…) → acción manual.
"""
import os
import re
import sys
from dataclasses import dataclass, field


def _cargar_pglast():
    ruta = os.environ.get("VZ_SQL_LIB", "/opt/vz-sql/lib")
    if os.path.isdir(ruta) and ruta not in sys.path:
        sys.path.insert(0, ruta)
    import pglast as _pglast
    return _pglast


pglast = _cargar_pglast()
from pglast import ast, enums  # noqa: E402
from pglast.stream import RawStream  # noqa: E402

PERMITIDA = "permitida"
MANUAL = "requiere_accion_manual"

LIMITE_FILAS_UPDATE = 100
PREFIJO_OPS = "vz_ops_"
ESQUEMAS_PERMITIDOS = {"public", "vz_pruebas"}
PREFIJO_ARCHIVO_MANUAL = "ACCION_MANUAL__"
MARCA_ACCION_MANUAL_RE = re.compile(r"--\s*VZ\s*:\s*ACCION_MANUAL", re.I)

ROLES_AMPLIOS = {"anon", "authenticated", "public"}
ROLES_GRANT_PERMITIDOS = {"service_role"}
PRIVILEGIOS_GRANT_PERMITIDOS = {"select", "insert", "update", "references", "trigger", "usage", "execute"}

# Funciones que leen el sistema de archivos, matan procesos, cambian configuración, ejecutan
# SQL dinámico o salen a la red. Prohibidas en cualquier parte de una sentencia (mensaje claro;
# de todos modos no están en FUNCIONES_SEGURAS_SISTEMA).
FUNCIONES_PROHIBIDAS = {
    "set_config", "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf", "pg_rotate_logfile",
    "pg_switch_wal", "pg_create_restore_point", "pg_promote", "pg_logical_emit_message",
    "lo_import", "lo_export", "lo_unlink", "lo_put", "lo_from_bytea", "lo_create",
    "query_to_xml", "query_to_xml_and_xmlschema", "query_to_xmlschema", "cursor_to_xml",
    "cursor_to_xmlschema", "table_to_xml", "table_to_xml_and_xmlschema", "table_to_xmlschema",
    "schema_to_xml", "schema_to_xml_and_xmlschema", "database_to_xml", "database_to_xml_and_xmlschema",
    "pg_stat_file", "pg_file_write", "pg_file_rename", "pg_file_unlink", "pg_import_system_collations",
}
PREFIJOS_FUNCIONES_PROHIBIDAS = ("pg_read_", "pg_ls_", "dblink", "http", "pg_file_")
ESQUEMAS_FUNCIONES_PROHIBIDOS = {"cron", "vault", "net", "dblink", "pgsodium", "supabase_functions",
                                 "graphql", "realtime", "storage", "pgbouncer", "supabase_migrations"}
FUNCIONES_AUTH_PERMITIDAS = {"uid", "jwt", "role", "email"}

# Funciones del sistema (pg_catalog) demostrablemente seguras: solo calculan, agregan o leen
# metadatos del esquema. No escriben (ni secuencias), no leen archivos, no salen a la red, no
# duermen ni muestran cuerpos de funciones. Cualquier otra función se bloquea (falla cerrado).
FUNCIONES_SEGURAS_SISTEMA = frozenset({
    # agregados y ventana
    "count", "sum", "avg", "min", "max", "bool_and", "bool_or", "every", "array_agg", "string_agg",
    "json_agg", "jsonb_agg", "json_object_agg", "jsonb_object_agg", "stddev", "stddev_pop", "stddev_samp",
    "variance", "var_pop", "var_samp", "percentile_cont", "percentile_disc", "mode",
    "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile", "lag", "lead",
    "first_value", "last_value", "nth_value",
    # texto
    "lower", "upper", "initcap", "length", "char_length", "character_length", "octet_length", "bit_length",
    "substr", "substring", "position", "strpos", "replace", "translate", "btrim", "ltrim", "rtrim", "lpad",
    "rpad", "left", "right", "concat", "concat_ws", "format", "split_part", "repeat", "reverse",
    "starts_with", "ascii", "chr", "overlay", "normalize", "is_normalized", "quote_ident", "quote_literal",
    "quote_nullable", "regexp_replace", "regexp_match", "regexp_matches", "regexp_like", "regexp_count",
    "regexp_substr", "regexp_instr", "regexp_split_to_array", "regexp_split_to_table", "string_to_array",
    "array_to_string", "like_escape", "similar_to_escape", "md5", "sha224", "sha256", "sha384", "sha512",
    "encode", "decode", "convert_from", "convert_to", "to_char", "to_number", "to_date", "to_timestamp",
    "to_hex", "pg_collation_for",
    # números
    "abs", "ceil", "ceiling", "floor", "round", "trunc", "mod", "div", "power", "sqrt", "cbrt", "exp", "ln",
    "log", "log10", "sign", "pi", "random", "width_bucket", "gcd", "lcm", "num_nulls", "num_nonnulls",
    # fechas
    "now", "clock_timestamp", "statement_timestamp", "transaction_timestamp", "date_trunc", "date_part",
    "date_bin", "extract", "age", "make_date", "make_time", "make_timestamp", "make_timestamptz",
    "make_interval", "justify_days", "justify_hours", "justify_interval", "isfinite", "timezone", "overlaps",
    # json y arrays
    "json_build_object", "jsonb_build_object", "json_build_array", "jsonb_build_array", "json_object",
    "jsonb_object", "to_json", "to_jsonb", "row_to_json", "array_to_json", "json_array_length",
    "jsonb_array_length", "json_array_elements", "jsonb_array_elements", "json_array_elements_text",
    "jsonb_array_elements_text", "json_each", "jsonb_each", "json_each_text", "jsonb_each_text",
    "json_object_keys", "jsonb_object_keys", "json_typeof", "jsonb_typeof", "json_strip_nulls",
    "jsonb_strip_nulls", "jsonb_set", "jsonb_set_lax", "jsonb_insert", "jsonb_pretty", "json_extract_path",
    "json_extract_path_text", "jsonb_extract_path", "jsonb_extract_path_text", "jsonb_path_exists",
    "jsonb_path_match", "jsonb_path_query", "jsonb_path_query_array", "jsonb_path_query_first",
    "array_length", "array_position", "array_positions", "array_append", "array_prepend", "array_cat",
    "array_remove", "array_replace", "array_dims", "array_lower", "array_upper", "array_ndims", "cardinality",
    "unnest", "generate_series", "generate_subscripts",
    # identificadores
    "gen_random_uuid",
    # metadatos del esquema (D8 y comprobaciones)
    "version", "current_setting", "current_database", "current_schema", "format_type", "pg_get_expr",
    "pg_get_constraintdef", "pg_get_indexdef", "pg_get_triggerdef", "pg_get_function_identity_arguments",
    "pg_get_function_arguments", "pg_get_function_result", "pg_get_userbyid", "to_regclass", "to_regtype",
    "to_regproc", "to_regprocedure", "to_regrole", "to_regnamespace", "obj_description", "col_description",
    "pg_typeof", "pg_column_size", "pg_relation_size", "pg_table_size", "pg_indexes_size",
    "pg_total_relation_size", "pg_size_pretty", "pg_table_is_visible", "has_table_privilege",
    "has_column_privilege", "has_schema_privilege", "has_function_privilege", "has_sequence_privilege",
    "pg_has_role", "aclexplode",
})
# current_setting() y SHOW solo con ajustes que no pueden contener secretos (en Supabase hay
# ajustes personalizados como app.settings.*).
AJUSTES_LEGIBLES = frozenset({
    "server_version", "server_version_num", "search_path", "timezone", "datestyle", "intervalstyle",
    "client_encoding", "server_encoding", "standard_conforming_strings", "statement_timeout", "lock_timeout",
    "idle_in_transaction_session_timeout", "transaction_read_only", "default_transaction_read_only",
    "max_connections", "lc_collate", "lc_ctype", "integer_datetimes",
})
# Vistas del sistema que muestran ajustes, credenciales o consultas de otras sesiones.
RELACIONES_SISTEMA_PROHIBIDAS = frozenset({
    "pg_settings", "pg_file_settings", "pg_hba_file_rules", "pg_ident_file_mappings", "pg_authid",
    "pg_shadow", "pg_user_mappings", "pg_stat_activity", "pg_db_role_setting",
})
OPERADORES_SEGUROS = frozenset({
    "=", "<>", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "^", "||",
    "~~", "~~*", "!~~", "!~~*", "~", "~*", "!~", "!~*",
    "->", "->>", "#>", "#>>", "@>", "<@", "?", "?|", "?&", "&&",
    "between", "not between", "between symmetric", "not between symmetric",
})
OPERADORES_PALABRA = {"between", "not between", "between symmetric", "not between symmetric"}

ALTER_TABLE_PERMITIDOS = {
    enums.AlterTableType.AT_AddColumn, enums.AlterTableType.AT_AddConstraint,
    enums.AlterTableType.AT_ValidateConstraint, enums.AlterTableType.AT_ColumnDefault,
    enums.AlterTableType.AT_SetNotNull, enums.AlterTableType.AT_EnableRowSecurity,
    enums.AlterTableType.AT_ForceRowSecurity,
}

PLPGSQL_CONOCIDAS = {
    "PLpgSQL_stmt_block", "PLpgSQL_stmt_assign", "PLpgSQL_stmt_if", "PLpgSQL_stmt_case",
    "PLpgSQL_stmt_loop", "PLpgSQL_stmt_while", "PLpgSQL_stmt_fori", "PLpgSQL_stmt_fors",
    "PLpgSQL_stmt_forc", "PLpgSQL_stmt_foreach_a", "PLpgSQL_stmt_exit", "PLpgSQL_stmt_return",
    "PLpgSQL_stmt_return_next", "PLpgSQL_stmt_return_query", "PLpgSQL_stmt_raise",
    "PLpgSQL_stmt_assert", "PLpgSQL_stmt_execsql", "PLpgSQL_stmt_perform", "PLpgSQL_stmt_getdiag",
    "PLpgSQL_stmt_open", "PLpgSQL_stmt_fetch", "PLpgSQL_stmt_close",
}
PLPGSQL_PROHIBIDAS = {
    "PLpgSQL_stmt_dynexecute": "EXECUTE dinámico", "PLpgSQL_stmt_dynfors": "FOR … IN EXECUTE",
    "PLpgSQL_stmt_call": "CALL", "PLpgSQL_stmt_commit": "COMMIT", "PLpgSQL_stmt_rollback": "ROLLBACK",
}


class AccionManual(Exception):
    def __init__(self, motivo, categoria="sensible"):
        super().__init__(motivo)
        self.motivo, self.categoria = motivo, categoria


@dataclass
class Sentencia:
    indice: int
    tipo: str
    objeto: str
    veredicto: str
    motivo: str
    categoria: str          # lectura | datos | estructura | permisos | destructiva | sensible | no_reconocida
    texto: str
    fuera_de_transaccion: bool = False
    es_update: bool = False

    def resumen(self):
        # Sin el texto: nunca se registran valores (auditoría).
        return {"n": self.indice, "tipo": self.tipo, "objeto": self.objeto, "veredicto": self.veredicto,
                "motivo": self.motivo, "categoria": self.categoria}


@dataclass
class Resultado:
    sentencias: list = field(default_factory=list)
    error: str = ""

    @property
    def permitido(self):
        return not self.error and bool(self.sentencias) and all(s.veredicto == PERMITIDA for s in self.sentencias)

    def bloqueadas(self):
        return [s for s in self.sentencias if s.veredicto != PERMITIDA]


class Contexto:
    def __init__(self, catalogo, modo):
        self.catalogo, self.modo = catalogo, modo
        self.creadas = set()      # (esquema, nombre) de relaciones creadas en este mismo archivo
        self.funciones = set()    # (esquema, nombre) de funciones creadas (y analizadas) en este archivo
        self.cache = {}           # respuestas del catálogo ya consultadas

    def pregunta(self, metodo, *args):
        """Pregunta al catálogo (con caché). Si el catálogo no sabe responder, la excepción hace que
        la sentencia quede en acción manual (falla cerrado)."""
        clave = (metodo,) + args
        if clave not in self.cache:
            self.cache[clave] = bool(getattr(self.catalogo, metodo)(*args))
        return self.cache[clave]


# =============================================================== utilidades =====

def es_archivo_accion_manual(nombre_archivo, contenido):
    return (os.path.basename(nombre_archivo or "").upper().startswith(PREFIJO_ARCHIVO_MANUAL)
            or bool(MARCA_ACCION_MANUAL_RE.search(contenido or "")))


def _hijos(nodo):
    if isinstance(nodo, (tuple, list)):
        for x in nodo:
            yield x
    elif isinstance(nodo, ast.Node):
        for nombre in nodo.__slots__:
            yield getattr(nodo, nombre, None)


def recorrer(nodo):
    """Todos los nodos del árbol (en profundidad), incluido el propio."""
    pila = [nodo]
    while pila:
        n = pila.pop()
        if isinstance(n, ast.Node):
            yield n
            pila.extend(_hijos(n))
        elif isinstance(n, (tuple, list)):
            pila.extend(n)


def _nombre(partes):
    vals = [p.sval for p in (partes or ()) if isinstance(p, ast.String)]
    return [v.lower() for v in vals]


def _rv(rv):
    return (rv.schemaname or "public").lower(), (rv.relname or "").lower()


def _qn(esquema, nombre):
    return f"{esquema}.{nombre}"


def _roles(roles):
    salida = []
    for r in roles or ():
        if r.roletype == enums.RoleSpecType.ROLESPEC_PUBLIC:
            salida.append("public")
        elif r.roletype == enums.RoleSpecType.ROLESPEC_CSTRING:
            salida.append((r.rolename or "").lower())
        else:
            salida.append(str(r.roletype.name).lower())  # CURRENT_USER, SESSION_USER…
    return salida


def _es_verdadero_trivial(expr):
    if expr is None:
        return False
    if isinstance(expr, ast.A_Const) and isinstance(expr.val, ast.Boolean):
        return bool(expr.val.boolval)
    if isinstance(expr, ast.TypeCast) and isinstance(expr.arg, ast.A_Const):
        tipo = _nombre(expr.typeName.names)[-1:] if expr.typeName else []
        val = expr.arg.val
        texto = getattr(val, "sval", None) if isinstance(val, ast.String) else None
        if tipo and tipo[0] in ("bool", "boolean") and texto and texto.strip().lower() in ("t", "true", "1", "yes", "on", "y"):
            return True
    if isinstance(expr, ast.A_Expr) and _nombre(expr.name) == ["="] \
            and isinstance(expr.lexpr, ast.A_Const) and isinstance(expr.rexpr, ast.A_Const):
        return repr(expr.lexpr.val) == repr(expr.rexpr.val)
    return False


def _funcion_prohibida(fc):
    partes = _nombre(fc.funcname)
    if not partes:
        return None
    nombre, esquema = partes[-1], (partes[0] if len(partes) > 1 else None)
    if esquema == "auth":
        return None if nombre in FUNCIONES_AUTH_PERMITIDAS else f"función auth.{nombre}"
    if esquema in ESQUEMAS_FUNCIONES_PROHIBIDOS:
        return f"función del esquema {esquema} ({'.'.join(partes)})"
    if nombre in FUNCIONES_PROHIBIDAS or nombre.startswith(PREFIJOS_FUNCIONES_PROHIBIDAS):
        return f"función prohibida {'.'.join(partes)}"
    return None


ESQUEMAS_TABLAS_PROHIBIDOS = {"vault", "cron", "net", "pgsodium", "supabase_functions", "supabase_migrations",
                              "pgbouncer"}


def _funcion_del_agente(esquema, nombre, ctx):
    """Creada y analizada por vz-sql: en este archivo o, según el catálogo, propiedad del agente
    en todas sus variantes y sin SECURITY DEFINER."""
    return (esquema, nombre) in ctx.funciones or ctx.pregunta("es_funcion_del_agente", esquema, nombre)


def _revisar_ajuste(arg, que):
    if isinstance(arg, ast.A_Const) and isinstance(arg.val, ast.String) \
            and (arg.val.sval or "").lower() in AJUSTES_LEGIBLES:
        return
    raise AccionManual(f"{que}: solo se pueden leer ajustes que no contienen secretos", "sensible")


def _revisar_llamada(fc, ctx):
    """Una llamada a función solo pasa si es demostrablemente segura (falla cerrado)."""
    partes = _nombre(fc.funcname)
    if not partes or len(partes) > 2:
        raise AccionManual("llamada a una función con un nombre no reconocido", "no_reconocida")
    nombre, esquema = partes[-1], (partes[0] if len(partes) == 2 else None)
    if esquema == "auth":
        return  # _funcion_prohibida ya limita auth a uid/jwt/role/email
    if esquema in ESQUEMAS_PERMITIDOS:
        if _funcion_del_agente(esquema, nombre, ctx):
            return
        raise AccionManual(f"llamada a la función existente {esquema}.{nombre}: las funciones/RPC de la "
                           "aplicación pueden escribir datos o saltarse D1/D2; solo se permiten las creadas y "
                           "analizadas por vz-sql", "sensible")
    if esquema is None and _funcion_del_agente("public", nombre, ctx) \
            and not ctx.pregunta("existe_funcion", "pg_catalog", nombre):
        return
    if esquema in (None, "pg_catalog") and nombre in FUNCIONES_SEGURAS_SISTEMA:
        if esquema is None and ctx.pregunta("funcion_de_aplicacion", nombre):
            raise AccionManual(f"llamada a {nombre}(): la aplicación tiene una función con ese nombre que podría "
                               f"usarse en lugar de la del sistema; usa pg_catalog.{nombre}", "sensible")
        if nombre == "current_setting":
            _revisar_ajuste(fc.args[0] if fc.args else None, "current_setting")
        return
    raise AccionManual(f"llamada a la función {'.'.join(partes)}: no está en la lista de funciones "
                       "demostrablemente seguras ni la ha creado vz-sql", "sensible")


def _revisar_operador(expr, ctx):
    partes = _nombre(expr.name)
    if not partes or len(partes) > 2 or (len(partes) == 2 and partes[0] != "pg_catalog"):
        raise AccionManual(f"operador {'.'.join(partes) or '?'}: solo se admiten operadores del sistema", "sensible")
    operador = partes[-1]
    if operador not in OPERADORES_SEGUROS:
        raise AccionManual(f"operador {operador}: no está en la lista de operadores seguros", "sensible")
    if operador not in OPERADORES_PALABRA and len(partes) == 1 \
            and ctx.pregunta("operador_de_aplicacion", operador):
        raise AccionManual(f"operador {operador}: la aplicación define un operador con ese símbolo que podría "
                           "ejecutar una función propia", "sensible")


def _revisar_funciones(nodo, ctx):
    """Funciones, operadores y relaciones sensibles en cualquier parte del árbol."""
    for n in recorrer(nodo):
        if isinstance(n, ast.RangeVar):
            esquema = (n.schemaname or "").lower()
            # Consulta habitual (antes con list_migrations del MCP): leer el registro de migraciones, solo en consultar.
            if ctx.modo == "lectura" and esquema == "supabase_migrations" \
                    and (n.relname or "").lower() == "schema_migrations":
                continue
            if esquema in ESQUEMAS_TABLAS_PROHIBIDOS:
                raise AccionManual(f"referencia a {n.schemaname}.{n.relname}: esquema interno sensible", "sensible")
            if esquema in ("", "pg_catalog") and (n.relname or "").lower() in RELACIONES_SISTEMA_PROHIBIDAS:
                raise AccionManual(f"referencia a {n.relname}: puede mostrar ajustes, credenciales o consultas "
                                   "de otras sesiones", "sensible")
        elif isinstance(n, ast.FuncCall):
            motivo = _funcion_prohibida(n)
            if motivo:
                raise AccionManual(motivo + ": lee archivos, mata procesos, cambia configuración, "
                                            "ejecuta SQL dinámico o sale a la red", "sensible")
            _revisar_llamada(n, ctx)
        elif isinstance(n, ast.A_Expr):
            _revisar_operador(n, ctx)


def _tabla_del_sistema(esquema, nombre, ctx):
    if esquema not in ESQUEMAS_PERMITIDOS:
        return False
    if (esquema, nombre) in ctx.creadas:
        return True
    if esquema == "public" and nombre.startswith(PREFIJO_OPS):
        return True
    return bool(ctx.catalogo.es_del_agente(esquema, nombre))


def _exigir_tabla_del_sistema(rv, ctx, que):
    esquema, nombre = _rv(rv)
    if not _tabla_del_sistema(esquema, nombre, ctx):
        raise AccionManual(f"{que} sobre {_qn(esquema, nombre)}: solo se permite en tablas vz_ops_* o "
                           "creadas por el propio sistema (D1). Las tablas de negocio existentes requieren "
                           "acción manual.", "sensible")
    return _qn(esquema, nombre)


# ========================================================== datos anidados =====

def _revisar_dml_anidado(st, ctx, modo):
    """DML dentro de CTEs o subconsultas: DELETE/MERGE nunca; INSERT/UPDATE con las reglas de datos."""
    for n in recorrer(st):
        if n is st:
            continue
        if isinstance(n, (ast.DeleteStmt, ast.MergeStmt)):
            raise AccionManual(f"{type(n).__name__} anidado (CTE que modifica datos): borra o sobrescribe "
                               "datos", "destructiva")
        if isinstance(n, (ast.InsertStmt, ast.UpdateStmt)):
            if modo == "lectura":
                raise AccionManual("consultar solo admite lectura; hay un INSERT/UPDATE anidado", "datos")
            _regla_datos(n, ctx)


def _tabla_de_la_tienda(st, ctx):
    """Tabla existente de public que no es del sistema y en la que el rol tiene ese permiso (dueño, 2026-11-27:
    INSERT/UPDATE limitados y solo en las tablas de contenido; los permisos y las políticas RLS van tabla a
    tabla en ACCION_MANUAL__rol_vz_agente_2026-11-27.sql)."""
    esquema, nombre = _rv(st.relation)
    privilegio = "INSERT" if isinstance(st, ast.InsertStmt) else "UPDATE"
    return esquema == "public" and not _tabla_del_sistema(esquema, nombre, ctx) \
        and ctx.pregunta("existe_relacion", esquema, nombre) and ctx.pregunta("puede", esquema, nombre, privilegio)


def _regla_datos(st, ctx, tienda=False):
    """tienda=True solo para la sentencia principal de «aplicar»: el broker mide sus filas."""
    if tienda and isinstance(st, (ast.InsertStmt, ast.UpdateStmt)) and _tabla_de_la_tienda(st, ctx):
        objeto = _qn(*_rv(st.relation))
        if isinstance(st, ast.InsertStmt):
            conflicto = st.onConflictClause
            if conflicto is not None and conflicto.action != enums.OnConflictAction.ONCONFLICT_NOTHING:
                raise AccionManual(f"INSERT … ON CONFLICT DO UPDATE sobre {objeto}: sobrescribe filas de la tienda "
                                   "sin WHERE ni límite", "destructiva")
            return objeto
    elif isinstance(st, ast.InsertStmt):
        return _exigir_tabla_del_sistema(st.relation, ctx, "INSERT")
    if isinstance(st, ast.UpdateStmt):
        objeto = _qn(*_rv(st.relation)) if tienda and _tabla_de_la_tienda(st, ctx) \
            else _exigir_tabla_del_sistema(st.relation, ctx, "UPDATE")
        if st.whereClause is None:
            raise AccionManual(f"UPDATE sin WHERE sobre {objeto} (D2)", "destructiva")
        if _es_verdadero_trivial(st.whereClause):
            raise AccionManual(f"UPDATE con WHERE siempre verdadero sobre {objeto} (D2)", "destructiva")
        return objeto
    raise AccionManual("sentencia de datos no reconocida", "no_reconocida")


# ======================================================== cuerpos de función =====

def _clasificar_cuerpo(nodo, ctx):
    """Sentencias dentro del cuerpo de una función: solo lectura e INSERT/UPDATE con las reglas de datos."""
    if isinstance(nodo, ast.SelectStmt) and nodo.intoClause is None:
        _revisar_funciones(nodo, ctx)
        _revisar_dml_anidado(nodo, ctx, "aplicar")
        return
    if isinstance(nodo, (ast.InsertStmt, ast.UpdateStmt)):
        _revisar_funciones(nodo, ctx)
        _regla_datos(nodo, ctx)
        _revisar_dml_anidado(nodo, ctx, "aplicar")
        return
    raise AccionManual(f"el cuerpo de la función contiene {type(nodo).__name__}: dentro de funciones solo "
                       "se admiten SELECT, INSERT y UPDATE con sus reglas", "sensible")


def _analizar_sql_de_funcion(texto, ctx):
    try:
        crudos = pglast.parse_sql(texto)
    except Exception:
        raise AccionManual("no se pudo analizar el cuerpo SQL de la función", "no_reconocida")
    for raw in crudos:
        _clasificar_cuerpo(raw.stmt, ctx)


EXPR_ASIGNACION_RE = re.compile(r"^\s*[^:=]+?\s*:?=\s*", re.S)


def _analizar_expresion_plpgsql(consulta, modo_parseo, ctx):
    texto = consulta or ""
    if modo_parseo == 0:
        _analizar_sql_de_funcion(texto, ctx)
        return
    if modo_parseo in (3, 4, 5):  # asignaciones: «v := expr» o «new.campo = expr»
        texto = EXPR_ASIGNACION_RE.sub("", texto, count=1)
    try:
        crudos = pglast.parse_sql("SELECT " + texto)
    except Exception:
        raise AccionManual("no se pudo analizar una expresión PL/pgSQL", "no_reconocida")
    for raw in crudos:
        _clasificar_cuerpo(raw.stmt, ctx)


def _analizar_plpgsql(texto_create, ctx):
    try:
        arbol = pglast.parse_plpgsql(texto_create)
    except Exception:
        raise AccionManual("no se pudo analizar el cuerpo PL/pgSQL", "no_reconocida")
    pila = [arbol]
    while pila:
        n = pila.pop()
        if isinstance(n, list):
            pila.extend(n)
        elif isinstance(n, dict):
            for clave, valor in n.items():
                if clave in PLPGSQL_PROHIBIDAS:
                    raise AccionManual(f"PL/pgSQL con {PLPGSQL_PROHIBIDAS[clave]}: SQL dinámico o control de "
                                       "transacciones", "sensible")
                if clave.startswith("PLpgSQL_stmt_"):
                    if clave not in PLPGSQL_CONOCIDAS:
                        raise AccionManual(f"sentencia PL/pgSQL no reconocida ({clave})", "no_reconocida")
                    if isinstance(valor, dict) and "dynquery" in valor:
                        raise AccionManual("PL/pgSQL con consulta dinámica (EXECUTE)", "sensible")
                if clave == "PLpgSQL_expr" and isinstance(valor, dict):
                    _analizar_expresion_plpgsql(valor.get("query"), valor.get("parseMode", 0), ctx)
                    continue
                pila.append(valor)


def _opcion(opciones, nombre):
    for o in opciones or ():
        if isinstance(o, ast.DefElem) and o.defname == nombre:
            return o
    return None


def _clasificar_funcion(st, ctx, texto):
    partes = _nombre(st.funcname)
    esquema, nombre = (partes[0], partes[1]) if len(partes) == 2 else ("public", partes[-1])
    objeto = _qn(esquema, nombre)
    if esquema not in ESQUEMAS_PERMITIDOS:
        raise AccionManual(f"función en el esquema {esquema}: solo public o vz_pruebas", "sensible")
    if st.replace and ((esquema, nombre) in ctx.funciones or ctx.catalogo.existe_funcion(esquema, nombre)):
        raise AccionManual(f"CREATE OR REPLACE sobre la función existente {objeto} (D4): la sobrescribe",
                           "sensible")
    if (esquema, nombre) not in ctx.funciones and ctx.catalogo.existe_funcion(esquema, nombre) \
            and not _funcion_del_agente(esquema, nombre, ctx):
        raise AccionManual(f"CREATE FUNCTION {objeto}: sobrecarga una función existente de la aplicación (D4); "
                           "las llamadas podrían acabar en la función ajena", "sensible")
    seguridad = _opcion(st.options, "security")
    if seguridad is not None and isinstance(seguridad.arg, ast.Boolean) and seguridad.arg.boolval:
        raise AccionManual(f"SECURITY DEFINER en {objeto} (D4): se ejecutaría con los privilegios del "
                           "propietario", "sensible")
    lenguaje = _opcion(st.options, "language")
    lenguaje = (lenguaje.arg.sval.lower() if lenguaje is not None and isinstance(lenguaje.arg, ast.String)
                else "sql")
    if st.sql_body is not None:  # BEGIN ATOMIC … END
        for n in _hijos(st.sql_body):
            for sub in (n if isinstance(n, (tuple, list)) else (n,)):
                if isinstance(sub, ast.Node):
                    _clasificar_cuerpo(sub, ctx)
    elif lenguaje == "sql":
        cuerpo = _opcion(st.options, "as")
        textos = [x.sval for x in (cuerpo.arg if cuerpo is not None else ()) if isinstance(x, ast.String)]
        if not textos:
            raise AccionManual(f"función {objeto} sin cuerpo analizable", "no_reconocida")
        _analizar_sql_de_funcion(textos[0], ctx)
    elif lenguaje == "plpgsql":
        _analizar_plpgsql(texto, ctx)
    else:
        raise AccionManual(f"función en lenguaje {lenguaje}: solo se analizan sql y plpgsql", "sensible")
    ctx.funciones.add((esquema, nombre))
    return objeto


# =================================================== clasificación principal =====

TIPOS_PROHIBIDOS = {
    "DeleteStmt": ("DELETE borra datos", "destructiva"),
    "TruncateStmt": ("TRUNCATE vacía tablas", "destructiva"),
    "MergeStmt": ("MERGE puede borrar o sobrescribir datos", "destructiva"),
    "DropStmt": ("DROP borra objetos", "destructiva"),
    "DropRoleStmt": ("DROP ROLE", "destructiva"), "DropdbStmt": ("DROP DATABASE", "destructiva"),
    "DropOwnedStmt": ("DROP OWNED", "destructiva"), "DropSubscriptionStmt": ("DROP SUBSCRIPTION", "destructiva"),
    "DropTableSpaceStmt": ("DROP TABLESPACE", "destructiva"), "DropUserMappingStmt": ("DROP USER MAPPING", "destructiva"),
    "RenameStmt": ("RENAME cambia nombres y rompe referencias", "destructiva"),
    "DoStmt": ("DO ejecuta código anónimo que no se puede revisar", "sensible"),
    "CopyStmt": ("COPY lee o escribe archivos o programas del servidor", "sensible"),
    "CreateRuleStmt": ("CREATE RULE puede reescribir consultas (p. ej. DO INSTEAD DELETE)", "sensible"),
    "CreateExtensionStmt": ("CREATE EXTENSION", "sensible"),
    "AlterExtensionStmt": ("ALTER EXTENSION", "sensible"),
    "AlterSystemStmt": ("ALTER SYSTEM", "sensible"),
    "AlterOwnerStmt": ("ALTER … OWNER TO", "sensible"),
    "AlterObjectSchemaStmt": ("ALTER … SET SCHEMA", "sensible"),
    "TransactionStmt": ("BEGIN/COMMIT/ROLLBACK manuales: la transacción la gestiona el broker", "sensible"),
    "VariableSetStmt": ("SET/RESET (incluye SET ROLE): la sesión la gestiona el broker", "sensible"),
    "CallStmt": ("CALL ejecuta un procedimiento que no se puede revisar aquí", "sensible"),
    "ExecuteStmt": ("EXECUTE de sentencias preparadas", "sensible"),
    "PrepareStmt": ("PREPARE", "sensible"), "DeallocateStmt": ("DEALLOCATE", "sensible"),
    "LockStmt": ("LOCK", "sensible"), "VacuumStmt": ("VACUUM/ANALYZE", "sensible"),
    "ClusterStmt": ("CLUSTER", "sensible"), "ReindexStmt": ("REINDEX", "sensible"),
    "CreateRoleStmt": ("CREATE ROLE", "sensible"), "AlterRoleStmt": ("ALTER ROLE", "sensible"),
    "AlterRoleSetStmt": ("ALTER ROLE … SET", "sensible"), "GrantRoleStmt": ("GRANT/REVOKE de roles", "sensible"),
    "AlterDefaultPrivilegesStmt": ("ALTER DEFAULT PRIVILEGES", "sensible"),
    "CreateEventTrigStmt": ("CREATE EVENT TRIGGER", "sensible"), "AlterEventTrigStmt": ("ALTER EVENT TRIGGER", "sensible"),
    "CreatePublicationStmt": ("CREATE PUBLICATION", "sensible"), "AlterPublicationStmt": ("ALTER PUBLICATION", "sensible"),
    "CreateSubscriptionStmt": ("CREATE SUBSCRIPTION", "sensible"), "AlterSubscriptionStmt": ("ALTER SUBSCRIPTION", "sensible"),
    "AlterFunctionStmt": ("ALTER FUNCTION (p. ej. a SECURITY DEFINER)", "sensible"),
    "AlterTypeStmt": ("ALTER TYPE", "sensible"), "AlterDomainStmt": ("ALTER DOMAIN", "sensible"),
    "AlterPolicyStmt": ("ALTER POLICY", "sensible"), "AlterSeqStmt": ("ALTER SEQUENCE", "sensible"),
    "LoadStmt": ("LOAD carga bibliotecas", "sensible"), "CheckPointStmt": ("CHECKPOINT", "sensible"),
    "DiscardStmt": ("DISCARD", "sensible"), "ListenStmt": ("LISTEN", "sensible"), "NotifyStmt": ("NOTIFY", "sensible"),
    "UnlistenStmt": ("UNLISTEN", "sensible"), "CreateSchemaStmt": ("CREATE SCHEMA", "sensible"),
    "CreatedbStmt": ("CREATE DATABASE", "sensible"), "AlterDatabaseStmt": ("ALTER DATABASE", "sensible"),
    "AlterDatabaseSetStmt": ("ALTER DATABASE … SET", "sensible"),
    "CreateForeignTableStmt": ("CREATE FOREIGN TABLE", "sensible"), "CreateFdwStmt": ("CREATE FOREIGN DATA WRAPPER", "sensible"),
    "CreateForeignServerStmt": ("CREATE SERVER", "sensible"), "CreateUserMappingStmt": ("CREATE USER MAPPING", "sensible"),
    "ImportForeignSchemaStmt": ("IMPORT FOREIGN SCHEMA", "sensible"), "SecLabelStmt": ("SECURITY LABEL", "sensible"),
    "RefreshMatViewStmt": ("REFRESH MATERIALIZED VIEW", "sensible"), "ReassignOwnedStmt": ("REASSIGN OWNED", "sensible"),
}


def _clasificar(st, ctx, texto):
    """Devuelve (tipo, objeto, categoria, fuera_de_transaccion, es_update) o lanza AccionManual."""
    tipo = type(st).__name__
    if tipo in TIPOS_PROHIBIDOS:
        motivo, categoria = TIPOS_PROHIBIDOS[tipo]
        raise AccionManual(motivo, categoria)
    _revisar_funciones(st, ctx)

    # ------------------------------------------------------------------ lectura
    if isinstance(st, ast.SelectStmt):
        if st.intoClause is not None:
            if ctx.modo == "lectura":
                raise AccionManual("SELECT INTO crea una tabla: usa aplicar con un archivo versionado", "estructura")
            esquema, nombre = _rv(st.intoClause.rel)
            if esquema not in ESQUEMAS_PERMITIDOS:
                raise AccionManual(f"tabla en el esquema {esquema}: solo public o vz_pruebas", "sensible")
            _revisar_dml_anidado(st, ctx, ctx.modo)
            ctx.creadas.add((esquema, nombre))
            return "SELECT INTO", _qn(esquema, nombre), "estructura", False, False
        if ctx.modo == "lectura" and st.lockingClause:
            raise AccionManual("SELECT … FOR UPDATE/SHARE bloquea filas: no es una consulta de lectura", "sensible")
        _revisar_dml_anidado(st, ctx, ctx.modo)
        return "SELECT", "", "lectura", False, False
    if isinstance(st, ast.VariableShowStmt):
        if (st.name or "").lower() not in AJUSTES_LEGIBLES:
            raise AccionManual(f"SHOW {st.name}: solo se pueden leer ajustes que no contienen secretos", "sensible")
        return "SHOW", st.name or "", "lectura", False, False
    if isinstance(st, ast.ExplainStmt):
        analizar = any(isinstance(o, ast.DefElem) and o.defname == "analyze" for o in st.options or ())
        if not analizar:
            if not isinstance(st.query, (ast.SelectStmt, ast.InsertStmt, ast.UpdateStmt, ast.DeleteStmt)):
                raise AccionManual("EXPLAIN de una sentencia no reconocida", "no_reconocida")
            return "EXPLAIN", "", "lectura", False, False
        # EXPLAIN ANALYZE ejecuta de verdad: se clasifica la sentencia interna.
        interno = _clasificar(st.query, ctx, texto)
        return "EXPLAIN ANALYZE " + interno[0], interno[1], interno[2], False, interno[4]

    if ctx.modo == "lectura":
        raise AccionManual(f"consultar solo admite lectura ({tipo}): usa aplicar con un archivo versionado",
                           "estructura" if tipo.startswith(("Create", "Alter", "Index", "View")) else "datos")

    # -------------------------------------------------------------------- datos
    if isinstance(st, (ast.InsertStmt, ast.UpdateStmt)):
        objeto = _regla_datos(st, ctx, tienda=True)
        _revisar_dml_anidado(st, ctx, ctx.modo)
        # Límite de filas (lo mide el broker dentro de la transacción y, si se supera, deshace TODO el archivo):
        # todo UPDATE, y también los INSERT en tablas de la tienda (dueño, 2026-11-27: «100 filas por operación»).
        limitada = isinstance(st, ast.UpdateStmt) or _tabla_de_la_tienda(st, ctx)
        return ("INSERT" if isinstance(st, ast.InsertStmt) else "UPDATE"), objeto, "datos", False, limitada

    # --------------------------------------------------------------- estructura
    if isinstance(st, ast.CreateStmt):
        esquema, nombre = _rv(st.relation)
        if esquema not in ESQUEMAS_PERMITIDOS:
            raise AccionManual(f"tabla en el esquema {esquema}: solo public o vz_pruebas", "sensible")
        ctx.creadas.add((esquema, nombre))
        return "CREATE TABLE", _qn(esquema, nombre), "estructura", False, False
    if isinstance(st, ast.CreateTableAsStmt):
        esquema, nombre = _rv(st.into.rel)
        if esquema not in ESQUEMAS_PERMITIDOS:
            raise AccionManual(f"relación en el esquema {esquema}: solo public o vz_pruebas", "sensible")
        _revisar_dml_anidado(st, ctx, ctx.modo)
        ctx.creadas.add((esquema, nombre))
        return "CREATE TABLE AS", _qn(esquema, nombre), "estructura", False, False
    if isinstance(st, ast.IndexStmt):
        esquema, nombre = _rv(st.relation)
        return ("CREATE INDEX CONCURRENTLY" if st.concurrent else "CREATE INDEX"), \
            f"{st.idxname or '(sin nombre)'} ON {_qn(esquema, nombre)}", "estructura", bool(st.concurrent), False
    if isinstance(st, ast.ViewStmt):
        esquema, nombre = _rv(st.view)
        if esquema not in ESQUEMAS_PERMITIDOS:
            raise AccionManual(f"vista en el esquema {esquema}: solo public o vz_pruebas", "sensible")
        if st.replace and ((esquema, nombre) in ctx.creadas or ctx.catalogo.existe_relacion(esquema, nombre)):
            raise AccionManual(f"CREATE OR REPLACE sobre la vista existente {_qn(esquema, nombre)} (D4)", "sensible")
        _revisar_dml_anidado(st, ctx, ctx.modo)
        ctx.creadas.add((esquema, nombre))
        return "CREATE VIEW", _qn(esquema, nombre), "estructura", False, False
    if isinstance(st, ast.CreateFunctionStmt):
        objeto = _clasificar_funcion(st, ctx, texto)
        return ("CREATE PROCEDURE" if st.is_procedure else "CREATE FUNCTION"), objeto, "estructura", False, False
    if isinstance(st, ast.CreateTrigStmt):
        esquema, tabla = _rv(st.relation)
        if not _tabla_del_sistema(esquema, tabla, ctx):
            raise AccionManual(f"CREATE TRIGGER sobre {_qn(esquema, tabla)}: solo en tablas vz_ops_* o creadas "
                               "por el sistema; en tablas de negocio cambia el comportamiento de la app", "sensible")
        partes = _nombre(st.funcname)
        f_esquema, f_nombre = (partes[0], partes[1]) if len(partes) == 2 else ("public", partes[-1])
        if f_esquema not in ESQUEMAS_PERMITIDOS or not _funcion_del_agente(f_esquema, f_nombre, ctx):
            raise AccionManual(f"CREATE TRIGGER {st.trigname}: ejecutaría la función {'.'.join(partes)}, que no ha "
                               "creado vz-sql", "sensible")
        if st.replace and ctx.catalogo.existe_trigger(esquema, tabla, (st.trigname or "").lower()):
            raise AccionManual(f"CREATE OR REPLACE sobre el trigger existente {st.trigname} (D4)", "sensible")
        return "CREATE TRIGGER", f"{st.trigname} ON {_qn(esquema, tabla)}", "estructura", False, False
    if isinstance(st, (ast.CreateEnumStmt, ast.CompositeTypeStmt, ast.CreateDomainStmt, ast.CreateRangeStmt,
                       ast.CreateSeqStmt)):
        nombres = {
            "CreateEnumStmt": "CREATE TYPE (enum)", "CompositeTypeStmt": "CREATE TYPE",
            "CreateDomainStmt": "CREATE DOMAIN", "CreateRangeStmt": "CREATE TYPE (range)",
            "CreateSeqStmt": "CREATE SEQUENCE"}
        return nombres[tipo], "", "estructura", False, False
    if isinstance(st, ast.AlterEnumStmt):
        if st.oldVal is not None or not st.newVal:
            raise AccionManual("ALTER TYPE … RENAME VALUE cambia valores existentes", "destructiva")
        return "ALTER TYPE ADD VALUE", ".".join(_nombre(st.typeName)), "estructura", False, False
    if isinstance(st, ast.CommentStmt):
        return "COMMENT", "", "estructura", False, False
    if isinstance(st, ast.AlterTableStmt):
        esquema, nombre = _rv(st.relation)
        if st.objtype != enums.ObjectType.OBJECT_TABLE:
            raise AccionManual(f"ALTER {st.objtype.name}: solo se admite ALTER TABLE", "sensible")
        for cmd in st.cmds or ():
            if cmd.subtype not in ALTER_TABLE_PERMITIDOS:
                raise AccionManual(f"ALTER TABLE {_qn(esquema, nombre)} con {cmd.subtype.name}: no es aditivo",
                                   "destructiva")
            if cmd.subtype == enums.AlterTableType.AT_ColumnDefault and cmd.def_ is None:
                raise AccionManual(f"ALTER TABLE {_qn(esquema, nombre)} … DROP DEFAULT", "destructiva")
        return "ALTER TABLE", _qn(esquema, nombre), "estructura", False, False

    # ------------------------------------------------------------------ permisos
    if isinstance(st, ast.CreatePolicyStmt):
        esquema, nombre = _rv(st.table)
        objeto = f"{st.policy_name} ON {_qn(esquema, nombre)}"
        if not _tabla_del_sistema(esquema, nombre, ctx):
            raise AccionManual(f"CREATE POLICY {objeto}: solo en tablas vz_ops_* o creadas por el sistema "
                               "(D3)", "sensible")
        roles = _roles(st.roles) or ["public"]  # sin TO = PUBLIC
        if set(roles) & {"anon", "public"}:
            raise AccionManual(f"CREATE POLICY {objeto} concede a {', '.join(roles)} (D3)", "sensible")
        if _es_verdadero_trivial(st.qual) or _es_verdadero_trivial(st.with_check):
            raise AccionManual(f"CREATE POLICY {objeto} con USING/WITH CHECK (true) (D3)", "sensible")
        return "CREATE POLICY", objeto, "permisos", False, False
    if isinstance(st, ast.GrantStmt):
        roles = _roles(st.grantees)
        if not st.is_grant:
            if not roles or not set(roles) <= ROLES_AMPLIOS:
                raise AccionManual(f"REVOKE a {', '.join(roles) or '?'}: solo se revocan de anon, "
                                   "authenticated o public", "sensible")
            return "REVOKE", ", ".join(roles), "permisos", False, False
        if st.grant_option:
            raise AccionManual("GRANT … WITH GRANT OPTION (D5)", "sensible")
        if not roles or not set(roles) <= ROLES_GRANT_PERMITIDOS:
            raise AccionManual(f"GRANT a {', '.join(roles) or '?'}: amplía el acceso (D5)", "sensible")
        privilegios = [(p.priv_name or "").lower() for p in st.privileges or ()]
        if not privilegios or not set(privilegios) <= PRIVILEGIOS_GRANT_PERMITIDOS:
            raise AccionManual(f"GRANT {', '.join(privilegios) or 'ALL'}: privilegios no permitidos (D5)",
                               "sensible")
        return "GRANT", ", ".join(roles), "permisos", False, False

    raise AccionManual(f"sentencia no reconocida ({tipo}): se bloquea por seguridad", "no_reconocida")


def _texto_de(sql, raw):
    """Recorta la sentencia original verificando que el recorte es exactamente esa sentencia
    (misma huella), tanto si pglast da posiciones en caracteres como en bytes."""
    inicio, largo = raw.stmt_location, raw.stmt_len
    candidatos = [sql[inicio:inicio + largo] if largo else sql[inicio:]]
    b = sql.encode("utf-8")
    try:
        candidatos.append((b[inicio:inicio + largo] if largo else b[inicio:]).decode("utf-8"))
    except UnicodeDecodeError:
        pass
    try:
        esperada = pglast.fingerprint(RawStream()(raw.stmt))
    except Exception:
        return None
    for c in candidatos:
        try:
            if pglast.fingerprint(c) == esperada and len(pglast.parse_sql(c)) == 1:
                return c.strip()
        except Exception:
            continue
    return None


def clasificar(sql, catalogo, modo="aplicar"):
    """modo: «lectura» (consultar) o «aplicar». Devuelve un Resultado; nunca ejecuta nada."""
    if modo not in ("lectura", "aplicar"):
        raise ValueError("modo desconocido")
    if MARCA_ACCION_MANUAL_RE.search(sql or ""):
        return Resultado(error="el SQL lleva la marca VZ: ACCION_MANUAL: nunca se ejecuta automáticamente")
    try:
        crudos = pglast.parse_sql(sql or "")
    except Exception as e:
        return Resultado(error=f"SQL no válido para PostgreSQL ({type(e).__name__})")
    if not crudos:
        return Resultado(error="el SQL no contiene sentencias")
    ctx = Contexto(catalogo, modo)
    resultado = Resultado()
    for i, raw in enumerate(crudos, 1):
        texto = _texto_de(sql, raw)
        tipo_nodo = type(raw.stmt).__name__
        if texto is None:
            resultado.sentencias.append(Sentencia(i, tipo_nodo, "", MANUAL, "no se pudo aislar el texto exacto de "
                                                  "la sentencia", "no_reconocida", ""))
            continue
        try:
            tipo, objeto, categoria, fuera, es_update = _clasificar(raw.stmt, ctx, texto)
            resultado.sentencias.append(Sentencia(i, tipo, objeto, PERMITIDA, "", categoria, texto, fuera, es_update))
        except AccionManual as e:
            resultado.sentencias.append(Sentencia(i, tipo_nodo, "", MANUAL, e.motivo, e.categoria, texto))
        except Exception as e:  # falla cerrado ante cualquier sorpresa del árbol o del catálogo
            resultado.sentencias.append(Sentencia(i, tipo_nodo, "", MANUAL, f"error al clasificar ({type(e).__name__})",
                                                  "no_reconocida", texto))
    fuera = [s for s in resultado.sentencias if s.fuera_de_transaccion]
    if fuera and len(resultado.sentencias) > 1:
        for s in fuera:
            s.veredicto, s.categoria = MANUAL, "sensible"
            s.motivo = "CREATE INDEX CONCURRENTLY no puede ir en transacción: debe ir solo en su archivo"
    return resultado


# ======================================================= acciones manuales =====

def _slug(texto):
    s = re.sub(r"[^A-Za-z0-9]+", "_", (texto or "OBJETO").upper()).strip("_")
    return (s or "OBJETO")[:60]


def nombre_archivo_accion_manual(sentencia, fecha):
    accion = "BORRAR" if sentencia.categoria == "destructiva" else "APROBAR"
    return f"{PREFIJO_ARCHIVO_MANUAL}{accion}_{_slug(sentencia.objeto or sentencia.tipo)}__{fecha}.sql"


def plantilla_accion_manual(sentencia, archivo_origen, fecha):
    """Borrador del archivo ACCION_MANUAL (nunca ejecutable: lleva la marca y el SQL comentado)."""
    sql_comentado = "\n".join("-- " + linea for linea in (sentencia.texto or "").splitlines()) or "-- (sin texto)"
    return f"""-- == VZ ================================================================
-- Archivo:        documentacion/acciones-manuales/{nombre_archivo_accion_manual(sentencia, fecha)}
-- Función:        Acción manual que vz-sql NO ejecuta: {sentencia.tipo} {sentencia.objeto}.
-- Para qué sirve: Que una persona revise y, si procede, ejecute a mano un cambio destructivo o sensible.
-- Conectado con:  {archivo_origen or "(SQL en línea)"}; documentacion/registro-archivos.md (acciones manuales).
-- Utilizado por:  El dueño de VideojuegosZaragoza (SQL Editor de Supabase).
-- Dependencias:   Ninguna.
-- Estado:         ACCION_MANUAL (PENDIENTE)
-- ============================================================================
-- VZ: ACCION_MANUAL
-- Este archivo NUNCA se ejecuta automáticamente (broker, guardián y worker lo rechazan).

-- 1. QUÉ: {sentencia.tipo} {sentencia.objeto}
-- 2. POR QUÉ SE BLOQUEÓ: {sentencia.motivo}
-- 3. POR QUÉ HACE FALTA: (complétalo: motivo de negocio o técnico)
-- 4. IMPACTO: (complétalo: datos u objetos afectados, quién deja de funcionar)
-- 5. DEPENDENCIAS (consulta de solo lectura; ajusta el nombre del objeto):
--    select classid::regclass, objid, deptype from pg_depend
--    where refobjid = 'NOMBRE_DEL_OBJETO'::regclass;
-- 6. COMPROBACIÓN PREVIA (solo lectura; por ejemplo cuántas filas o qué objetos dependen):
--    select count(*) from NOMBRE_DE_LA_TABLA;
-- 7. COPIA RECOMENDADA ANTES DE EJECUTAR (si afecta a datos): exportar la tabla desde el panel de
--    Supabase o crear una copia con «create table copia_… as select * from …» en un esquema de copias.
--    La copia de estructura del broker NO incluye datos.
-- 8. SQL EXACTO (descoméntalo solo tras revisarlo, y ejecútalo a mano en el SQL Editor):
-- begin;
{sql_comentado}
-- commit;
-- 9. COMPROBACIÓN POSTERIOR (solo lectura): (complétalo)
"""
