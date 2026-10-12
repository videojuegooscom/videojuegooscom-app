#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:  infraestructura/publicacion/test_controlador.py
# Función:  Pruebas de las comprobaciones del controlador de publicación (sin red).
# Uso:      python3 infraestructura/publicacion/test_controlador.py   (desde la raíz del repo)
# ============================================================================
import importlib.util
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("controlador", os.path.join(AQUI, "controlador.py"))
c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(c)

fallos = []


def comprobar(nombre, valor):
    if not valor:
        fallos.append(nombre)


SHA = "a" * 40
PR_OK = {"state": "OPEN", "isDraft": False, "baseRefName": "main", "isCrossRepository": False,
         "mergeable": "MERGEABLE", "headRefOid": SHA}
VERCEL_OK = [{"context": "Vercel", "state": "success"}]


def diff(ruta, *lineas):
    return f"diff --git a/{ruta} b/{ruta}\n--- a/{ruta}\n+++ b/{ruta}\n@@ -0,0 +1 @@\n" + "\n".join(
        "+" + l for l in lineas) + "\n"


# Metadatos
comprobar("PR correcta pasa", c.revisar_metadatos(PR_OK) == [])
for campo, valor in (("state", "CLOSED"), ("isDraft", True), ("baseRefName", "dev"), ("isCrossRepository", True),
                     ("mergeable", "CONFLICTING"), ("mergeable", "UNKNOWN"), ("headRefOid", "abc")):
    comprobar(f"metadatos: {campo}={valor} se rechaza", c.revisar_metadatos({**PR_OK, campo: valor}))

# Archivos
comprobar("archivos normales pasan", c.revisar_archivos([
    {"filename": "app/catalogo.tsx", "status": "modified"}, {"filename": "lib/tabBar.ts", "status": "added"},
    {"filename": "supabase/migrations/20261012_x.sql", "status": "added"}, {"filename": "CLAUDE.md", "status": "modified"}]) == [])
comprobar("sin archivos se rechaza", c.revisar_archivos([]))
for ruta in ("infraestructura/claude-code/guardian.py", ".github/workflows/ci.yml", "package.json",
             "package-lock.json", "vercel.json", "app.json", ".npmrc", "aPI/blue-ia.ts", "api/x.ts",
             "scripts/inject-seo-html.js", "sql/01-catalogo-productos.sql", ".claude/settings.json",
             "infraestructura/publicacion/controlador.py", "babel.config.js", "metro.config.js"):
    comprobar(f"ruta protegida {ruta} se rechaza", c.revisar_archivos([{"filename": ruta, "status": "modified"}]))
comprobar("borrar se rechaza", c.revisar_archivos([{"filename": "app/x.tsx", "status": "removed"}]))
comprobar("renombrar se rechaza", c.revisar_archivos([{"filename": "app/y.tsx", "status": "renamed",
                                                       "previous_filename": "app/x.tsx"}]))
comprobar("renombrar desde ruta protegida se rechaza", c.revisar_archivos([
    {"filename": "app/y.json", "status": "renamed", "previous_filename": "vercel.json"}]))

# Contenido
comprobar("código normal pasa", c.revisar_contenido(diff("app/x.tsx", "const a = 1;")) == [])
for linea in ("const k = 'sk-abcdefghijklmnopqrstuvwxyz123456';", "token: ghp_abcdefghijklmnopqrstuvwxyz1234",
              "SUPABASE_SERVICE_ROLE=xyz", "-----BEGIN RSA PRIVATE KEY-----", "const s = 'sb_secret_abcdefghijk';",
              "github_pat_abcdefghijklmnopqrstuvwxyz_123"):
    comprobar(f"secreto se rechaza: {linea[:20]}", c.revisar_contenido(diff("app/x.tsx", linea)))
MIG = "supabase/migrations/20261012_x.sql"
comprobar("migración aditiva pasa", c.revisar_contenido(diff(MIG,
    "create table if not exists public.t (id uuid primary key);",
    "alter table public.t enable row level security;",
    "create policy p on public.t for select to authenticated using ((select public.is_admin()));")) == [])
for sql in ("drop table public.products;", "truncate public.products;", "delete from public.products;",
            "alter table public.products drop column price_eur;", "alter table t disable row level security;",
            "DROP POLICY x ON t;", "copy t to program 'sh';", "select pg_read_file('/etc/passwd');"):
    comprobar(f"SQL destructivo se rechaza: {sql[:30]}", c.revisar_contenido(diff(MIG, sql)))
for sql in ("grant all on public.t to anon;", "revoke select on t from authenticated;",
            "create function f() returns void language sql security definer as $$ select 1 $$;",
            "create policy p on t for select to anon using (true);", "alter role authenticated set x = 1;",
            "select * from auth.users;", "create policy p on t for insert with check (true);"):
    comprobar(f"SQL de permisos delicados se rechaza: {sql[:30]}", c.revisar_contenido(diff(MIG, sql)))
comprobar("comentario con DROP no cuenta", c.revisar_contenido(diff(MIG, "-- aquí no hay drop table", "create table t (id int);")) == [])
comprobar("texto entre comillas con DELETE no cuenta",
          c.revisar_contenido(diff(MIG, "insert into t (nota) values ('delete from nada');")) == [])
comprobar("SQL fuera de migraciones se rechaza", c.revisar_contenido(diff("app/x.sql", "create table t (id int);")))

# Checks
comprobar("Vercel en verde pasa", c.revisar_checks(VERCEL_OK, []) == [])
comprobar("sin Vercel se rechaza", c.revisar_checks([], []))
comprobar("Vercel pendiente se rechaza", c.revisar_checks([{"context": "Vercel", "state": "pending"}], []))
comprobar("Vercel fallido se rechaza", c.revisar_checks([{"context": "Vercel", "state": "failure"}], []))
comprobar("otro check fallido se rechaza", c.revisar_checks(VERCEL_OK + [{"context": "ci", "state": "failure"}], []))
comprobar("CI en curso se rechaza", c.revisar_checks(VERCEL_OK, [{"name": "ci", "status": "in_progress"}]))
comprobar("CI fallida se rechaza", c.revisar_checks(VERCEL_OK, [{"name": "ci", "status": "completed", "conclusion": "failure"}]))
comprobar("CI correcta pasa", c.revisar_checks(VERCEL_OK, [{"name": "ci", "status": "completed", "conclusion": "success"}]) == [])

# Forma de invocación
comprobar("orden inválida devuelve 2", c.main(["vz-publicar", "fusionar", "3"]) == 2)
comprobar("número inválido devuelve 2", c.main(["vz-publicar", "publicar", "3;rm"]) == 2)
comprobar("sin argumentos devuelve 2", c.main(["vz-publicar"]) == 2)

for f in fallos:
    print("FALLO", f)
print(f"test_controlador: {len(fallos)} fallos")
sys.exit(1 if fallos else 0)
