# FICX 64 — personal festival programme

An offline app to build your own festival schedule, in **a single HTML file**. Everything lives
inside it: catalogue, screenings, styles and logic. No server, no account, no network requests
unless you opt into film images.

- Works offline once the file is downloaded.
- Data stays in the browser (`localStorage`). Nothing leaves your device.
- The programme, titles and synopses belong to the **Festival Internacional de Cine de Xixón**;
  they are gathered here for personal use only.

## Building

```bash
python3 build.py                 # writes dist/index.html
python3 build.py --output other.html
```

Python 3.9 or newer, no dependencies.

It takes `src/index.html`, `src/styles.css` and `src/app.js`, inlines the four JSON files from
`data/`, and writes one self-contained file.

GitHub Actions builds on every push to `main` and publishes `dist/` to Pages. `dist/` is not
versioned.

## Data format

Every file in `data/` is a JSON object with `schemaVersion`. A version the build does not expect
makes it **fail on purpose**, rather than ship an app with half the data missing.

Identifiers (`id` for films, `candidateId` for screenings) are free-form: they only exist to link
things together.

### `data/films.json`

```json
{
  "schemaVersion": 1,
  "edition": { "id": "ficx-64", "name": "FICX 64", "year": 2026,
               "startDate": "2026-11-13", "endDate": "2026-11-21" },
  "films": [
    {
      "id": "el-debut",
      "title": "El debut",
      "directors": ["Jesse Eisenberg"],
      "actors": [],
      "countries": ["España"],
      "year": 2026,
      "durationMinutes": 105,
      "sections": ["Crossroads"],
      "ciclo": [],
      "format": null,
      "synopsis": "Synopsis text…",
      "synopsisSource": "web",
      "pageUrl": "https://ficx.tv/peliculas/el-debut/",
      "imageUrl": "https://…/el-debut.jpg",
      "hasWebPage": true
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique film identifier |
| `title` | string | Display title |
| `directors`, `actors`, `countries` | string arrays | May be empty |
| `year` | number | Production year |
| `durationMinutes` | number or `null` | Film runtime |
| `sections`, `ciclo` | string arrays | Festival section and retrospective, if any. The first section drives the home screen |
| `format` | `"short"`, `"medium"` or `null` | Short or medium-length film; draws the format badge |
| `synopsis`, `synopsisSource` | string or `null` | Full text, with blank lines (`\n\n`) between paragraphs, and where it came from (`"web"`, `"catalogo-pdf"`) |
| `pageUrl`, `imageUrl` | string | Optional links; the image only loads if the user enables it |
| `hasWebPage` | boolean | Whether an external page exists |

### `data/screenings.json`

```json
{
  "schemaVersion": 1,
  "edition": { "id": "ficx-64", "…": "…" },
  "screenings": [
    {
      "candidateId": "calendar-p03-g01-d13-900",
      "date": "2026-11-13",
      "time": "09:00",
      "venue": "Escuela de Comercio",
      "room": null,
      "venueGroup": "escuela-comercio",
      "eventLabels": [],
      "accessType": "public",
      "reviewStatus": "reviewed",
      "durationMinutes": 164,
      "durationSource": "calendar-block",
      "hasMeeting": false,
      "meetingMinutes": null,
      "filmIds": ["the-dreamed-adventure"],
      "films": [{ "id": "the-dreamed-adventure", "title": "The Dreamed Adventure" }],
      "title": ""
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `candidateId` | string | Unique screening identifier |
| `date`, `time` | string | `YYYY-MM-DD` and `HH:MM`, local time |
| `venue`, `room` | string or `null` | Venue and room as displayed |
| `venueGroup` | string | Normalised venue; links to `venue-transfers.json` |
| `eventLabels` | string array | Introduction, Q&A, opening night… |
| `accessType` | `"public"`, `"restricted"`, `"school"` | Who may attend; only public ones show by default |
| `reviewStatus` | `"reviewed"` or `"needs-review"` | Whether the screening is confirmed |
| `durationMinutes`, `durationSource` | number, string | Whole-screening duration (multiple films included) and its origin |
| `hasMeeting`, `meetingMinutes` | boolean, number | Q&A and the minutes it takes beforehand |
| `filmIds` | string array | Films in the screening; joined with `films.json` at build time |
| `films` | array of `{id, title}` | Titles exactly as the official programme writes them. The original spelling is kept even when it differs from the film page |
| `title` | string | Official block or activity title, when provided |
| `mainFilmId` | optional string | Explicit principal film in a grouped screening; must reference one of its `filmIds`. No runtime inference |
| `mainFilmSource` | optional string | `duration-proposal` marks a provisional offline approximation; absent or `manual` means curated data |

### `data/venue-transfers.json`

```json
{
  "schemaVersion": 2,
  "sameVenueBufferMinutes": 5,
  "venues": [{ "id": "ocine", "name": "OCINE", "enterExitMinutes": 10 }],
  "transfers": [
    { "from": "ocine", "to": "escuela-comercio", "reviewStatus": "verified",
      "walkingMinutes": 34, "cyclingMinutes": 12 }
  ]
}
```

`enterExitMinutes` is the time to get into or out of the building and is added to every trip.
Any `reviewStatus` other than `"verified"` makes the app show “transfer to be confirmed”.

### `data/bus-transfers.json`

```json
{
  "schemaVersion": 1,
  "source": "EMTUSA",
  "timeBands": { "diurno_laborable_sabado": { "label": "Weekdays", "headway_main_lines_min": 10 } },
  "stops": { "ocine": { "stops": { "salida_hacia_centro_y_este": "Stop…" } } },
  "routes": [
    { "from": ["escuela-comercio"], "to": ["yelmo"],
      "options": [{ "lines": ["L1"], "board_stop": "…", "alight_stop": "…",
                    "walk_notes": "…", "minutes": { "diurno_laborable_sabado": 22 } }] }
  ]
}
```

Minutes are **per time band** and may be `null` when there is no service. The data format only
includes routes explicitly listed in `routes`.

## What this repository does not include

- How the JSON files are produced from the festival PDFs or website. This repository documents
  the **format**, not the extraction.
- Film image files: synopses are included in the catalogue JSON, but images are not stored here.
  Their external URLs are loaded only if the user enables images.

## Licence

The code in this repository is **CC0 1.0** (public domain). Catalogue content keeps the
festival's authorship.

## PWA updates

The build derives the service worker version from the generated HTML, the worker,
the manifest and the icons. Repeating a build without changes keeps the same
version; no manual counter is needed. Always publish the complete contents of
`dist/` as a single deployment.

The app checks for updates on load, when returning to the foreground, when
connection is restored and every five minutes while visible. The notice appears
only after the new cache is ready. “Update” activates the worker and reloads when
the controller changes. Dismissing the notice does not force a reload. Lists stay
in `localStorage`; cleanup is limited to FICX caches.

Documents use the network first. For the app's root and `index.html`, a cached
copy is served after three seconds if the network is slow, or immediately after
a network failure or HTTP 404/5xx. A late successful response refreshes the cache
without reloading the open page. Without a cached copy, the app keeps waiting for
the network.

If writing local data fails, a persistent warning offers an export of the current
lists and schedule. It remains until all failed keys have been saved successfully;
an unrelated successful write or an export does not clear it.

Automated checks:

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_service_worker.cjs
```

Mobile film details also have a real Chromium regression check (Node 22+ and
`chromium`, or set `CHROMIUM_BIN` to its executable):

```sh
python3 build.py
node tests/test_film_swipe.cjs
node tests/test_sections_browser.cjs
node tests/test_storage_failure_browser.cjs
node tests/test_network_fallback_browser.cjs
```

It checks the first tap after swiping, vertical scrolling, complete paragraphs,
the mobile font range, country/link layout and larger font preferences.

Browser acceptance check: open a published version, save a film, publish another
version with a UI or data change without touching `sw.js`, return to the app and
check for the notice. Press Update and verify the change and the saved film.
Repeat offline: the app should open the cached copy. Automated checks do not
replace this real installation, update and offline check.

## Download the app as HTML

Help offers `index.html` for download with the suggested filename `ficx64.html`.
The file includes the app and catalogue, but not browser choices; export the
programme from Settings to transfer them. The local file does not receive
automatic updates. The download link is hidden when the app is opened as a local
file.

`dist/index.html` is the only complete published copy. `dist/ficx64.html` is a
small redirect that preserves old links, including list and itinerary parameters
and fragments. To generate a separate portable copy:

```sh
python3 build.py --output /tmp/ficx64-portable/ficx64.html
```

## Section filters

In Explore, section cards can be combined: films from any selected section are
shown once. Click a selected card again to remove it. The additional-section
selector adds a section without replacing the selection; it appears as a selected
card so it can be removed. Selecting a section preserves the current scroll position on every screen size. Refinements use one shared list for the union of selected sections, with each film counted once. They also appear when viewing
all sections, whenever the current results have additional tags to filter.
Available options follow search and list filters, but remain available when
unchecked so they can be restored.
“Ver todo el festival” clears the selected sections; “Limpiar filtros” also clears
search, list/discard filters and section subfilters.

The Explore search matches titles, filmmakers, countries and section names.
Country search combines with selected sections and the other catalogue filters.

The Cortometrajes refinement controls Catalyst Shorts, Asturies Curtiumetraxes,
La Noche del Corto Español and Sección Oficial Cortometrajes together. Re-enabling one subset also
enables the parent while keeping other excluded subsets unchecked.

Film cards show their countries beside the filmmaker only when the complete line
fits with at least 32 CSS pixels to spare. This is recalculated for each card on
resize and after fonts load; compact cards keep the existing single credit line.

Country credits are separated from filmmakers as `Filmmaker | (Country · Country)`.
When that does not fit, cards try `Filmmaker | (First country +N)` before hiding the
country credit. The complete list remains available to assistive technology and
as a tooltip. Selected section cards use a stronger edge and short shadow, without checkmarks.
Catalogue ordering also supports shortest/longest first; unknown durations stay
last, with alphabetical ordering as the tie-breaker.

Explore keeps the search field at full width. Refinements start collapsed and open
inline through “Afinar resultados”; active exclusions remain visible on the button
when collapsed. Escape closes the panel and returns focus to its button. Clear is
shown only while catalogue filters are active. Selecting sections never scrolls
the page, on desktop or mobile; selection uses an edge and shadow, without checks.

## Itinerary PDF

In **Mi programa**, open **Exportar y compartir** and select **Descargar itinerario
PDF**. Export asks for an optional name used only in that PDF: it does not change
the app alias. Leave it blank for “Tu itinerario”; cancelling creates no file.
The document includes every planned day even when the screen shows just one.
Shared screenings appear once; standalone activities are included too.

The compact A4 layout puts whole-screening duration beside the title and sections
beside the venue. It uses the approved FICX mark and Barlow fonts, with an encounter
badge rather than internal presentation minutes. End times include the pre-film
presentation but not the subsequent discussion; the footer states that caveat.
It uses the selected travel mode and preserves unknown times instead of inventing
ends or journeys. Four ordinary screenings across two days fit on one page;
long documents paginate without cutting off content.

A grouped screening with a curated `mainFilmId` uses that film as the title and
lists its accompanying films under “Incluye”, with their individual durations
when known. The annotations identify the principal in Torino Shadow + El día que ella volvió,
Las acogidas + ¿A dónde, Vauste?, María Silvia Esteve (I/II), and other reviewed
grouped screenings. The shared Lucía Seles / POEX screening keeps its reviewed
descriptive heading without assigning a principal. Otherwise the official block title is kept,
or “Programa de N películas” is used. The app never guesses a principal film at runtime. Provisional offline
approximations are recorded explicitly and remain reviewable. Editorial decisions and
provenance are stored with the screening data, so the review report can be regenerated
without losing them. The build rejects a `mainFilmId` outside the linked films.

The PDF is a dated snapshot for reading or printing, not an importable data backup.
Download it again after changing the plan. The menu points to **Ajustes → Exportar
tu programa** for app data export. Empty plans cannot be exported; generation
failures preserve the plan and allow another attempt.

Generation is entirely local. jsPDF, fonts, artwork and licenses are bundled in
the single HTML, including the portable download; no CDN or PDF service is used.
The PDF contains selectable text, not a screenshot. It is not a tagged PDF.
Asset provenance and licenses are documented in `src/pdf-assets/README.md`.

PDF validation requires Node 22+, Chromium and Poppler's `pdftotext`
(`poppler-utils` on Debian/Ubuntu). The tests cover pagination and page bounds,
Unicode, primary-film annotations, name/cancellation, all-day export, error
recovery and actual downloads after an offline reload and from an isolated
portable HTML.

```sh
python3 build.py
node --test tests/test_itinerary_pdf.cjs
CHROMIUM_BIN=/usr/lib/chromium/chromium node tests/test_itinerary_pdf_browser.cjs
# Preserve the downloaded browser-test sample for inspection:
FICX_PDF_SAMPLE=/tmp/ficx-itinerary.pdf node tests/test_itinerary_pdf_browser.cjs
```

## Reviewing principal films

`review/main-films.md` lists doubtful cases first, followed by applied provisional
approximations and the full grouped-screening inventory. The accompanying JSON
records all screening IDs, durations, provenance and input hashes.

```sh
python3 scripts/review_main_films.py              # report only; no data changes
python3 scripts/review_main_films.py --apply-clear # annotate clear unconfigured pairs
```

The offline helper applies only unnamed pairs with a film of at least 60 minutes,
an accompaniment of at most 20 minutes and a ratio of at least 4:1. It never
overwrites an existing role or chooses a lead for a named programme. These are
proposals, not official confirmation: they are marked `mainFilmSource:
duration-proposal`. Remove that marker (or set it to `manual`) after approval;
remove both fields to undo the proposal. The app/build does not run this helper.
