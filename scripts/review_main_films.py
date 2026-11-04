#!/usr/bin/env python3
"""Audit grouped screenings; optionally apply conservative, explicitly provisional main-film suggestions.

python3 scripts/review_main_films.py                 # regenerate review artifacts
python3 scripts/review_main_films.py --apply-clear   # annotate only clear, unconfigured pairs

No runtime inference: the app continues to use explicit mainFilmId data.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROPOSAL_SOURCE = "duration-proposal"


def clear_candidate(movies, titles):
    known = all(isinstance(f["durationMinutes"], (int, float)) and not isinstance(f["durationMinutes"], bool)
                and math.isfinite(f["durationMinutes"]) and f["durationMinutes"] > 0 for f in movies)
    if not known or len(movies) != 2 or titles:
        return None
    first, second = sorted(movies, key=lambda f: (-f["durationMinutes"], f["id"]))
    if first["durationMinutes"] >= 60 and second["durationMinutes"] <= 20 and first["durationMinutes"] >= 4 * second["durationMinutes"]:
        return first["id"]
    return None


def classify(screenings, by_id):
    ids = sorted(set(screenings[0].get("filmIds", [])))
    movies = [{"id": film_id, "title": by_id.get(film_id, {}).get("title", film_id),
               "durationMinutes": by_id.get(film_id, {}).get("durationMinutes"),
               "pageUrl": by_id.get(film_id, {}).get("pageUrl", "")} for film_id in ids]
    titles = sorted({(s.get("title") or "").strip() for s in screenings if (s.get("title") or "").strip()})
    existing = {s["mainFilmId"] for s in screenings if s.get("mainFilmId")}
    result = {"filmIds": ids, "films": movies, "blockTitles": titles,
              "screenings": [{"id": s["candidateId"], "date": s["date"], "time": s["time"],
                              "venue": s.get("venue", ""), "mainFilmId": s.get("mainFilmId"),
                              "mainFilmSource": s.get("mainFilmSource", "manual" if s.get("mainFilmId") else None)}
                             for s in sorted(screenings, key=lambda s: (s["date"], s["time"], s["candidateId"]))],
              "candidateMainFilmId": None}
    if existing:
        if len(existing) != 1 or len([s for s in screenings if s.get("mainFilmId")]) != len(screenings):
            return dict(result, status="needs-review", reason="Configuración distinta o incompleta entre pases de la misma combinación; no se modifica.")
        main_id = next(iter(existing))
        if main_id not in ids:
            return dict(result, status="needs-review", reason="La principal configurada no pertenece al pase; revisar los datos.")
        provisional = any(s.get("mainFilmSource") == PROPOSAL_SOURCE for s in screenings)
        if provisional and clear_candidate(movies, titles) != main_id:
            return dict(result, candidateMainFilmId=main_id, status="needs-review",
                        reason="La aproximación existente ya no cumple los umbrales con estos datos; se conserva hasta revisión, sin sobrescribirla.")
        source = next((screening.get("mainFilmSource", "manual") for screening in screenings if screening.get("mainFilmId")), "manual")
        status = "applied-proposal" if provisional else ("official-confirmed" if source == "official-programme" else "confirmed")
        return dict(result, candidateMainFilmId=main_id, status=status,
                    reason="Aproximación aplicada por duración; pendiente de confirmación editorial." if provisional
                    else ("La fuente oficial identifica esta película como acompañante; se conserva como principal." if source == "official-programme"
                          else "Principal aprobada editorialmente; se conserva sin cambios."))
    if titles and all(s.get("titleSource") == "editorial-reviewed" for s in screenings):
        return dict(result, status="editorial-title", reason="Cabecera descriptiva revisada editorialmente; programa compartido sin principal.")
    known = all(isinstance(f["durationMinutes"], (int, float)) and not isinstance(f["durationMinutes"], bool)
                and math.isfinite(f["durationMinutes"]) and f["durationMinutes"] > 0 for f in movies)
    if not known:
        return dict(result, status="needs-review", reason="Faltan duraciones fiables; no se elige principal.")
    ranked = sorted(movies, key=lambda f: (-f["durationMinutes"], f["id"]))
    longest = ranked[0]
    second = ranked[1]
    if clear_candidate(movies, titles):
        return dict(result, candidateMainFilmId=longest["id"], status="clear-proposal",
                    reason=f"Pareja sin título propio: {longest['durationMinutes']} frente a {second['durationMinutes']} min; cumple el umbral conservador. Es una inferencia, no confirmación del festival.")
    if len(ids) == 2:
        candidate = longest["id"] if longest["durationMinutes"] >= 60 else None
        if titles:
            reason = "Sesión con título propio. Aunque predomina un largometraje, hay que decidir si conservar la cabecera del programa autoral."
        elif candidate:
            reason = f"La más larga dura {longest['durationMinutes']} min, pero la acompañante dura {second['durationMinutes']} min o no alcanza la proporción exigida; podría ser un programa doble."
        else:
            reason = "Dos mediometrajes sin predominio suficiente; propuesta: mantener ambos como programa compartido."
        return dict(result, status="needs-review", candidateMainFilmId=candidate, reason=reason)
    if longest["durationMinutes"] >= 60:
        return dict(result, status="needs-review", candidateMainFilmId=longest["id"],
                    reason="Más de dos películas con un largometraje; no se automatiza el papel de principal.")
    return dict(result, status="keep-program", reason="Programa de cortos o mediometrajes sin un largometraje dominante; se conserva como colectivo.")


def analyze(data, films):
    by_id = {film["id"]: film for film in films}
    groups = defaultdict(list)
    for screening in data["screenings"]:
        if len(set(screening.get("filmIds", []))) > 1:
            groups[tuple(sorted(set(screening["filmIds"])))].append(screening)
    return [classify(group, by_id) for _, group in sorted(groups.items(), key=lambda pair: min((s["date"], s["time"], s["candidateId"]) for s in pair[1]))]


def apply_clear(data, groups):
    suggestions = {s["id"]: group["candidateMainFilmId"] for group in groups if group["status"] == "clear-proposal" for s in group["screenings"]}
    changed = 0
    for screening in data["screenings"]:
        if screening["candidateId"] in suggestions and not screening.get("mainFilmId"):
            screening["mainFilmId"] = suggestions[screening["candidateId"]]
            screening["mainFilmSource"] = PROPOSAL_SOURCE
            changed += 1
    return changed


def film_text(movie):
    duration = f"{movie['durationMinutes']} min" if movie["durationMinutes"] else "duración desconocida"
    title = movie["title"].replace("|", "\\|")
    return f"{title} ({duration})"


def markdown(groups):
    labels = {"needs-review": "REVISAR", "applied-proposal": "APROXIMACIÓN APLICADA", "confirmed": "PRINCIPAL APROBADA", "official-confirmed": "PRINCIPAL SEGÚN FUENTE OFICIAL", "editorial-title": "TÍTULO EDITORIAL · SIN PRINCIPAL", "keep-program": "MANTENER PROGRAMA", "clear-proposal": "PROPUESTA SIN APLICAR"}
    lines = ["# Revisión de películas principales en pases agrupados", "",
             "Generado por `python3 scripts/review_main_films.py`. [El JSON](main-films.json) conserva el inventario y las decisiones propuestas.", "",
             f"**{len(groups)} combinaciones / {sum(len(g['screenings']) for g in groups)} pases agrupados.**", "",
             "## Criterio y límites", "",
             "- Solo se aplica una aproximación a parejas sin título de programa: principal ≥60 min, acompañante ≤20 min y relación ≥4:1.",
             "- Las anotaciones anteriores y los títulos de programas se preservan. Nunca se recalcula el rol al abrir la app.",
             "- Las nuevas anotaciones llevan `mainFilmSource: duration-proposal`: son provisionales, no una confirmación del festival.",
             "- Se agrupan los pases por sus películas, no por el orden del array ni por sus títulos; se listan todos los horarios.",
             "- Las decisiones editoriales y las cabeceras revisadas se guardan en los propios pases; este informe se puede regenerar sin perderlas.", "",
             "## Casos para revisar", ""]
    for i, group in enumerate((g for g in groups if g["status"] == "needs-review"), 1):
        heading = " + ".join(f["title"] for f in sorted(group["films"], key=lambda f: -(f["durationMinutes"] or 0)))
        lines.extend([f"### D{i}. {heading}", "", group["reason"], ""])
        if group["blockTitles"]:
            lines.append("**Título actual:** " + " / ".join(group["blockTitles"]) + ".")
        candidate = group["candidateMainFilmId"]
        name = next((f["title"] for f in group["films"] if f["id"] == candidate), None)
        lines.extend([f"**Propuesta:** principal «{name}» (`{candidate}`), solo si se confirma su papel." if name else "**Propuesta:** mantener el programa compartido, sin principal.", ""])
        for movie in sorted(group["films"], key=lambda f: -(f["durationMinutes"] or 0)):
            text = film_text(movie)
            lines.append(f"- [{text}]({movie['pageUrl']})" if movie["pageUrl"] else f"- {text}")
        lines.extend(["", "**Pases:**"])
        for screening in group["screenings"]:
            lines.append(f"- {screening['date']} · {screening['time']} · {screening['venue']} — `{screening['id']}`")
        lines.extend(["", "- [ ] Confirmar propuesta" if name else "- [ ] Mantener programa sin principal", "- [ ] Mantener programa sin principal" if name else "- [ ] Elegir una principal (indicar título)", "- [ ] Otra decisión: …", ""])
    lines.extend(["## Aproximaciones aplicadas — revisables", "", "| Principal propuesta | Incluye | Pases |", "|---|---|---:|"])
    for group in groups:
        if group["status"] != "applied-proposal": continue
        main = next(f for f in group["films"] if f["id"] == group["candidateMainFilmId"])
        others = "; ".join(film_text(f) for f in group["films"] if f["id"] != main["id"])
        lines.append(f"| {film_text(main)} | {others} | {len(group['screenings'])} |")
    lines.extend(["", "## Inventario completo", "", "| Estado | Programa / películas | Principal | Pases |", "|---|---|---|---:|"])
    for group in groups:
        title = " / ".join(group["blockTitles"]) or " + ".join(film_text(f) for f in group["films"])
        main = next((f["title"] for f in group["films"] if f["id"] == group["candidateMainFilmId"]), "—")
        lines.append(f"| {labels[group['status']]} | {title.replace('|', chr(92)+'|')} | {main} | {len(group['screenings'])} |")
    lines.extend(["", "## Cómo cerrar la revisión", "",
                  "Las decisiones aprobadas se conservan en `data/screenings.json`. Para aprobar una nueva aproximación, conserva `mainFilmId` y cambia `mainFilmSource` a `manual`; para retirar una propuesta, elimina ambos campos. Después regenera el informe y la build.", "",
                  "La duración solo propone: no prueba que el festival trate una obra como acompañante.", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-clear', action='store_true')
    args = parser.parse_args()
    screening_path = ROOT / 'data/screenings.json'
    films_path = ROOT / 'data/films.json'
    data = json.loads(screening_path.read_text())
    films = json.loads(films_path.read_text())["films"]
    groups = analyze(data, films)
    changed = apply_clear(data, groups) if args.apply_clear else 0
    if changed:
        screening_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        groups = analyze(data, films)
    output = ROOT / 'review'
    output.mkdir(exist_ok=True)
    report = {"schemaVersion": 1, "evidence": "local film durations and existing screening metadata; role proposals are not official confirmation",
              "sourceHashes": {"data/films.json": hashlib.sha256(films_path.read_bytes()).hexdigest(), "data/screenings.json": hashlib.sha256(screening_path.read_bytes()).hexdigest()},
              "summary": dict(Counter(g['status'] for g in groups)), "groups": groups}
    (output / 'main-films.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (output / 'main-films.md').write_text(markdown(groups))
    print(f"{len(groups)} groups / {sum(len(g['screenings']) for g in groups)} screenings; {changed} annotations applied")
    print(json.dumps(report['summary'], ensure_ascii=False))


if __name__ == '__main__':
    main()
