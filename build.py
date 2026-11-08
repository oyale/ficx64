#!/usr/bin/env python3
"""Construye la app en un solo HTML a partir de src/ y data/.

    python3 build.py                      # escribe dist/index.html
    python3 build.py --output otro.html   # escribe donde se le diga
"""

from __future__ import annotations

import hashlib
import base64
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
        main_id = screening.get("mainFilmId")
        if main_id and (main_id not in screening.get("filmIds", []) or main_id not in by_id):
            raise SystemExit(f"mainFilmId no enlazado en el pase {screening.get('candidateId')}")
        if not screening.get("films"):
            screening["films"] = [
                {"id": by_id[i]["id"], "title": by_id[i].get("title", "")}
                for i in (screening.get("filmIds") or []) if i in by_id
            ]

    icons = sorted(icon for icon in (ROOT / "icons").iterdir()
                   if icon.suffix in {".png", ".svg"})
    icon_urls = {f"icons/{icon.name}": f"icons/{icon.name}?v={hashlib.sha256(icon.read_bytes()).hexdigest()[:16]}"
                 for icon in icons}

    def version_icon_urls(content: str) -> str:
        for original, versioned in icon_urls.items():
            content = content.replace(original, versioned)
        return content

    html = (SOURCE / "index.html").read_text(encoding="utf-8")
    # Keep the adaptive favicon available in the downloaded standalone HTML.
    favicon = (ROOT / "icons" / "favicon.svg").read_text(encoding="utf-8")
    html = html.replace('href="icons/favicon.svg"', 'href="data:image/svg+xml,' + quote(favicon, safe="") + '"')
    html = html.replace('  <link rel="stylesheet" href="styles.css">',
                        f"  <style>\n{(SOURCE / 'styles.css').read_text(encoding='utf-8')}\n  </style>")
    html = html.replace('  <script src="app.js"></script>',
                        f"  <script>\n{(SOURCE / 'app.js').read_text(encoding='utf-8')}\n  </script>")
    # Embed the generator, fonts and licenses: PDF export also works in the portable HTML.
    pdf_assets = SOURCE / "pdf-assets"
    pdf_fonts = {font.name: base64.b64encode(font.read_bytes()).decode("ascii")
                 for font in sorted(pdf_assets.glob("*.ttf"))}
    pdf_renderer = (SOURCE / "pdf-itinerary.js").read_text(encoding="utf-8")
    pdf_renderer = pdf_renderer.replace("/* __PDF_FONTS__ */ {}", compact(pdf_fonts))
    pdf_logo = "data:image/png;base64," + base64.b64encode((pdf_assets / "ficx-mark.png").read_bytes()).decode("ascii")
    pdf_renderer = pdf_renderer.replace('/* __PDF_LOGO__ */ ""', compact(pdf_logo))
    pdf_library = (pdf_assets / "jspdf-4.2.1.umd.min.js").read_text(encoding="utf-8")
    pdf_library = "\n".join(line for line in pdf_library.splitlines() if not line.startswith("//# sourceMappingURL="))
    pdf_licenses = "\n".join(path.read_text(encoding="utf-8") for path in sorted(pdf_assets.glob("*.txt")))
    pdf_bundle = "/*\n" + pdf_licenses + "\n*/\n" + pdf_library + "\n" + pdf_renderer
    # Protect the containing HTML script even when vendored dependency text changes.
    pdf_bundle = pdf_bundle.replace("</script", "<\\/script")
    pdf_bundle_name = f"pdf-itinerary.{hashlib.sha256(pdf_bundle.encode('utf-8')).hexdigest()[:16]}.js"
    pdf_marker = '  <script src="pdf-itinerary.js"></script>'
    inline_pdf = f'  <script id="ficx-pdf-bundle" type="application/x-ficx-pdf">\n{pdf_bundle}\n  </script>'
    is_pwa_output = args.output.resolve() == OUTPUT.resolve()
    if is_pwa_output:
        pdf_loader_config = f'  <script>window.FICX_PDF_BUNDLE_URL = "{pdf_bundle_name}";</script>'
        html = html.replace(pdf_marker, pdf_loader_config)
    else:
        html = html.replace(pdf_marker, inline_pdf)
    # The fallback poster logo must also work in a downloaded offline HTML.
    mark = (ROOT / "icons" / "mark.svg").read_text(encoding="utf-8")
    html = html.replace('src="icons/mark.svg"', 'src="data:image/svg+xml,' + quote(mark, safe="") + '"')
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

    html = version_icon_urls(html)
    if is_pwa_output:
        portable_html = html.replace(pdf_loader_config, inline_pdf)

    out = args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    if is_pwa_output:
        (out.parent / pdf_bundle_name).write_text(pdf_bundle, encoding="utf-8")
        (out.parent / "ficx64-portable.html").write_text(portable_html, encoding="utf-8")
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
    for icon in manifest.get("icons", []):
        icon["src"] = icon_urls.get(icon["src"], icon["src"])
    for shortcut in manifest.get("shortcuts", []):
        for icon in shortcut.get("icons", []):
            icon["src"] = icon_urls.get(icon["src"], icon["src"])
    if site_url:
        manifest["id"] = site_url
        manifest["related_applications"] = [{
            "platform": "webapp", "url": urljoin(site_url, "manifest.webmanifest"), "id": site_url,
        }]
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (out.parent / "manifest.webmanifest").write_bytes(manifest_bytes)
    worker_source = (SOURCE / "sw.js").read_text(encoding="utf-8").replace("__PDF_BUNDLE__", pdf_bundle_name)
    worker = version_icon_urls(worker_source)
    digest = hashlib.sha256()
    for name, content in [("index.html", html.encode("utf-8")),
                          ("sw.js", worker.encode("utf-8")),
                          ("manifest.webmanifest", manifest_bytes),
                          (pdf_bundle_name, pdf_bundle.encode("utf-8"))] + [
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
