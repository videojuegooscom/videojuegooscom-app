#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/descargar_dependencias.py (copia de VeoAura, commit eb5f74fc)
# Función:        Descarga de PyPI exactamente los wheels de requisitos.txt, comprueba que el sha256
#                 coincide con el FIJADO en el repositorio (no con el que diga PyPI) y los descomprime
#                 en la carpeta indicada. Si un hash no coincide, aborta sin instalar nada.
# Para qué sirve: Instalar pglast y psycopg sin pip (el servidor no tiene ensurepip) y sin confiar
#                 en nada que no esté fijado en el repo (D9).
# Conectado con:  requisitos.txt, instalar-sql.sh.
# Utilizado por:  instalar-sql.sh:  python3 descargar_dependencias.py <destino>
#                 El dueño, para elegir versiones (no instala nada; 2026-11-27, pglast 7.18 retirado de PyPI):
#                   python3 -I descargar_dependencias.py --consultar pglast==7.23 psycopg==3.3.5 …
# Dependencias:   python3 (biblioteca estándar), acceso a pypi.org y files.pythonhosted.org.
# Estado:         ACTIVO
# ============================================================================
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))


def leer_requisitos():
    salida = []
    with open(os.path.join(AQUI, "requisitos.txt"), encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#"):
                continue
            requisito, archivo, sha = linea.split()
            nombre, version = requisito.split("==")
            salida.append((nombre, version, archivo, sha))
    return salida


def leer_json(url, que):
    """JSON de PyPI; si no existe (404) lo dice claro en lugar de un traceback."""
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        sys.exit(f"PyPI respondió {e.code} al pedir {que}")


# Wheels válidos para el servidor: CPython 3.12 en Linux x86_64 con glibc (Ubuntu 24.04 tiene glibc 2.39).
RUEDA_VALIDA = re.compile(r"-(py3-none-any|cp312-cp312-manylinux[0-9a-z_.]*x86_64[0-9a-z_.]*)\.whl$")


def consultar(pedidos):
    """--consultar nombre==versión …: NO instala nada. Para cada paquete busca su wheel para Python 3.12 en
    Linux x86_64, lo descarga a una carpeta temporal, calcula su sha256 aquí (no se fía del de PyPI: lo compara)
    y escribe la línea lista para requisitos.txt. Si la versión no existe, enseña las últimas que sí existen."""
    temporal = tempfile.mkdtemp(prefix="vz-sql-consulta-")
    correcto = True
    lineas = []
    try:
        for pedido in pedidos:
            nombre, _, version = pedido.partition("==")
            meta = leer_json(f"https://pypi.org/pypi/{nombre}/{version}/json", pedido)
            if meta is None:
                todo = leer_json(f"https://pypi.org/pypi/{nombre}/json", nombre) or {"releases": {}}
                vivas = [v for v, archivos in todo["releases"].items()
                         if archivos and not all(a.get("yanked") for a in archivos)]
                print(f"NO EXISTE {pedido}. Versiones publicadas (últimas 15): {', '.join(vivas[-15:]) or 'ninguna'}")
                correcto = False
                continue
            if meta["info"].get("yanked"):
                print(f"RETIRADA {pedido} (yanked): elige otra")
                correcto = False
                continue
            ruedas = [u for u in meta["urls"] if u["packagetype"] == "bdist_wheel" and RUEDA_VALIDA.search(u["filename"])
                      and not u.get("yanked")]
            if not ruedas:
                print(f"SIN WHEEL para Python 3.12 Linux x86_64: {pedido}")
                correcto = False
                continue
            rueda = sorted(ruedas, key=lambda u: u["filename"])[0]
            if not rueda["url"].startswith("https://files.pythonhosted.org/"):
                sys.exit(f"origen inesperado para {rueda['filename']}")
            ruta = os.path.join(temporal, rueda["filename"])
            with urllib.request.urlopen(rueda["url"], timeout=180) as r, open(ruta, "wb") as f:
                shutil.copyfileobj(r, f)
            calculado = hashlib.sha256(open(ruta, "rb").read()).hexdigest()
            if calculado != rueda["digests"]["sha256"]:
                sys.exit(f"HASH DISTINTO en {rueda['filename']}: PyPI dice {rueda['digests']['sha256']}, "
                         f"descargado {calculado}. No uses esta versión.")
            print(f"Python requerido por {pedido}: {meta['info'].get('requires_python') or 'sin límite'}")
            print(f"LINEA {nombre}=={version} {rueda['filename']} {calculado}")
            lineas.append(f"{nombre}=={version} {rueda['filename']} {calculado}")
    finally:
        shutil.rmtree(temporal, ignore_errors=True)
    # Copia exacta para Claude (sin transcribir hashes a mano): .expo/ del proyecto, que git ignora.
    salida = os.path.join(os.path.dirname(os.path.dirname(AQUI)), ".expo", "vzsql-requisitos-consultados.txt")
    try:
        os.makedirs(os.path.dirname(salida), exist_ok=True)
        with open(salida, "w", encoding="utf-8") as f:
            f.write("\n".join(lineas + ["todo comprobado" if correcto else "HAY PAQUETES QUE CAMBIAR"]) + "\n")
        print(f"resultado guardado en {salida}")
    except OSError as e:
        print(f"no se pudo guardar el resultado ({type(e).__name__}); copia las líneas LINEA a mano")
    print("todo comprobado" if correcto else "HAY PAQUETES QUE CAMBIAR")
    sys.exit(0 if correcto else 1)


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--consultar":
        consultar(sys.argv[2:])
    if len(sys.argv) != 2:
        sys.exit("uso: descargar_dependencias.py <carpeta-destino>  |  --consultar nombre==versión …")
    destino = sys.argv[1]
    temporal = tempfile.mkdtemp(prefix="vz-sql-wheels-")
    try:
        descargados = []
        for nombre, version, archivo, sha in leer_requisitos():
            meta = leer_json(f"https://pypi.org/pypi/{nombre}/{version}/json", f"{nombre}=={version}")
            if meta is None:
                sys.exit(f"{nombre}=={version} ya no está en PyPI: busca otra con «--consultar {nombre}==<versión>»")
            url = next((u["url"] for u in meta["urls"] if u["filename"] == archivo), None)
            if not url or not url.startswith("https://files.pythonhosted.org/"):
                sys.exit(f"no se encontró {archivo} en PyPI")
            ruta = os.path.join(temporal, archivo)
            with urllib.request.urlopen(url, timeout=180) as r, open(ruta, "wb") as f:
                shutil.copyfileobj(r, f)
            calculado = hashlib.sha256(open(ruta, "rb").read()).hexdigest()
            if calculado != sha:
                sys.exit(f"HASH DISTINTO en {archivo}: esperado {sha}, obtenido {calculado}. No se instala nada.")
            descargados.append(ruta)
            print(f"verificado {archivo}")
        os.makedirs(destino, exist_ok=True)
        for ruta in descargados:
            zipfile.ZipFile(ruta).extractall(destino)
        print(f"dependencias instaladas en {destino}")
    finally:
        shutil.rmtree(temporal, ignore_errors=True)


if __name__ == "__main__":
    main()
