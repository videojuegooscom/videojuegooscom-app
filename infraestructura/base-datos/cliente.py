#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/cliente.py
#                 (copia adaptada de VeoAura, commit eb5f74fc, autorizada por su propietario el 2026-11-27)
#                 (se instala como /usr/local/bin/vz-sql con instalar-sql.sh)
# Función:        Cliente de vz-sql: envía la orden al broker por el socket Unix y muestra
#                 la respuesta. No conoce credenciales ni decide nada: todas las comprobaciones
#                 las repite el broker.
# Para qué sirve: Única forma de que Claude trabaje con el Supabase real de VideojuegosZaragoza:
#                   vz-sql estado
#                   vz-sql diagnostico-d8
#                   vz-sql consultar --sql 'select …'   |  --archivo ruta.sql
#                   vz-sql plan --archivo ruta.sql
#                   vz-sql aplicar --archivo ruta.sql   (archivo versionado, D6)
# Conectado con:  broker.py (socket /run/vz-sql/sql.sock).
# Utilizado por:  Claude Code (permitido en managed-settings.json), el worker y las personas.
# Dependencias:   python3 (biblioteca estándar).
# Estado:         ACTIVO
# ============================================================================
import argparse
import json
import os
import socket
import sys

SOCKET = os.environ.get("VZ_SQL_SOCKET", "/run/vz-sql/sql.sock")
ORDENES = ("estado", "diagnostico-d8", "consultar", "plan", "aplicar")
CODIGOS = {"ok": 0, "requiere_accion_manual": 2, "rechazada": 3, "error": 1}


def enviar(peticion, ruta_socket=SOCKET, tiempo=300):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
        s.settimeout(tiempo)
        s.connect(ruta_socket)
        s.sendall(json.dumps(peticion, ensure_ascii=False).encode("utf-8") + b"\n")
        datos = b""
        while b"\n" not in datos:
            trozo = s.recv(65536)
            if not trozo:
                break
            datos += trozo
    return json.loads(datos.split(b"\n", 1)[0].decode("utf-8"))


def _mostrar(r):
    estado = r.get("estado", "?")
    print(f"estado: {estado}")
    for clave in ("motivo", "postgres", "usuario", "segunda_barrera", "tablas_negocio_borrables", "broker",
                  "pglast", "sha256", "commit", "registrada", "copia_estructura", "aviso"):
        if clave == "tablas_negocio_borrables" and clave in r:
            print(f"{clave}: {r[clave]}")
            continue
        if r.get(clave):
            print(f"{clave}: {r[clave]}")
    if r.get("error"):
        print(f"error: {r['error'].get('mensaje')} (sqlstate {r['error'].get('sqlstate')})")
    for s in r.get("sentencias", []):
        marca = "OK " if s.get("veredicto") == "permitida" else "NO "
        detalle = f" — {s['motivo']}" if s.get("motivo") else ""
        print(f"  {marca} #{s.get('n')} {s.get('tipo')} {s.get('objeto') or ''}{detalle}")
    if r.get("filas_afectadas") is not None:
        print(f"filas afectadas: {r['filas_afectadas']}")
    for a in r.get("acciones_manuales", []):
        print(f"ACCIÓN MANUAL sugerida: documentacion/acciones-manuales/{a['nombre']} (contenido con --json)")
    for i, res in enumerate(r.get("resultados", []), 1):
        if res.get("columnas"):
            print(f"-- resultado {i}: {len(res['filas'])} filas{' (truncado)' if res.get('truncado') else ''}")
            print("\t".join(res["columnas"]))
            for fila in res["filas"]:
                print("\t".join("" if v is None else str(v) for v in fila))


def main(argv=None):
    p = argparse.ArgumentParser(prog="vz-sql", description="Acceso controlado al Supabase de VideojuegosZaragoza.")
    p.add_argument("orden", choices=ORDENES)
    grupo = p.add_mutually_exclusive_group()
    grupo.add_argument("--archivo", help="archivo .sql del repositorio")
    grupo.add_argument("--sql", help="solo para consultar (lectura)")
    p.add_argument("--json", action="store_true", help="muestra la respuesta completa en JSON")
    a = p.parse_args(argv)
    if a.orden in ("plan", "aplicar") and not a.archivo:
        p.error(f"{a.orden} necesita --archivo (D6: el DDL solo sale de archivos versionados)")
    if a.orden == "consultar" and not (a.archivo or a.sql):
        p.error("consultar necesita --sql o --archivo")
    if a.orden in ("estado", "diagnostico-d8") and (a.archivo or a.sql):
        p.error(f"{a.orden} no admite --archivo ni --sql")
    peticion = {"orden": a.orden}
    if a.archivo:
        peticion["archivo"] = os.path.abspath(a.archivo)
    if a.sql:
        peticion["sql"] = a.sql
    try:
        respuesta = enviar(peticion)
    except (OSError, ValueError) as e:
        print(f"vz-sql: no se pudo hablar con el broker ({type(e).__name__}). ¿Está activo "
              "vz-sql.socket?", file=sys.stderr)
        return 1
    if a.json:
        print(json.dumps(respuesta, ensure_ascii=False, indent=2, default=str))
    else:
        _mostrar(respuesta)
    return CODIGOS.get(respuesta.get("estado"), 1)


if __name__ == "__main__":
    sys.exit(main())
