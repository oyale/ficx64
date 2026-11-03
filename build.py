#!/usr/bin/env python3
"""Construye la app en un solo HTML a partir de src/ y data/.

    python3 build.py                      # escribe dist/index.html
    python3 build.py --output otro.html   # escribe donde se le diga
"""

from __future__ import annotations

import hashlib
import argparse
import json
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"
OUTPUT = ROOT / "dist" / "index.html"

DATA = {
    "films": ROOT / "data" / "films.json",
    "screenings": ROOT / "data" / "screenings.json",
    "transfers": ROOT / "data" / "venue-transfers.json",
    "bus": ROOT / "data" / "bus-transfers.json",
}
SCHEMA_VERSION = 1
PRIMARY_SECTIONS = [
    "Albar", "Retueyos", "Sección Oficial", "Esbilla", "Enfants Terribles",
    "Crossroads", "FICX Premiere", "Generación Mutante",
]


def load(key: str, required: bool = True):
    path = DATA[key]
    if not path.exists():
        if required:
            raise SystemExit(f"Falta {path.name}. Mira README.md para el formato.")
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"{path.name} debe ser un objeto JSON.")
    # Cada fichero declara su versión; solo se comprueba que la tenga.
    if not isinstance(data.get("schemaVersion"), int):
        raise SystemExit(f"{path.name}: falta schemaVersion.")
    return data


def compact(value) -> str:
    # `<` escapado: un título con "</script>" no puede cerrar la etiqueta.
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--site-url", help="URL base del despliegue alternativo (por ejemplo GitHub Pages)")
    args = parser.parse_args()
    site_url = args.site_url
    if site_url:
        parsed = urlsplit(site_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
            parser.error("--site-url debe ser una URL HTTPS sin parámetros ni fragmentos")
        site_url = site_url.rstrip("/") + "/"

    films = load("films").get("films", [])
    screenings = load("screenings").get("screenings", [])
    by_id = {film.get("id"): film for film in films}
    # La app necesita cada pase con sus películas. El JSON guarda ya la lista «films» (id y
    # título tal como lo escribe el calendario, que puede diferir de la ficha); si falta, se
    # rellena con el título de la ficha.
    for screening in screenings:
        if not screening.get("films"):
            screening["films"] = [
                {"id": by_id[i]["id"], "title": by_id[i].get("title", "")}
                for i in (screening.get("filmIds") or []) if i in by_id
            ]

    html = (SOURCE / "index.html").read_text(encoding="utf-8")
    # Keep the adaptive favicon available in the downloaded standalone HTML.
    favicon = (ROOT / "icons" / "favicon.svg").read_text(encoding="utf-8")
    html = html.replace('href="icons/favicon.svg"', 'href="data:image/svg+xml,' + quote(favicon, safe="") + '"')
    html = html.replace('  <link rel="stylesheet" href="styles.css">',
                        f"  <style>\n{(SOURCE / 'styles.css').read_text(encoding='utf-8')}\n  </style>")
    html = html.replace('  <script src="app.js"></script>',
                        f"  <script>\n{(SOURCE / 'app.js').read_text(encoding='utf-8')}\n  </script>")
    for placeholder, value in (
        ("window.FICX_FILMS = [];", films),
        ("window.FICX_SCREENINGS = [];", screenings),
        # Las secciones van con coma y espacio, como las escribía el script original.
        ("window.FICX_PRIMARY_SECTIONS = [];", {"raw": json.dumps(PRIMARY_SECTIONS, ensure_ascii=False)}),
    ):
        rendered = value["raw"] if isinstance(value, dict) else compact(value)
        html = html.replace(placeholder, placeholder.split(" = ")[0] + f" = {rendered};")
    html = html.replace("window.FICX_VENUE_TRANSFERS = {};", f"window.FICX_VENUE_TRANSFERS = {compact(load('transfers', False))};")
    html = html.replace("window.FICX_BUS_TRANSFERS = {};", f"window.FICX_BUS_TRANSFERS = {compact(load('bus', False))};")

    out = args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    # Compatibilidad con enlaces antiguos: solo una redirección, no otra copia de la app.
    if out.resolve() == OUTPUT.resolve():
        (out.parent / "ficx64.html").write_text(
            '<!doctype html><html lang="es"><meta charset="utf-8">'
            '<title>FICX 64</title><script>'
            'location.replace("./" + location.search + location.hash);'
            '</script><p>La app está en <a href="./">la página principal</a>.</p></html>',
            encoding="utf-8")

    # Piezas que la instalación necesita fuera del HTML: manifest, iconos y service worker.
    import shutil
    manifest_bytes = (ROOT / "manifest.webmanifest").read_bytes()
    manifest = json.loads(manifest_bytes)
    if site_url:
        manifest["id"] = site_url
        manifest["related_applications"] = [{
            "platform": "webapp", "url": urljoin(site_url, "manifest.webmanifest"), "id": site_url,
        }]
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (out.parent / "manifest.webmanifest").write_bytes(manifest_bytes)
    worker = (SOURCE / "sw.js").read_text(encoding="utf-8")
    digest = hashlib.sha256()
    for name, content in [("index.html", html.encode("utf-8")),
                          ("sw.js", worker.encode("utf-8")),
                          ("manifest.webmanifest", manifest_bytes)] + [
                              (f"icons/{icon.name}", icon.read_bytes())
                              for icon in sorted((ROOT / "icons").glob("*")) if icon.suffix in {".png", ".svg"}]:
        digest.update(name.encode("utf-8") + b"\0" + content + b"\0")
    version = digest.hexdigest()[:20]
    (out.parent / "sw.js").write_text(worker.replace("__BUILD_VERSION__", version), encoding="utf-8")
    icons_out = out.parent / "icons"
    icons_out.mkdir(exist_ok=True)
    for icon in (ROOT / "icons").glob("*"):
        if icon.suffix not in {".png", ".svg"}:
            continue
        shutil.copyfile(icon, icons_out / icon.name)

    print(f"{len(films)} películas y {len(screenings)} pases -> {out}")


if __name__ == "__main__":
    main()
