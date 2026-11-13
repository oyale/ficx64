# Goldfish Annotated Review Report

Status: resolved

**Target:** docs/SPEC-FILTRO-TEMPORAL.md (full file).
**Fecha:** 13/11/2026.
**Entrada:** hallazgos consolidados A1–A11, con trazabilidad a informes originales en consolidated_review_report.md; respuestas del autor registradas en la especificación.

Se aplica egm-resolve. Se omite una nueva parada de aceptación porque el autor pidió guardar las preguntas para el final y autorizó continuar la resolución documental. No se extiende esa autorización a implementar. Las correcciones siguientes ya están aplicadas. Las severidades originales se conservan. «Resolved» significa clasificación y reparación documental, no aprobación por nueva revisión independiente.

## Prioritized Findings & AI Suggestions

### A1 — Horarios incompletos y cierre global — Severity: Major

- **Affected Scope:** Información incompleta y Dominio y colecciones, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Horarios incompletos y cierre global; véase la fila A1 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Se elimina cierre administrativo; día y festival solo cierran con finales conocidos; catálogo vacío tiene mensaje propio.
- **Estado:** Aplicado.

### A2 — Histórico y compartidos — Severity: Major

- **Affected Scope:** Dominio y colecciones, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Histórico y compartidos; véase la fila A2 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Exención explícita de listas y fichas de origen; compartidos plegados sin preselección, decisiones explícitas preservadas.
- **Estado:** Aplicado.

### A3 — Cobertura y conflictos por modo — Severity: Major

- **Affected Scope:** Dominio y colecciones, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Cobertura y conflictos por modo; véase la fila A3 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** La decisión del autor es solo presentación: conservar cálculos sobre selección completa y explicar avisos que incluyan eventos ocultos.
- **Estado:** Aplicado.

### A4 — Ampliar conflictos entre fechas — Severity: Major

- **Affected Scope:** Decisiones confirmadas y Alternativas y límites, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Ampliar conflictos entre fechas; véase la fila A4 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** CONTEST.
- **Justification / Proposed Edit:** La decisión registrada excluye modificar el encaje y el motor de conflictos; máximo final permite cerrar el día sin offset. La limitación del comparador se conserva expresamente.
- **Estado:** No aplicado; alcance explícitamente documentado.

### A5 — Contratos, zona y archivos — Severity: Major

- **Affected Scope:** Modelo temporal local y Plan de implementación, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Contratos, zona y archivos; véase la fila A5 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Modelo en app.js; firmas, null, validación, conversión verificada por componentes y lista cerrada de archivos.
- **Estado:** Aplicado.

### A6 — Actualización y estado UI — Severity: Major

- **Affected Scope:** Estado de presentación y reloj, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Actualización y estado UI; véase la fila A6 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Firma de proyección; capturar/restaurar claves de foco, detalles y scroll; conservar nodo del diálogo y limitar anuncios.
- **Estado:** Aplicado.

### A7 — Guardas temporales en handlers — Severity: Major

- **Affected Scope:** Dominio y colecciones, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Guardas temporales en handlers; véase la fila A7 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** CONTEST.
- **Justification / Proposed Edit:** No aplicar guardas de elegibilidad: contradicen el alcance solo visual confirmado y registrado en la spec. Solo preselección de compartidos cambia por decisión expresa.
- **Estado:** No aplicado; alcance explícitamente documentado.

### A8 — Reloj, regresiones y artefactos — Severity: Major

- **Affected Scope:** Plan de implementación fases 1–5, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Reloj, regresiones y artefactos; véase la fila A8 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Reloj inyectado CDP, pruebas VM, suites concretas, checkpoints y dos productos: HTTP y portable aislado.
- **Estado:** Aplicado.

### A9 — Restablecimiento sin datos y persistencia — Severity: Major

- **Affected Scope:** Estado de presentación y reloj, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Restablecimiento sin datos y persistencia; véase la fila A9 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Control de restablecimiento siempre accesible; borrar datos también restablece; tratamiento del booleano de saveLocalValue y aviso por clave.
- **Estado:** Aplicado.

### A10 — Alternativas, dominio y límites — Severity: Major

- **Affected Scope:** Dominio, Alternativas y límites, hitos, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Alternativas, dominio y límites; véase la fila A10 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Comparar opciones, definir dominio y límites locales. No inventar presupuesto o fecha antes de medir; registrar hitos y criterio de recorte.
- **Estado:** Aplicado.

### A11 — Terminología, excepciones y caché — Severity: Nit

- **Affected Scope:** Objetivo, Información incompleta y Plan, en la especificación actual. Las líneas originales constan en los informes fuente.
- **Discrepancy Description / Rationale:** Terminología, excepciones y caché; véase la fila A11 y sus referencias originales en el informe consolidado.
- **AI Suggestion:** PROPOSE FIX.
- **Justification / Proposed Edit:** Capacidades como requisitos; derivación única de datos inmutables y excepciones explícitas.
- **Estado:** Aplicado.

## Sincronización y salida

9 correcciones PROPOSE FIX aplicadas; 2 CONTEST documentados; 0 ESCALATE; 0 DECLINE. Las 11 acciones consolidadas tienen disposición. No quedan preguntas de producto necesarias para esta resolución. Se mantienen como limitaciones explícitas el comparador entre fechas y la falta de estimación de ejecución; no se simulan decisiones de presupuesto.

Pendiente: reauditoría independiente de la especificación corregida. No se afirma que supere todavía el estándar de implementación. No se han ejecutado pruebas, build o navegador porque esta entrega es documental. Los informes anteriores conservan su contenido histórico y líneas de la versión original.


## Ciclo posterior de reauditoría

Véase [loop-resolution.md](loop-resolution.md): cinco rondas posteriores, con informes por persona. Se aplicaron correcciones nuevas; el estado resolved de este informe solo corresponde a A1–A11, no acredita convergencia del ciclo posterior. Últimas correcciones pendientes de reauditoría.
