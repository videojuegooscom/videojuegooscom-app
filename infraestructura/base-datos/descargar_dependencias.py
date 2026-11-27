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
# Dependencias:   python3 (biblioteca estándar), acceso a pypi.org y files.pythonhosted.org.
# Estado:         ACTIVO
# ============================================================================
import hashlib
import json
import os
import shutil
import sys
import tempfile
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


def main():
    if len(sys.argv) != 2:
        sys.exit("uso: descargar_dependencias.py <carpeta-destino>")
    destino = sys.argv[1]
    temporal = tempfile.mkdtemp(prefix="vz-sql-wheels-")
    try:
        descargados = []
        for nombre, version, archivo, sha in leer_requisitos():
            with urllib.request.urlopen(f"https://pypi.org/pypi/{nombre}/{version}/json", timeout=30) as r:
                meta = json.load(r)
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
