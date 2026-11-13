**NOT CLEAN — 1 hallazgo accionable.**

**codebase_details-5-1 · Major — Falta concretar la presentación de fechas inválidas.**

- **Líneas:** `docs/SPEC-FILTRO-TEMPORAL.md:40–42, 107, 129–133, 155`.
- **Razón:** se exige conservar visibles los pases con fecha ausente o inválida, sin asignarlos artificialmente a otro día. El modelo temporal contempla devolver `null`, pero eso no protege los renderizadores existentes: `screeningCard()` y `updateSessionSummary()` formatean fechas directamente mediante `Intl.DateTimeFormat` (`src/app.js:293–296, 893–896`); `formatProgramDate()` tampoco valida (`927–928`), y compartidos además ejecuta `screening.date.slice()` (`2795–2797`). Con esos datos, conservar el registro puede provocar una excepción o normalizar una fecha imposible. La parrilla también construye sus agrupaciones y selectores desde las fechas originales. Falta decidir cómo presentar estos registros para cumplir la política defensiva ya incluida en el alcance.
- **Remedio:** especificar en la fase 3 una presentación segura para fecha desconocida: texto explícito, ausencia de fecha ficticia y ubicación definida en la parrilla fuera de los días válidos. Enumerar los renderizadores afectados y añadir fixtures de navegador con fecha ausente, cadena inválida y fecha imposible; comprobar Pases, ficha, parrilla y compartidos sin excepciones ni normalización silenciosa. Mantener intactos datos persistidos y algoritmos de encaje/conflictos.

**Lecturas efectivas:** completos `agents/codebase_details.md`, `resources/document_standards/implementation-readiness-standard.md` y la especificación actual; completos los cuatro tests permitidos y `build.py`; fragmentos pertinentes de `src/app.js`, `src/index.html`, `src/styles.css` y `README.md`.

Revisión estática, sin escrituras, delegación, historial, memoria ni ejecución de pruebas.
