# Revisión estratégica inicial — filtro temporal

Revisión de todo `docs/SPEC-FILTRO-TEMPORAL.md`, con contexto nuevo, sin memoria, historial ni delegación. Persona y estándar leídos completos antes de revisar. Evaluación estática: no se ejecutaron pruebas, build ni navegador. Solo se escribe este informe.

## Dictamen

El objetivo tiene contexto suficiente y encaja con la aplicación offline descrita en README: proyección local, sin servidor, sin borrar elecciones y conservando los contratos de exportación. No se identifican Blocker. Conviene resolver dos decisiones de alcance antes de implementar y eliminar una optimización prematura. Las referencias siguientes corresponden al documento revisado.

## Hallazgos accionables

1. **Major — El cierre administrativo no resuelve el ciclo de vida de los eventos de final desconocido.** Líneas **32–34, 66 y 69**; aceptación **116 y 125**.

   Se define cuándo cerrar el día, pero no cuándo dejar de mostrar en la parrilla un pase iniciado cuyo final no puede determinarse. Puede quedar «Iniciado · fin sin confirmar» indefinidamente mientras su día está desactivado y se anuncia que el festival ha terminado. Tampoco queda definido si sigue participando en los conflictos operativos. La incertidumbre temporal necesita una política compartida por parrilla, selectores y resúmenes; resolver cada pantalla por separado introduciría excepciones y estados incoherentes.

   **Acción:** decidir expresamente si el cierre administrativo también retira esos eventos de la vista operativa y de sus conflictos, conservando su estado real como desconocido en el histórico, o si permanecen en una categoría visible independiente. Añadir un caso de aceptación posterior a ese cierre con un evento guardado sin duración. No equiparar administrativamente cerrado con realmente terminado.

2. **Major — Falta separar la incorporación histórica de una nueva recomendación en compartidos.** Líneas **67, 70–71, 98 y 122–123**.

   Se exige que ningún pase iniciado se proponga ni se añada mediante una acción caducada, pero también que importar y revisar compartidos permita recuperar sesiones pasadas. No se especifica si marcar manualmente un pase compartido pasado es recuperación histórica o una nueva elección prohibida, ni qué hace «Marcar todos los que encajan». El código ya concentra elegibilidad de compartidos en `sharedPassState()` (`src/app.js:2622`) y la acción masiva lo reutiliza (`src/app.js:4075`); insertar allí un rechazo temporal indiscriminado bloquearía también la recuperación que se promete.

   **Acción:** establecer una frontera explícita entre recomendaciones operativas e incorporación de histórico, incluyendo marcado individual, marcado masivo e importación. Conservar una política común reutilizada por las acciones de compartidos, sin duplicar excepciones en cada botón. Añadir aceptación con ajuste activo, un pase pasado recibido y una selección que cruza el inicio antes de confirmarse.

3. **Nit — La caché con invalidación se prescribe sin necesidad demostrada.** Línea **95**, en relación con **76–80**.

   El plan obliga a cachear horarios derivados e invalidarlos cuando cambian los datos, aunque no aporta mediciones que justifiquen ese mecanismo. El empaquetado actual incrusta los datos en el HTML (`build.py`, carga y sustitución de `window.FICX_SCREENINGS`); no se demuestra aquí un flujo de actualización de horarios en caliente. La política de invalidación añade estado a una función cuyo objetivo es precisamente recalcular de manera coherente desde un instante único.

   **Acción:** retirar la obligación de caché e invalidación del contrato inicial. Permitir cálculo directo o una derivación única de los datos inmutables al cargar, reutilizando `plannedMinutes()` (`src/app.js:945`) para duración ocupada. Introducir una caché más compleja solo si una medición muestra que hace falta. Mantener en el diseño el contrato temporal y su precisión, dejando esta elección al desarrollo.

## Reutilización y límites de evidencia

Se buscaron componentes existentes en `src/app.js`: `plannedMinutes()`, `selectedPlanEvents()`, `visiblePlanChoices()`, `matchingFilms()`, `filmsForSection()`, almacenamiento, formateo de fechas y puntos de recomendación. El documento acierta al preservar `selectedPlanEvents()` completo. Los formateadores locales y `startMinute()` existentes no sustituyen por sí solos una conversión de instante Europe/Madrid: no se recomienda reutilizarlos como conversor de zona. No se encontró en los fragmentos y búsquedas revisados un modelo temporal equivalente ya implementado; esto no constituye una auditoría exhaustiva de todo el repositorio.

## Archivos efectivamente leídos

- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/zoom_out.md`: completo.
- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md`: completo.
- `docs/SPEC-FILTRO-TEMPORAL.md`: completo, líneas 1–133.
- `README.md`: lectura de contenido mediante salida conjunta con límite de salida; cabecera y líneas 1–35 verificadas aparte. No se presupone lectura íntegra de los segmentos truncados.
- `build.py`: contenido mostrado en la lectura conjunta, incluido empaquetado y carga de datos.
- `src/app.js`: búsquedas de símbolos y lectura de fragmentos 330–368, 918–959, 1040–1088, 1100–1136, 1438–1455, 1473–1525, 2610–2635 y 4060–4110; búsquedas adicionales de almacenamiento, ajustes y borrado.
- `src/index.html`: coincidencias de búsqueda sobre ajustes y borrado; sin lectura íntegra.
- `tests/test_pass_filters_browser.cjs`: coincidencias de búsqueda sobre restablecimiento; sin lectura íntegra ni ejecución.
- `tests/test_owned_tickets.cjs` y `tests/test_storage_failure.cjs`: incluidos en una búsqueda dirigida; no se obtuvieron fragmentos útiles para fundamentar hallazgos ni se consideran revisados íntegramente.

No se leyeron `src/styles.css`, `data/screenings.json` ni `data/films.json`. No se consultó código fuera de la baseline autorizada. La comprobación de ausencia de `.codegraph/` no leyó contenido adicional.

## Preguntas para cerrar la revisión

1. ¿El cierre administrativo retira también de la parrilla operativa y de sus conflictos los pases de final desconocido, o deben seguir visibles en una categoría distinta?
2. ¿Qué operaciones concretas de compartidos pueden incorporar pases pasados con el ajuste activo, y debe el marcado masivo limitarse a futuros aunque el marcado histórico individual esté permitido?
