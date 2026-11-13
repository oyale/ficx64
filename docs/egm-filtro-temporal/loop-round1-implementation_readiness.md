Ronda 1 **no limpia**: 2 Major, 1 Nit, ningún Blocker. Revisión estática de preparación para implementar; sin escrituras, ejecución de pruebas, historial, memoria ni delegación.

1. **implementation_readiness-1-1 — Major**

   **Líneas del objetivo:** 111 y 143.

   **Discrepancia:** se exige conservar abierta una película que desaparezca de los resultados y actualizar sus flechas al orden visible, pero no se define cómo localizar sus vecinos cuando su ID ya no pertenece a esa colección.

   **Fundamento:** `navigateFilm()` usa `filmNavigationIds.indexOf(expandedId)` y desplaza ese índice. Si la película desaparece, obtiene `-1`: avanzar llevaría al primer resultado, aunque no sea su sucesor. El contrato propuesto obliga a decidir entre conservar posición anterior, buscar por ordenación o desactivar ambas flechas.

   **Remedio preciso:** fijar una política explícita. Por ejemplo, obtener los vecinos situando la película abierta en la ordenación vigente antes de excluirla temporalmente, y escoger el anterior y siguiente que continúen visibles. Aplicar los mismos destinos a botones y gestos. Añadir pruebas con desaparición de una película intermedia, primera y última, también con orden descendente.

2. **implementation_readiness-1-2 — Major**

   **Líneas del objetivo:** 59, 111 y 143.

   **Discrepancia:** la exención de las fichas depende de su procedencia, pero la integración propuesta solo concreta `onlyMyLists/showDiscarded`; falta definir cómo representar y conservar la procedencia al abrir una ficha desde las listas.

   **Fundamento:** `openFilmFromList()` prepara navegación y abre Explorar, pero no activa `onlyMyLists`. Por tanto, esos booleanos no bastan para implementar que una ficha abierta desde Mi lista herede la exención. También queda por decidir si esa procedencia se conserva al navegar entre películas y cuándo se elimina.

   **Remedio preciso:** documentar un contexto explícito de ficha con procedencia y exención temporal, establecerlo en cada entrada relevante, conservarlo al navegar dentro de la colección de origen y limpiarlo al cerrar o abrir desde otra procedencia. Añadir una prueba que abra una película caducada desde Mi lista con `onlyMyLists === false`, recorra sus vecinas y después la abra desde Explorar general. Mantener intactas las reglas actuales ajenas al filtro temporal.

3. **implementation_readiness-1-3 — Nit**

   **Líneas del objetivo:** 144–145.

   **Discrepancia:** la fase 4 exige que pasen «esas cinco suites», pero el plan identifica dos pruebas nuevas y cuatro existentes: seis en total.

   **Fundamento:** la puerta de regresión admite dos interpretaciones sobre qué pruebas deben ejecutarse en ese hito.

   **Remedio preciso:** enumerar las suites de esa puerta o indicar expresamente que son las seis citadas, en coherencia con la fase 5.

No se señala como defecto que la funcionalidad todavía no esté implementada. Los hallazgos afectan a decisiones pendientes del documento y respetan el alcance exclusivamente de presentación, sin proponer cambios de encaje o conflictos.

**Archivos efectivamente leídos:**

- Completos: persona `implementation_readiness.md`, estándar `implementation-readiness-standard.md`, skill `egm-review-loop/SKILL.md`, `docs/SPEC-FILTRO-TEMPORAL.md`, `tests/test_pass_filters_browser.cjs`, `tests/test_owned_tickets.cjs`, `tests/test_storage_failure.cjs` y `tests/test_film_ordering.cjs`.
- Parcialmente, mediante fragmentos y búsquedas: `src/app.js`, `src/index.html`, `src/styles.css`, `build.py` y `README.md`.

La lectura adicional del skill se limitó al protocolo de revisión; no se aplicaron sus pasos de delegación, resolución ni escritura, conforme al alcance solicitado.
