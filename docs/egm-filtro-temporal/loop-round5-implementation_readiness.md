**NO CLEAN** — un hallazgo accionable.

**implementation_readiness-5-1 · Major**  
**Líneas:** `docs/SPEC-FILTRO-TEMPORAL.md:125` y `139`.

**Motivo:** La centralización de anuncios enumera las regiones que deben perder `aria-live` o `role=status`, pero omite `.pass-conflict-popover`, generado con `role="status"` por `passConflictWarning()` (`src/app.js:1582`) y utilizado por `renderPassQuickActions()`. Retirar únicamente el atributo de la lista contenedora mantiene regiones vivas implícitas dentro de los resultados. Al repintar y restaurar desplegables abiertos, queda una vía de anuncios fuera de los dos cambios temporales permitidos. Las instrucciones enumeradas no bastan para cumplir el contrato de región única.

**Remedio:** Añadir explícitamente la retirada de `role="status"` de esos popovers, conservando su contenido y apertura manual. Ampliar la comprobación DOM para detectar también regiones vivas descendientes de los resultados. Incluir un conflicto desplegado durante una actualización temporal y comprobar que conserva su apertura sin generar otro canal vivo. No modificar el cálculo de conflictos.

**Lecturas efectivas:** protocolo `agents/implementation_readiness.md`, estándar `resources/document_standards/implementation-readiness-standard.md` y especificación actual completos; los cuatro tests permitidos completos; fragmentos de `src/app.js` sobre catálogo, fichas, duración, programa, conflictos y compartidos; búsquedas dirigidas en `src/index.html` y `src/styles.css`. No leí el contenido de `build.py` ni `README.md`. Sin memoria, historial, revisiones anteriores, escrituras, delegación ni ejecución de pruebas.
