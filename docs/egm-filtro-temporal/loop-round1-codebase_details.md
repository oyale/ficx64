Ronda 1, persona `codebase_details`: **no limpia**. Resultado: **3 Major, 1 Nit; ningún Blocker**.

Revisión estática y de solo lectura. Se respeta el alcance exclusivamente visual: no se propone alterar encaje, conflictos, cobertura ni selección.

### codebase_details-1-1 — Major

**Destino:** `docs/SPEC-FILTRO-TEMPORAL.md:111,143`.

**Discrepancia:** La exención de las fichas abiertas desde Mi lista está exigida, pero el mecanismo de integración se concreta únicamente mediante `onlyMyLists/showDiscarded`. Esos indicadores no identifican todos los accesos existentes: `openFilmFromList()` (`src/app.js:1951`) abre una ficha desde las listas guardadas sin activar `onlyMyLists`, y cambia a Explorar.

**Razón:** Un implementador que siga literalmente la fase 3 puede filtrar los pases de una ficha que debería heredar la exención. Falta definir cómo representar y conservar su procedencia durante actualizaciones y navegación.

**Remedio preciso:** Especificar un estado de contexto de ficha independiente de los filtros de catálogo; enumerar los puntos de apertura que lo establecen, su conservación al navegar y su limpieza al cerrar. Añadir un caso de navegador que abra una película histórica desde las listas guardadas con ambos indicadores desactivados y compruebe pases, contadores y navegación exentos.

### codebase_details-1-2 — Major

**Destino:** `docs/SPEC-FILTRO-TEMPORAL.md:111,127,143`.

**Discrepancia:** Se exige mantener abierta una ficha retirada de resultados y actualizar sus flechas según el orden visible, pero no se define qué constituye su vecino cuando su ID ya no pertenece a ese orden.

Actualmente tanto el marcado de flechas (`src/app.js:530`) como `navigateFilm()` (`src/app.js:793`) usan `filmNavigationIds.indexOf(...)` y suman la dirección. Si se sustituye la colección por los resultados actualizados, el índice será `-1`: «siguiente» apuntaría al primer resultado, independientemente de la posición anterior.

**Razón:** La nueva situación requiere una decisión de navegación que el plan deja al implementador. Conservar el algoritmo literalmente produciría un salto arbitrario.

**Remedio preciso:** Definir expresamente el comportamiento cuando la ficha abierta queda fuera de resultados —por ejemplo, desactivar ambas direcciones hasta cerrarla— y aplicar el mismo contrato a botones y gestos. Añadir pruebas con una ficha situada entre otras dos que caduque mientras permanece abierta.

### codebase_details-1-3 — Major

**Destino:** `docs/SPEC-FILTRO-TEMPORAL.md:142-145`.

**Discrepancia:** Las fases 2 y 3 establecen puertas de validación en navegador, pero la regeneración del producto no aparece hasta la fase 5. La infraestructura tomada como referencia en `tests/test_pass_filters_browser.cjs` navega a `dist/index.html`; no carga directamente `src/app.js`. Su cabecera exige ejecutar previamente `python3 build.py`.

**Razón:** Las puertas intermedias pueden probar un artefacto anterior o fallar porque aún no contiene los controles nuevos. No verifican necesariamente la fase que pretenden cerrar.

**Remedio preciso:** Añadir `python3 build.py` antes de cada puerta que ejecute pruebas contra `dist`, incluyendo las fases 2, 3 y 4. Explicitar que esos hitos pueden actualizar los archivos generados autorizados y que los tests nuevos usan el producto recién construido.

### codebase_details-1-4 — Nit

**Destino:** `docs/SPEC-FILTRO-TEMPORAL.md:144`.

**Discrepancia:** La puerta menciona «esas cinco suites», mientras que la fase 5 enumera dos tests nuevos y cuatro existentes: seis.

**Razón:** El recuento deja ambiguo qué conjunto debe pasar antes de avanzar.

**Remedio preciso:** Enumerar los nombres exigidos en esa puerta; si comprende toda la regresión prevista, corregir el total a seis.

### Archivos realmente leídos

**Completos:**

- `docs/SPEC-FILTRO-TEMPORAL.md`.
- Persona `agents/codebase_details.md`.
- Estándar `resources/document_standards/implementation-readiness-standard.md`.
- Skill `skills/egm-review-loop/SKILL.md` e integración `docs/codex.md`.
- `build.py`.
- `tests/test_pass_filters_browser.cjs`.
- `tests/test_owned_tickets.cjs`.
- `tests/test_storage_failure.cjs`.
- `tests/test_film_ordering.cjs`.

**Lectura parcial y búsquedas dirigidas:**

- `src/app.js`: almacenamiento, catálogo, fichas, navegación, fechas, planificación, compartidos y handlers relacionados.
- `src/index.html`: Ajustes y estructura relacionada.
- `src/styles.css`: controles de días, Ajustes y aviso de almacenamiento.
- `README.md`: pruebas, empaquetado portable y recepción de itinerarios.

Sin memoria, historial, revisiones anteriores, delegación, escrituras ni ejecución de pruebas. Las afirmaciones sobre el catálogo de la línea 9 no se verificaron: `data/screenings.json` queda fuera del baseline autorizado.
