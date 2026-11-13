**Dictamen: el plan de las líneas 93–133 no supera el estándar de preparación para implementación.** Define bien los resultados esperados, pero todavía deja decisiones de diseño e integración al implementador. Encontré **8 hallazgos Major**, sin Blocker confirmado por contradicción con el código.

He considerado las líneas 1–92 como contexto: no señalo como ausentes las reglas funcionales que ya están definidas allí.

1. **Major — Readiness y detalles del código: falta una lista cerrada de archivos y operaciones.**  
   **Ámbito:** documento, líneas 95–101 y 128.  
   No identifica por fase los archivos exactos con `Create`, `Modify` o `Delete`. Además, «si se extrae un módulo temporal» deja abierta una decisión arquitectónica que afecta al empaquetado y a las pruebas. `build.py:96–99` incrusta explícitamente CSS y `app.js`; no incorpora automáticamente un módulo nuevo.  
   **Corrección requerida:** fijar dónde residirá el modelo temporal y enumerar los archivos de producción, pruebas y artefactos generados autorizados, con su operación correspondiente.

2. **Major — Readiness: el modelo temporal carece de contrato implementable.**  
   **Ámbito:** documento, línea 95; `src/app.js:945–951`.  
   Se piden helpers puros, pero no se fijan nombres, firmas, estructura del snapshot, representación de valores desconocidos ni validación de fechas y duraciones. La conversión explícita a Madrid tampoco tiene algoritmo definido. `plannedMinutes()` convierte valores con `Number()` y no valida positividad ni finitud: reutilizarlo sin especificar una normalización deja sin resolver los casos inválidos exigidos por la línea 116. La prueba de verano/invierno tampoco decide qué hacer con horas inexistentes o duplicadas durante cambios de horario.  
   **Corrección requerida:** documentar contratos, validaciones, algoritmo de conversión y fixtures con instantes esperados.

3. **Major — Readiness y detalles del código: falta el mecanismo para actualizar sin destruir estado de interfaz.**  
   **Ámbito:** documento, líneas 96–97; `src/app.js:838`, `878–912`, `1491–1547`.  
   Los renderizadores actuales reemplazan grupos completos mediante `innerHTML`: chips, resultados, agenda y selectores. Invocarlos al vencer un pase puede eliminar el nodo enfocado o reiniciar desplegables. «Conservar ficha abierta y foco» indica el objetivo, pero no cómo conseguirlo ni qué estado capturar y restaurar. Tampoco define la firma de cambio que evitará repintados innecesarios.  
   **Corrección requerida:** concretar qué regiones se actualizan, cómo se identifican sus elementos y cómo se conservan foco, apertura, navegación y scroll.

4. **Major — Detalles del código: la separación entre selección completa y cálculo operativo no alcanza a los evaluadores reales.**  
   **Ámbito:** documento, línea 98; `src/app.js:1105–1128`, `1428–1452`, `1473–1523`.  
   `evaluatePlanChoice(screening, filmId, events, choices)` reconstruye la simulación desde `choices`, cuyo valor por defecto es `plannedScreenings`; el argumento `events` no determina esa selección hipotética. Pasarle únicamente eventos futuros/en curso no elimina por sí solo los históricos del análisis. Además, `renderMaybeSuggestion()` obtiene candidatos directamente de `screeningRecords`, evitando `visiblePlanChoices()`, y `programFitRank()` privilegia la selección existente.  
   **Corrección requerida:** especificar los cambios en esos tres caminos y separar explícitamente cobertura histórica, candidatos elegibles, conflictos operativos y pendientes sin próximos pases.

5. **Major — Detalles del código y readiness: la revalidación no está trazada hasta todas las acciones de selección.**  
   **Ámbito:** documento, línea 98 y prueba de línea 122; `src/app.js:1617–1644`, `2297–2301`, `2340`.  
   Existen escrituras de selección fuera de `handleQuickAction()`, incluido `choose-program-screening`. El plan no enumera dónde se aplica la comprobación al pulsar ni define un guard común. Debe distinguir adición/sustitución de eliminación: bloquear cualquier acción sobre un pase iniciado impediría quitar una selección histórica, contradiciendo el comportamiento requerido.  
   **Corrección requerida:** enumerar los handlers afectados y sus excepciones, manteniendo separadas importación histórica y nuevas elecciones interactivas.

6. **Major — Readiness y detalles del código: la estrategia de pruebas no define reloj, infraestructura ni regresiones concretas.**  
   **Ámbito:** documento, líneas 99 y 128; `tests/test_pass_filters_browser.cjs:52–57`, `tests/test_film_ordering.cjs:5–21`, `tests/test_owned_tickets.cjs:6–21`.  
   Las pruebas de navegador usan Chromium mediante CDP y scripts previos a la navegación. Las pruebas aisladas extraen funciones de `app.js` y las ejecutan en contextos VM con dependencias declaradas manualmente. Congelar el reloj no resuelve las nuevas dependencias que recibirá, por ejemplo, `matchingFilms()`. Tampoco se fija cómo avanzar simultáneamente reloj y temporizadores, simular reanudación, cambiar zona o probar `storage` entre pestañas. «Pruebas relevantes» no establece comandos ni alcance reproducible.  
   **Corrección requerida:** listar suites a modificar, contratos de sus mocks, mecanismo de reloj controlado y comandos por fase. Las fases 2–4 también necesitan checkpoints verificables antes de continuar.

7. **Major — Detalles del código: la verificación offline no identifica los dos productos distintos del build.**  
   **Ámbito:** documento, líneas 99 y 124; `build.py:117–146`; `src/index.html:545–547`.  
   El build predeterminado produce `dist/index.html` con configuración para cargar el PDF externo, y `dist/ficx64-portable.html` con ese contenido incrustado. Verificar únicamente «el HTML generado» no garantiza la entrega portable. La prueba de Pases inspeccionada abre `dist/index.html` mediante `file://`, que tampoco sustituye una comprobación del archivo portable aislado.  
   **Corrección requerida:** nombrar ambos artefactos y asignar comprobaciones diferenciadas: app servida y archivo portable sin archivos acompañantes, incluyendo conservación de exportaciones históricas.

8. **Major — Readiness y detalles del código: el restablecimiento de la preferencia no está integrado con las condiciones actuales de borrado.**  
   **Ámbito:** documento, líneas 96 y 98; requisito contextual de línea 45; `src/app.js:4351–4360`; `src/index.html:212–218`.  
   «Borrar mis datos» retorna inmediatamente si `hasUserData()` es falso y su botón está dentro del bloque de datos existentes. No se especifica qué ocurre cuando la única modificación del usuario es desactivar el filtro temporal. Tampoco se concreta el tratamiento de la clave dentro de `failedStorageKeys`: `saveLocalValue()` devuelve éxito/fallo y mantiene el aviso por clave, sin lanzar la excepción al llamador.  
   **Corrección requerida:** definir disponibilidad del borrado, restablecimiento en memoria y persistencia, texto de confirmación y resolución del aviso cuando falla esa escritura.

**Preguntas que deben quedar resueltas en el documento**

- ¿El modelo temporal permanece en `app.js` o se crea un módulo? ¿Cuáles son sus contratos?
- ¿Cómo se resuelven fechas inválidas, duraciones no positivas y horas ambiguas o inexistentes?
- ¿Qué estado operativo recibe cada evaluador y qué handlers deben revalidar nuevas elecciones?
- ¿Qué mecanismo conserva nodos o restaura el estado de interfaz al actualizar?
- ¿Qué reloj de pruebas, suites, comandos y artefactos constituyen cada checkpoint?
- ¿Cómo se restablece la preferencia cuando no hay listas ni parrilla guardadas?

**Lecturas efectivamente realizadas**

- Completas: ambos agentes solicitados, `implementation-readiness-standard.md` y `docs/SPEC-FILTRO-TEMPORAL.md`.
- Código: búsqueda de símbolos y lecturas focalizadas de `src/app.js`, incluyendo almacenamiento, catálogo, fichas, fechas, planificación, sugerencias, acciones, compartidos y borrado.
- `src/index.html` y `build.py`: lectura general con salida parcialmente truncada; relectura focalizada de empaquetado y artefactos.
- Pruebas: inventario de archivos; lectura completa de `test_pass_filters_browser.cjs` y `test_film_ordering.cjs`; infraestructura VM y almacenamiento de `test_owned_tickets.cjs`, `test_storage_failure.cjs` y búsquedas en `test_clear_lists.cjs`.

No había `.codegraph/`. No consulté memoria ni historial, no modifiqué archivos y no ejecuté pruebas, build ni navegador. Los hallazgos son de revisión estática; la ausencia de implementación está correctamente declarada y no constituye un defecto del plan.
