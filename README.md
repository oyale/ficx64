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
| `title` | string | Screening title when there are no films (talks, events) |

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
