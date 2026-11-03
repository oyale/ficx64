(() => {
  "use strict";

  const films = Array.isArray(window.FICX_FILMS) ? window.FICX_FILMS : [];
  const screeningRecords = Array.isArray(window.FICX_SCREENINGS) ? window.FICX_SCREENINGS : [];
  const venueTransfers = window.FICX_VENUE_TRANSFERS || {};
  const busTransfers = window.FICX_BUS_TRANSFERS || {};
  const primarySections = Array.isArray(window.FICX_PRIMARY_SECTIONS) ? window.FICX_PRIMARY_SECTIONS : [];
  // Same list as dev_build_app.py: used if the bundle ever ships without it.
  const FALLBACK_PINNED_SECTIONS = ["Albar", "Retueyos", "Sección Oficial", "Esbilla", "Enfants Terribles", "Crossroads", "FICX Premiere", "Generación Mutante"];
  const maxPinnedSections = 8;
  const pinStorageKey = "ficx64-pinned-sections-v1";
  const plannedScreeningsStorageKey = "ficx64-planned-screenings-v1";
  const transportStorageKey = "ficx64-transport-mode-v1";
  const remoteImagesStorageKey = "ficx64-remote-images-enabled-v1";
  const aliasStorageKey = "ficx64-alias-v1";
  const themeStorageKey = "ficx64-theme-v1";
  const storageKey = "ficx64-film-intentions-v2";
  const legacyStorageKey = "ficx64-saved-film-ids-v1";
  const list = document.querySelector("#film-list");
  const search = document.querySelector("#search-input");
  const moreSections = document.querySelector("#more-sections");
  const sort = document.querySelector("#sort-order");
  const savedList = document.querySelector("#saved-list");
  const maybeList = document.querySelector("#maybe-list");
  const clearSaved = document.querySelector("#clear-saved");
  const filmById = new Map(films.map((film) => [film.id, film]));
  const sectionSubfilters = document.querySelector("#section-subfilters");
  const excludedSubfiltersBySection = new Map();
  let remoteImagesEnabled = readRemoteImagesSetting();
  let intentions = readIntentions();
  let plannedScreenings = readPlannedScreenings();
  // Activities/talks without a linked film are planned by candidate id only.
  const standaloneStorageKey = "ficx64-planned-standalone-v1";
  let plannedStandalone = readPlannedStandalone();
  const discardedStorageKey = "ficx64-discarded-v1";
  let discarded = readDiscarded();
  const prioritizedStorageKey = "ficx64-prioritized-v1";
  let prioritized = readPrioritized();
  let pinnedSections = readPinnedSections();
  let activeSection = "";
  let onlyMyLists = false;
  let showDiscarded = false;
  let expandedId = null;
  let filmNavigationIds = [];
  // Pass lists stay folded until the person opens them; the fold is re-rendered
  // on every paint, so this carries the user's open state across renders.
  let openPassesId = null;
  let returnToSessionSearch = false;
  let returnToProgram = false;
  let programScrollY = 0;
  let returnToShared = false;
  let sharedScrollY = 0;
  let sessionSearchScrollY = 0;
  let activeProgramDate = "";
  const specialAccessStorageKey = "ficx64-include-special-v1";
  let includeSpecialInProgram = readIncludeSpecial();

  function readIncludeSpecial() {
    try { return localStorage.getItem(specialAccessStorageKey) === "true"; } catch (_) { return false; }
  }
  function persistIncludeSpecial() {
    try { localStorage.setItem(specialAccessStorageKey, String(includeSpecialInProgram)); } catch (_) { /* Preference stays for this session. */ }
  }
  let transportMode = readTransportMode();
  let activeScreen = "explore";
  let activeMobileTab = "explore";
  const activeDates = new Set();
  const activeTimes = new Set();
  const activeVenues = new Set();

  function readIntentions() {
    try {
      const current = localStorage.getItem(storageKey);
      const parsed = current ? JSON.parse(current) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return new Map(Object.entries(parsed).filter(([id, status]) => films.some((film) => film.id === id) && ["want", "maybe"].includes(status)));
      }
      const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || "[]");
      return new Map(Array.isArray(legacy) ? legacy.filter((id) => films.some((film) => film.id === id)).map((id) => [id, "want"]) : []);
    } catch (_) { return new Map(); }
  }
  function readPlannedStandalone() {
    try {
      const saved = JSON.parse(localStorage.getItem(standaloneStorageKey) || "[]");
      if (!Array.isArray(saved)) return new Set();
      return new Set(saved.filter((id) => screeningRecords.some((screening) => screening.candidateId === id && !(screening.filmIds || []).length)));
    } catch (_) { return new Set(); }
  }
  function persistStandalone() {
    try { localStorage.setItem(standaloneStorageKey, JSON.stringify([...plannedStandalone])); } catch (_) { /* Keep it for this session. */ }
  }
  function readDiscarded() {
    try {
      const saved = JSON.parse(localStorage.getItem(discardedStorageKey) || "[]");
      if (!Array.isArray(saved)) return new Set();
      return new Set(saved.filter((id) => films.some((film) => film.id === id)));
    } catch (_) { return new Set(); }
  }
  function persistDiscarded() {
    try { localStorage.setItem(discardedStorageKey, JSON.stringify([...discarded])); } catch (_) { /* Keep it for this session. */ }
  }
  function readPrioritized() {
    try {
      const saved = JSON.parse(localStorage.getItem(prioritizedStorageKey) || "[]");
      if (!Array.isArray(saved)) return new Set();
      return new Set(saved.filter((id) => films.some((film) => film.id === id) && !discarded.has(id) && intentions.has(id)));
    } catch (_) { return new Set(); }
  }
  function persistPrioritized() {
    try { localStorage.setItem(prioritizedStorageKey, JSON.stringify([...prioritized])); } catch (_) { /* Keep it for this session. */ }
  }
  function readTransportMode() {
    try {
      const value = localStorage.getItem(transportStorageKey);
      return ["walking", "cycling", "bus", "all"].includes(value) ? value : "all";
    } catch (_) { return "all"; }
  }
  function readPlannedScreenings() {
    try {
      const saved = JSON.parse(localStorage.getItem(plannedScreeningsStorageKey) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return new Map();
      return new Map(Object.entries(saved).filter(([filmId, candidateId]) =>
        films.some((film) => film.id === filmId)
        && screeningRecords.some((screening) => screening.candidateId === candidateId && screening.filmIds.includes(filmId))
      ));
    } catch (_) { return new Map(); }
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(intentions))); } catch (_) { /* Local storage may be disabled. */ }
  }
  function persistPlannedScreenings() {
    try { localStorage.setItem(plannedScreeningsStorageKey, JSON.stringify(Object.fromEntries(plannedScreenings))); } catch (_) { /* The plan remains available for this session. */ }
  }
  function availableSections() {
    return [...new Set(films.flatMap((film) => film.sections || []))]
      .filter((name) => name && name.toLocaleLowerCase("es") !== "otras secciones");
  }
  function readPinnedSections() {
    const available = availableSections();
    const valid = (name) => available.includes(name);
    let saved = null;
    try {
      const raw = localStorage.getItem(pinStorageKey);
      if (raw !== null) saved = JSON.parse(raw);
    } catch (_) { /* Fall back to the festival's initial highlights. */ }
    // Defaults are the safety net: they apply whenever the stored value is
    // missing, invalid or holds no section that still exists in the catalogue.
    if (Array.isArray(saved)) {
      const kept = [...new Set(saved.filter(valid))].slice(0, maxPinnedSections);
      if (kept.length) return kept;
    }
    const defaults = (primarySections.length ? primarySections : Object.keys(FALLBACK_PINNED_SECTIONS))
      .filter(valid).slice(0, maxPinnedSections);
    if (defaults.length) return defaults;
    return FALLBACK_PINNED_SECTIONS.filter(valid).slice(0, maxPinnedSections);
  }
  function persistPinnedSections() {
    try { localStorage.setItem(pinStorageKey, JSON.stringify(pinnedSections)); } catch (_) { /* Local storage may be disabled. */ }
  }
  function readRemoteImagesSetting() {
    try { return localStorage.getItem(remoteImagesStorageKey) === "true"; } catch (_) { return false; }
  }
  function updateRemoteImagesStatus() {
    document.querySelector("#remote-images-status").textContent = remoteImagesEnabled
      ? "Activado · se cargarán al desplegar fichas."
      : "Desactivado · no se solicitan imágenes remotas.";
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function directorText(film) {
    return Array.isArray(film.directors) ? film.directors.join(", ") : (film.directors || "Dirección no disponible");
  }
  function screeningCard(screening) {
    const date = new Date(`${screening.date}T12:00:00`);
    const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date).replace(/\.$/, "").toLocaleUpperCase("es");
    const day = new Intl.DateTimeFormat("es-ES", { day: "2-digit" }).format(date);
    const month = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date).replace(/\.$/, "").toLocaleUpperCase("es");
    const sharedProgram = screening.filmIds?.length > 1
      ? `<span class="screening-program-tag">Pase compartido · ${screening.filmIds.length} películas</span>`
      : "";
    const blockTitle = screening.title && (screening.filmIds || []).length > 1
      ? `<p class="screening-program-title">${escapeHtml(screening.title)}</p>`
      : "";
    const labels = eventLabelsFor(screening);
    const meetingNote = screening.meetingMinutes ? `<p class="screening-meeting"><span class="meeting-icon" aria-hidden="true">🎙</span>Encuentro con el equipo</p>` : "";
    // reviewStatus stays in the data; the UI no longer flags pending passes.
    return `<li class="cinema-card screening-card">
      <time class="screening-date" datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}"><span>${escapeHtml(weekday)}</span><b>${escapeHtml(day)}</b><small>${escapeHtml(month)}</small></time>
      <div class="screening-info">
        <p class="screening-time"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3.2 2"/></svg><time datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}">${escapeHtml(screening.time)}</time></p>
        <p class="screening-place"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8.2c0 4.4-6 9.3-6 9.3S4 12.6 4 8.2a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8" r="2"/></svg><span>${escapeHtml(screening.venue)}${screening.room ? `<b>${escapeHtml(screening.room)}</b>` : ""}</span></p>
        ${busStopLine(screening.venueGroup)}
        ${screening.meetingMinutes ? `<p class="screening-meeting"><span class="meeting-icon" aria-hidden="true">🎙</span>Encuentro con el equipo</p>` : ""}
        ${blockTitle}
        <div class="screening-tags">${sharedProgram}${labels}</div>
        ${renderPassQuickActions(screening, { planOnly: true })}
      </div>
    </li>`;
  }
  function finderFilmEntry(film) {
    if (!film.id) return `<span class="screening-film-unlinked">${escapeHtml(film.title)}</span>`;
    // The intent is already shown by the "Mi lista" / "Quizás" buttons below.
    const status = intentions.get(film.id);
    return `<span class="finder-film-entry${status ? " has-intention" : ""}"><button type="button" class="screening-film-link" data-open-film="${escapeHtml(film.id)}">${escapeHtml(film.title)}</button></span>`;
  }
  function renderFilmScreenings(film) {
    const screenings = Array.isArray(film.screenings) ? film.screenings : [];
    const publicScreenings = screenings.filter((screening) => screening.accessType === "public");
    const specialScreenings = screenings.filter((screening) => screening.accessType !== "public");
    const emptyMessage = !screenings.length ? `<p class="screenings-empty">No hay pases para esta película.</p>` : "";
    const specialList = specialScreenings.length ? `<details class="special-screenings"><summary>Pases con acceso especial <span>${specialScreenings.length}</span></summary><p>Incluye pases escolares o reservados a prensa y acreditados.</p><ul class="screening-list">${specialScreenings.map(screeningCard).join("")}</ul></details>` : "";
    // Passes start folded. Only an explicit Mi lista / Quizás click opens them;
    // marking the opposite intent again closes them.
    const open = openPassesId === film.id ? " open" : "";
    const passContent = screenings.length ? `${publicScreenings.length ? `<ul class="screening-list">${publicScreenings.map(screeningCard).join("")}</ul>` : `<p class="screenings-empty">No hay pases abiertos al público.</p>`}${specialList}` : emptyMessage;
    return `<section class="film-screenings" aria-label="Pases de ${escapeHtml(film.title)}"><details class="film-screenings-foldout"${open}><summary><span>Pases</span><b>${screenings.length}</b></summary><div class="film-screenings-content">${passContent}</div></details></section>`;
  }
  function filmsForSection(sectionName) {
    return films.filter((film) => !discarded.has(film.id) && (!sectionName || (film.sections || []).includes(sectionName)));
  }
  function matchingFilms() {
    const query = search.value.trim().toLocaleLowerCase("es");
    const excluded = excludedSubfiltersBySection.get(activeSection) || new Set();
    return films.filter((film) => {
      // Mientras dura el acuse, la recién descartada sigue ocupando su sitio.
      if (discarded.has(film.id) !== showDiscarded && !(discardAck && discardAck.film.id === film.id)) return false;
      const names = film.sections || [];
      const searchable = `${film.title} ${directorText(film)} ${names.join(" ")}`.toLocaleLowerCase("es");
      const inMyLists = intentions.has(film.id);
      return (!activeSection || names.includes(activeSection)) && !names.some((name) => excluded.has(name))
        && (!onlyMyLists || inMyLists) && (!query || searchable.includes(query));
    }).sort((a, b) => {
      const compare = a.title.localeCompare(b.title, "es", { sensitivity: "base" });
      return sort.value === "title-desc" ? -compare : compare;
    });
  }
  // Frase de una línea por sección, tomada de la web del festival.
  const SECTION_TAGLINES = {
    "Albar": "El mapa del cine de autor del año",
    "Retueyos": "Primeras miradas: aquí nacen las carreras",
    "Sección Oficial": "La competición del festival",
    "Esbilla": "La mejor cosecha del año, sin competición",
    "Enfants Terribles": "El gran cine no tiene edad",
    "Crossroads": "Donosti ↔ Xixón connection",
    "FICX Premiere": "Estrenos en España de grandes maestros",
    "Generación Mutante": "El laboratorio del FICX: el género se transforma",
    "Pases Especiales": "Cineastas de la temporada, cara a cara",
    "Catalyst Shorts": "Cortos de la escuela Catalyst de Berlín",
    "La Noche del Corto Español": "Una noche entera de cortos",
    "Asturies Curtiumetraxes": "El corto hecho en Asturies",
    "Sección Oficial Cortometrajes": "Los cortos que compiten",
    "Focos": "Retrospectivas y miradas de autor",
    "Interior/Exterior": "El archivo como mirada política",
    "Recuerdos del porvenir": "Cine político: el archivo como resistencia",
  };

  function renderSectionPicker() {
    const featured = document.querySelector("#featured-sections");
    const present = pinnedSections.filter((name) => films.some((film) => (film.sections || []).includes(name)));
    featured.innerHTML = present.map((name, index) => {
      const count = filmsForSection(name).length;
      const selected = activeSection === name;
      const tagline = SECTION_TAGLINES[name] || "";
      return `<button class="cinema-card section-card${selected ? " is-selected" : ""}" type="button" data-section="${escapeHtml(name)}" aria-pressed="${selected}">
        <svg class="section-card-bolt" viewBox="0 0 180 250" aria-hidden="true"><path d="M112 0 25 114h52L0 250l155-155H99L180 0z"/></svg>
        <span class="section-card-name">${escapeHtml(name)}</span>
        ${tagline ? `<span class="section-card-tagline">${escapeHtml(tagline)}</span>` : ""}
        <span class="section-card-count" aria-hidden="true"><b>${count}</b><small>${count === 1 ? "película" : "películas"}</small></span>
        <span class="sr-only">${count} ${count === 1 ? "película" : "películas"}; ${selected ? "seleccionada" : "pulsa para explorar"}</span>
      </button>`;
    }).join("");

    const remaining = [...new Set(films.flatMap((film) => film.sections || []))]
      .filter((name) => !pinnedSections.includes(name) && name.toLocaleLowerCase("es") !== "otras secciones").sort((a, b) => a.localeCompare(b, "es"));
    moreSections.innerHTML = `<option value="">Más secciones…</option>${remaining.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} · ${filmsForSection(name).length}</option>`).join("")}`;
    moreSections.value = remaining.includes(activeSection) ? activeSection : "";
    // First-run default: until the person picks a section, mark the main
    // sections chosen by the festival so the screen is not an empty list.
    if (!activeSection) {
      featured.querySelectorAll(".section-card").forEach((card, index) => {
        if (index < 4) {
          card.classList.add("is-selected");
          card.setAttribute("aria-pressed", "true");
          const meta = card.querySelector(".section-card-meta span");
          if (meta) meta.textContent = "Explorar";
        }
      });
    }
    renderPinOptions();
  }
  function renderPinOptions() {
    const container = document.querySelector("#pin-options");
    const available = availableSections();
    const ordered = [...available].sort((a, b) => {
      const ai = pinnedSections.indexOf(a); const bi = pinnedSections.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
      return a.localeCompare(b, "es");
    });
    container.innerHTML = ordered.map((name) => {
      const checked = pinnedSections.includes(name);
      const disabled = !checked && pinnedSections.length >= maxPinnedSections;
      return `<label class="pin-option${disabled ? " is-disabled" : ""}"><input type="checkbox" data-pin-section="${escapeHtml(name)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span>${escapeHtml(name)}</span><b>${filmsForSection(name).length}</b></label>`;
    }).join("");
    document.querySelector("#pinned-count").textContent = `${pinnedSections.length}/${maxPinnedSections}`;
    document.querySelector("#pin-limit-note").textContent = pinnedSections.length >= maxPinnedSections ? "Máximo alcanzado" : `Puedes fijar ${maxPinnedSections - pinnedSections.length} más`;
    const settingsPins = document.querySelector("#settings-pins");
    if (settingsPins) {
      settingsPins.innerHTML = ordered.map((name) => {
        const checked = pinnedSections.includes(name);
        const disabled = !checked && pinnedSections.length >= maxPinnedSections;
        return `<label class="settings-pin${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}"><input type="checkbox" data-settings-pin="${escapeHtml(name)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span>${escapeHtml(name)} <b>${filmsForSection(name).length}</b></span></label>`;
      }).join("") + `<small class="settings-pin-note">${pinnedSections.length}/${maxPinnedSections} fijadas${pinnedSections.length >= maxPinnedSections ? " · máximo alcanzado" : ""}</small>`;
    }
  }
  function renderSubfilters() {
    if (!activeSection) { sectionSubfilters.hidden = true; sectionSubfilters.innerHTML = ""; return; }
    const core = new Set(primarySections);
    const counts = new Map();
    films.filter((film) => (film.sections || []).includes(activeSection)).forEach((film) => {
      (film.sections || []).forEach((name) => {
        if (name !== activeSection && !core.has(name) && name.toLocaleLowerCase("es") !== "otras secciones") counts.set(name, (counts.get(name) || 0) + 1);
      });
    });
    if (!counts.size) { sectionSubfilters.hidden = true; sectionSubfilters.innerHTML = ""; return; }
    const excluded = excludedSubfiltersBySection.get(activeSection) || new Set();
    sectionSubfilters.hidden = false;
    sectionSubfilters.innerHTML = `<span class="subfilter-title">Afinar esta sección <small>Mostrar</small></span>${[...counts].sort(([a], [b]) => a.localeCompare(b, "es")).map(([name, count]) => `<label class="subfilter-chip"><input type="checkbox" data-subfilter="${escapeHtml(name)}"${excluded.has(name) ? "" : " checked"}><span>${escapeHtml(name)}</span><b>${count}</b></label>`).join("")}`;
  }
  // Botones de intención de una película, con el aspecto del listado. `status` va aparte porque la
  // demo del asistente prueba un estado que no está guardado.
  function intentButtonMarkup(kind, { film, status = intentions.get(film.id), discardedFlag = film ? discarded.has(film.id) : false }) {
    const id = escapeHtml(film.id);
    const selected = (value) => (value === status ? " is-selected" : "");
    if (kind === "discard") {
      const icon = discardedFlag
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12c2.3-4.3 5.5-6.5 9.5-6.5s7.2 2.2 9.5 6.5c-2.3 4.3-5.5 6.5-9.5 6.5S4.8 16.3 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12c2.3-4.3 5.5-6.5 9.5-6.5s7.2 2.2 9.5 6.5c-2.3 4.3-5.5 6.5-9.5 6.5S4.8 16.3 2.5 12Z"/><path d="M4.3 4.3 9.95 9.95M14.05 14.05 19.7 19.7"/><circle cx="12" cy="12" r="2.8"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/></svg>`;
      return discardedFlag
        ? `<button class="intent-button intent-discard is-selected" type="button" data-action="discard" data-id="${id}" aria-pressed="true" title="Restaurar película">${icon}<span class="intent-copy"><b>Restaurar</b><small>Volver a verla</small></span></button>`
        : `<button class="intent-button intent-discard" type="button" data-action="discard" data-id="${id}" aria-pressed="false" title="Descartar película">${icon}<span class="intent-copy"><b>Descartar</b><small>No la quiero ver</small></span></button>`;
    }
    if (kind === "want") {
      const icon = status === "want"
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m7.5 12.2 3 3 6-6.2"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`;
      return `<button class="intent-button intent-want${selected("want")}" type="button" data-action="intent" data-status="want" data-id="${id}" aria-pressed="${status === "want"}" title="Añadir a mi lista">${icon}<span class="intent-copy"><b>${status === "want" ? "En mi lista" : "Añadir a mi lista"}</b><small>${status === "want" ? "Guardada" : "No perderla"}</small></span></button>`;
    }
    return `<button class="intent-button intent-maybe${selected("maybe")}" type="button" data-action="intent" data-status="maybe" data-id="${id}" aria-pressed="${status === "maybe"}" title="Mmm… quizás"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4-7 4V4.5Z"/><path d="M9.5 7.5a2.5 2.5 0 0 1 4.6 1.3c0 1.5-2.1 1.7-2.1 3.2M12 15h.01"/></svg><span class="intent-copy"><b>${status === "maybe" ? "Quizás" : "Mmm… quizás"}</b><small>${status === "maybe" ? "Para más tarde" : "Lo estoy pensando"}</small></span></button>`;
  }
  function renderFilms() {
    // El repintado rehace las tarjetas: el acuse abierto se recoloca al final del pintado.
    if (discardAck && !discardAck.fromDialog) { const ack = discardAck; requestAnimationFrame(() => discardAck === ack && keepDiscardAck()); }
    const visible = matchingFilms();
    const title = showDiscarded ? "Películas descartadas" : (activeSection ? `Películas en ${activeSection}` : "Todas las películas");
    document.querySelector("#browse-title").childNodes[0].textContent = `${title} `;
    document.querySelector("#browse-count").textContent = String(visible.length);
    document.querySelector("#active-section-label").textContent = activeSection || "Todas las secciones";
    document.querySelector("#empty-state").hidden = visible.length > 0;
    document.querySelector("#empty-state").textContent = showDiscarded ? "No has descartado ninguna película." : "No encontramos películas con esos filtros. Prueba otro título o sección.";
    renderSubfilters();
    list.innerHTML = visible.map((film) => {
      const status = intentions.get(film.id);
      const isExpanded = expandedId === film.id;
      const tags = (film.sections || []).filter((name) => !["otras secciones", "cortometrajes"].includes(name.toLocaleLowerCase("es"))).map((name) => `<span class="film-section">${escapeHtml(name)}</span>`).join("");
      const cicloTags = (film.ciclo || []).map((name) => `<span class="film-ciclo">${escapeHtml(name)}</span>`).join("");
      const credits = directorText(film);
      const countries = Array.isArray(film.countries) ? film.countries.filter(Boolean) : [];
      const facts = [film.year, film.durationMinutes ? `${film.durationMinutes} min` : ""].filter(Boolean).map(escapeHtml).join(" · ");
      const detailUrl = /^https:\/\/(?:www\.)?ficx\.tv\//.test(film.pageUrl || "") ? film.pageUrl : "";
      const posterSection = (film.sections || [])[0] || "Festival Internacional de Cine de Xixón";
      const toneIndex = [...String(posterSection)].reduce((sum, char) => sum + char.codePointAt(0), 0) % 4;
      const formatLabel = film.format === "medium" ? "Mediometraje" : "Cortometraje";
      const formatBadge = ["short", "medium"].includes(film.format)
        ? `<span class="poster-format-badge poster-format-${film.format}" role="img" aria-label="${formatLabel}" title="${formatLabel}"><svg viewBox="0 0 36 18" aria-hidden="true"><rect x="1" y="1" width="34" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="6" width="24" height="6" rx=".5" fill="currentColor"/><path d="M5 2v2m6-2v2m6-2v2m6-2v2m6-2v2M5 14v2m6-2v2m6-2v2m6-2v2m6-2v2" stroke="currentColor" stroke-width="1.5"/></svg></span>`
        : "";
      const discardedFlag = discarded.has(film.id);
      // Jerarquía única en Explorar y en la ficha: Mi lista y Quizás juntos, Descartar aparte.
      // Descartar solo se ofrece mientras no hay decisión: con intención ya elegida, no aparece.
      const canDiscard = !discardedFlag && status !== "want" && status !== "maybe";
      const intentButtons = discardedFlag
        ? `<span class="intent-row">${intentButtonMarkup("discard", { film })}</span>`
        : `<span class="intent-row"><span class="intent-primary">${intentButtonMarkup("want", { film, status })}${intentButtonMarkup("maybe", { film, status })}</span>${canDiscard ? intentButtonMarkup("discard", { film }) : ""}</span>`;
      const expandedHeader = `<header class="film-detail-sticky">
        <div class="film-detail-sticky-copy">
          <h2 class="film-title" id="film-detail-title-${escapeHtml(film.id)}">${escapeHtml(film.title)}${filmStar(film, { action: true })}</h2>
          <p class="film-credit">${escapeHtml(credits) || "Sin datos de dirección"}</p>
          ${facts || tags || cicloTags ? `<p class="film-facts film-detail-facts">${facts ? `<span>${facts}</span>` : ""}${tags}${cicloTags}</p>` : ""}
        </div>
        <div class="film-detail-sticky-actions">
          <nav class="film-detail-navigation" aria-label="Navegación entre películas">${[-1, 1].map((direction) => {
            const index = filmNavigationIds.indexOf(film.id);
            const adjacent = films.find((item) => item.id === filmNavigationIds[index + direction]);
            const label = direction < 0 ? "anterior" : "siguiente";
            const action = direction < 0 ? "previous" : "next";
            return `<button class="film-detail-nav" type="button" data-action="film-${action}"${adjacent ? ` aria-label="Película ${label}: ${escapeHtml(adjacent.title)}" title="${escapeHtml(adjacent.title)}"` : ` aria-label="No hay película ${label}" title="No hay película ${label}" disabled`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${direction < 0 ? "m12.5 3.5-6.5 6.5 6.5 6.5" : "m7.5 3.5 6.5 6.5-6.5 6.5"}"/></svg></button>`;
          }).join("")}</nav>
          <button class="film-detail-close" type="button" data-action="expand" data-id="${escapeHtml(film.id)}" aria-label="Cerrar ficha de ${escapeHtml(film.title)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
        </div>
      </header>`;
      const details = isExpanded ? `<dialog class="film-expanded" id="film-detail-${escapeHtml(film.id)}" aria-labelledby="film-detail-title-${escapeHtml(film.id)}">
        ${expandedHeader}
        <div class="film-expanded-main">
        <div class="film-detail-poster poster-tone-${toneIndex}${remoteImagesEnabled && film.imageUrl ? " poster-has-image" : ""}" aria-label="Imagen de ${escapeHtml(film.title)}">
          ${remoteImagesEnabled && film.imageUrl ? `<img class="poster-image" src="${escapeHtml(film.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('poster-has-image');this.remove()">` : ""}
          <div class="poster-topline"><b>FICX</b><img class="poster-mark" src="icons/mark.svg" alt="64" width="38" height="38"></div>
          <svg class="poster-bolt" viewBox="0 0 180 250" aria-hidden="true"><path d="M112 0 25 114h52L0 250l155-155H99L180 0z"/></svg>
          <div class="poster-edition">XIXÓN<br>2026</div>
          ${formatBadge}
          <div class="poster-mobile-metadata">
            <h2><span class="poster-mobile-title">${escapeHtml(film.title)}</span>${filmStar(film, { action: true })}</h2><p>${escapeHtml(credits) || "Sin datos de dirección"}</p>
            ${facts ? `<span class="poster-mobile-facts">${facts}</span>` : ""}
            <div class="poster-mobile-sections">${tags}${cicloTags}</div>
          </div>
        </div>
        <div class="film-detail-copy">
          ${countries.length ? `<p class="detail-kicker detail-countryline">${escapeHtml(countries.join(" · "))}</p>` : ""}
          <h4>Sinopsis</h4>
          ${film.synopsis ? `<p class="detail-synopsis">${escapeHtml(film.synopsis)}</p>` : `<p class="detail-synopsis detail-missing">La sinopsis no está disponible en la ficha capturada.</p>`}
          <div class="detail-bottom"><span class="detail-provenance">${film.synopsisSource === "catalogo-pdf" ? "Texto del catálogo impreso" : "Texto de la ficha web"}</span>
            ${detailUrl ? `<a class="film-web-link" href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener noreferrer">Ver ficha en ficx.tv <span aria-hidden="true">↗</span></a>` : ""}
          </div>
        </div>
        </div>
        <div class="film-expanded-screenings">${renderFilmScreenings(film)}</div>
           <div class="detail-actions film-expanded-actions" role="group" aria-label="Decidir sobre ${escapeHtml(film.title)}">${intentButtons}</div>
      </dialog>` : "";
      return `<li class="cinema-card film-row${isExpanded ? " is-expanded" : ""}${discardedFlag ? " is-discarded" : ""}" data-film-id="${escapeHtml(film.id)}">
        ${!isExpanded ? `<div class="film-body">
          <div class="film-copy">
            <span class="film-title-line">${escapeHtml(film.title)}${filmStar(film, { action: true })}</span>
            <p class="film-credit">${escapeHtml(credits) || "Sin datos de dirección"}</p>
            ${facts || tags || cicloTags ? `<p class="film-meta-line">${facts ? `<span class="film-facts">${facts}</span>` : ""}${tags}${cicloTags}</p>` : ""}
          </div>
          <div class="film-actions" aria-label="Añadir ${escapeHtml(film.title)} a una lista">${intentButtons}</div>
        </div>` : ""}
        ${details}
      </li>`;
    }).join("");
    const detailDialog = list.querySelector("dialog.film-expanded");
    if (detailDialog) {
      detailDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        // Con el acuse de descartar abierto, Escape lo cierra a él y no la ficha.
        if (discardAck) { closeDiscardAck(); return; }
        closeFilmDetails();
      });
      syncFilmDialog();
    }
  }
  function renderSaved() {
    const wanted = films.filter((film) => intentions.get(film.id) === "want");
    const maybes = films.filter((film) => intentions.get(film.id) === "maybe");
    const renderLane = (items) => items.map((film) => `<div class="saved-item"><button type="button" class="saved-item-title saved-item-open" data-action="open-film" data-id="${escapeHtml(film.id)}">${escapeHtml(film.title)}</button><button type="button" class="saved-remove" data-action="remove" data-id="${escapeHtml(film.id)}" aria-label="Quitar ${escapeHtml(film.title)}">×</button></div>`).join("");
    savedList.innerHTML = renderLane(wanted);
    maybeList.innerHTML = renderLane(maybes);
    document.querySelector("#want-empty").hidden = wanted.length > 0;
    document.querySelector("#maybe-empty").hidden = maybes.length > 0;
    const total = wanted.length + maybes.length;
    clearSaved.hidden = total === 0;
    document.querySelector("#want-count").textContent = String(wanted.length);
    document.querySelector("#maybe-count").textContent = String(maybes.length);
    document.querySelector("#saved-total").textContent = String(total);
    renderSectionPicker();
    renderFilms();
    renderProgram();
    updateSessionSummary();
    updateSettingsPanel();
  }
  function switchScreen(name, { scrollTop = true } = {}) {
    if (name !== "explore") { const scrim = document.querySelector("#mi-programa-sheet"); if (scrim) scrim.hidden = true; }
    activeScreen = name;
    document.querySelectorAll(".app-screen").forEach((screen) => { screen.hidden = screen.id !== `screen-${name}`; });
    document.querySelectorAll(".nav-link[data-screen]").forEach((button) => {
      const current = button.dataset.screen === name;
      if (button.classList.contains("nav-link")) button.classList.toggle("is-current", current);
      if (current) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    if (typeof updateMobileTabState === "function") updateMobileTabState();
    if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "explore") syncFilmDialog();
  }
  let backgroundScrollY = 0;
  let backgroundScrollStyles = null;
  function lockBackgroundScroll() {
    if (backgroundScrollStyles) return;
    backgroundScrollY = window.scrollY;
    const properties = ["position", "top", "left", "right", "width", "overflow"];
    backgroundScrollStyles = [document.body, document.documentElement].map((element) => ({
      element,
      styles: Object.fromEntries(properties.map((property) => [property, [element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]])),
    }));
    document.body.style.setProperty("position", "fixed");
    document.body.style.setProperty("top", `-${backgroundScrollY}px`);
    document.body.style.setProperty("left", "0");
    document.body.style.setProperty("right", "0");
    document.body.style.setProperty("width", "100%");
    document.body.style.setProperty("overflow", "hidden");
    document.documentElement.style.setProperty("overflow", "hidden");
  }
  function unlockBackgroundScroll() {
    if (!backgroundScrollStyles) return;
    for (const { element, styles } of backgroundScrollStyles) {
      for (const [property, [value, priority]] of Object.entries(styles)) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
    backgroundScrollStyles = null;
    requestAnimationFrame(() => window.scrollTo({ top: backgroundScrollY, behavior: "auto" }));
  }
  function syncFilmDialog() {
    const dialog = list.querySelector("dialog.film-expanded");
    if (!dialog || activeScreen !== "explore" || dialog.open) return;
    lockBackgroundScroll();
    dialog.showModal();
    dialog.querySelector(".film-detail-sticky .film-title")?.focus({ preventScroll: true });
  }
  function closeFilmDetails(filmId = expandedId) {
    if (!filmId) return;
    openPassesId = null;
    const wasFromSession = returnToSessionSearch;
    unlockBackgroundScroll();
    expandedId = null;
    returnToSessionSearch = false;
    filmNavigationIds = [];
    // Leer antes de repintar: renderFilms puede cerrar la ficha y volver aquí.
    const backToProgram = returnToProgram;
    returnToProgram = false;
    const backToShared = returnToShared;
    returnToShared = false;
    renderFilms();
    if (wasFromSession) {
      switchScreen("sessions", { scrollTop: false });
      requestAnimationFrame(() => window.scrollTo({ top: sessionSearchScrollY, behavior: "auto" }));
    } else if (backToProgram) {
      switchScreen("program", { scrollTop: false });
      requestAnimationFrame(() => window.scrollTo({ top: programScrollY, behavior: "auto" }));
    } else if (backToShared) {
      returnToShared = false;
      switchScreen("shared", { scrollTop: false });
      requestAnimationFrame(() => window.scrollTo({ top: sharedScrollY, behavior: "auto" }));
    } else {
      list.querySelector(`button[data-action="expand"][data-id="${CSS.escape(filmId)}"]`)?.focus({ preventScroll: true });
    }
  }
  // The "Pases" summary still works: opening it marks this film as open, and the
  // state is applied after the next re-render instead of closing silently.
  document.addEventListener("toggle", (event) => {
    const foldout = event.target.closest?.("details.film-screenings-foldout");
    if (!foldout) return;
    const row = foldout.closest(".film-row");
    if (!row) return;
    openPassesId = foldout.open ? row.dataset.filmId : null;
  }, true);

  function navigateFilm(direction) {
    openPassesId = null;
    const currentIndex = filmNavigationIds.indexOf(expandedId);
    const filmId = filmNavigationIds[currentIndex + direction];
    if (!filmId) return;
    expandedId = filmId;
    renderFilms();
  }
  // Swipe left/right inside a film card moves to the next/previous film.
  const SWIPE_MIN_X = 60;
  const SWIPE_MAX_Y = 70;
  let swipeStart = null;
  document.addEventListener("touchstart", (event) => {
    const dialog = event.target.closest("dialog.film-expanded");
    if (!dialog || event.touches.length !== 1) { swipeStart = null; return; }
    if (event.target.closest("button, a, input, select, textarea, summary")) { swipeStart = null; return; }
    const touch = event.touches[0];
    swipeStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    if (!swipeStart || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y) return;
    navigateFilm(dx < 0 ? 1 : -1);
  }, { passive: true });

  function renderDateChoices() {
    const dates = [
      ["2026-11-13", "Vie", "13"], ["2026-11-14", "Sáb", "14"], ["2026-11-15", "Dom", "15"],
      ["2026-11-16", "Lun", "16"], ["2026-11-17", "Mar", "17"], ["2026-11-18", "Mié", "18"],
      ["2026-11-19", "Jue", "19"], ["2026-11-20", "Vie", "20"], ["2026-11-21", "Sáb", "21"],
    ];
    document.querySelector("#date-options").innerHTML = `<button type="button" class="choice-chip${activeDates.size ? "" : " is-selected"}" data-date="" aria-pressed="${activeDates.size === 0}">Todos</button>` + dates.map(([value, day, number]) => `<button type="button" class="choice-chip${activeDates.has(value) ? " is-selected" : ""}" data-date="${value}" aria-pressed="${activeDates.has(value)}">${day} ${number}</button>`).join("");
  }
  function updateSessionSummary() {
    const dateText = activeDates.size
      ? [...activeDates].sort().map((date) => document.querySelector(`#date-options [data-date="${date}"]`)?.textContent).filter(Boolean).join(", ")
      : "Todos los días";
    const timeNames = [...activeTimes].map((time) => ({ morning: "mañana", afternoon: "tarde", evening: "noche" })[time]);
    const timeText = timeNames.length ? timeNames.join(" y ") : "todas las horas";
    const venueCount = activeVenues.size;
    const venueText = venueCount ? ` · ${venueCount} ${venueCount === 1 ? "sede" : "sedes"}` : " · todas las sedes";
    const includeSpecial = includeSpecialInProgram;
    const onlySaved = document.querySelector("#only-saved").checked;
    const filtered = screeningRecords.filter((screening) => {
      const hour = Number(String(screening.time || "0").split(":")[0]);
      const period = hour < 13 ? "morning" : hour < 19 ? "afternoon" : "evening";
      return (!activeDates.size || activeDates.has(screening.date))
        && (!activeTimes.size || activeTimes.has(period))
        && (!activeVenues.size || activeVenues.has(screening.venueGroup))
        && (includeSpecial || screening.accessType === "public")
        && (!onlySaved || (screening.filmIds || []).some((id) => intentions.has(id)));
    });
    const resultList = document.querySelector("#session-results-list");
    resultList.innerHTML = filtered.length ? filtered.map((screening) => {
      const names = (screening.films || []).map((film, index) => `${index ? '<span class="film-separator" aria-hidden="true">·</span>' : ""}${finderFilmEntry(film)}`).join("");
      const sections = sectionChips((screening.filmIds || []).map((id) => filmById.get(id)).filter(Boolean));
      const date = new Date(`${screening.date}T12:00:00`);
      const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(date).replace(/\.$/, "").toLocaleUpperCase("es");
      const day = new Intl.DateTimeFormat("es-ES", { day: "2-digit" }).format(date);
      const month = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date).replace(/\.$/, "").toLocaleUpperCase("es");
      const review = "";
      const access = screening.accessType !== "public" ? `<span class="screening-event-tag">${screening.accessType === "restricted" ? "PRENSA Y ACREDITADOS" : "ESCOLARES"}</span>` : "";
      // "ENCUENTRO" is not a category chip: it is a coloquio around the film.
      const labels = eventLabelsFor(screening);
      const shared = (screening.films || []).length > 1 ? `<span class="screening-program-tag">Programa · ${(screening.films || []).length} títulos</span>` : "";
      const blockTitle = screening.title && (screening.filmIds || []).length > 1 ? `<div class="finder-program-title">${escapeHtml(screening.title)}</div>` : "";

      const slotMinutes = plannedMinutes(screening);
      const durationText = slotMinutes ? `<span class="finder-duration">${slotMinutes} min</span>` : "";
      return `<li class="cinema-card finder-screening"><time class="finder-date" datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}"><span>${weekday}</span><b>${day}</b><small>${month}</small></time><div class="finder-screening-content"><div class="finder-screening-heading"><time datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}">${escapeHtml(screening.time)}</time><span>${escapeHtml(screening.venue)}${screening.room ? ` · ${escapeHtml(screening.room)}` : ""}</span>${durationText}</div>${screening.meetingMinutes ? `<p class="screening-meeting"><span class="meeting-icon" aria-hidden="true">🎙</span>Encuentro con el equipo</p>` : ""}${blockTitle}<div class="finder-film-titles${screening.filmIds.length > 1 ? " is-multi" : ""}">${names || `<span class="screening-film-unlinked">Título por identificar</span>`}</div>${sections}<div class="screening-tags">${access}${shared}${labels}${renderPassQuickActions(screening, { planOnly: true })}</div></div></li>`;
    }).join("") : `<li class="finder-no-results">No hay pases con estos filtros. Prueba con más días, franjas u otras sedes.</li>`;
    document.querySelector("#session-results-title").textContent = `${filtered.length} ${filtered.length === 1 ? "pase" : "pases"} · ${dateText} · ${timeText}${venueText}`;
  }

  function findScreening(candidateId) {
    return screeningRecords.find((screening) => screening.candidateId === candidateId);
  }
  function selectedPlanEvents() {
    const planned = [...new Set(plannedScreenings.values())].map(findScreening)
      .concat([...plannedStandalone].map(findScreening))
      .filter(Boolean);
    return [...new Set(planned)].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  }
  function selectedFilmIds(events = selectedPlanEvents()) {
    return new Set(events.flatMap((screening) => screening.filmIds || []));
  }
  function formatProgramDate(value, options = { weekday: "long", day: "numeric", month: "long" }) {
    return new Intl.DateTimeFormat("es-ES", options).format(new Date(`${value}T12:00:00`));
  }
  const VENUE_CODES = {
    "ocine": "OCINE", "yelmo": "YELMO", "teatro-jovellanos": "TJ", "escuela-comercio": "AEC",
    "laboral": "LAB", "antiguo-instituto": "CCAI", "pumarin": "SUR",
  };
  const WEEKDAY_INITIALS = { "lunes": "L", "martes": "M", "miércoles": "X", "jueves": "J", "viernes": "V", "sábado": "S", "domingo": "D" };
  function shortPassLabel(screening) {
    const date = new Date(`${screening.date}T12:00:00`);
    const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(date).toLocaleLowerCase("es");
    const day = new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(date);
    const code = VENUE_CODES[screening.venueGroup] || screening.venueGroup;
    const fullVenue = `${screening.venue}${screening.room ? ` · ${screening.room}` : ""}`;
    return `<span class="program-pass-brief" title="${escapeHtml(fullVenue)}">${WEEKDAY_INITIALS[weekday] || "?"}${day} - ${escapeHtml(screening.time)} @ ${escapeHtml(code)}</span>`;
  }
  // A coloquio ("ENCUENTRO") adds its pre-show time to the occupied slot.
  // Occupied slot: the film plus the introduction that runs before it.
  function plannedMinutes(screening) {
    const base = Number(screening.durationMinutes) || 0;
    return base ? base + (Number(screening.meetingMinutes) || 0) : 0;
  }
  function startMinute(screening) {
    const [hour, minute] = String(screening.time || "0:0").split(":").map(Number);
    return hour * 60 + minute;
  }
  function formatClock(minutes) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  function venueEnterExitMinutes(venueGroup) {
    const venue = (venueTransfers.venues || []).find((item) => item.id === venueGroup);
    return Number((venue && venue.enterExitMinutes) || 5);
  }
  // ---- Autobús (EMTUSA) ----
  // El total ya incluye caminar + espera + viaje; no se suman salida/entrada.
  function busRoute(fromGroup, toGroup) {
    return (busTransfers.routes || []).find((route) =>
      route.from.includes(fromGroup) && route.to.includes(toGroup));
  }
  function busBand(date, time) {
    const weekday = new Date(`${date}T12:00:00`).getDay(); // 0 = domingo
    const hour = Number(String(time || "0:0").split(":")[0]) || 0;
    if (hour >= 23) return "nocturno";
    if (weekday === 0 || hour >= 21) return "festivo_y_tarde_noche";
    return "diurno_laborable_sabado";
  }
  function busBestOption(route, band) {
    // Los minutos que faltan en una franja llegan como null: no valen como 0.
    const opts = (route?.options || [])
      .map((opt) => ({ opt, total: opt.minutes ? opt.minutes[band] : null }))
      .filter((item) => Number.isFinite(item.total) && item.total > 0);
    if (!opts.length) return null;
    opts.sort((a, b) => a.total - b.total);
    return { ...opts[0].opt, est_total_min: opts[0].total };
  }
  function busResolve(fromGroup, toGroup, date, time) {
    if (fromGroup === toGroup) return null;
    const route = busRoute(fromGroup, toGroup);
    if (!route) return null;
    const band = busBand(date, time);
    return { route, band, option: busBestOption(route, band) };
  }
  function busMinutes(from, to, date, time) {
    const resolved = busResolve(from.venueGroup, to.venueGroup, date, time);
    return resolved?.option ? resolved.option.est_total_min : null;
  }
  function busDetail(from, to, date, time) {
    const resolved = busResolve(from.venueGroup, to.venueGroup, date, time);
    if (!resolved?.option) return null;
    return {
      lines: resolved.option.lines,
      board_stop: resolved.option.board_stop,
      alight_stop: resolved.option.alight_stop,
      walk_notes: resolved.option.walk_notes,
      est_total_min: resolved.option.est_total_min,
      band: resolved.band,
    };
  }
  // La franja depende de cuándo sales: el fin del pase anterior.
  function busMinutesFromEnd(from, to) {
    return busMinutes(from, to, from.date, formatClock(startMinute(from) + plannedMinutes(from)));
  }
  // Frecuencias de la franja, tal como vienen en los datos; no se inventan horas.
  function busBandNote(band) {
    const data = busTransfers.timeBands?.[band];
    if (!data) return "";
    const headway = data.headway_main_lines_min ? `cada ${data.headway_main_lines_min} min` : "";
    return [data.label, headway].filter(Boolean).join(" · ");
  }
  function busTransferDetail(from, to) {
    const detail = busDetail(from, to, from.date, formatClock(startMinute(from) + plannedMinutes(from)));
    if (!detail) return "";
    const night = detail.band === "nocturno"
      ? `<p class="bus-night-note">Noche: ${escapeHtml(busBandNote(detail.band))}. ${escapeHtml(busTransferNightNote(detail.lines))}</p>`
      : "";
    return `<details class="bus-transfer-detail"><summary>${escapeHtml(detail.lines.join(" / "))} · ${detail.est_total_min} min · ${escapeHtml(detail.board_stop)} → ${escapeHtml(detail.alight_stop)}</summary><p>${escapeHtml(detail.walk_notes || "Sin nota de camino")}</p>${night}</details>`;
  }
  // Sólo se nombra lo que lleva la opción; las frecuencias ya vienen de la franja.
  function busTransferNightNote(lines) {
    const hasBuhos = (lines || []).some((line) => /^B\d/.test(line));
    const hasL34 = (lines || []).includes("L34");
    if (hasL34 && hasBuhos) return "L34 todas las noches; los Búhos, solo viernes, sábados y vísperas.";
    if (hasL34) return "L34 todas las noches.";
    if (hasBuhos) return "Los Búhos solo operan viernes, sábados y vísperas.";
    return "Comprueba la última salida de la línea.";
  }
  // Parada informativa de la sede: la de ida al centro, o la única que tenga.
  function busStopLine(venueGroup) {
    const stop = busTransfers.stops?.[venueGroup];
    const text = stop?.stops && (stop.stops.salida_hacia_centro_y_este || Object.values(stop.stops)[0]);
    if (!text) return "";
    return `<p class="bus-venue-stop">🚌 ${escapeHtml(text)}</p>`;
  }
  function transferMinutes(from, to) {
    const sameGroup = Boolean(from.venueGroup) && from.venueGroup === to.venueGroup && from.venueGroup !== "other";
    const fromName = String(from.venue || "").trim().toLocaleLowerCase("es");
    const toName = String(to.venue || "").trim().toLocaleLowerCase("es");
    const sameNamedVenue = Boolean(fromName) && fromName === toName;
    if (sameGroup || sameNamedVenue) return Number(venueTransfers.sameVenueBufferMinutes) || 5;
    const route = (venueTransfers.transfers || []).find((item) =>
      item.from === from.venueGroup && item.to === to.venueGroup);
    if (!route || route.reviewStatus !== "verified") return null;
    const exit = venueEnterExitMinutes(from.venueGroup);
    const enter = venueEnterExitMinutes(to.venueGroup);
    if (transportMode === "bus") {
      const bus = busMinutesFromEnd(from, to);
      return Number.isFinite(bus) ? bus + exit + enter : bus;
    }
    if (transportMode === "all") {
      const times = [];
      if (Number.isFinite(Number(route.walkingMinutes))) times.push(Number(route.walkingMinutes) + exit + enter);
      if (Number.isFinite(Number(route.cyclingMinutes))) times.push(Number(route.cyclingMinutes) + exit + enter);
      const bus = busMinutesFromEnd(from, to);
      if (Number.isFinite(bus) && bus > 0) times.push(bus + exit + enter);
      return times.length ? Math.min(...times) : null;
    }
    const travel = Number(transportMode === "cycling" ? route.cyclingMinutes : route.walkingMinutes);
    if (!Number.isFinite(travel) || travel < 0) return null;
    return travel + venueEnterExitMinutes(from.venueGroup) + venueEnterExitMinutes(to.venueGroup);
  }
  function compareScreenings(first, second) {
    if (first.date !== second.date) return { status: "separate" };
    let earlier = first; let later = second;
    if (startMinute(earlier) > startMinute(later)) [earlier, later] = [later, earlier];
    const earlierStart = startMinute(earlier);
    const laterStart = startMinute(later);
    // Arrive at the start time; the introduction only makes the slot longer.
    const earlierDuration = plannedMinutes(earlier);
    if (earlierStart === laterStart) return { status: "conflict", reason: "same-time" };
    if (!earlierDuration) return { status: "uncertain", reason: "duration" };
    const earlierEnd = earlierStart + earlierDuration;
    if (earlierEnd > laterStart) return { status: "conflict", reason: "overlap" };
    const transfer = transferMinutes(earlier, later);
    if (transfer === null) return { status: "uncertain", reason: "transfer" };
    if (laterStart - earlierEnd < transfer) return { status: "conflict", reason: "transfer" };
    return { status: "clear", transferMinutes: transfer };
  }
  function analyzeProgram(events) {
    const conflicts = new Map(events.map((event) => [event.candidateId, []]));
    const uncertain = new Set();
    let conflictPairs = 0;
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        const first = events[i]; const second = events[j];
        const comparison = compareScreenings(first, second);
        if (comparison.status === "conflict") {
          conflicts.get(first.candidateId).push({ screening: second, reason: comparison.reason });
          conflicts.get(second.candidateId).push({ screening: first, reason: comparison.reason });
          conflictPairs += 1;
        } else if (comparison.status === "uncertain") {
          uncertain.add(first.candidateId); uncertain.add(second.candidateId);
        }
      }
    }
    return { conflicts, uncertain, conflictPairs };
  }
  function visiblePlanChoices(filmId, selectedId = plannedScreenings.get(filmId)) {
    const showSpecial = includeSpecialInProgram;
    return screeningRecords.filter((screening) => screening.filmIds.includes(filmId)
      && (screening.accessType === "public" || showSpecial || screening.candidateId === selectedId));
  }
  // `choices` permite valorar un pase sobre una parrilla simulada sin tocar la del usuario.
  function evaluatePlanChoice(screening, filmId, events, choices = plannedScreenings) {
    const simulated = new Map(choices);
    simulated.set(filmId, screening.candidateId);
    const hypothetical = [...new Set(simulated.values())].map(findScreening).filter(Boolean);
    const analysis = analyzeProgram(hypothetical);
    return {
      conflicts: analysis.conflicts.get(screening.candidateId) || [],
      uncertain: analysis.uncertain.has(screening.candidateId),
      hasOtherEvents: hypothetical.some((item) => item.candidateId !== screening.candidateId),
    };
  }
  function fitBadge(screening, filmId, events) {
    const fit = evaluatePlanChoice(screening, filmId, events);
    if (fit.conflicts.length) return `<span class="program-fit-badge is-conflict">${fit.conflicts.some((item) => item.reason === "transfer") ? "No da tiempo al traslado" : "Choca con tu parrilla"}</span>`;
    if (fit.uncertain) return `<span class="program-fit-badge is-uncertain">Falta duración o distancia</span>`;
    return `<span class="program-fit-badge is-clear">Encaja con tu parrilla</span>`;
  }
  function renderProgramChoice(screening, film, selectedId, events, suggestion = false) {
    const selected = selectedId === screening.candidateId;
    const review = "";
    const special = screening.accessType === "public" ? "" : `<span class="program-access-tag">${screening.accessType === "restricted" ? "Prensa/acreditados" : "Escolares"}</span>`;
    const slotMinutes = plannedMinutes(screening);
    const duration = slotMinutes
      ? `<span>${slotMinutes} min</span>`
      : `<span class="program-duration-unknown">Duración pendiente</span>`;
    const shared = screening.filmIds.length > 1 ? `<span class="screening-program-tag">Programa · ${screening.filmIds.length} títulos</span>` : "";
    const labels = eventLabelsFor(screening);
    const meetingNote = screening.meetingMinutes ? `<p class="screening-meeting"><span class="meeting-icon" aria-hidden="true">🎙</span>Encuentro con el equipo</p>` : "";
    const currentOtherId = plannedScreenings.get(film.id);
    const choiceText = suggestion ? "Elegir este pase" : selected ? "Elegido" : currentOtherId ? "Cambiar pase" : screening.filmIds.length > 1 ? "Elegir programa" : "Elegir este pase";
    const action = suggestion ? "add-maybe-suggestion" : "choose-program-screening";
    return `<article class="cinema-card program-pass-option${selected ? " is-selected" : ""}">
      <div class="program-pass-topline"><time datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}">${escapeHtml(formatProgramDate(screening.date, { weekday: "short", day: "numeric", month: "short" }))} · ${escapeHtml(screening.time)}</time>${review}</div>
      <p class="program-pass-venue">${escapeHtml(screening.venue)}${screening.room ? ` <b>${escapeHtml(screening.room)}</b>` : ""}</p>
      <div class="program-pass-meta">${duration}${fitBadge(screening, film.id, events)}${shared}${special}${labels}</div>
      ${screening.meetingMinutes ? `<p class="screening-meeting"><span class="meeting-icon" aria-hidden="true">🎙</span>Encuentro con el equipo</p>` : ""}
      ${screening.filmIds.length > 1 ? `<div class="program-pass-films">${filmTitlesSeparated(screening.films, "program-pass-film")}</div>` : ""}
      <button class="program-choice-button${selected ? " is-selected" : ""}" type="button" data-program-action="${action}" data-film-id="${escapeHtml(film.id)}" data-candidate-id="${escapeHtml(screening.candidateId)}"${selected && !suggestion ? " disabled" : ""}>${selected && !suggestion ? "✓ " : ""}${choiceText}</button>
    </article>`;
  }
  // Chips shown per screening: "ENCUENTRO" is the coloquio note, the access type
  // has its own badge and "PROYECCIÓN" is the default, so they are not chips.
  const HIDDEN_EVENT_LABELS = new Set(["ENCUENTRO", "PROYECCIÓN", "PROYECCION", "ESCOLARES", "PRENSA Y ACREDITADOS", "PRENSA Y PÚBLICO"]);
  // Programme sections of a screening, taken from its films. They render as a
  // quiet caption with a coloured dot, not as another tag: the film is the star.
  const SECTION_SHORT = {
    "Sección Oficial": "Sección Oficial",
    "Sección Oficial Cortometrajes": "Cortos de Sección Oficial",
    "Generación Mutante": "Gen. Mutante",
  };
  const SECTION_TONE = {
    "Albar": "albar", "Retueyos": "retueyos", "Sección Oficial": "oficial",
    "Sección Oficial Cortometrajes": "cortos", "Esbilla": "esbilla",
    "Enfants Terribles": "enfants", "FICX Premiere": "premiere", "Crossroads": "crossroads",
    "Generación Mutante": "mutante", "Pases Especiales": "especiales",
    "La Noche del Corto Español": "noche", "Catalyst Shorts": "catalyst",
    "Asturies Curtiumetraxes": "asturies", "Focos": "focos",
    "Recuerdos del porvenir": "porvenir", "Interior/Exterior": "interior",
  };
  function sectionNames(films) {
    const names = [];
    for (const film of films || []) {
      for (const section of film.sections || []) {
        const label = section.toLowerCase();
        if (label === "otras secciones" || label === "cortometrajes") continue;
        if (!names.includes(section)) names.push(section);
      }
    }
    return names.slice(0, 3);
  }
  function sectionChips(films, className = "screening-section-line") {
    const names = sectionNames(films);
    if (!names.length) return "";
    return `<p class="${className}">${names.map((name) =>
      `<span class="section-mark tone-${SECTION_TONE[name] || "otras"}"></span>${escapeHtml(SECTION_SHORT[name] || name)}`).join('<span class="section-sep" aria-hidden="true">·</span>')}</p>`;
  }
  function eventLabelsFor(screening) {
    return (screening.eventLabels || [])
      .filter((label) => !HIDDEN_EVENT_LABELS.has(String(label).trim().toUpperCase()))
      .map((label) => `<span class="screening-event-tag">${escapeHtml(label)}</span>`)
      .join("");
  }
  // Shared markup for the compact film row, so Mi lista and Quizás never drift.
  function filmPickSummary({ film, duration, passText, detailsLine, badgeText, badgeClass, removeButton }) {
    const star = filmStar(film);
    return `<summary><span class="program-film-title"><span class="program-film-name">${star}<button type="button" class="program-film-open" data-program-action="open-picker-film" data-film-id="${escapeHtml(film.id)}">${escapeHtml(film.title)}</button></span><small>${escapeHtml(directorText(film))}${duration}<span class="program-film-passes"> · ${passText}</span></small>${detailsLine}</span><b class="program-film-fit ${badgeClass}">${escapeHtml(badgeText)}</b>${removeButton}</summary>`;
  }
  function renderWantedFilmPick(film, events) {
    const selectedId = plannedScreenings.get(film.id) || events.find((screening) => screening.filmIds.includes(film.id))?.candidateId;
    const options = visiblePlanChoices(film.id, selectedId);
    const current = selectedId ? findScreening(selectedId) : null;
    const evaluations = options.map((screening) => ({ screening, fit: evaluatePlanChoice(screening, film.id, events) }));
    const recommendation = evaluations.find((item) => !item.fit.conflicts.length && !item.fit.uncertain)
      || evaluations.find((item) => !item.fit.conflicts.length)
      || evaluations[0];
    const currentEvaluation = current ? evaluations.find((item) => item.screening.candidateId === current.candidateId) : null;
    const best = currentEvaluation || recommendation;
    const summaryState = current
      ? "Seleccionada"
      : best
        ? (best.fit.conflicts.length ? "Choca" : best.fit.uncertain ? "Datos por confirmar" : "Encaja")
        : `${options.length} ${options.length === 1 ? "pase" : "pases"}`;
    const summaryClass = current ? "is-selected" : best?.fit.conflicts.length ? "is-conflict" : best?.fit.uncertain ? "is-uncertain" : best ? "is-clear" : "";
    const detailsLine = current
      ? `<small class="program-film-details">${escapeHtml(formatProgramDate(current.date, { weekday: "short", day: "numeric", month: "short" }))} · ${escapeHtml(current.time)} · ${escapeHtml(current.venue)}</small>`
      : "";
    const passCountText = `${options.length} ${options.length === 1 ? "pase" : "pases"}`;
    // Without a chosen pass, show when the film is scheduled so the list is
    // useful at a glance (e.g. "· 2 pases (M17 - 19:30 @ LAB)").
    const briefInfo = !current && options.length ? ` (${options.map((screening) => shortPassLabel(screening)).join(" | ")})` : "";
    const filmDuration = current ? (current.durationMinutes ? ` · ${current.durationMinutes} min` : "") : (film.durationMinutes ? ` · ${film.durationMinutes} min` : "");
    const picks = options.length
      ? options.map((screening) => renderProgramChoice(screening, film, selectedId, events)).join("")
      : `<p class="program-no-options">${screeningRecords.some((screening) => screening.filmIds.includes(film.id)) ? "Solo tiene pases escolares o de prensa. Actívalos para verlos." : "No encontramos pases enlazados a esta película."}</p>`;
    const includedByShared = selectedFilmIds(events).has(film.id);
    const unselectAction = current
      ? `<button class="program-unselect-action" type="button" data-program-action="unselect-film" data-film-id="${escapeHtml(film.id)}">Quitar selección</button>`
      : "";
    const intentAction = `<button class="program-intent-remove" type="button" data-program-action="remove-intent" data-film-id="${escapeHtml(film.id)}" aria-label="Quitar ${escapeHtml(film.title)} de las listas" title="Quitar de Mis listas">✕</button>`;
    return `<details class="program-film-pick${current || includedByShared ? " has-choice" : ""}">${filmPickSummary({ film, duration: filmDuration, passText: `${passCountText}${briefInfo}`, detailsLine, badgeText: summaryState, badgeClass: summaryClass, removeButton: intentAction })}<div class="program-film-options">${unselectAction}${picks}</div></details>`;
  }
  // Cada título del pase abre la ficha de su película, como en Buscar pases.
  function eventTitles(screening) {
    const filmsInPass = screening.films || [];
    if (!filmsInPass.length) return "";
    return filmsInPass.map((film, index) =>
      `${index ? '<span class="film-separator" aria-hidden="true">·</span>' : ""}${filmStar(film)}${film.id && filmById.has(film.id)
        ? `<button type="button" class="program-event-film" data-open-film="${escapeHtml(film.id)}">${escapeHtml(film.title)}</button>`
        : `<span class="program-event-film">${escapeHtml(film.title)}</span>`}`
    ).join("");
  }
  function renderProgramEvent(screening, conflicts, uncertain, chosenId) {
    const conflictList = conflicts.get(screening.candidateId) || [];
    const titles = filmTitlesSeparated(screening.films, "program-event-film")
      // A single-title pass has no title span here, so the star needs its own prefix.
      || `${filmStar((screening.films || [])[0])}<span class="program-event-film">${escapeHtml(screening.title || "")}</span>`;
    const blockTitle = screening.title && (screening.filmIds || []).length > 1 ? `<div class="screening-program-title">${escapeHtml(screening.title)}</div>` : "";
    const duration = plannedMinutes(screening);
    const endClock = duration ? formatClock(Math.ceil((startMinute(screening) + duration) / 5) * 5) : "";
    const endMeta = endClock ? `<span class="program-event-end">hasta ${endClock} · ${duration} min</span>` : "";
    const flags = [
      // reviewState is kept in the data but no longer shown as a warning.
      conflictList.length ? `<span class="program-conflict-tag">${conflictList.some((item) => item.reason === "transfer") ? "No da tiempo al traslado" : "Solapa con " + conflictList.map((item) => escapeHtml(item.screening.time)).join(", ")}</span>` : "",
      uncertain.has(screening.candidateId) || !screening.durationMinutes ? `<span class="program-duration-unknown">Duración por confirmar</span>` : "",
      screening.accessType !== "public" ? `<span class="program-access-tag">${screening.accessType === "restricted" ? "Prensa/acreditados" : "Escolares"}</span>` : "",
    ].filter(Boolean).join("");
    return `<article class="cinema-card program-event${conflictList.length ? " has-conflict" : ""}${screening.candidateId === chosenId ? " is-demo-chosen" : ""}"><time class="program-event-time" datetime="${escapeHtml(screening.date)}T${escapeHtml(screening.time)}">${escapeHtml(screening.time)}</time><div class="program-event-body"><div class="program-event-venue">${escapeHtml(screening.venue)}${screening.room ? ` · ${escapeHtml(screening.room)}` : ""}${endMeta}</div>${blockTitle}<div class="program-event-films">${demoChosenTag(screening, chosenId)}${eventTitles(screening)}</div>${sectionChips((screening.filmIds || []).map((id) => filmById.get(id)).filter(Boolean), "screening-section-line program-section-line")}<div class="program-event-flags">${flags}</div></div><button class="program-calendar-event" type="button" data-program-action="calendar-event" data-candidate-id="${escapeHtml(screening.candidateId)}" aria-haspopup="menu" aria-expanded="false" aria-label="Añadir ${escapeHtml((screening.films || []).map((film) => film.title).join(", ") || screening.title || "este pase")} al calendario" title="Añadir al calendario"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg></button><button class="program-share-event" type="button" data-program-action="share-screening" data-candidate-id="${escapeHtml(screening.candidateId)}" aria-label="Compartir este pase" title="Compartir este pase"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.6 6.8-4M8.6 13.4l6.8 4"/></svg></button><button class="program-remove-event" type="button" data-program-action="remove-program-screening" data-candidate-id="${escapeHtml(screening.candidateId)}" aria-label="Quitar pase de ${escapeHtml((screening.films || []).map((film) => film.title).join(", "))}" title="Quitar pase"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></article>`;
  }
  // Etiqueta del pase elegido en la demo del asistente (ver renderWizardTransfers). En la
  // parrilla real nunca hay pase elegido y no pinta nada.
  function demoChosenTag(screening, chosenId) {
    return chosenId && screening.candidateId === chosenId ? `<span class="program-demo-tag">elegido</span>` : "";
  }
  function transferNote(from, to, gap, chosenId) {
    const sameGroup = Boolean(from.venueGroup) && from.venueGroup === to.venueGroup && from.venueGroup !== "other";
    const sameNamed = String(from.venue || "").trim().toLocaleLowerCase("es") === String(to.venue || "").trim().toLocaleLowerCase("es");
    if (sameGroup || sameNamed) {
      return `<div class="program-transfer${from.candidateId === chosenId ? " is-demo-chosen" : ""}">Misma sede · ${Number(venueTransfers.sameVenueBufferMinutes) || 5} min</div>`;
    }
    const route = (venueTransfers.transfers || []).find((item) => item.from === from.venueGroup && item.to === to.venueGroup);
    if (!route || route.reviewStatus !== "verified") {
      return `<div class="program-transfer is-uncertain">Traslado por confirmar</div>`;
    }
    const exit = venueEnterExitMinutes(from.venueGroup);
    const enter = venueEnterExitMinutes(to.venueGroup);
    const departure = startMinute(from) + plannedMinutes(from);
    const busTravel = busMinutesFromEnd(from, to);
    function etaLabel(total) {
      return `ETA ~${formatClock(departure + total)}h`;
    }
    function modeLine(icon, label, travel, addExitEnter) {
      if (travel == null || travel === "") {
        return `<span class="program-transfer-line is-missing">${icon} sin datos</span>`;
      }
      const value = Number(travel);
      if (!Number.isFinite(value) || value < 0) {
        return `<span class="program-transfer-line is-missing">${icon} sin datos</span>`;
      }
      const total = value + (addExitEnter ? exit + enter : 0);
      const danger = gap != null && total > gap ? `<span class="transfer-danger" title="Va justo">⚠</span>` : "";
      const breakdown = addExitEnter ? `salir ${exit} + ${value} ${label} + entrar ${enter}` : `${value} min`;
      return `<span class="program-transfer-line">${icon} ${total} min${danger}<small>${breakdown}</small><small class="transfer-eta">(${etaLabel(total)})</small></span>`;
    }
    const walk = modeLine("🚶", "a pie", route.walkingMinutes, true);
    const bike = modeLine("🚴", "en bici", route.cyclingMinutes, true);
    // El bus también entra y sale de los edificios: sin sumarlo salía siempre el más rápido.
    const bus = modeLine("🚌", "en bus", busTravel, true);
    // Sin bus no hay «sin datos»: en bus.json faltan adrede los tramos dentro del centro y
    // OCINE↔centro. Si a pie sí hay medida, se dice, que es lo que se hace de verdad.
    const walkValue = Number(route.walkingMinutes);
    const noBus = busTravel == null && Number.isFinite(walkValue) && walkValue >= 0
      ? `🚌 Sin bus entre estas sedes · a ${walkValue} min a pie`
      : "";
    let content;
    let classes = "program-transfer";
    if (transportMode === "walking") {
      content = walk;
    } else if (transportMode === "cycling") {
      content = bike;
    } else if (transportMode === "bus") {
      content = noBus
        ? `<span class="program-transfer-line is-no-bus">${noBus}</span>`
        : bus + (busTravel != null ? busTransferDetail(from, to) : "");
      // Un tramo sin bus a esa hora es un dato, no una incógnita.
      if (busTravel == null) classes += noBus ? " is-no-bus" : " is-uncertain";
    } else {
      content = [walk, bike, noBus ? `<span class="program-transfer-line is-no-bus">${noBus}</span>` : bus].join("");
      const detail = busTravel != null ? busTransferDetail(from, to) : "";
      if (detail) content += detail;
      classes += " is-multi";
    }
    return `<div class="${classes}${from.candidateId === chosenId ? " is-demo-chosen" : ""}">${content}</div>`;
  }
  function renderDayEvents(dayEvents, conflicts, uncertain, chosenId) {
    return dayEvents.map((screening, index) => {
      const event = renderProgramEvent(screening, conflicts, uncertain, chosenId);
      if (index === dayEvents.length - 1) return event;
      const next = dayEvents[index + 1];
      const currentEnd = startMinute(screening) + (Number(screening.durationMinutes) || 0);
      const gap = startMinute(next) - currentEnd;
      if (gap > 240) return event;
      return event + transferNote(screening, next, gap, chosenId);
    }).join("");
  }
  function renderMaybeSuggestion(film, events) {
    const maybeRemove = `<button class="program-intent-remove" type="button" data-program-action="remove-intent" data-film-id="${escapeHtml(film.id)}" aria-label="Quitar ${escapeHtml(film.title)} de las listas" title="Quitar de Mis listas">✕</button>`;
    // A "quizás" with a chosen pass stays listed but folds into its compact row,
    // exactly like a film in Mi lista.
    const plannedId = plannedScreenings.get(film.id);
    const planned = plannedId ? findScreening(plannedId) : null;
    if (planned) {
      const duration = planned.durationMinutes ? ` · ${planned.durationMinutes} min` : "";
      const detailsLine = `<small class="program-film-details">${escapeHtml(formatProgramDate(planned.date, { weekday: "short", day: "numeric", month: "short" }))} · ${escapeHtml(planned.time)} · ${escapeHtml(planned.venue)}</small>`;
      const options = screeningRecords.filter((screening) => screening.filmIds.includes(film.id) && (screening.accessType === "public" || includeSpecialInProgram));
      const picks = options.map((screening) => renderProgramChoice(screening, film, plannedId, events)).join("");
      return `<details class="program-film-pick program-maybe-pick has-choice">${filmPickSummary({ film, duration, passText: `${options.length} ${options.length === 1 ? "pase" : "pases"}`, detailsLine, badgeText: "Seleccionada", badgeClass: "is-selected", removeButton: maybeRemove })}<div class="program-film-options"><button class="program-unselect-action" type="button" data-program-action="unselect-film" data-film-id="${escapeHtml(film.id)}">Quitar selección</button>${picks}</div></details>`;
    }
    const options = screeningRecords.filter((screening) => screening.filmIds.includes(film.id)
      && (screening.accessType === "public" || includeSpecialInProgram));
    const foldSuggestion = (content, badgeText, badgeClass = "", detailsLine = "") =>
      `<details class="program-film-pick program-maybe-pick">${filmPickSummary({
        film, duration: film.durationMinutes ? ` · ${film.durationMinutes} min` : "",
        passText: `${options.length} ${options.length === 1 ? "pase" : "pases"}`,
        detailsLine, badgeText, badgeClass, removeButton: maybeRemove,
      })}<div class="program-film-options">${content}</div></details>`;
    const evaluated = options.map((screening) => ({ screening, fit: evaluatePlanChoice(screening, film.id, events) }))
      .map((item) => ({ ...item, conflicts: item.fit.conflicts, uncertain: item.fit.uncertain }));
    const recommendation = evaluated.filter((item) => !item.conflicts.length)
      .sort((a, b) => Number(a.uncertain) - Number(b.uncertain) || `${a.screening.date}T${a.screening.time}`.localeCompare(`${b.screening.date}T${b.screening.time}`))[0];
    if (!recommendation) {
      const hasAny = options.length > 0;
      const hasSpecial = screeningRecords.some((screening) => screening.filmIds.includes(film.id) && screening.accessType !== "public");
      const message = hasAny ? "Sus pases chocan con la parrilla actual." : hasSpecial && !includeSpecialInProgram ? "Solo se proyecta en pases escolares o de prensa." : "Aún no hay pases enlazados a esta película.";
      if (!hasAny) {
        const enableSpecial = `<button type="button" class="program-empty-action" data-program-action="enable-special">Mostrar esos pases</button>`;
        return foldSuggestion(`<p class="program-empty-note">${message}</p>${hasSpecial && !includeSpecialInProgram ? enableSpecial : ""}`, "Sin pases disponibles");
      }
      const blocked = [...evaluated].sort((a, b) => a.conflicts.length - b.conflicts.length || `${a.screening.date}T${a.screening.time}`.localeCompare(`${b.screening.date}T${b.screening.time}`))[0];
      const conflicts = [...new Map(blocked.conflicts.map((item) => [`${item.screening.candidateId}:${item.reason}`, item])).values()];
      const blockers = conflicts.map(({ screening, reason }) => {
        const titles = (screening.films || []).map((item) => item.title).join(", ") || "Otro pase";
        const explanation = reason === "transfer" ? "No da tiempo al traslado con" : "Se solapa con";
        return `<li><b>${explanation}</b> ${escapeHtml(titles)} · ${escapeHtml(screening.time)} · ${escapeHtml(screening.venue)}${screening.room ? `, ${escapeHtml(screening.room)}` : ""}</li>`;
      }).join("");
      return foldSuggestion(`<p class="program-conflict-intro">${message} La alternativa más cercana es ${escapeHtml(formatProgramDate(blocked.screening.date, { weekday: "short", day: "numeric", month: "short" }))} a las ${escapeHtml(blocked.screening.time)}:</p><ul class="program-conflict-list">${blockers}</ul>`, "Sin pase que encaje", "is-conflict");
    }
    const uncertainNote = recommendation.uncertain ? `<p class="program-suggestion-caveat">Posible hueco: falta duración o distancia para confirmar el encaje.</p>` : "";
    return foldSuggestion(`${renderProgramChoice(recommendation.screening, film, "", events, true)}${uncertainNote}`, recommendation.uncertain ? "Posible hueco" : "Encaja", recommendation.uncertain ? "is-uncertain" : "is-clear");
  }
  function renderProgram() {
    const allEvents = selectedPlanEvents();
    const coverage = selectedFilmIds(allEvents);
    const wanted = films.filter((film) => intentions.get(film.id) === "want");
    const unplannedWanted = wanted.filter((film) => !coverage.has(film.id));
    const maybes = films.filter((film) => intentions.get(film.id) === "maybe");
    const { conflicts, uncertain, conflictPairs } = analyzeProgram(allEvents);
    const visibleEvents = activeProgramDate ? allEvents.filter((item) => item.date === activeProgramDate) : allEvents;
    const dateOptions = [...new Set(allEvents.map((item) => item.date))].sort();
    if (activeProgramDate && !dateOptions.includes(activeProgramDate)) activeProgramDate = "";
    document.querySelector("#program-day-options").innerHTML = dateOptions.length > 1 || activeProgramDate
      ? `<button type="button" class="program-day-chip${activeProgramDate ? "" : " is-selected"}" data-program-date="">Todos los días</button>${dateOptions.map((date) => `<button type="button" class="program-day-chip${activeProgramDate === date ? " is-selected" : ""}" data-program-date="${date}">${escapeHtml(formatProgramDate(date, { weekday: "short", day: "numeric" }))}</button>`).join("")}`
      : "";
    document.querySelector("#program-pass-count").textContent = String(allEvents.length);
    document.querySelector("#program-conflict-count").textContent = String(conflictPairs);
    document.querySelector("#program-conflict-label").textContent = conflictPairs === 1 ? "conflicto" : "conflictos";
    document.querySelector("#program-unplanned-count").textContent = String(unplannedWanted.length);
    document.querySelector("#wanted-unplanned-count").textContent = String(unplannedWanted.length);
    const picksPanel = document.querySelector(".program-picks-panel");
    const picksFold = document.querySelector("#program-picks-fold");
    const hasWantedPending = unplannedWanted.length > 0;
    const maybesPending = maybes.filter((film) => !coverage.has(film.id)).length;
    const hasPending = hasWantedPending || maybesPending > 0;
    picksPanel.classList.toggle("has-pending", hasPending);
    picksPanel.classList.toggle("only-quizas", hasPending && !hasWantedPending);
    picksPanel.classList.toggle("all-fitted", !hasPending);
    // Desktop keeps the column expanded; only the phone view folds it.
    const compactPicks = window.matchMedia("(max-width: 650px)").matches;
    const foldState = compactPicks ? (hasWantedPending ? "pending" : "complete") : "desktop";
    // Solo al cambiar de situación: los repintados conservan el plegado manual.
    if (picksFold.dataset.autoState !== foldState) {
      picksFold.open = !compactPicks || hasWantedPending;
      picksFold.dataset.autoState = foldState;
    }
    updateMobileTabState();
    // The summary counts what is still open: films without a pass and quizás
    // films that still need a decision. It shrinks as passes are chosen.
    const openParts = [];
    if (unplannedWanted.length) openParts.push(`${unplannedWanted.length} por encajar`);
    if (maybesPending) openParts.push(`${maybesPending} quizás por decidir`);
    document.querySelector("#picks-fold-note").textContent = openParts.length
      ? openParts.join(" · ")
      : `${allEvents.length} ${allEvents.length === 1 ? "pase" : "pases"} · todo encajado`;
    document.querySelector("#nav-plan-count").textContent = String(allEvents.length);
    document.querySelector("#clear-planned-screenings").hidden = allEvents.length === 0;
    const grouped = new Map();
    visibleEvents.forEach((screening) => {
      if (!grouped.has(screening.date)) grouped.set(screening.date, []);
      grouped.get(screening.date).push(screening);
    });
    document.querySelector("#program-agenda").innerHTML = grouped.size      ? [...grouped].map(([date, dayEvents]) => `<section class="program-day"><header><h3>${escapeHtml(formatProgramDate(date))}</h3><span>${dayEvents.length} ${dayEvents.length === 1 ? "pase" : "pases"}</span></header><div class="program-day-events">${renderDayEvents(dayEvents, conflicts, uncertain)}</div></section>`).join("")
      : allEvents.length
        ? `<div class="cinema-card program-empty"><h3>No hay pases ese día</h3><p>Prueba otro día para ver tu selección.</p></div>`
        : `<div class="cinema-card program-empty"><h3>Tu parrilla empieza con un pase</h3><p>Elige sesiones de las películas que has añadido. Si todavía no has guardado ninguna, vuelve a explorar.</p><button type="button" data-program-action="explore-films">Explorar películas</button></div>`;
    document.querySelector("#program-wanted-list").innerHTML = wanted.length
      ? [...wanted].sort((a, b) => (coverage.has(a.id) ? 1 : 0) - (coverage.has(b.id) ? 1 : 0)).map((film) => renderWantedFilmPick(film, allEvents)).join("")
      : `<p class="program-picks-empty">Añade películas a Mi lista desde Explorar y aparecerán aquí para encajarlas.</p>`;
    document.querySelector("#program-maybe-list").innerHTML = maybes.length
      ? maybes.map((film) => renderMaybeSuggestion(film, allEvents)).join("")
      : `<p class="program-picks-empty">No tienes más películas en “Quizás”.</p>`;
    updateCalendarNote();
  }

  // Shared-program screenings list their films with a visible separator.
  function filmTitlesSeparated(films, className) {
    return (films || []).map((film, index) =>
      `${index ? '<span class="film-separator" aria-hidden="true">·</span>' : ""}${filmStar(film)}<span class="${className}">${escapeHtml(film.title)}</span>`
    ).join("");
  }
  // Single-film passes carry no separated title list, so the star needs its own prefix.
  // In the catalogue it is the control that turns priority on and off; elsewhere it is a mark.
  function filmStar(film, { action = false } = {}) {
    const on = prioritized.has(film.id);
    if (!action) return on ? `<span class="film-star" aria-hidden="true">★</span>` : "";
    const hasIntent = intentions.has(film.id) && !discarded.has(film.id);
    // No intent, no priority: the star only appears once the film is in a list.
    if (!on && !hasIntent) return "";
    return starButtonMarkup(film, on);
  }
  function starButtonMarkup(film, on) {
    return `<button class="film-star-button${on ? " is-on" : ""}" type="button" data-action="prioritize" data-id="${escapeHtml(film.id)}" aria-pressed="${on}" aria-label="${on ? `Quitar la prioridad a ${escapeHtml(film.title)}` : `Priorizar ${escapeHtml(film.title)} en caso de conflicto`}" title="${on ? "Quitar la prioridad" : "Priorizar en caso de conflicto"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>`;
  }
  function renderPassQuickActions(screening, { planOnly = false } = {}) {
    const ids = Array.isArray(screening.filmIds) ? screening.filmIds : [];
    // A discarded film gets no action buttons: discarding is the final decision.
    const liveIds = ids.filter((id) => !discarded.has(id));
    if (ids.length && !liveIds.length) return "";
    // Talks and activities without a linked film can still be added to the agenda
    // by their candidate id alone.
    const planned = ids.length
      ? ids.every((id) => plannedScreenings.get(id) === screening.candidateId)
      : plannedStandalone.has(screening.candidateId);
    const label = planned ? "✓ En la parrilla" : "＋ A la parrilla";
    const planButton = `<button type="button" class="pass-quick is-plan${planned ? " is-done" : ""}" data-quick-action="plan" data-ids="${escapeHtml(liveIds.join(","))}" data-candidate="${escapeHtml(screening.candidateId)}" aria-pressed="${planned}">${label}</button>`;
    if (!ids.length) return `<span class="pass-quick-actions">${planButton}</span>`;
    if (planOnly) return `<span class="pass-quick-actions">${planButton}</span>`;
    // Un pase compartido ofrece las dos intenciones para cada película, una por fila.
    const intentRow = (filmId) => {
      const intent = intentions.get(filmId);
      const title = filmById.get(filmId)?.title || "";
      return `<span class="pass-quick-row"><span class="pass-quick-film">${escapeHtml(title)}</span><button type="button" class="pass-quick pass-quick-want${intent === "want" ? " is-done" : ""}" data-quick-action="want" data-ids="${escapeHtml(filmId)}" aria-pressed="${intent === "want"}" aria-label="Añadir ${escapeHtml(title)} a mi lista"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m7.5 12.2 3 3 6-6.2"/></svg>Mi lista</button><button type="button" class="pass-quick pass-quick-maybe${intent === "maybe" ? " is-done" : ""}" data-quick-action="maybe" data-ids="${escapeHtml(filmId)}" aria-pressed="${intent === "maybe"}" aria-label="Marcar ${escapeHtml(title)} como quizás"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.3L21 12l-6.5 2.7L12 21l-2.5-6.3L3 12l6.5-2.7L12 3Z"/></svg>Quizás</button></span>`;
    };
    if (liveIds.length > 1) return `<span class="pass-quick-actions">${planButton}${liveIds.map(intentRow).join("")}</span>`;
    return `<span class="pass-quick-actions">${planButton}${intentRow(ids[0])}</span>`;
  }
  function handleQuickAction(button) {
    const { quickAction, ids: idList, candidate } = button.dataset;
    // Never re-add a discarded film: drop it and bail out if nothing live remains.
    const ids = (idList || "").split(",").filter((id) => id && !discarded.has(id));
    if (quickAction === "plan" && !ids.length) {
      if (!candidate || !findScreening(candidate)) return true;
      if (plannedStandalone.has(candidate)) plannedStandalone.delete(candidate);
      else plannedStandalone.add(candidate);
      persistStandalone(); renderSaved();
      return true;
    }
    if (!ids.length) return false;
    if (quickAction === "plan") {
      if (!candidate || !findScreening(candidate)) return true;
      const alreadyPlanned = ids.every((id) => plannedScreenings.get(id) === candidate);
      for (const id of ids) {
        if (alreadyPlanned) plannedScreenings.delete(id);
        else {
          plannedScreenings.set(id, candidate);
          // Choosing a pass is a decision: keep it in "Mi lista" unless it was a "quizás".
          if (!intentions.has(id)) intentions.set(id, "want");
        }
      }
      persist(); persistPlannedScreenings();
      renderSaved();
      refreshSharedScreen();
      return true;
    } else if (quickAction === "want" || quickAction === "maybe") {
      const id = ids[0];
      if (intentions.get(id) === quickAction) { intentions.delete(id); prioritized.delete(id); }
      else intentions.set(id, quickAction);
      persist(); persistPrioritized();
    } else {
      return false;
    }
    renderSaved();
    return true;
  }
  // Priorizar solo tiene sentido con intención y nunca sobre una descartada.
  function handlePrioritize(id) {
    if (discarded.has(id) || !intentions.has(id)) return;
    if (prioritized.has(id)) prioritized.delete(id);
    else prioritized.add(id);
    persistPrioritized();
    renderSaved();
  }
  // Descartar es inmediato y reversible: el toque descarta y deja un acuse en el sitio del
  // contenido (la cenefa no se toca) con «Deshacer» durante 3 s. La instantánea guarda la
  // intención, el pase y la prioridad para devolverlos tal cual.
  const discardAckMs = 3000;
  let discardAck = null;
  let discardAckTimer = null;
  // Con `restoreFocus` el foco vuelve al botón de origen.
  function closeDiscardAck({ restoreFocus = false, restoring = false } = {}) {
    clearTimeout(discardAckTimer);
    const { overlay, button, inerted, slot, card, host } = discardAck || {};
    // The ack may already be detached (the dialog moved on): the node is still the one to fade.
    const leaving = overlay || host?.querySelector(".discard-ack");
    discardAck = null;
    inerted?.forEach((element) => { element.inert = false; });
    slot?.remove();
    card?.style.removeProperty("min-height");
    card?.classList.remove("has-discard-ack");
    host?.classList.remove("has-discard-ack");
    // Al cerrar, la tarjeta descartada ya no se retiene: el listado se rehace sin ella.
    if (!leaving || !restoring) renderFilms();
    if (!leaving) return;
    leaving.classList.add("is-leaving");
    setTimeout(() => leaving.remove(), 150);
    if (restoreFocus && button?.isConnected) button.focus({ preventScroll: true });
  }
  // No se inserta aquí: el repintado del descarte rehace la tarjeta entera y se lo llevaría.
  function openDiscardAck(film, snapshot, button, fromDialog = false) {
    closeDiscardAck();
    const overlay = document.createElement("div");
    // Los id son únicos por instancia: un acuse abierto no debe robar el aria de otro bloque.
    const uid = `discard-ack-${Date.now()}`;
    overlay.className = "discard-confirm discard-ack";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-labelledby", `${uid}-title`);
    overlay.setAttribute("aria-describedby", `${uid}-note`);
    // Título en dos tonos: el nombre de la película en tinta y «descartada» en turquesa.
    overlay.innerHTML = `<p class="discard-confirm-title" id="${uid}-title">«${escapeHtml(film.title)}»<span> descartada</span></p>
      <p class="discard-confirm-note" id="${uid}-note">Puedes recuperarla cuando quieras en «Descartadas».</p>
      <div class="discard-confirm-actions"><button type="button" class="intent-button discard-ack-undo"><b>Deshacer</b></button></div>`;
    const undo = overlay.querySelector(".discard-ack-undo");
    undo.addEventListener("click", undoDiscard);
    // `inert` deja fuera el contenido sustituido; con un solo botón, el Tab da la vuelta sobre él.
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      undo.focus();
    });
    discardAck = { overlay, undo, inerted: [], film, snapshot, button, fromDialog };
  }
  // El acuse se pinta donde se descartó: en la barra de la ficha (que ya saltó a la siguiente) o
  // en la tarjeta del listado, que se repinta y sigue en su sitio mientras dura el acuse.
  function discardAckHosts() {
    const bar = discardAck.fromDialog ? list.querySelector("dialog.film-expanded .film-expanded-actions") : null;
    const id = String(discardAck.film.id);
    const row = [...list.querySelectorAll(".film-row")]
      .find((item) => item.getAttribute("data-film-id") === id) || null;
    const body = row?.querySelector(".film-body") || null;
    return { row, body, bar, hosts: [bar, body].filter(Boolean) };
  }
  // En la tarjeta, el acuse entra en un contenedor propio (`.discard-ack-slot`): el repintado
  // rehace la tarjeta entera y se lo llevaría. En la ficha es una banda fija: va directo.
  function placeDiscardAck(host) {
    const state = discardAck;
    if (host.classList.contains("film-expanded-actions")) {
      host.appendChild(state.overlay);
      state.slot = null;
      state.host = host;
      return;
    }
    const slot = document.createElement("div");
    slot.className = "discard-ack-slot";
    slot.setAttribute("role", "presentation");
    // Congela el alto de la tarjeta entera: nada se mueve mientras dura el acuse.
    const card = host.closest(".film-row");
    const height = (card || host).getBoundingClientRect().height;
    if (height) card?.style.setProperty("min-height", `${Math.round(height)}px`);
    host.appendChild(slot);
    slot.replaceChildren(state.overlay);
    host.classList.add("has-discard-ack");
    state.slot = slot;
    state.host = host;
    state.card = host;
    [host.querySelector(".film-copy"), host.querySelector(".film-actions")].filter(Boolean)
      .forEach((element) => { element.inert = true; state.inerted.push(element); });
  }
  function attachDiscardAck(state = discardAck) {
    if (!state || state.overlay.isConnected) return;
    const { hosts } = discardAckHosts();
    if (!hosts[0]) return;
    placeDiscardAck(hosts[0]);
    state.undo.focus({ preventScroll: true });
  }
  // Mientras el acuse siga abierto, el repintado rehace su tarjeta: se recoloca al final.
  function keepDiscardAck() {
    const { body } = discardAckHosts();
    if (!body) return;
    if (discardAck.host !== body) placeDiscardAck(body);
    else if (!body.contains(discardAck.overlay)) body.querySelector(".discard-ack-slot")?.appendChild(discardAck.overlay);
    discardAck.undo.focus({ preventScroll: true });
  }
  // Escape, tocar fuera o los 3 s cierran el acuse: la película se queda descartada.
  function undoDiscard() {
    const { film, snapshot } = discardAck || {};
    if (!film) return;
    closeDiscardAck({ restoreFocus: true, restoring: true });
    discarded.delete(film.id);
    if (snapshot.intent) intentions.set(film.id, snapshot.intent);
    if (snapshot.planned) plannedScreenings.set(film.id, snapshot.planned);
    if (snapshot.prioritized) prioritized.add(film.id);
    persistDiscarded(); persist(); persistPlannedScreenings(); persistPrioritized();
    countVisibleFilms();
    renderSaved();
    refreshSharedScreen();
  }
  function handleDiscard(id, sourceButton = null) {
    if (discarded.has(id)) {
      discarded.delete(id);
      persistDiscarded();
      countVisibleFilms();
      renderSaved();
      return;
    }
    const film = films.find((item) => item.id === id);
    if (!film || !sourceButton) return;

    const snapshot = { intent: intentions.get(id) || "", planned: plannedScreenings.get(id) || "", prioritized: prioritized.has(id) };
    discarded.add(id);
    intentions.delete(id);
    plannedScreenings.delete(id);
    prioritized.delete(id);
    persistDiscarded(); persistPrioritized(); persist(); persistPlannedScreenings();
    countVisibleFilms();
    // Secuencia: repintar todo (el repintado rehace la tarjeta), colocar el acuse en la tarjeta
    // nueva y arrancar su temporizador.
    // Desde la ficha, descartar no cierra: sigue con la siguiente del mismo recorrido.
    const fromDialog = !!sourceButton.closest("dialog.film-expanded");
    if (expandedId === id) {
      const index = filmNavigationIds.indexOf(id);
      const next = filmNavigationIds.slice(index + 1).find((filmId) => !discarded.has(filmId));
      expandedId = next || null;
      if (!next) closeFilmDetails();
    }
    openDiscardAck(film, snapshot, sourceButton, fromDialog);
    // La instantánea del hueco se toma antes del repintado: después la ficha ya saltó a otra.
    const site = discardAck;
    renderSaved();
    attachDiscardAck(site);
    refreshSharedScreen();
    clearTimeout(discardAckTimer);
    discardAckTimer = setTimeout(closeDiscardAck, discardAckMs);
  }
  // Tocar fuera del acuse de descarte lo cierra sin deshacer.
  document.addEventListener("click", (event) => {
    if (discardAck && !discardAck.overlay.contains(event.target)) closeDiscardAck();
  }, true);
  list.addEventListener("click", (event) => {
    const quick = event.target.closest("button[data-quick-action]");
    if (quick && handleQuickAction(quick)) { event.stopPropagation(); return; }
  }, true);
  // En la parrilla, el título del pase abre la ficha; al cerrar se vuelve a la parrilla.
  document.querySelector("#program-agenda").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-open-film]");
    if (!button) return;
    const film = films.find((item) => item.id === button.dataset.openFilm);
    if (!film) return;
    programScrollY = window.scrollY;
    returnToProgram = true;
    // Una apertura desde la parrilla anula el "volver a la búsqueda" de la anterior.
    returnToSessionSearch = false;
    activeSection = "";
    search.value = "";
    moreSections.value = "";
    // Las flechas recorren las películas de la parrilla, en el orden en que se ven.
    filmNavigationIds = [...new Set(selectedPlanEvents().flatMap((screening) => screening.filmIds || []))];
    expandedId = film.id;
    renderSectionPicker();
    renderFilms();
    switchScreen("explore", { scrollTop: false });
  });

  document.querySelector("#session-results-list").addEventListener("click", (event) => {
    const quick = event.target.closest("button[data-quick-action]");
    if (quick && handleQuickAction(quick)) { event.stopPropagation(); return; }
  }, true);

  document.querySelector("#featured-sections").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-section]");
    if (!button) return;
    activeSection = activeSection === button.dataset.section ? "" : button.dataset.section;
    moreSections.value = "";
    renderSectionPicker();
    renderFilms();
    document.querySelector("#browse-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#toggle-pin-config").addEventListener("click", (event) => {
    const panel = document.querySelector("#pin-config");
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.querySelector("#pin-options").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-pin-section]");
    if (!input) return;
    if (input.checked) {
      if (pinnedSections.length >= maxPinnedSections) { input.checked = false; return; }
      pinnedSections.push(input.dataset.pinSection);
    } else {
      pinnedSections = pinnedSections.filter((name) => name !== input.dataset.pinSection);
    }
    persistPinnedSections();
    renderSectionPicker();
    renderFilms();
  });
  document.querySelector("#settings-pins").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-settings-pin]");
    if (!input) return;
    if (input.checked) {
      if (pinnedSections.length >= maxPinnedSections) { input.checked = false; return; }
      pinnedSections.push(input.dataset.settingsPin);
    } else {
      pinnedSections = pinnedSections.filter((name) => name !== input.dataset.settingsPin);
    }
    persistPinnedSections();
    renderSectionPicker();
    renderFilms();
  });
  moreSections.addEventListener("change", () => {
    activeSection = moreSections.value;
    renderSectionPicker();
    renderFilms();
  });
  sectionSubfilters.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-subfilter]");
    if (!input) return;
    const excluded = excludedSubfiltersBySection.get(activeSection) || new Set();
    if (input.checked) excluded.delete(input.dataset.subfilter); else excluded.add(input.dataset.subfilter);
    excludedSubfiltersBySection.set(activeSection, excluded);
    renderFilms();
  });
  list.addEventListener("click", (event) => {
    const dialog = event.target.closest("dialog.film-expanded");
    if (dialog && event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      const clickedBackdrop = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (clickedBackdrop) { closeFilmDetails(); return; }
    }
    const button = event.target.closest("button[data-action]");
    if (button?.dataset.action === "film-previous" || button?.dataset.action === "film-next") {
      navigateFilm(button.dataset.action === "film-previous" ? -1 : 1);
      return;
    }
    if (button?.dataset.action === "intent") {
      const { id, status } = button.dataset;
      const wasSet = intentions.get(id) === status;
      if (wasSet) intentions.delete(id); else intentions.set(id, status);
      if (!intentions.has(id)) prioritized.delete(id);
      persist(); persistPrioritized(); renderSaved(); return;
    }
    if (button?.dataset.action === "discard") {
      handleDiscard(button.dataset.id, button);
      return;
    }
    if (button?.dataset.action === "prioritize") {
      handlePrioritize(button.dataset.id);
      return;
    }
    const row = event.target.closest(".film-row");
    if (!row || event.target.closest("a, input, select, textarea, summary")) return;
    // Inside the open card only its close button toggles the film.
    if (event.target.closest(".film-expanded") && event.target.closest('button:not([data-action="expand"])')) return;
    const filmId = row.dataset.filmId;
    if (expandedId === filmId) { closeFilmDetails(filmId); return; }
    filmNavigationIds = matchingFilms().map((film) => film.id);
    expandedId = filmId;
    renderFilms();
  });
  function openFilmFromList(filmId, listStatus = "want") {
    const film = films.find((item) => item.id === filmId);
    if (!film) return;
    activeSection = "";
    search.value = "";
    moreSections.value = "";
    // Las flechas se quedan dentro de la lista desde la que se abrió.
    filmNavigationIds = films.filter((item) => intentions.get(item.id) === listStatus).map((item) => item.id);
    expandedId = film.id;
    renderSectionPicker();
    renderFilms();
    switchScreen("explore");
    requestAnimationFrame(() => list.querySelector("dialog.film-expanded .film-detail-sticky .film-title")?.focus({ preventScroll: true }));
  }
  function removeFromList(event) {
    const open = event.target.closest('button[data-action="open-film"]');
    if (open) { openFilmFromList(open.dataset.id, event.currentTarget.id === "maybe-list" ? "maybe" : "want"); return; }
    const button = event.target.closest('button[data-action="remove"]');
    if (!button) return;
    // Dos clics, igual que «remove-intent» en Mi parrilla: el primero arma, el segundo borra.
    if (!button.classList.contains("is-confirming")) {
      button.classList.add("is-confirming");
      button.textContent = "¿Quitar?";
      button.title = "Pulsa otra vez para confirmar";
      button.setAttribute("aria-label", "Confirmar: quitar de las listas");
      clearTimeout(button._confirmTimer);
      button._confirmTimer = setTimeout(() => {
        button.classList.remove("is-confirming");
        button.textContent = "×";
        button.title = "Quitar de Mis listas";
      }, 2600);
      return;
    }
    clearTimeout(button._confirmTimer);
    intentions.delete(button.dataset.id);
    plannedScreenings.delete(button.dataset.id);
    prioritized.delete(button.dataset.id);
    persist(); persistPlannedScreenings(); persistPrioritized(); renderSaved(); refreshSharedScreen();
  }
  savedList.addEventListener("click", removeFromList);
  maybeList.addEventListener("click", removeFromList);
  document.querySelectorAll("[data-screen]").forEach((button) => button.addEventListener("click", () => {
    // La pestaña «Pases» ya la gestiona su propia barra para no perder el estado activo.
    if (button.classList.contains("mobile-tab")) return;
    switchScreen(button.dataset.screen);
  }));
  document.querySelector("#go-program").addEventListener("click", () => {
    switchScreen("program");
  });
  document.querySelector("#next-to-sessions").addEventListener("click", () => switchScreen("sessions"));
  document.querySelector("#show-all-sections").addEventListener("click", () => {
    activeSection = ""; search.value = ""; moreSections.value = ""; showDiscarded = false; syncFilterToggles(); renderSectionPicker(); renderFilms();
  });
  search.addEventListener("input", renderFilms);
  sort.addEventListener("change", renderFilms);
  document.querySelector("#clear-filters").addEventListener("click", () => { search.value = ""; showDiscarded = false; syncFilterToggles(); renderFilms(); search.focus(); });
  const onlyMyListsButton = document.querySelector("#only-my-lists");
  const showDiscardedButton = document.querySelector("#show-discarded");
  function syncFilterToggles() {
    onlyMyListsButton.setAttribute("aria-pressed", String(onlyMyLists));
    onlyMyListsButton.textContent = onlyMyLists ? "Mostrando mis listas" : "Solo mis listas";
    showDiscardedButton.setAttribute("aria-pressed", String(showDiscarded));
    showDiscardedButton.textContent = showDiscarded ? "Ocultar descartadas" : "Descartadas";
  }
  onlyMyListsButton.addEventListener("click", () => {
    onlyMyLists = !onlyMyLists;
    if (onlyMyLists) showDiscarded = false;
    syncFilterToggles();
    renderFilms();
  });
  showDiscardedButton.addEventListener("click", () => {
    showDiscarded = !showDiscarded;
    if (showDiscarded) {
      onlyMyLists = false;
      activeSection = "";
      moreSections.value = "";
      renderSectionPicker();
    }
    syncFilterToggles();
    renderFilms();
  });
  function resetClearSavedConfirmation() {
    clearTimeout(clearSaved._confirmTimer);
    clearSaved.classList.remove("is-confirming");
    clearSaved.textContent = "Vaciar ambas";
    clearSaved.removeAttribute("title");
    clearSaved.removeAttribute("aria-label");
  }
  function clearSavedLists() {
    if (!clearSaved.classList.contains("is-confirming")) {
      clearSaved.classList.add("is-confirming");
      clearSaved.textContent = "¿Vaciar ambas?";
      clearSaved.title = "Pulsa otra vez para confirmar";
      clearSaved.setAttribute("aria-label", "Confirmar: vaciar ambas listas");
      clearSaved._confirmTimer = setTimeout(resetClearSavedConfirmation, 2600);
      return;
    }
    resetClearSavedConfirmation();
    intentions.clear();
    prioritized.clear();
    persist(); persistPrioritized(); renderSaved();
  }
  clearSaved.addEventListener("click", clearSavedLists);
  clearSaved.addEventListener("blur", resetClearSavedConfirmation);
  clearSaved.addEventListener("keydown", (event) => {
    if (event.key === "Escape") resetClearSavedConfirmation();
  });
  document.querySelector("#extras-toggle").addEventListener("click", (event) => {
    const panel = document.querySelector("#extras-panel");
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  const remoteImagesToggle = document.querySelector("#remote-images-toggle");
  remoteImagesToggle.checked = remoteImagesEnabled;
  updateRemoteImagesStatus();
  remoteImagesToggle.addEventListener("change", () => {
    remoteImagesEnabled = remoteImagesToggle.checked;
    try { localStorage.setItem(remoteImagesStorageKey, String(remoteImagesEnabled)); } catch (_) { /* Preference remains active for this session. */ }
    updateRemoteImagesStatus();
    renderFilms();
  });
  // El <head> ya aplicó el atributo; aquí solo se sincronizan los botones y se
  // escucha al sistema para el modo «Sistema».
  let themePreference = readTheme();
  const themeOptions = document.querySelector("#theme-options");
  function readTheme() {
    try {
      const value = localStorage.getItem(themeStorageKey);
      return ["light", "dark", "system"].includes(value) ? value : "system";
    } catch (_) { return "system"; }
  }
  function renderThemeOptions() {
    themeOptions.querySelectorAll(".theme-option").forEach((button) => {
      const active = button.dataset.themeValue === themePreference;
      button.classList.toggle("is-current", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function applyTheme(value = themePreference) {
    themePreference = value;
    if (value === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    try { localStorage.setItem(themeStorageKey, value); } catch (_) { /* Keep it for this session. */ }
    // La barra del navegador móvil acompaña al tema elegido, no al del sistema.
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e1218" : "#fbf9f3");
    renderThemeOptions();
  }
  // El botón de cabecera alterna claro/oscuro; «Sistema» se elige en Ajustes.
  function currentIsDark() {
    if (themePreference === "dark") return true;
    if (themePreference === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    applyTheme(currentIsDark() ? "light" : "dark");
  });
  themeOptions.addEventListener("click", (event) => {
    const button = event.target.closest(".theme-option");
    if (button) applyTheme(button.dataset.themeValue);
  });
  // Con «Sistema» el tema lo resuelven los tokens por @media, así que el
  // cambio del sistema no requiere tocar el DOM; el listener existe para dejar
  // constancia de que el modo se sigue en vivo (y repinta el grupo).
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themePreference === "system") renderThemeOptions();
  });
  renderThemeOptions();
  document.querySelector("#date-options").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    const date = button.dataset.date;
    if (!date) activeDates.clear();
    else if (activeDates.has(date)) activeDates.delete(date);
    else activeDates.add(date);
    renderDateChoices(); updateSessionSummary();
  });
  document.querySelector("#time-options").addEventListener("click", (event) => {
    const allButton = event.target.closest("button[data-time-all]");
    if (allButton) {
      activeTimes.clear();
      document.querySelectorAll("#time-options [data-time]").forEach((button) => {
        button.classList.remove("is-selected"); button.setAttribute("aria-pressed", "false");
      });
      allButton.classList.add("is-selected"); allButton.setAttribute("aria-pressed", "true");
      updateSessionSummary();
      return;
    }
    const button = event.target.closest("button[data-time]");
    if (!button) return;
    if (activeTimes.has(button.dataset.time)) activeTimes.delete(button.dataset.time); else activeTimes.add(button.dataset.time);
    button.classList.toggle("is-selected", activeTimes.has(button.dataset.time));
    button.setAttribute("aria-pressed", String(activeTimes.has(button.dataset.time)));
    const allTimes = document.querySelector("#time-options [data-time-all]");
    allTimes.classList.toggle("is-selected", activeTimes.size === 0);
    allTimes.setAttribute("aria-pressed", String(activeTimes.size === 0));
    updateSessionSummary();
  });
  document.querySelector("#venue-options").addEventListener("click", (event) => {
    const allButton = event.target.closest("button[data-venue-all]");
    if (!allButton) return;
    activeVenues.clear();
    document.querySelectorAll("#venue-options input[type=checkbox]").forEach((input) => { input.checked = false; });
    allButton.classList.add("is-selected"); allButton.setAttribute("aria-pressed", "true");
    updateSessionSummary();
  });
  document.querySelector("#venue-options").addEventListener("change", (event) => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) activeVenues.add(event.target.value); else activeVenues.delete(event.target.value);
    const allButton = document.querySelector("#venue-options [data-venue-all]");
    allButton.classList.toggle("is-selected", activeVenues.size === 0);
    allButton.setAttribute("aria-pressed", String(activeVenues.size === 0));
    updateSessionSummary();
  });
  document.querySelector("#only-saved").addEventListener("change", updateSessionSummary);
  document.querySelector("#session-results-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-open-film]");
    if (!button) return;
    const film = films.find((item) => item.id === button.dataset.openFilm);
    if (!film) return;
    filmNavigationIds = [...new Set([...document.querySelectorAll("#session-results-list button[data-open-film]")].map((item) => item.dataset.openFilm))];
    sessionSearchScrollY = window.scrollY;
    returnToSessionSearch = true;
    activeSection = "";
    search.value = "";
    moreSections.value = "";
    expandedId = film.id;
    renderSectionPicker();
    renderFilms();
    switchScreen("explore");
    requestAnimationFrame(() => list.querySelector("dialog.film-expanded .film-detail-sticky .film-title")?.focus({ preventScroll: true }));
  });
  const programScreen = document.querySelector("#screen-program");
  programScreen.addEventListener("click", (event) => {
    const dateButton = event.target.closest("button[data-program-date]");
    if (dateButton) {
      activeProgramDate = dateButton.dataset.programDate;
      renderProgram();
      return;
    }
    const button = event.target.closest("button[data-program-action]");
    if (!button) return;
    const { programAction, filmId, candidateId } = button.dataset;
    if (programAction === "open-picker-film") {
      event.preventDefault(); // Abrir la ficha no debe alternar el desplegable padre.
      const film = filmById.get(filmId);
      if (!film) return;
      const source = button.closest(".program-film-picks");
      filmNavigationIds = [...source.querySelectorAll('[data-program-action="open-picker-film"]')]
        .map((item) => item.dataset.filmId);
      programScrollY = window.scrollY;
      returnToProgram = true;
      returnToSessionSearch = false;
      returnToShared = false;
      activeSection = "";
      search.value = "";
      moreSections.value = "";
      expandedId = film.id;
      renderSectionPicker();
      renderFilms();
      switchScreen("explore", { scrollTop: false });
      return;
    }
    if (programAction === "explore-films") { switchScreen("explore"); return; }
    if (programAction === "calendar-event") {
      openCalendarMenu(button, candidateId);
      return;
    }
    if (programAction === "calendar-google") {
      const screening = findScreening(candidateId);
      if (screening) window.open(googleEventUrl(screening), "_blank", "noopener");
      closeCalendarMenu();
      return;
    }
    if (programAction === "calendar-ics") {
      const screening = findScreening(candidateId);
      if (screening) downloadBlob(buildSingleCalendar(screening), "text/calendar;charset=utf-8", calendarFileName(screening));
      closeCalendarMenu();
      return;
    }
    if (programAction === "share-screening") {
      sharePassLink([candidateId]).catch(() => {});
      return;
    }
    if (programAction === "remove-program-screening") {
      plannedStandalone.delete(candidateId);
      persistStandalone();
      for (const [plannedFilmId, plannedCandidateId] of plannedScreenings) {
        if (plannedCandidateId === candidateId) plannedScreenings.delete(plannedFilmId);
      }
      persistPlannedScreenings(); renderProgram();
      refreshSharedScreen();
      return;
    }
    if (programAction === "choose-program-screening") {
      if (findScreening(candidateId)?.filmIds.includes(filmId)) {
        plannedScreenings.set(filmId, candidateId);
        persistPlannedScreenings(); renderProgram();
      }
      return;
    }
    if (programAction === "enable-special") {
      includeSpecialInProgram = true;
      persistIncludeSpecial();
      syncSpecialToggle();
      renderProgram();
      updateSessionSummary();
      return;
    }
    if (programAction === "unselect-film") {
      plannedScreenings.delete(filmId);
      persistPlannedScreenings(); renderSaved(); refreshSharedScreen(); return;
    }
    if (programAction === "remove-intent") {
      if (!button.classList.contains("is-confirming")) {
        button.classList.add("is-confirming");
        button.textContent = "¿Quitar?";
        button.title = "Pulsa otra vez para confirmar";
        button.setAttribute("aria-label", "Confirmar: quitar de las listas");
        clearTimeout(button._confirmTimer);
        button._confirmTimer = setTimeout(() => {
          button.classList.remove("is-confirming");
          button.textContent = "✕";
          button.title = "Quitar de Mis listas";
          button.setAttribute("aria-label", "Quitar de las listas");
        }, 2600);
        return;
      }
      for (const [plannedFilmId, plannedCandidateId] of plannedScreenings) {
        if (plannedCandidateId && findScreening(plannedCandidateId)?.filmIds.includes(filmId)) plannedScreenings.delete(plannedFilmId);
      }
      intentions.delete(filmId);
      prioritized.delete(filmId);
      persist(); persistPlannedScreenings(); persistPrioritized(); renderSaved(); refreshSharedScreen(); return;
    }
    if (programAction === "add-maybe-suggestion") {
      if (findScreening(candidateId)?.filmIds.includes(filmId)) {
        plannedScreenings.set(filmId, candidateId);
        persistPlannedScreenings(); renderProgram();
      }
    }
  });
  const specialToggle = document.querySelector("#program-include-special");
  function syncSpecialToggle() {
    specialToggle.setAttribute("aria-pressed", String(includeSpecialInProgram));
    specialToggle.classList.toggle("is-on", includeSpecialInProgram);
  }
  specialToggle.addEventListener("click", () => {
    includeSpecialInProgram = !includeSpecialInProgram;
    persistIncludeSpecial();
    syncSpecialToggle();
    renderProgram();
    updateSessionSummary();
  });
  syncSpecialToggle();
  const transportSelect = document.querySelector("#program-transport");
  transportSelect.value = transportMode;
  transportSelect.addEventListener("change", () => {
    transportMode = transportSelect.value;
    try { localStorage.setItem(transportStorageKey, transportMode); } catch (_) { /* Keep this choice for the current session. */ }
    settingsTransport.value = transportMode;
    renderProgram();
  });
  document.querySelector("#clear-planned-screenings").addEventListener("click", () => {
    // Named "Deshacer la parrilla": it undoes the plan, keeps the lists.
    if (!window.confirm("¿Deshacer tu parrilla? Se quitan todos los pases elegidos. Tus listas de «Mi lista» y «Quizás» se conservan.")) return;
    plannedScreenings.clear();
    plannedStandalone.clear();
    persistStandalone();
    activeProgramDate = "";
    persistPlannedScreenings(); renderProgram();
    refreshSharedScreen();
  });
  document.querySelector("#reset-session-filters").addEventListener("click", () => {
    activeDates.clear(); activeTimes.clear(); activeVenues.clear();
    document.querySelectorAll("#venue-options input").forEach((input) => { input.checked = false; });
    document.querySelectorAll("#time-options [data-time]").forEach((button) => { button.classList.remove("is-selected"); button.setAttribute("aria-pressed", "false"); });
    document.querySelector("#time-options [data-time-all]").classList.add("is-selected");
    document.querySelector("#time-options [data-time-all]").setAttribute("aria-pressed", "true");
    document.querySelector("#venue-options [data-venue-all]").classList.add("is-selected");
    document.querySelector("#venue-options [data-venue-all]").setAttribute("aria-pressed", "true");
    renderDateChoices(); updateSessionSummary();
  });
  function scrollPageToTop() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }
  // Mobile tab bar: jump straight to the list or the agenda from anywhere.
  const sheet = document.querySelector("#mi-programa-sheet");
  function openSelectionSheet(open) {
    sheet.hidden = !open;
    if (open) activeMobileTab = "mine";
    else if (activeMobileTab === "mine") activeMobileTab = "explore";
    if (typeof updateMobileTabState === "function") updateMobileTabState();
    if (open) document.querySelector("#sheet-close").focus({ preventScroll: true });
  }
  sheet.addEventListener("click", () => openSelectionSheet(false));
  document.querySelector("#sheet-close").addEventListener("click", () => openSelectionSheet(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !sheet.hidden) openSelectionSheet(false); });
  document.querySelectorAll("[data-sheet]").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (activeScreen !== "explore") switchScreen("explore", { scrollTop: false });
      openSelectionSheet(true);
    });
  });
  document.querySelectorAll("[data-screen-jump]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.screenJump;
      switchScreen(tab.dataset.mobileTab === "program" ? "program" : "explore", { scrollTop: false });
      activeMobileTab = tab.dataset.mobileTab;
      updateMobileTabState();
      const picksPanel = document.querySelector(".program-picks-panel");
      const hasWantedPending = picksPanel.classList.contains("has-pending")
        && !picksPanel.classList.contains("only-quizas");
      const showPendingChoices = tab.dataset.mobileTab === "program" && hasWantedPending;
      const target = showPendingChoices ? picksPanel : document.querySelector(`#${targetId}`);
      if (showPendingChoices) document.querySelector("#program-picks-fold").open = true;
      if (!target) return;
      const jump = () => {
        let top = 0;
        for (let node = target; node; node = node.offsetParent) top += node.offsetTop;
        window.scrollTo({ top: Math.max(0, top - 76), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      };
      window.scrollTo({ top: 0, behavior: "instant" });
      requestAnimationFrame(() => requestAnimationFrame(jump));
    });
  });
  // Tab "mine" is its own state while the sheet is open; closing falls back to the active screen.
  function currentMobileTab() {
    if (activeScreen === "sessions") return "sessions";
    if (activeScreen === "program") return activeMobileTab === "program" ? "program" : "explore";
    return activeMobileTab;
  }
  function updateMobileTabState() {
    const count = document.querySelector("#mobile-tab-count");
    if (count) count.textContent = String(selectedPlanEvents().length);
    const current = currentMobileTab();
    document.querySelectorAll(".mobile-tab").forEach((tab) => {
      const isCurrent = tab.dataset.mobileTab === current;
      tab.classList.toggle("is-current", isCurrent);
      if (isCurrent) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
    });
  }
  document.querySelectorAll(".mobile-tab[data-screen]").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeMobileTab = tab.dataset.mobileTab;
      switchScreen(tab.dataset.screen, { scrollTop: false });
    });  });

  const floatingBackToTop = document.querySelector("#back-to-top-floating");
  function updateFloatingBackToTop() {
    floatingBackToTop.hidden = window.scrollY < 600;
  }
  document.querySelector("#back-to-top").addEventListener("click", scrollPageToTop);
  // El logo también lleva arriba: es el gesto que la gente prueba primero.
  document.querySelector(".wordmark").addEventListener("click", (event) => { event.preventDefault(); scrollPageToTop(); });
  document.querySelector("#help-close").addEventListener("click", () => switchScreen("explore"));
  floatingBackToTop.addEventListener("click", scrollPageToTop);
  window.addEventListener("scroll", updateFloatingBackToTop, { passive: true });
  window.addEventListener("resize", updateFloatingBackToTop);
  updateFloatingBackToTop();
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && activeScreen === "explore") { event.preventDefault(); search.focus(); }
    if (event.key === "Escape" && discardAck) { closeDiscardAck(); return; }
    if (event.key === "Escape" && document.activeElement === search) { search.value = ""; renderFilms(); search.blur(); }
    // Film card: ← / → move between films, Escape closes (handled by the dialog).
    const dialog = document.querySelector("dialog.film-expanded");
    if (!dialog) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target.closest("input, textarea, select")) return;
    event.preventDefault();
    navigateFilm(event.key === "ArrowRight" ? 1 : -1);
  });

  // ---- Ajustes: exportar/importar, transporte e imágenes ----
  const settingsToggle = document.querySelector("#extras-toggle");
  const settingsPanel = document.querySelector("#extras-panel");
  const settingsEmpty = document.querySelector("#settings-data-empty");
  const settingsReady = document.querySelector("#settings-data-ready");
  const settingsExportView = document.querySelector("#settings-export-view");
  const settingsImportView = document.querySelector("#settings-import-view");
  const settingsSummary = document.querySelector("#settings-summary");
  const settingsExportCode = document.querySelector("#settings-export-code");
  const settingsImportCode = document.querySelector("#settings-import-code");
  const settingsFeedback = document.querySelector("#settings-feedback");
  const settingsFile = document.querySelector("#settings-file");
  const settingsTransport = document.querySelector("#settings-transport");

  function hasUserData() {
    return intentions.size > 0 || plannedScreenings.size > 0 || discarded.size > 0 || prioritized.size > 0;
  }
  function encodeProgram(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function decodeProgram(code) {
    const binary = atob(code.trim());
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  // ---- Compartir por enlace ----
  // El enlace lleva solo ids de pase; el programa y las listas no salen del navegador.
  // Formato explícito: "v1.z." = payload deflate, "v1." = JSON crudo (navegadores sin CompressionStream).
  const passLinkCompressedPrefix = "v1.z.";
  const passLinkPrefix = "v1.";
  function bytesToBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function base64UrlToBytes(text) {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  async function compressBytes(bytes) {
    if (typeof CompressionStream !== "function") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function decompressBytes(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function cleanAlias(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }
  function encodePassLink(candidateIds, alias = "") {
    const data = { v: 1, p: candidateIds };
    const name = cleanAlias(alias);
    if (name) data.a = name;
    const payload = new TextEncoder().encode(JSON.stringify(data));
    return compressBytes(payload).then((packed) => (packed && packed.length
      ? `${passLinkCompressedPrefix}${bytesToBase64Url(packed)}`
      : `${passLinkPrefix}${bytesToBase64Url(payload)}`));
  }
  // Listas compartidas: mismas piezas que el itinerario, con las películas en `l` en vez de los pases.
  function encodeListLink(entries, alias = "") {
    const data = { v: 1, l: entries };
    const name = cleanAlias(alias);
    if (name) data.a = name;
    const payload = new TextEncoder().encode(JSON.stringify(data));
    return compressBytes(payload).then((packed) => (packed && packed.length
      ? `${passLinkCompressedPrefix}${bytesToBase64Url(packed)}`
      : `${passLinkPrefix}${bytesToBase64Url(payload)}`));
  }
  async function decodeListLink(fragment) {
    try {
      const compressed = fragment.startsWith(passLinkCompressedPrefix);
      if (!compressed && !fragment.startsWith(passLinkPrefix)) throw new Error("invalid");
      const body = fragment.slice((compressed ? passLinkCompressedPrefix : passLinkPrefix).length);
      const bytes = base64UrlToBytes(body);
      const plain = compressed ? await decompressBytes(bytes) : bytes;
      const data = JSON.parse(new TextDecoder().decode(plain));
      if (!data || data.v !== 1 || !Array.isArray(data.l)) throw new Error("invalid");
      return {
        // Un elemento por película: [id, "want" | "maybe", prioridad 0|1].
        lists: data.l
          .filter((item) => Array.isArray(item) && typeof item[0] === "string" && filmById.has(item[0]))
          .map((item) => ({ filmId: item[0], status: item[1] === "maybe" ? "maybe" : "want", prioritized: item[2] === 1 })),
        alias: cleanAlias(data.a),
      };
    } catch (error) {
      throw Object.assign(new Error("invalid"), { cause: error });
    }
  }
  async function decodePassLink(fragment) {
    try {
      // El prefijo dice si viene comprimido; nunca se adivina por el primer byte.
      const compressed = fragment.startsWith(passLinkCompressedPrefix);
      if (!compressed && !fragment.startsWith(passLinkPrefix)) throw new Error("invalid");
      const body = fragment.slice((compressed ? passLinkCompressedPrefix : passLinkPrefix).length);
      const bytes = base64UrlToBytes(body);
      const plain = compressed ? await decompressBytes(bytes) : bytes;
      const data = JSON.parse(new TextDecoder().decode(plain));
      if (!data || data.v !== 1 || !Array.isArray(data.p)) throw new Error("invalid");
      return {
        passes: data.p.filter((id) => typeof id === "string" && screeningRecords.some((screening) => screening.candidateId === id && (screening.filmIds || []).length)),
        alias: cleanAlias(data.a),
      };
    } catch (error) {
      // Cualquier fallo (atob, deflate, JSON, versión) es el mismo caso para quien llama; la causa se conserva.
      throw Object.assign(new Error("invalid"), { cause: error });
    }
  }
  function readSharedPasses() {
    const match = /(?:^|[#&?])pases=([^&#]+)/.exec(window.location.hash) || /[?&]pases=([^&#]+)/.exec(window.location.search);
    if (!match) return Promise.resolve(null);
    return Promise.resolve().then(() => decodePassLink(decodeURIComponent(match[1]))).catch(() => ({ passes: [], alias: "" }));
  }
  function readSharedList() {
    const match = /(?:^|[#&?])listas=([^&#]+)/.exec(window.location.hash) || /[?&]listas=([^&#]+)/.exec(window.location.search);
    if (!match) return Promise.resolve(null);
    return Promise.resolve().then(() => decodeListLink(decodeURIComponent(match[1]))).catch(() => ({ lists: [], alias: "" }));
  }
  // El arranque va en un IIFE: el test de Playwright llama a esta función desde el ámbito global.
  window.renderSharedScreen = renderSharedScreen;
  window.encodePassLink = encodePassLink;
  // ---- Pantalla de itinerario compartido ----
  let sharedPasses = [];
  let sharedAlias = "";
  // El enlace abierto: pases (por defecto) o listas de películas.
  let sharedListsOnly = false;
  const sharedSelection = new Set();
  // reason y kind solo para bloqueos; note es el aviso que no impide marcarlo.
  // Etiqueta corta del pase propio: "L21 · 19:30" se lee de un vistazo en el aviso.
  function shortOwnPass(screening) {
    if (!screening) return "";
    const day = new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(new Date(`${screening.date}T12:00:00`)).replace(/\.$/, "");
    return `${day} ${Number(screening.date.slice(8, 10))} · ${screening.time}`;
  }
  function sharedPassState(candidateId) {
    const screening = findScreening(candidateId);
    if (!screening) return { disabled: true, reason: "", kind: "", note: "" };
    const own = (screening.filmIds || []).some((id) => plannedScreenings.get(id) === candidateId);
    if (own) return { disabled: true, reason: "🎉 Coincidimos: este pase ya está en tu parrilla.", kind: "coincide", note: "" };
    const clashes = ownedClashList(candidateId);
    const conflict = clashes.find((item) => item.status === "conflict");
    if (conflict) return { disabled: true, reason: `Choca con tu pase de las ${conflict.screening.time} · ${conflict.screening.venue}`, kind: "conflict", note: "" };
    if (clashes.length) return { disabled: true, reason: "Falta la duración o la distancia para saber si encaja", kind: "uncertain", note: "" };
    const filmIds = screening.filmIds || [];
    const other = filmIds
      .map((id) => plannedScreenings.get(id))
      .find((plannedId) => plannedId && plannedId !== candidateId);
    if (other) {
      const planned = findScreening(other);
      if (planned) {
        const extra = filmIds.length > 1 ? ` · programa de ${filmIds.length}` : "";
        return {
          disabled: false,
          reason: "",
          kind: "",
          note: `Ya la tienes el ${shortOwnPass(planned)} · ${planned.venue}${extra}. Márcala si prefieres este pase: cambia el tuyo.`,
          replaces: planned.candidateId,
        };
      }
    }
    // En tus listas pero sin pase: este la encaja, así que se marca y se celebra.
    const listed = filmIds.filter((id) => intentions.has(id));
    if (listed.length) {
      return {
        disabled: false,
        reason: "",
        kind: "",
        note: "🎉 La tienes en tu lista y este pase te encaja: márcala y entra en tu parrilla.",
        replaces: null,
        listed: true,
      };
    }
    return { disabled: false, reason: "", kind: "", note: "", replaces: null, listed: false };
  }
  // analyzeProgram solo mira pares de la parrilla: el pase del enlace se compara aparte.
  function ownedClashList(candidateId) {
    const screening = findScreening(candidateId);
    if (!screening) return [];
    return selectedPlanEvents()
      .map((own) => ({ screening: own, status: compareScreenings(own, screening).status }))
      .filter((item) => item.status === "conflict" || item.status === "uncertain");
  }
  // Títulos del pase compartido: cada película abre su ficha, como en la parrilla.
  function sharedPassTitles(screening) {
    const filmsInPass = screening.films || [];
    if (!filmsInPass.length) return escapeHtml(screening.title || "");
    return filmsInPass.map((film, index) => {
      const separator = index ? '<span class="film-separator" aria-hidden="true">·</span>' : "";
      return film.id && filmById.has(film.id)
        ? `${separator}<button type="button" class="shared-film-link" data-open-film="${escapeHtml(film.id)}">${escapeHtml(film.title)}</button>`
        : `${separator}<span>${escapeHtml(film.title)}</span>`;
    }).join("");
  }
  function renderSharedScreen(candidateIds, alias = "") {
    sharedListsOnly = false;
    document.querySelector("#screen-shared").classList.remove("is-list-reception");
    for (const id of ["shared-list-filters", "shared-filter-empty", "shared-pending-summary", "shared-view-lists", "shared-keep-looking"]) document.getElementById(id).hidden = true;
    document.querySelector("#shared-eyebrow").textContent = "ITINERARIO COMPARTIDO";
    document.querySelector("#shared-dismiss").textContent = "Descartar este itinerario";
    candidateIds = candidateIds.filter(findScreening);
    sharedPasses = candidateIds;
    sharedAlias = alias;
    sharedSelection.clear();
    // Opened by a link: land on the heading, not wherever the old page was scrolled to.
    if (!document.querySelector("#screen-shared").hidden) window.scrollTo(0, 0);
    const feedback = document.querySelector("#shared-feedback");
    feedback.textContent = "";
    document.querySelector("#shared-explore").hidden = true;
    document.querySelector("#shared-add").hidden = false;
    document.querySelector("#shared-dismiss").hidden = false;
    document.querySelector(".shared-tools").hidden = false;
    const ownCount = selectedPlanEvents().length;
    const filmCount = new Set(candidateIds.flatMap((id) => findScreening(id).filmIds || [])).size;
    // Resume el encuentro: cuántos pases coinciden ya, cuántos son la misma peli en otro horario.
    let coincide = 0;
    let sameFilmOther = 0;
    let listedCount = 0;
    for (const id of candidateIds) {
      const state = sharedPassState(id);
      if (state.kind === "coincide") coincide += 1;
      else if (state.replaces) sameFilmOther += 1;
      else if (state.listed) listedCount += 1;
    }
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    let summary;
    // Sin parrilla propia pero con la película en la lista: eso también se celebra.
    if (!ownCount && listedCount) {
      summary = listedCount === candidateIds.length
        ? `🎉 ${listedCount === 1 ? "Esta película está" : "Estas películas están"} en tu lista y el itinerario te encaja.`
        : `🎉 ${plural(listedCount, "pase te encaja", "pases te encajan")} con la lista.`;
    } else if (!ownCount) {
      summary = `Añade los que quieras: ${plural(candidateIds.length, "pase propuesto", "pases propuestos")}.`;
    } else if (coincide === candidateIds.length && candidateIds.length > 0) {
      summary = `🎉 ¡Vas a todos! Coincidís en ${plural(coincide, "pase", "pases")}. Nos vemos en el cine.`;
    } else {
      const parts = [];
      if (coincide) parts.push(`🎉 Coincidís en ${plural(coincide, "pase", "pases")}`);
      if (listedCount) {
        parts.push(listedCount === 1
          ? "🎉 tienes 1 película en tu lista y este itinerario te encaja"
          : `🎉 tienes ${listedCount} películas en tu lista y este itinerario te encaja`);
      }
      if (sameFilmOther) {
        parts.push(sameFilmOther === 1
          ? "y vais a una misma película a horarios distintos (¡para comentarla!)"
          : `y vais a ${sameFilmOther} películas a horarios distintos (¡para comentarlas!)`);
      }
      const rest = candidateIds.length - coincide - sameFilmOther - listedCount;
      if (rest > 0) parts.push(`quedan ${plural(rest, "pase más", "pases más")} por decidir`);
      // Una sola frase por parte: mayúscula inicial y sin punto suelto entre ellas.
      summary = parts.map((part, index) => index ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(". ") + ".";
    }
    // El alias, si viene, encabeza la pantalla; si no, un saludo neutro.
    document.querySelector("#shared-title").innerHTML = alias
      ? `El itinerario de <span>${escapeHtml(alias)}.</span>`
      : `Te han compartido <span>un itinerario.</span>`;
    // Spec asks for the pass/film count; the .eyebrow slot is free on this screen.
    document.querySelector("#shared-count").textContent = `${candidateIds.length} ${candidateIds.length === 1 ? "pase" : "pases"} · ${filmCount} ${filmCount === 1 ? "película" : "películas"}`;
    document.querySelector("#shared-count").hidden = false;
    document.querySelector("#shared-summary").textContent = summary;
    document.querySelector("#shared-list").innerHTML = candidateIds.map((candidateId) => {
      const screening = findScreening(candidateId);
      const state = sharedPassState(candidateId);
      // Solo se marca sola la que ya está en tus listas y este pase la encaja.
      if (state.listed) sharedSelection.add(candidateId);
      const note = state.reason
        ? `<p class="shared-${state.kind || "blocked"}">${escapeHtml(state.reason)}</p>`
        : state.note ? `<p class="shared-note${state.listed ? " is-listed" : ""}">${escapeHtml(state.note)}</p>` : "";
      const day = Number(screening.date.slice(8, 10));
      const month = formatProgramDate(screening.date, { month: "short" }).replace(/\.$/, "");
      const weekday = formatProgramDate(screening.date, { weekday: "short" }).replace(/\.$/, "");
      return `<li class="shared-pass${state.disabled ? " is-blocked" : ""}${state.listed ? " is-listed" : ""}">
        <label>
          <input type="checkbox" data-shared-pass="${escapeHtml(candidateId)}"${state.disabled ? " disabled" : state.listed ? " checked" : ""}>
          <span class="shared-pass-date" aria-hidden="true"><small>${escapeHtml(weekday)}</small><b>${day}</b><small>${escapeHtml(month)}</small></span>
          <span class="shared-pass-body">
            <span class="shared-pass-titles">${sharedPassTitles(screening)}</span>
            <span class="shared-pass-meta"><b>${escapeHtml(screening.time)}</b>${escapeHtml(screening.venue)}${screening.room ? ` · ${escapeHtml(screening.room)}` : ""}</span>
            ${note}
          </span>
        </label>
      </li>`;
    }).join("");
    syncSharedCount();
    switchScreen("shared");
  }
  // ---- Pantalla de listas compartidas ----
  let sharedListFilms = [];
  let sharedListFilter = "all";
  const sharedRecovered = new Set();
  // Lo que decide cada persona: película → «want» o «maybe». La lista de origen solo propone.
  const sharedListChoices = new Map();
  function sharedListState(filmId) {
    const film = filmById.get(filmId);
    if (!film) return { disabled: true, reason: "" };
    if (discarded.has(film.id) && !sharedRecovered.has(film.id)) return { disabled: true, discarded: true, reason: "La tienes descartada." };
    const mine = intentions.get(film.id);
    if (mine === "want") return { disabled: true, reason: "🎉 Coincidimos: también la tienes en «Lo quiero ver».", match: "want" };
    if (mine === "maybe") return { disabled: false, reason: "🎉 Coincidimos: también la tienes en «Mmm… quizás».", listed: true, match: "maybe" };
    return { disabled: false, reason: "" };
  }
  function renderSharedListScreen(lists, alias = "") {
    sharedListFilms = lists.filter((item) => filmById.has(item.filmId));
    sharedListChoices.clear();
    sharedListsOnly = true;
    sharedAlias = alias;
    sharedListFilter = "all";
    sharedRecovered.clear();
    document.querySelector("#screen-shared").classList.add("is-list-reception");
    document.querySelector("#shared-list-filters").hidden = false;
    document.querySelector("#shared-pending-summary").hidden = false;
    document.querySelector("#shared-view-lists").hidden = true;
    document.querySelector("#shared-keep-looking").hidden = true;
    if (!document.querySelector("#screen-shared").hidden) window.scrollTo(0, 0);
    document.querySelector("#shared-feedback").textContent = "";
    document.querySelector("#shared-explore").hidden = true;
    document.querySelector("#shared-add").hidden = false;
    document.querySelector("#shared-dismiss").hidden = false;
    document.querySelector(".shared-tools").hidden = false;
    const wanted = sharedListFilms.filter((item) => item.status === "want").length;
    const maybe = sharedListFilms.length - wanted;
    const already = sharedListFilms.filter((item) => intentions.get(item.filmId) === "want").length;
    document.querySelector("#shared-eyebrow").textContent = "LISTAS COMPARTIDAS";
    document.querySelector("#shared-dismiss").textContent = "Cerrar sin guardar";
    document.querySelector("#shared-title").innerHTML = alias
      ? `Las listas de <span>${escapeHtml(alias)}.</span>`
      : `Te han compartido <span>sus listas.</span>`;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const parts = [wanted ? plural(wanted, "película para ver", "películas para ver") : "", maybe ? plural(maybe, "quizás que quiere ver", "quizás que quiere ver") : ""].filter(Boolean);
    document.querySelector("#shared-count").textContent = `${sharedListFilms.length} películas · Coincidís en ${sharedListFilms.filter((item) => intentions.has(item.filmId)).length}`;
    document.querySelector("#shared-count").hidden = false;
    document.querySelector("#shared-summary").textContent = already === sharedListFilms.length && sharedListFilms.length
      ? "🎉 Las tienes todas: coincidís de pleno."
      : "Elige qué quieres guardar. Tus listas se actualizarán al pulsar «Guardar selección». La estrella de prioridad se guarda al momento.";
    // Sin «marcar todas»: aquí se decide película a película, como en una tarjeta del catálogo.
    document.querySelector(".shared-tools").hidden = true;
    renderSharedFilmsOnly();
    syncSharedListCount();
    switchScreen("shared");
  }
  // Solo las tarjetas: la estrella cambia sin tocar cabecera, recuento ni posición.
  function renderSharedFilmsOnly() {
    const matchesFilter = ({ filmId }) => sharedListFilter === "all"
      || (sharedListFilter === "matches" ? intentions.has(filmId) : !intentions.has(filmId));
    const visible = sharedListFilms.filter(matchesFilter);
    document.querySelector("#shared-filter-empty").hidden = visible.length > 0;
    document.querySelector("#shared-list-filters").innerHTML = [["all", "Todas", sharedListFilms.length],
      ["new", "Por descubrir", sharedListFilms.filter(({filmId}) => !intentions.has(filmId)).length],
      ["matches", "Coincidencias", sharedListFilms.filter(({filmId}) => intentions.has(filmId)).length]]
      .map(([id, label, count]) => `<button type="button" class="text-button" data-shared-filter="${id}" aria-pressed="${sharedListFilter === id}">${label} · ${count}</button>`).join("");
    document.querySelector("#shared-list").innerHTML = visible.map(({ filmId, status }) => {
      const film = filmById.get(filmId);
      const state = sharedListState(filmId);
      // La misma ficha que en el catálogo: título, dirección, año y duración, y sus etiquetas.
      const credits = directorText(film);
      const facts = [film.year, film.durationMinutes ? `${film.durationMinutes} min` : ""].filter(Boolean).map(escapeHtml).join(" · ");
      const tags = (film.sections || []).filter((name) => !["otras secciones", "cortometrajes"].includes(String(name).toLocaleLowerCase("es")))
        .map((name) => `<span class="film-section">${escapeHtml(name)}</span>`).join("");
      const cicloTags = (film.ciclo || []).map((name) => `<span class="film-ciclo">${escapeHtml(name)}</span>`).join("");
      const suggested = status === "want" ? "quiere verla" : "quizás";
      // La coincidencia se celebra junto al título; el motivo de bloqueo, debajo de la ficha.
      const match = state.match
        ? `<span class="shared-match" title="${escapeHtml(state.reason)}">${state.match === "want" ? "✓ En tu lista" : "★ Ya en quizás"}</span>`
        : "";
      return `<li class="cinema-card film-row shared-film${state.disabled ? " is-blocked" : ""}" data-shared-row="${escapeHtml(filmId)}">
        <div class="film-body">
          <div class="film-copy">
            <span class="film-title-line"><button type="button" class="shared-film-open" data-open-shared-film="${escapeHtml(filmId)}">${escapeHtml(film.title)}</button>${filmStar(film, { action: true })}${match}</span>
            <p class="film-credit">${escapeHtml(credits) || "Sin datos de dirección"}</p>${facts ? `<p class="film-facts">${facts}</p>` : ""}${tags}${cicloTags}
            ${state.disabled && state.reason ? `<p class="shared-blocked">${escapeHtml(state.reason)}</p>` : ""}
          </div>
          <div class="film-actions" role="group" aria-label="Añadir ${escapeHtml(film.title)} a una lista"><p class="shared-suggest">${escapeHtml(sharedAlias || "Quien comparte")}: <b>${suggested}</b></p>${suggestions(filmId, film, state)}</div>
        </div>
      </li>`;
    }).join("");
  }
  // Mismos dos botones que en la tarjeta del catálogo, con la propuesta marcada hasta que se toca.
  function suggestions(filmId, film, state) {
    if (state.discarded) return `<button type="button" class="text-button" data-shared-recover="${escapeHtml(filmId)}">Recuperar y seleccionar</button>`;
    if (state.disabled) return "";
    // Mismo marcado que la tarjeta: si ya está en una lista, el botón sale marcado al abrir; al
    // tocar, manda lo elegido en esta pantalla (incluido desmarcarlo).
    const mine = intentions.get(film.id) || null;
    const shown = sharedListChoices.has(filmId) ? sharedListChoices.get(filmId) : mine;
    // `data-film-id` del botón de la tarjeta no vale aquí: el refresco usa `data-status`, así que se
    // renombra y el id se pone aparte, o el clic se queda sin película.
    return `<span class="intent-row"><span class="intent-primary" data-shared-for="${escapeHtml(filmId)}">${intentButtonMarkup("want", { film, status: shown })}${intentButtonMarkup("maybe", { film, status: shown })}</span></span>`
      .replace(/data-action="intent"/g, 'data-shared-add="set"')
      // El id se conserva (lo necesita el refresco por fila); `data-status` pasa a `data-add-status`
      // para que el clic general de la app no lo trate como intención guardada.
      .replace(/data-status="(want|maybe)"/g, 'data-add-status="$1" data-status="$1"');
  }
  // Qué cambiaría de verdad al añadir: lo elegido que no coincide con lo guardado. Volver al estado
  // inicial (o a la misma lista que ya tenías) no cuenta.
  function sharedListChanges() {
    const changes = new Map();
    for (const [filmId, status] of sharedListChoices) {
      const mine = intentions.get(filmId) || null;
      if (status !== mine) changes.set(filmId, status);
    }
    return changes;
  }
  function syncSharedListCount() {
    if (!sharedListsOnly) return;
    const button = document.querySelector("#shared-add");
    if (!button) return;
    const count = sharedListChanges().size;
    button.textContent = "Guardar selección";
    const changes = [...sharedListChanges().values()];
    document.querySelector("#shared-pending-summary").textContent = count
      ? `${changes.filter((status) => status === "want").length} para ver · ${changes.filter((status) => status === "maybe").length} quizás · ${changes.filter((status) => status === null).length} para quitar`
      : "Sin cambios pendientes";
    for (const row of document.querySelectorAll("[data-shared-row]")) {
      const pending = sharedListChanges().has(row.dataset.sharedRow);
      row.classList.toggle("is-pending", pending);
      let note = row.querySelector(".shared-pending-note");
      if (!note) { note = document.createElement("p"); note.className = "shared-pending-note"; row.querySelector(".film-actions").append(note); }
      note.hidden = !pending;
      note.textContent = sharedListChanges().get(row.dataset.sharedRow) === null
        ? "Quitar · sin guardar" : "Sin guardar";
    }
    button.disabled = count === 0;
  }
  function addSharedFilms() {
    let added = 0;
    for (const [filmId, status] of sharedListChanges()) {
      if (!filmById.has(filmId) || (discarded.has(filmId) && !sharedRecovered.has(filmId))) continue;
      if (status === null) {
        intentions.delete(filmId);
        plannedScreenings.delete(filmId);
        prioritized.delete(filmId);
        added += 1;
        continue;
      }
      discarded.delete(filmId);
      intentions.set(filmId, status === "maybe" ? "maybe" : "want");
      const entry = sharedListFilms.find((item) => item.filmId === filmId);
      if (entry?.prioritized) prioritized.add(filmId);
      added += 1;
    }
    if (!added) return 0;
    sharedListChoices.clear();
    persist(); persistPlannedScreenings(); persistDiscarded(); persistPrioritized(); renderSaved(); countVisibleFilms(); renderFilms();
    return added;
  }
  // Quitar un pase puede desbloquear uno compartido: repintar conservando lo marcado.
  function refreshSharedScreen() {
    if (document.querySelector("#screen-shared").hidden) return;
    const kept = new Set(sharedSelection);
    renderSharedScreen(sharedPasses, sharedAlias);
    sharedSelection.clear();
    sharedPasses.forEach((id) => {
      const input = document.querySelector(`input[data-shared-pass="${CSS.escape(id)}"]`);
      if (!input || input.disabled) return;
      if (kept.has(id)) input.checked = true;
      else input.checked = false;
      if (input.checked) sharedSelection.add(id);
    });
    syncSharedCount();
  }
  function syncSharedCount() {
    const button = document.querySelector("#shared-add");
    if (!button) return;
    button.textContent = sharedSelection.size ? `Añadir ${sharedSelection.size} ${sharedSelection.size === 1 ? "pase" : "pases"}` : "Añadir pases";
    button.disabled = sharedSelection.size === 0;
  }
  function addSharedPasses() {
    // Cambiar un pase propio por otro de la misma película se avisa antes de tocarlo.
    const replacing = [...sharedSelection]
      .map((candidateId) => ({ candidateId, state: sharedPassState(candidateId) }))
      .filter((item) => item.state.replaces);
    if (replacing.length) {
      const question = replacing.length === 1
        ? "Vas a cambiar tu pase de una película por el del enlace. ¿Seguimos?"
        : `Vas a cambiar ${replacing.length} pases de película por los del enlace. ¿Seguimos?`;
      if (!window.confirm(question)) return 0;
    }
    let added = 0;
    for (const candidateId of sharedSelection) {
      const screening = findScreening(candidateId);
      if (!screening) continue;
      const kept = (screening.filmIds || []).filter((filmId) => !discarded.has(filmId));
      for (const filmId of kept) {
        plannedScreenings.set(filmId, candidateId);
        if (!intentions.has(filmId)) intentions.set(filmId, "want");
      }
      if (kept.length) added += 1;
    }
    if (!added) return 0;
    persist(); persistPlannedScreenings();
    renderSaved();
    // El fragmento se limpia para que recargar no repita la pantalla.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    switchScreen("program");
    return added;
  }
  // ---- Calendario (.ics) ----
  function icsEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  function icsLocal(date, time, addMinutes = 0) {
    const [hour, minute] = String(time || "0:0").split(":").map(Number);
    const total = hour * 60 + minute + addMinutes;
    const day = Number(date.slice(8, 10)) + Math.floor(total / 1440);
    const stamp = `${date.slice(0, 7)}-${String(day).padStart(2, "0")}T${formatClock(((total % 1440) + 1440) % 1440).replace(":", "")}00`;
    return stamp;
  }
  function calendarEvent(screening) {
    const ids = screening.filmIds || [];
    const titles = (screening.films || []).map((film) => film.title).filter(Boolean);
    const summary = titles.length > 1
      ? (screening.title || titles.join(" · "))
      : (titles[0] || screening.title || "FICX 64");
    const minutes = plannedMinutes(screening) || 90;
    const where = `${screening.venue}${screening.room ? ` · ${screening.room}` : ""}`;
    const notes = [
      ids.length > 1 ? `Programa de ${ids.length} películas` : "",
      screening.meetingMinutes ? "Encuentro con el equipo" : "",
      screening.reviewStatus !== "reviewed" ? "Pase pendiente de confirmar por el festival" : "",
      "Programa personal FICX 64",
    ].filter(Boolean).join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:${screening.candidateId}@ficx64`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;TZID=Europe/Madrid:${icsLocal(screening.date, screening.time)}`,
      `DTEND;TZID=Europe/Madrid:${icsLocal(screening.date, screening.time, minutes)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `LOCATION:${icsEscape(where)}`,
      `DESCRIPTION:${icsEscape(notes)}`,
      "END:VEVENT",
    ].join("\r\n");
  }
  // Nombre opcional: se pide en el asistente y se usa al compartir y en los archivos. Nunca sale
  // del dispositivo salvo en lo que la persona comparta a propósito.
  function readAlias() {
    try { return String(localStorage.getItem(aliasStorageKey) || "").trim().slice(0, 40); } catch (_) { return ""; }
  }
  function persistAlias(value) {
    try { localStorage.setItem(aliasStorageKey, value); } catch (_) { /* Stays for this session. */ }
  }
  let userAlias = readAlias();
  function calendarTitle() {
    return "FICX 64 · mi programa";
  }
  function updateCalendarNote() {
    const note = document.querySelector("#settings-calendar-note");
    if (!note) return;
    const events = selectedPlanEvents();
    note.textContent = events.length
      ? `${events.length} ${events.length === 1 ? "pase" : "pases"} en tu calendario`
      : "Añade pases a la parrilla para exportarlos";
    const download = document.querySelector("#settings-ics");
    if (download) download.disabled = !events.length;
    const share = document.querySelector("#share-itinerary");
    if (share) share.disabled = !events.length;
  }
  function buildCalendar(events = selectedPlanEvents()) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FICX 64//Programa personal//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsEscape(calendarTitle())}`,
      "X-WR-TIMEZONE:Europe/Madrid",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Madrid",
      "BEGIN:STANDARD",
      "DTSTART:19701025T030000",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "TZNAME:CET",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700329T020000",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "TZNAME:CEST",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      ...events.map(calendarEvent),
      "END:VCALENDAR",
    ].join("\r\n");
  }
  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  let shareToastTimer = 0;
  function showShareToast(message) {
    const toast = document.querySelector("#share-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(shareToastTimer);
    shareToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
  }
  // Diálogo propio en vez de window.prompt: se estiliza, cuenta los 40 caracteres
  // y no vuelve a preguntar cuando el nombre es largo.
  // Ejemplos del propio catálogo; nunca se usan como nombre del usuario.
  function randomAliasPlaceholder() {
    const names = [...new Set(films.flatMap((film) => film.directors || []))]
      .filter((name) => typeof name === "string" && name.trim() && name.length <= 40);
    return names.length ? names[Math.floor(Math.random() * names.length)] : "Tu nombre o apodo";
  }
  function askAlias(kind = "itinerary") {
    const dialog = document.querySelector("#alias-dialog");
    const input = document.querySelector("#alias-input");
    const counter = document.querySelector("#alias-counter");
    if (!dialog || !input) return Promise.resolve("");
    const isItinerary = kind === "itinerary";
    document.querySelector("#alias-intro").textContent = isItinerary
      ? "Es opcional: aparecerá como «El itinerario de …» al abrir el enlace."
      : "Es opcional: aparecerá en la cabecera del enlace de tus listas.";
    document.querySelector("#alias-privacy-note").hidden = !isItinerary;
    // Con nombre guardado, el enlace sale ya firmado: basta confirmar.
    userAlias = readAlias();
    input.value = userAlias;
    input.placeholder = randomAliasPlaceholder();
    counter.textContent = `${input.value.length}/40`;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        input.removeEventListener("input", onInput);
        dialog.removeEventListener("close", onClose);
        document.querySelector("#alias-cancel").removeEventListener("click", onCancel);
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onInput = () => { counter.textContent = `${input.value.length}/40`; };
      // Esc o el botón cerrar disparan "close" sin value: cuenta como cancelar.
      const onClose = () => finish(dialog.returnValue === "ok" ? input.value : null);
      const onCancel = () => finish(null);
      input.addEventListener("input", onInput);
      dialog.addEventListener("close", onClose);
      document.querySelector("#alias-cancel").addEventListener("click", onCancel);
      dialog.showModal();
      input.focus();
    });
  }
  async function sharePassLink(candidateIds) {
    // Charlas y actividades no llevan películas: decodePassLink los descarta y el enlace llegaría vacío.
    candidateIds = candidateIds.filter((candidateId) => (findScreening(candidateId)?.filmIds || []).length);
    if (!candidateIds.length) {
      showShareToast("Ese pase no se puede compartir");
      return;
    }
    // El alias es opcional: se usa para saludar en la pantalla de recepción.
    const answer = await askAlias("itinerary");
    if (answer === null) return;
    if (answer.trim()) { userAlias = answer.trim().slice(0, 40); persistAlias(userAlias); }
    const fragment = await encodePassLink(candidateIds, answer);
    const url = `${window.location.href.split("#")[0]}#pases=${fragment}`;
    if (navigator.share) {
      try { await navigator.share({ title: calendarTitle(), url }); return; } catch (_) { /* Cancelado: se muestra igual. */ }
    }
    // Se copia si el navegador deja, pero el enlace siempre queda a la vista.
    copyToClipboard(url).catch(() => {});
    showShareLink(url);
  }
  function showShareLink(url, kind = "passes") {
    const intro = document.querySelector("#share-dialog-intro");
    intro.innerHTML = kind === "lists"
      ? "Puedes enviarlo a quien quieras: verá tus listas y elegirá cuáles añadir. <b>Quien tenga el enlace podrá ver qué películas quieres ver.</b>"
      : "Puedes enviarlo a quien quieras: verá los pases y elegirá cuáles añadir. <b>Quien tenga el enlace podrá ver tu itinerario.</b>";
    const dialog = document.querySelector("#share-dialog");
    const field = document.querySelector("#share-url");
    if (!dialog || !field) return;
    field.value = url;
    const copy = document.querySelector("#share-copy");
    copy.textContent = "Copiar";
    copy.onclick = async () => {
      try { await copyToClipboard(url); copy.textContent = "¡Copiado!"; } catch (_) { field.select(); copy.textContent = "Copia manualmente"; }
      setTimeout(() => { copy.textContent = "Copiar"; }, 1800);
    };
    if (!dialog.open) dialog.showModal();
    field.select();
  }
  // El test de Playwright abre y cierra la función para no depender de un prompt real.
  // El test de Playwright abre y cierra la función para no depender de un prompt real.
  window.sharePassLink = sharePassLink;
  function calendarCountText() {
    const events = selectedPlanEvents();
    return events.length
      ? `${events.length} ${events.length === 1 ? "pase" : "pases"} listos para tu calendario`
      : "Añade pases a la parrilla para exportarlos";
  }
  // El mismo pase en un .ics suelto: la app no obliga a pasar por Google.
  function calendarFileName(screening) {
    const slug = (screening.films || []).map((film) => film.title).join("-") || screening.title || "pase";
    const clean = slug.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `ficx64-${clean || "pase"}.ics`;
  }
  function buildSingleCalendar(screening) {
    return buildCalendar([screening]);
  }
  let calendarMenu = null;
  function closeCalendarMenu() {
    if (calendarMenu) { calendarMenu.remove(); calendarMenu = null; }
    document.querySelectorAll('[data-program-action="calendar-event"][aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  function openCalendarMenu(button, candidateId) {
    const alreadyOpen = calendarMenu && calendarMenu.dataset.candidate === candidateId;
    closeCalendarMenu();
    if (alreadyOpen) return;
    const screening = findScreening(candidateId);
    if (!screening) return;
    const title = (screening.films || []).map((film) => film.title).join(", ") || screening.title || "el pase";
    const menu = document.createElement("div");
    menu.className = "calendar-menu";
    menu.dataset.candidate = candidateId;
    menu.setAttribute("role", "menu");
    menu.innerHTML = `<p class="calendar-menu-title">${escapeHtml(title)}</p>
      <button type="button" role="menuitem" data-program-action="calendar-google" data-candidate-id="${escapeHtml(candidateId)}">Añadir a Google Calendar</button>
      <button type="button" role="menuitem" data-program-action="calendar-ics" data-candidate-id="${escapeHtml(candidateId)}">Descargar .ics</button>`;
    document.body.append(menu);
    const box = button.getBoundingClientRect();
    menu.style.top = `${Math.min(box.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    button.setAttribute("aria-expanded", "true");
    calendarMenu = menu;
  }
  document.addEventListener("click", (event) => {
    if (!calendarMenu) return;
    const item = event.target.closest(".calendar-menu [data-program-action]");
    if (item) {
      const screening = findScreening(item.dataset.candidateId);
      if (screening && item.dataset.programAction === "calendar-google") window.open(googleEventUrl(screening), "_blank", "noopener");
      if (screening && item.dataset.programAction === "calendar-ics") {
        downloadBlob(buildSingleCalendar(screening), "text/calendar;charset=utf-8", calendarFileName(screening));
      }
      closeCalendarMenu();
      event.stopPropagation();
      return;
    }
    if (event.target.closest("[data-program-action=\"calendar-event\"]")) return;
    closeCalendarMenu();
  }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCalendarMenu(); });

  function googleEventUrl(screening) {
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: calendarEvent(screening).match(/SUMMARY:(.*)/)[1].replace(/\\,/g, ","),
      dates: `${icsLocal(screening.date, screening.time)}/${icsLocal(screening.date, screening.time, plannedMinutes(screening) || 90)}`,
      ctz: "Europe/Madrid",
      location: `${screening.venue}${screening.room ? ` · ${screening.room}` : ""}`,
      details: "Programa personal FICX 64",
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  // El nombre, si lo hay, va en el fichero: «pelayo-programaficx64.json». Sin acentos ni espacios.
  function exportFileName() {
    const alias = userAlias.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return alias ? `${alias}-programaficx64.json` : "ficx64-programa.json";
  }
  function buildExportPayload() {
    return {
      app: "ficx64-programa",
      version: 1,
      exportedAt: new Date().toISOString(),
      filmIntentions: Object.fromEntries(intentions),
      plannedScreenings: Object.fromEntries(plannedScreenings),
      discarded: [...discarded],
      prioritized: [...prioritized],
      pinnedSections,
      transportMode,
      alias: userAlias,
    };
  }
  function updateSettingsPanel() {
    const hasData = hasUserData();
    settingsEmpty.hidden = hasData;
    settingsReady.hidden = !hasData;
    settingsToggle.classList.toggle("has-nudge", !hasData);
    if (hasData) {
      const passCount = selectedPlanEvents().length;
      const filmsText = `${intentions.size} ${intentions.size === 1 ? "película" : "películas"}`;
      const guardadas = intentions.size === 1 ? "guardada" : "guardadas";
      const passesText = passCount ? ` y <b>${passCount} ${passCount === 1 ? "pase" : "pases"}</b> en tu parrilla` : "";
      settingsSummary.innerHTML = `Tienes <b>${filmsText}</b> ${guardadas}${passesText}.`;
    }
  }
  function showSettingsMain() {
    settingsExportView.hidden = true;
    settingsImportView.hidden = true;
    updateSettingsPanel();
  }
  function showSettingsExport() {
    settingsExportCode.value = encodeProgram(buildExportPayload());
    settingsExportView.hidden = false;
    settingsReady.hidden = true;
    settingsEmpty.hidden = true;
    settingsImportView.hidden = true;
  }
  function showSettingsImport() {
    settingsImportView.hidden = false;
    settingsReady.hidden = true;
    settingsEmpty.hidden = true;
    settingsExportView.hidden = true;
    settingsImportCode.value = "";
    settingsFeedback.textContent = "";
    settingsFeedback.className = "settings-feedback";
  }
  // ---- Asistente de bienvenida ----
  const wizardStepKey = "ficx64-onboarding-step-v1";
  const wizardDoneKey = "ficx64-onboarding-done-v1";
  const wizard = document.querySelector("#wizard");
  const wizardStepLabels = { 1: "Bienvenida", 2: "Ajustes", 3: "Mi lista", 4: "Tu parrilla", 5: "Llévatelo" };
  const isEmbeddedBrowser = /WhatsApp|FBAN|FBAV|Instagram/i.test(navigator.userAgent)
    || (navigator.userAgent.includes(" wv)"));
  if (isEmbeddedBrowser) document.querySelector("#wizard-webview").hidden = false;
  let wizardStep = 1;
  // El paso 2 pregunta a pregunta: se ven los ajustes que ya se han contestado en esta visita.
  const wizardAnswered = new Set();
  let wizardDemoFilm = null;
  // La práctica del asistente es una demostración: vive solo aquí y nunca toca las listas del usuario.
  let wizardDemoIntent = null;
  // El paso 4 revela los pases por capas: A solo, luego B con su traslado, luego C con su choque.
  let wizardDemoBShown = false;
  // El paso 4 enseña tres pases reales (A, B y un C que solapa con B) sin añadirlos a nada.
  let wizardDemoA = null;
  let wizardDemoB = null;
  let wizardDemoC = null;
  let wizardPairKey = "";
  let wizardThird = null;
  let wizardDemoStarred = false;
  let wizardDemoDiscarded = false;
  function readWizardStep() {
    try {
      const saved = Number(localStorage.getItem(wizardStepKey));
      return saved >= 1 && saved <= 5 ? saved : 1;
    } catch (_) { return 1; }
  }
  function saveWizardStep(step) {
    try { localStorage.setItem(wizardStepKey, String(step)); } catch (_) { /* Keep it for this session. */ }
  }
  // La demo repinta la tarjeta entera con los controles reales del listado y su propio estado:
  // nada de esto se guarda.
  function renderWizard() {
    // «Siguiente» cerrado no basta: el pie dice por qué y cuánto queda.
    const pending = wizardStep === 2 && !wizardSettingsAnswered();
    const next = document.querySelector("#wizard-next");
    next.disabled = pending;
    if (pending) {
      const left = wizardSettings.filter((item) => !item.optional && !wizardAnswered.has(item.id)).length;
      next.title = `Te queda${left === 1 ? "" : "n"} ${left} pregunta${left === 1 ? "" : "s"} por contestar`;
      next.setAttribute("aria-describedby", "wizard-settings-note");
    } else {
      next.removeAttribute("title");
      next.removeAttribute("aria-describedby");
    }
    document.querySelector("#wizard-progress-text").textContent = `PASO ${wizardStep} DE 5`;
    document.querySelector("#wizard-live").textContent = `Paso ${wizardStep} de 5`;
    for (let step = 1; step <= 5; step += 1) {
      document.querySelector(`#wizard-step-${step}`).hidden = step !== wizardStep;
    }
    // La lista lateral (solo escritorio) repite los títulos de cada paso: informativa, no navegable.
    document.querySelector("#wizard-dots").innerHTML = [1, 2, 3, 4, 5]
      .map((step) => `<li class="${step === wizardStep ? "is-current" : step < wizardStep ? "is-done" : ""}">${escapeHtml(wizardStepLabels[step])}</li>`).join("");
    document.querySelector("#wizard-back").hidden = wizardStep === 1;
    document.querySelector("#wizard-next").textContent = wizardStep === 5 ? "Empezar a explorar" : "Siguiente";
    renderWizardSettings();
    if (wizardStep === 3 && wizardDemoFilm) renderWizardDemo();
    const note = document.querySelector("#wizard-settings-note");
    const left = wizardSettings.filter((item) => !item.optional && !wizardAnswered.has(item.id)).length;
    note.innerHTML = !pending
      ? "Hecho. Puedes cambiarlo cuando quieras en <b>Ajustes</b>."
      : left === 4
        ? "Nada viene elegido: responde cada pregunta y <b>Siguiente</b> se abrirá."
        : `Te queda${left === 1 ? "" : "n"} <b>${left} pregunta${left === 1 ? "" : "s"}</b> por contestar.`;
    document.querySelector("#wizard-next").title = pending ? note.textContent : "";
  }
  // Ajustes del paso 2, por orden: cada uno se pinta solo cuando los anteriores están contestados.
  const wizardSettings = [
    { id: "wizard-transport", pick: (button) => button.dataset.transport },
    { id: "wizard-images", pick: (button) => button.dataset.images },
    { id: "wizard-theme", pick: (button) => button.dataset.wizardTheme },
    { id: "wizard-special", pick: (button) => button.dataset.special },
    // Opcional: se ve al final y no cuenta para «Siguiente».
    { id: "wizard-name", pick: (button) => button.dataset.name, optional: true },
  ];
  function wizardSettingsAnswered() {
    return wizardSettings.every(({ id, optional }) => optional || wizardAnswered.has(id));
  }
  // Devuelve el ajuste que acaba de entrar, para animarlo; sin `prefers-reduced-motion`, sin animación.
  function renderWizardSettings() {
    const open = wizardSettings.find((item) => !item.optional && !wizardAnswered.has(item.id))?.id;
    let shown = null;
    wizardSettings.forEach(({ id, optional }) => {
      const field = document.querySelector(`#${id}`).closest("fieldset");
      const visible = wizardAnswered.has(id) || open === id || Boolean(optional);
      if (visible && !field.hidden) return;
      field.hidden = !visible;
      // Lo opcional no se anima: no está entrando, siempre estuvo.
      if (visible && !optional) shown = field;
    });
    if (shown && wizardStep === 2) shown.classList.add("is-new");
    return shown;
  }
  function goToOnboardingStep(step) {
    wizardStep = Math.min(5, Math.max(1, step));
    saveWizardStep(wizardStep);
    if (wizard.open) renderWizardChoices();
    renderWizard();
    if (wizardStep === 3) renderWizardDemo();
    // El paso 4 se repinta al entrar: el par depende del transporte y de los pases especiales.
    if (wizardStep === 4) {
      renderWizardTransfers();
      renderWizardPassNote();
    }
  }
  function openOnboarding(step = readWizardStep()) {
    // La introducción siempre se ve desde el principio: nada se arrastra de la visita anterior.
    wizardDemoIntent = null;
    wizardDemoStarred = wizardDemoDiscarded = false;
    wizardDemoBShown = false;
    wizardDemoC = null;
    userAlias = readAlias();
    document.querySelector("#wizard-name").placeholder = randomAliasPlaceholder();
    goToOnboardingStep(step);
    if (!wizard.open) wizard.showModal();
    // Repinta ya abierto: al arrancar la app las elecciones se pintan antes del primer layout.
    renderWizardChoices();
  }
  function closeOnboarding(markDone = false) {
    if (markDone) {
      try { localStorage.setItem(wizardDoneKey, "true"); } catch (_) { /* Nothing to remember. */ }
      try { localStorage.removeItem(wizardStepKey); } catch (_) { /* Nothing to forget. */ }
    }
    if (wizard.open) wizard.close();
  }
  document.querySelector("#wizard-next").addEventListener("click", () => {
    if (wizardStep === 5) closeOnboarding(true);
    else goToOnboardingStep(wizardStep + 1);
  });
  document.querySelector("#wizard-back").addEventListener("click", () => goToOnboardingStep(wizardStep - 1));
  document.querySelector("#wizard-skip").addEventListener("click", () => closeOnboarding(true));
  // Cerrar sin querer (Esc) solo guarda el paso: la introducción sigue pendiente.
  wizard.addEventListener("cancel", (event) => { event.preventDefault(); closeOnboarding(false); });
  document.querySelector("#replay-wizard").addEventListener("click", () => openOnboarding(1));

  // Solo se marca lo que el usuario ha contestado en el paso 2. El valor guardado de la app no
  // nace marcado: si lo hiciera, no habría nada que decidir ni forma de saber qué falta.
  // El nombre es opcional: se guarda tal como se escribe y nunca frena el paso.
  function syncWizardName() {
    const input = document.querySelector("#wizard-name");
    if (input && document.activeElement !== input) input.value = userAlias;
  }
  document.querySelector("#wizard-name").addEventListener("input", (event) => {
    userAlias = event.target.value.trim().slice(0, 40);
    persistAlias(userAlias);
  });
  function renderWizardChoices() {
    const marks = {
      "wizard-transport": (button) => button.dataset.transport === transportMode && wizardAnswered.has("wizard-transport"),
      "wizard-images": (button) => (button.dataset.images === "true") === remoteImagesEnabled && wizardAnswered.has("wizard-images"),
      "wizard-theme": (button) => button.dataset.wizardTheme === themePreference && wizardAnswered.has("wizard-theme"),
      "wizard-special": (button) => (button.dataset.special === "true") === includeSpecialInProgram && wizardAnswered.has("wizard-special"),
    };
    Object.entries(marks).forEach(([id, isActive]) => {
      document.querySelectorAll(`#${id} button`).forEach((button) => {
        const active = isActive(button);
        button.classList.toggle("is-current", active);
        button.setAttribute("aria-pressed", String(active));
      });
    });
    syncWizardName();
  }
  // Mismo estado que el interruptor de Ajustes: una sola variable y un solo guardado.
  document.querySelector("#wizard-special").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-special]");
    if (!button) return;
    includeSpecialInProgram = button.dataset.special === "true";
    persistIncludeSpecial();
    syncSpecialToggle();
    renderProgram();
    updateSessionSummary();
    renderWizardChoices();
  });
  document.querySelector("#wizard-theme").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-wizard-theme]");
    if (!button) return;
    applyTheme(button.dataset.wizardTheme);
    renderWizardChoices();
  });
  document.querySelector("#wizard-step-2").addEventListener("click", (event) => {
    const button = event.target.closest(".wizard-choices button");
    if (!button) return;
    const setting = wizardSettings.find(({ id }) => button.closest(`#${id}`));
    if (!setting || wizardAnswered.has(setting.id)) return;
    wizardAnswered.add(setting.id);
    renderWizard();
    const entered = document.querySelector(`#wizard-step-2 .wizard-field.is-new .wizard-choices button`);
    if (entered) entered.focus({ preventScroll: true });
  }, true);
  document.querySelector("#wizard-transport").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-transport]");
    if (!button) return;
    transportMode = button.dataset.transport;
    try { localStorage.setItem(transportStorageKey, transportMode); } catch (_) { /* Keep it. */ }
    transportSelect.value = transportMode;
    settingsTransport.value = transportMode;
    renderWizardChoices();
    // Con otro transporte, A y B pueden ya no caber: se vuelven a elegir y a calcular.
    renderWizardTransfers();
    renderWizardPassNote();
    renderProgram();
  });
  document.querySelector("#wizard-images").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-images]");
    if (!button) return;
    remoteImagesEnabled = button.dataset.images === "true";
    try { localStorage.setItem(remoteImagesStorageKey, String(remoteImagesEnabled)); } catch (_) { /* Keep it. */ }
    remoteImagesToggle.checked = remoteImagesEnabled;
    updateRemoteImagesStatus();
    renderFilms();
    renderWizardChoices();
  });

  // El pase elegido en la demo no entra en la parrilla: solo se dice qué es.
  // El cálculo de traslados y choques vive en renderWizardPassNote, sobre A, B y C.
  function wizardPassNote(screening) {
    const clock = formatClock(startMinute(screening) + plannedMinutes(screening));
    return `<p class="wizard-hint">Este pase acabaría a las ${escapeHtml(clock)} y quedaría en «Mi programa», en la parrilla por días.</p>`;
  }
  // Pase real del catálogo que solapa con el de la demo: sirve para enseñar el aviso de choque.
  // Solo se recuerda; nunca se añade a la parrilla del usuario.
  function pickClashingScreening(demo) {
    if (!demo) return null;
    const start = startMinute(demo);
    const end = start + plannedMinutes(demo);
    const clash = screeningRecords
      .filter((item) => item.accessType === "public" && item.date === demo.date && item.candidateId !== demo.candidateId)
      .find((item) => {
        const otherStart = startMinute(item);
        const otherEnd = otherStart + plannedMinutes(item);
        return otherStart < end && otherEnd > start;
      }) || null;
    return clash && clash.filmIds && clash.filmIds.length
      ? { filmId: clash.filmIds[0], candidateId: clash.candidateId }
      : null;
  }
  // La demo usa datos reales del catálogo: si no hay película con sinopsis y pase, no promete nada.
  function pickWizardDemo() {
    // La película se elige una vez: al volver al paso 3 la demo sigue donde se dejó.
    wizardDemoFilm = wizardDemoFilm
      || films.find((film) => film.synopsis && (film.screenings || []).some((item) => item.accessType === "public")) || films[0] || null;
    if (!wizardDemoFilm) return;
    // Tarjeta vacía con la cenefa: su contenido lo repinta renderWizardDemo con el estado de la demo.
    document.querySelector("#wizard-demo-film").innerHTML = `<article class="wizard-film"></article>`;
    renderWizardDemo();
  }
  // El paso 4 usa la misma parrilla que «Mi programa», sobre una lista de tres pases que solo
  // existe aquí: no se guarda nada.
  function wizardDemoEvents() {
    return [wizardDemoA, wizardDemoB, wizardDemoC].filter(Boolean);
  }
  // Los pases de la demo, ya como la parrilla los tiene: filmIds y films enlazados.
  function wizardDemoScreening(screening) {
    const filmIds = screening.filmIds || [];
    return { ...screening, filmIds, films: filmIds.map((id) => filmById.get(id)).filter(Boolean) };
  }
  function renderWizardTransfers() {
    const cards = document.querySelector("#wizard-demo-pass");
    const layers = document.querySelector("#wizard-pass-layers");
    if (!cards || !layers) return;
    pickWizardPassPair();
    // Por capas: primero el pase A solo; el B y el C los pide el usuario, y cada uno trae su lectura.
    const third = wizardDemoC;
    document.querySelector("[data-wizard-layer='add-b']").hidden = wizardDemoBShown || !wizardDemoB;
    const addC = document.querySelector("[data-wizard-layer='add-c']");
    addC.hidden = !wizardDemoBShown || !wizardThird;
    addC.innerHTML = `<span class="wizard-layer-plus" aria-hidden="true">${wizardDemoC ? "−" : "+"}</span> ${wizardDemoC ? "Quita el pase C" : "Añade un pase C que solapa"}`;
    addC.classList.toggle("is-on", Boolean(wizardDemoC));
    addC.setAttribute("aria-pressed", String(Boolean(wizardDemoC)));
    document.querySelector("[data-wizard-layer='reset']").hidden = !wizardDemoBShown;
    if (!wizardDemoA) {
      cards.innerHTML = `<p class="wizard-hint">El catálogo no trae pases con duración para enseñar la parrilla.</p>`;
      return;
    }
    // Mismo orden que «Mi programa»: por hora, como `selectedPlanEvents`.
    const demo = [wizardDemoA, wizardDemoBShown ? wizardDemoB : null, third].filter(Boolean)
      .sort((a, b) => startMinute(a) - startMinute(b)).map(wizardDemoScreening);
    // En la parrilla las tarjetas dicen de qué día son; aquí basta con la fecha del encadenado.
    const date = `<h3>${escapeHtml(formatProgramDate(demo[0].date))}</h3>`;
    const heading = `<header>${date}<span>${demo.length} ${demo.length === 1 ? "pase" : "pases"}</span></header>`;
    // El análisis va sobre los pases que se ven, como `analyzeProgram(dayEvents)` en «Mi programa»
    // (si no, el traslado hasta el siguiente se mide contra un pase que no está en la demo).
    const { conflicts, uncertain } = analyzeProgram([...selectedPlanEvents(), ...demo]);
    cards.innerHTML = `<section class="program-day">${heading}<div class="program-day-events">${renderDayEvents(demo, conflicts, uncertain, null)}</div></section>`
      + wizardDemoChain(demo);
    // Los botones de la tarjeta (calendario, compartir, quitar) son de la parrilla del usuario y
    // aquí no habría nada que quitarte: la demo queda solo con lo que se lee.
    cards.querySelectorAll(".program-event-actions, .program-calendar-event, .program-share-event, .program-remove-event").forEach((button) => button.remove());
  }
  // Encadenado del día tal como lo leería «Mi programa», con las horas y sedes de los pases
  // que se ven. Solo con un pase elegido; si no, no hay nada que enseñar.
  function wizardDemoChain(demo) {
    if (!wizardDemoBShown || demo.length < 2) return "";
    const steps = demo
      .filter((item) => item.date === demo[0].date)
      .map((item) => `${escapeHtml(item.time)} · ${escapeHtml(`${item.venue}${item.room ? ` · ${item.room}` : ""}`)}`);
    return `<p class="wizard-demo-chain">Así se vería en Mi programa: ${steps.join(" → ")}</p>`;
  }
  // Cambia la línea del pie según se haya probado el pase o haya un solape; sin nada de eso
  // se queda la frase base, que es la que explica para qué sirve el ejemplo.
  function renderWizardPassNote() {
    const note = document.querySelector("#wizard-pass-note");
    if (!note) return;
    const { conflicts } = analyzeProgram(wizardDemoEvents());
    // Cada capa explica lo que acaba de aparecer; sin capas, la frase base.
    note.textContent = !wizardDemoBShown
      ? "Un pase suelto, como lo verás en «Mi programa»."
      : [...conflicts.values()].some((list) => list.length)
        ? "El pase C solapa con B, y así se marca en «Mi programa»."
        : "Con el pase B aparece la línea de traslado: salida, trayecto y entrada, con el hueco que sobra.";
  }

  // Par real A → B del catálogo: entre sedes si con el transporte elegido queda ruta con tiempos,
  // y si no, entre salas de la misma sede. El tercero es un pase real que solapa con B.
  // Se recalcula por transporte (y por pases especiales): A y B tienen que caber con ese modo.
  function pickWizardPassPair() {
    const key = `${transportMode}|${includeSpecialInProgram}`;
    if (wizardPairKey === key) return;
    wizardPairKey = key;
    wizardDemoA = wizardDemoB = wizardDemoC = null;
    wizardThird = null;
    const candidates = screeningRecords
      .filter((item) => plannedMinutes(item))
      .filter((item) => item.accessType === "public" || includeSpecialInProgram)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    // Ordenar por minutos para que la pareja se lea de arriba abajo.
    const sorted = [...candidates].sort((a, b) => startMinute(a) - startMinute(b));
    const fits = (first, second) => second !== first && second.date === first.date
      && startMinute(second) > startMinute(first) && startMinute(second) >= startMinute(first) + plannedMinutes(first)
      && first.venueGroup !== "other" && transferMinutes(first, second) !== null
      && startMinute(second) - (startMinute(first) + plannedMinutes(first)) >= transferMinutes(first, second);
    let best = Infinity;
    for (const first of sorted) {
      for (const second of sorted) {
        if (!fits(first, second)) continue;
        const margin = startMinute(second) - (startMinute(first) + plannedMinutes(first)) - transferMinutes(first, second);
        // Entre sedes enseña el traslado que importa; si no hay, vale la misma sede.
        const rank = (second.venueGroup !== first.venueGroup ? 0 : 1) * 1e6 + margin;
        if (rank < best) { best = rank; wizardDemoA = first; wizardDemoB = second; }
      }
    }
    if (wizardDemoA) {
      const bStart = startMinute(wizardDemoB);
      const bEnd = bStart + plannedMinutes(wizardDemoB);
      wizardThird = candidates.find((item) => item !== wizardDemoA && item !== wizardDemoB
        && item.date === wizardDemoB.date && startMinute(item) < bEnd && startMinute(item) + plannedMinutes(item) > bStart
        && startMinute(item) >= startMinute(wizardDemoA) + plannedMinutes(wizardDemoA)) || null;
    } else {
      // Ni siquiera la misma sede da una pareja: un pase suelto sigue enseñando cómo es una tarjeta.
      wizardDemoA = candidates[0] || null;
      wizardDemoB = null;
    }
  }
  // Repinta el paso 3 con lo probado en la demo (no con lo guardado: aquí no se guarda nada).
  function renderWizardDemo() {
    // La película de ejemplo se elige una sola vez; el resto de visitas conserva la demo.
    if (!wizardDemoFilm) pickWizardDemo();
    const card = document.querySelector("#wizard-demo-film .wizard-film");
    if (!card || !wizardDemoFilm) return;
    const status = wizardDemoIntent;
    const hasIntent = status === "want" || status === "maybe";
    // Como en «Mi lista»: la estrella de cada película, aquí solo si la demo le dio intención.
    const star = hasIntent && !wizardDemoDiscarded ? starButtonMarkup(wizardDemoFilm, wizardDemoStarred) : "";
    // La película descartada sale del listado y solo deja «Restaurar», como su tarjeta.
    card.innerHTML = `<p class="eyebrow">Ejemplo</p>
      <div class="wizard-film-main"><h3><span>${escapeHtml(wizardDemoFilm.title)}</span>${star}</h3>
      <p class="wizard-film-credit">${escapeHtml(directorText(wizardDemoFilm))}</p>
      <div class="wizard-film-actions">${wizardDemoDiscarded
        ? intentButtonMarkup("discard", { film: wizardDemoFilm, discardedFlag: true })
        : `${intentButtonMarkup("want", { film: wizardDemoFilm, status: status || null })}${intentButtonMarkup("maybe", { film: wizardDemoFilm, status: status || null })}${hasIntent ? "" : intentButtonMarkup("discard", { film: wizardDemoFilm })}`}</div></div>`;
    document.querySelector("#wizard-branches-hint").hidden = false;
  }
  document.querySelector("#wizard-step-3").addEventListener("click", (event) => {
    const button = event.target.closest("#wizard-demo-film button");
    if (!button || !wizardDemoFilm) return;
    // Los controles son los reales del listado: se responde a sus acciones, sin guardar nada.
    if (button.dataset.action === "intent") {
      // El mismo botón pulsado otra vez deja la película sin intención en la demo.
      wizardDemoIntent = wizardDemoIntent === button.dataset.status ? null : button.dataset.status;
      if (!wizardDemoIntent) wizardDemoStarred = false;
    } else if (button.dataset.action === "prioritize") {
      wizardDemoStarred = !wizardDemoStarred;
    } else if (button.dataset.action === "discard") {
      // Restaurar la devuelve a la demo tal como estaba antes de descartarla.
      wizardDemoDiscarded = !wizardDemoDiscarded;
      if (wizardDemoDiscarded) wizardDemoIntent = null;
    }
    renderWizardDemo();
  });
  document.querySelector("#wizard-step-4").addEventListener("click", (event) => {
    const layer = event.target.closest("button[data-wizard-layer]");
    if (!layer) return;
    // Cada capa se añade y se puede deshacer volviendo al primer pase.
    if (layer.dataset.wizardLayer === "add-b") wizardDemoBShown = true;
    else if (layer.dataset.wizardLayer === "add-c") wizardDemoC = wizardDemoC ? null : wizardThird;
    else { wizardDemoBShown = false; wizardDemoC = null; }
    renderWizardTransfers();
    renderWizardPassNote();
  });

  function showOnboardingIfNeeded() {
    let done = false;
    try { done = localStorage.getItem(wizardDoneKey) === "true"; } catch (_) { /* Fall back to showing it. */ }
    if (!done && !hasUserData()) openOnboarding();
  }
  function importProgram(payload) {
    if (!payload || typeof payload !== "object") throw new Error("invalid");
    // El nombre viaja con el programa: al importarlo en otro dispositivo viene puesto.
    if (!userAlias && typeof payload.alias === "string" && payload.alias.trim()) {
      userAlias = payload.alias.trim().slice(0, 40);
      persistAlias(userAlias);
    }
    const validIds = new Set(films.map((film) => film.id));
    const validCandidates = new Set(screeningRecords.map((screening) => screening.candidateId));
    let addedIntents = 0;
    let addedPasses = 0;
    if (payload.filmIntentions && typeof payload.filmIntentions === "object") {
      for (const [id, status] of Object.entries(payload.filmIntentions)) {
        if (validIds.has(id) && !discarded.has(id) && ["want", "maybe"].includes(status)) { intentions.set(id, status); addedIntents += 1; }
      }
    }
    if (payload.plannedScreenings && typeof payload.plannedScreenings === "object") {
      for (const [id, candidateId] of Object.entries(payload.plannedScreenings)) {
        if (validIds.has(id) && !discarded.has(id) && validCandidates.has(candidateId)) { plannedScreenings.set(id, candidateId); addedPasses += 1; }
      }
    }
    if (Array.isArray(payload.discarded)) {
      for (const id of payload.discarded) {
        if (validIds.has(id)) {
          discarded.add(id);
          intentions.delete(id);
          plannedScreenings.delete(id);
        }
      }
    }
    for (const id of discarded) prioritized.delete(id);
    if (Array.isArray(payload.prioritized)) {
      for (const id of payload.prioritized) {
        if (validIds.has(id) && !discarded.has(id) && intentions.has(id)) prioritized.add(id);
      }
    }
    if (Array.isArray(payload.pinnedSections)) {
      const available = availableSections();
      for (const name of payload.pinnedSections) {
        if (available.includes(name) && !pinnedSections.includes(name) && pinnedSections.length < maxPinnedSections) pinnedSections.push(name);
      }
    }
    persist(); persistPlannedScreenings(); persistDiscarded(); persistPrioritized(); persistPinnedSections(); renderSaved();
    return { addedIntents, addedPasses };
  }
  function handleImportText(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      settingsFeedback.textContent = "Pega o carga un código primero.";
      settingsFeedback.className = "settings-feedback is-error";
      return;
    }
    let payload;
    try {
      payload = trimmed.startsWith("{") ? JSON.parse(trimmed) : decodeProgram(trimmed);
    } catch (_) {
      settingsFeedback.textContent = "No reconocemos ese código. Revísalo y vuelve a intentarlo.";
      settingsFeedback.className = "settings-feedback is-error";
      return;
    }
    try {
      const { addedIntents, addedPasses } = importProgram(payload);
      // Imported discarded films also change the visible count.
      countVisibleFilms();
      renderFilms();
      const parts = [`${addedIntents} ${addedIntents === 1 ? "película" : "películas"}`];
      if (addedPasses) parts.push(`${addedPasses} ${addedPasses === 1 ? "pase" : "pases"}`);
      settingsFeedback.textContent = `Importado: ${parts.join(" y ")}.`;
      settingsFeedback.className = "settings-feedback is-ok";
      setTimeout(showSettingsMain, 1400);
    } catch (_) {
      settingsFeedback.textContent = "El código no contiene un programa válido.";
      settingsFeedback.className = "settings-feedback is-error";
    }
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((resolve) => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (_) { /* Clipboard unavailable. */ }
      area.remove();
      resolve();
    });
  }

  document.querySelector("#settings-ics").addEventListener("click", () => {
    downloadBlob(buildCalendar(), "text/calendar;charset=utf-8", "ficx64-programa.ics");
    document.querySelector("#settings-calendar-feedback").textContent = "Calendario descargado. Ábrelo para añadirlo a tu app de calendario.";
  });
  document.querySelector("#share-itinerary").addEventListener("click", () => {
    sharePassLink(selectedPlanEvents().map((screening) => screening.candidateId)).catch(() => {});
  });

  document.querySelector("#shared-list").addEventListener("click", (event) => {
    // El título abre la ficha; desde ella las flechas recorren las películas de este enlace.
    const button = event.target.closest("button[data-open-film], button[data-open-shared-film]");
    if (!button) return;
    event.preventDefault();
    const filmId = button.dataset.openFilm || button.dataset.openSharedFilm;
    const film = films.find((item) => item.id === filmId);
    if (!film) return;
    sharedScrollY = window.scrollY;
    returnToShared = true;
    // Captura la lista visible y su orden al abrir, incluidos los filtros activos.
    filmNavigationIds = sharedListsOnly
      ? [...document.querySelectorAll("#shared-list [data-shared-row]")].map((row) => row.dataset.sharedRow)
      : [...new Set(sharedPasses.flatMap((id) => findScreening(id)?.filmIds || []))];
    activeSection = "";
    search.value = "";
    moreSections.value = "";
    expandedId = film.id;
    renderSectionPicker();
    renderFilms();
    switchScreen("explore", { scrollTop: false });
  });

  document.querySelector("#shared-list").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-shared-pass]");
    if (!input) return;
    if (input.checked) sharedSelection.add(input.dataset.sharedPass);
    else sharedSelection.delete(input.dataset.sharedPass);
    syncSharedCount();
  });
  document.querySelector("#shared-mark-fitting").addEventListener("click", () => {
    sharedPasses.forEach((candidateId) => {
      if (sharedPassState(candidateId).disabled) return;
      sharedSelection.add(candidateId);
      const input = document.querySelector(`input[data-shared-pass="${CSS.escape(candidateId)}"]`);
      if (input) input.checked = true;
    });
    syncSharedCount();
  });
  document.querySelector("#shared-clear").addEventListener("click", () => {
    sharedSelection.clear();
    document.querySelectorAll("input[data-shared-pass]").forEach((input) => { input.checked = false; });
    syncSharedCount();
    syncSharedListCount();
  });
  // Elegir la lista de cada película: el mismo gesto que en la tarjeta, sin pasar por ella.
  document.querySelector("#shared-list").addEventListener("click", (event) => {
    // Prioridad al momento, como en el catálogo: no cambia de lista, solo el orden.
    const star = event.target.closest("button[data-action='prioritize']");
    if (star && sharedListsOnly) {
      const id = star.dataset.id;
      if (prioritized.has(id)) prioritized.delete(id);
      else prioritized.add(id);
      persistPrioritized();
      // Repintar conserva lo elegido y la posición: cambiar la estrella no debe mover nada.
      const scroll = window.scrollY;
      renderSharedFilmsOnly();
      syncSharedListCount();
      window.scrollTo(0, scroll);
      return;
    }
    const button = event.target.closest("button[data-add-status]");
    if (!button || !sharedListsOnly) return;
    const filmId = button.dataset.id || button.closest("[data-shared-for]")?.dataset.sharedFor || "";
    if (!filmId || sharedListState(filmId).disabled) return;
    const value = button.dataset.addStatus === "maybe" ? "maybe" : "want";
    // Lo marcado es lo que se va a guardar: tocar el mismo botón lo quita de verdad.
    const nowShown = sharedListChoices.has(filmId) ? sharedListChoices.get(filmId) : (intentions.get(filmId) || null);
    if (nowShown === value) sharedListChoices.set(filmId, null);
    else sharedListChoices.set(filmId, value);
    // Se repinta solo la botonera, no la tarjeta entera (que lleva el estado y el aviso).
    button.parentElement.outerHTML = suggestions(filmId, filmById.get(filmId), sharedListState(filmId));
    syncSharedListCount();
  });
  document.querySelector("#shared-list-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-shared-filter]");
    if (!button) return;
    sharedListFilter = button.dataset.sharedFilter;
    renderSharedFilmsOnly(); syncSharedListCount();
    document.querySelector(`[data-shared-filter="${sharedListFilter}"]`)?.focus();
  });
  document.querySelector("#shared-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-shared-recover]");
    if (!button || !sharedListsOnly) return;
    const id = button.dataset.sharedRecover;
    sharedRecovered.add(id); sharedListChoices.set(id, "want");
    renderSharedFilmsOnly(); syncSharedListCount();
    document.querySelector(`[data-shared-row="${CSS.escape(id)}"] button[data-add-status]`)?.focus();
  });
  document.querySelector("#shared-view-lists").addEventListener("click", () => {
    switchScreen("explore");
    document.querySelector("#mi-programa").scrollIntoView({block: "start"});
    if (window.matchMedia("(max-width: 650px)").matches) openSelectionSheet(true);
  });
  document.querySelector("#shared-keep-looking").addEventListener("click", () => {
    document.querySelector("#shared-list-filters button")?.focus();
    document.querySelector("#shared-list-filters").scrollIntoView({block: "center"});
  });
  document.querySelector("#shared-add").addEventListener("click", () => {
    if (sharedListsOnly) {
      const changes = [...sharedListChanges()];
      const moved = changes.filter(([id, status]) => status && intentions.has(id)).length;
      const removed = changes.filter(([, status]) => status === null).length;
      const maybe = changes.filter(([, status]) => status === "maybe").length;
      const wanted = changes.filter(([, status]) => status === "want").length;
      const added = addSharedFilms();
      if (!added) {
        renderSharedListScreen(sharedListFilms, sharedAlias);
        document.querySelector("#shared-feedback").textContent = "No se pudo añadir nada: esas películas están descartadas.";
        return;
      }
      renderSharedListScreen(sharedListFilms, sharedAlias);
      document.querySelector("#shared-feedback").textContent = `Cambios guardados: ${wanted} para ver · ${maybe} quizás · ${removed} quitadas.${moved ? ` ${moved} cambiadas de lista.` : ""}`;
      document.querySelector("#shared-view-lists").hidden = false;
      document.querySelector("#shared-keep-looking").hidden = false;
      document.querySelector("#shared-dismiss").textContent = "Cerrar";
      return;
    }
    const added = addSharedPasses();
    if (!added) {
      // Nothing cleared: addSharedPasses only resets the screen state when something was saved.
      renderSharedScreen(sharedPasses, sharedAlias);
      document.querySelector("#shared-feedback").textContent = "No se pudo añadir nada: todas las películas de estos pases están descartadas.";
      return;
    }
    document.querySelector("#shared-feedback").textContent = `Añadidos ${added} ${added === 1 ? "pase" : "pases"}.`;
  });
  // Compartir «Mis listas»: mismo diálogo opcional de nombre que el itinerario.
  document.querySelector("#share-lists").addEventListener("click", async () => {
    const entries = [...intentions.entries()]
      .filter(([filmId]) => filmById.has(filmId) && !discarded.has(filmId))
      .map(([filmId, status]) => [filmId, status, prioritized.has(filmId) ? 1 : 0]);
    const button = document.querySelector("#share-lists");
    if (!entries.length) {
      button.disabled = true;
      button.textContent = "Comparte cuando tengas alguna en tus listas";
      return;
    }
    const answer = await askAlias("lists");
    if (answer === null) return;
    if (answer.trim()) { userAlias = answer.trim().slice(0, 40); persistAlias(userAlias); }
    const fragment = await encodeListLink(entries, answer);
    const url = `${window.location.href.split("#")[0]}#listas=${fragment}`;
    if (navigator.share) {
      try { await navigator.share({ title: "FICX 64 · mis listas", url }); return; } catch (_) { /* Cancelado: se muestra igual. */ }
    }
    copyToClipboard(url).catch(() => {});
    showShareLink(url, "lists");
  });
  document.querySelector("#shared-dismiss").addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    switchScreen("explore");
  });
  document.querySelector("#shared-explore").addEventListener("click", () => {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    document.querySelector("#shared-feedback").textContent = "";
    switchScreen("explore");
  });
  // Un mismo enlace puede pegarse con la pestaña ya abierta: solo cambia el hash.
  function handleSharedLink() {
    readSharedList().then((lists) => {
      if (lists === null) return false;
      if (!lists.lists.length) {
        renderSharedListScreen([], lists.alias);
        document.querySelector("#shared-summary").textContent = "Este enlace no es válido o no queda ninguna película disponible.";
        document.querySelector("#shared-feedback").textContent = "Pide un enlace nuevo a quien te lo envió o vuelve a Explorar.";
        document.querySelector("#shared-add").hidden = true;
        document.querySelector("#shared-dismiss").hidden = true;
        document.querySelector(".shared-tools").hidden = true;
        document.querySelector("#shared-explore").hidden = false;
        return true;
      }
      renderSharedListScreen(lists.lists, lists.alias);
      return true;
    }).then((handled) => { if (!handled) return handleSharedPassLink(); });
  }
  function handleSharedPassLink() {
    readSharedPasses().then((shared) => {
    if (shared === null) return;
    if (!shared.passes.length) {
      switchScreen("shared");
      document.querySelector("#shared-title").innerHTML = `Te han compartido <span>un itinerario.</span>`;
      document.querySelector("#shared-count").hidden = true;
      document.querySelector("#shared-summary").textContent = "Este enlace no es válido o no queda ningún pase disponible.";
      document.querySelector("#shared-list").innerHTML = "";
      document.querySelector("#shared-feedback").textContent = "Pide un enlace nuevo a quien te lo envió o vuelve a Explorar.";
      document.querySelector("#shared-explore").hidden = false;
      // Sin pases no hay nada que añadir ni descartar: Explorar queda como única acción.
      document.querySelector("#shared-add").hidden = true;
      document.querySelector("#shared-dismiss").hidden = true;
      document.querySelector(".shared-tools").hidden = true;
      return;
    }
    renderSharedScreen(shared.passes, shared.alias);
    });
  }
  handleSharedLink();
  window.addEventListener("hashchange", handleSharedLink);

  const calendarToggle = document.querySelector("#program-calendar-toggle");
  const calendarPanel = document.querySelector("#program-calendar-panel");
  // Alto de la barra inferior móvil: no depende de su estado, así que no cambia al abrir el diálogo.
  const mobileBarHeight = () => {
    const tabbar = document.querySelector(".mobile-tabbar");
    return getComputedStyle(tabbar).display === "none" ? 0 : tabbar.offsetHeight;
  };
  // Coloca el panel pegado al borde derecho visible y por encima de la barra inferior.
  function positionCalendarPanel() {
    const gap = 12;
    const anchor = calendarToggle.getBoundingClientRect();
    const width = calendarPanel.offsetWidth;
    const height = calendarPanel.offsetHeight;
    const bottomLimit = window.innerHeight - mobileBarHeight() - gap;
    const left = Math.max(gap, Math.min(anchor.right - width, window.innerWidth - gap - width));
    const below = anchor.bottom + 8;
    const top = Math.max(gap, below + height <= bottomLimit ? below : anchor.top - 8 - height);
    calendarPanel.style.left = `${left}px`;
    calendarPanel.style.top = `${top}px`;
  }
  calendarToggle.addEventListener("click", () => {
    const open = calendarPanel.hidden;
    calendarPanel.hidden = !open;
    calendarToggle.setAttribute("aria-expanded", String(open));
    if (open) positionCalendarPanel();
    updateCalendarNote();
  });
  window.addEventListener("resize", () => { if (!calendarPanel.hidden) positionCalendarPanel(); }, { passive: true });
  window.addEventListener("scroll", () => { if (!calendarPanel.hidden) positionCalendarPanel(); }, { passive: true });
  document.addEventListener("click", (event) => {
    if (calendarPanel.hidden) return;
    if (event.target.closest("#program-calendar-panel, #program-calendar-toggle")) return;
    calendarPanel.hidden = true;
    calendarToggle.setAttribute("aria-expanded", "false");
  });

  document.querySelector("#settings-start-fresh").addEventListener("click", () => {
    settingsPanel.hidden = true;
    settingsToggle.setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelector("#settings-apply").addEventListener("click", () => {
    settingsPanel.hidden = true;
    settingsToggle.setAttribute("aria-expanded", "false");
    settingsToggle.classList.remove("has-nudge");
    settingsToggle.focus({ preventScroll: true });
  });
  document.querySelector("#settings-open-import").addEventListener("click", showSettingsImport);
  document.querySelector("#settings-export").addEventListener("click", showSettingsExport);
  document.querySelector("#settings-import").addEventListener("click", showSettingsImport);
  document.querySelector("#settings-export-done").addEventListener("click", showSettingsMain);
  document.querySelector("#settings-import-cancel").addEventListener("click", showSettingsMain);
  document.querySelector("#settings-copy").addEventListener("click", async () => {
    await copyToClipboard(settingsExportCode.value);
    const button = document.querySelector("#settings-copy");
    button.textContent = "¡Copiado!";
    setTimeout(() => { button.textContent = "Copiar código"; }, 1500);
  });
  document.querySelector("#settings-download").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName();
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector("#settings-do-import").addEventListener("click", () => handleImportText(settingsImportCode.value));
  document.querySelector("#settings-upload").addEventListener("click", () => settingsFile.click());
  settingsFile.addEventListener("change", () => {
    const file = settingsFile.files && settingsFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { settingsImportCode.value = String(reader.result || ""); handleImportText(settingsImportCode.value); };
    reader.readAsText(file);
  });
  document.querySelector("#settings-clear").addEventListener("click", () => {
    if (!hasUserData()) return;
    if (!window.confirm("¿Borrar todas tus listas, tu parrilla, las películas descartadas, las prioridades y las secciones fijadas? Esta acción no se puede deshacer.")) return;
    intentions.clear();
    plannedScreenings.clear();
    discarded.clear();
    prioritized.clear();
    pinnedSections = [];
    persist(); persistPlannedScreenings(); persistDiscarded(); persistPrioritized(); persistPinnedSections(); countVisibleFilms(); renderSectionPicker(); renderFilms(); renderSaved();
  });
  settingsTransport.value = transportMode;
  settingsTransport.addEventListener("change", () => {
    transportMode = settingsTransport.value;
    try { localStorage.setItem(transportStorageKey, transportMode); } catch (_) { /* Keep this choice for the current session. */ }
    transportSelect.value = transportMode;
    renderProgram();
  });

  function countVisibleFilms() {
    document.querySelector("#nav-film-count").textContent = String(filmsForSection("").length);
  }
  countVisibleFilms();
  renderDateChoices();
  renderSaved();
  renderFilms();
  showOnboardingIfNeeded();
})();
