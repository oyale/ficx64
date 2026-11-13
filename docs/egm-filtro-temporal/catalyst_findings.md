# Revisión Inventive Catalyst — filtro temporal

Revisión de contexto nuevo, modo REVIEW, documento completo. Sin memoria, historial, delegación, ejecución de pruebas ni cambios de código o especificación. Los hallazgos son recomendaciones sobre la propuesta, no defectos demostrados en una implementación aún inexistente.

## Fuentes realmente leídas

- Persona completa: `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/inventive_catalyst.md`.
- Estándar completo: `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/heilmeier-standard.md`.
- `docs/SPEC-FILTRO-TEMPORAL.md`: completo, líneas 1–133.
- `src/app.js`: búsqueda de símbolos y fragmentos de selección, duración, candidatos, encaje y renderizado de programa; no lectura completa.
- `src/index.html` y `src/styles.css`: coincidencias de Ajustes, almacenamiento y controles; no lectura completa.
- `README.md`, `build.py`, `tests/test_pass_filters_browser.cjs`, `tests/test_owned_tickets.cjs`, `tests/test_storage_failure.cjs`: lectura conjunta, con salida parcialmente truncada; no se afirma lectura íntegra de los dos primeros.
- `data/screenings.json` y `data/films.json`: lectura y análisis JSON completos mediante script; inspección de metadatos, recuentos, campos ausentes y ejemplos, no revisión individual de cada registro. Hay 278 pases y 224 películas; ningún pase carece de fecha, hora o duración en esta instantánea.

No existe `.codegraph/` en la raíz comprobada; no se utilizó CodeGraph. No se abrieron archivos adicionales referenciados por las pruebas.

## Evaluación general

La separación entre selección persistida y proyección temporal es una buena base: evita sacrificar históricos y exportaciones para simplificar la pantalla. No procede sustituirla por un bus de eventos, un servicio remoto de hora o un sistema de persistencia nuevo. El corte al inicio, la activación por defecto y el cierre al final de la última sesión son restricciones expresas, no compromisos que esta revisión pretenda eliminar.

Persisten dos tensiones relevantes: recuperar el histórico exige abandonar globalmente la vista operativa, y la información desconocida puede ser visible pero inaccesible por fecha. Además, faltan decisiones sobre el coste de la solución y sobre la separación interna de los cálculos de encaje.

## Hallazgos accionables

### 1. Major — Un pase desconocido puede quedar visible en teoría e inaccesible en la práctica

**Destino:** Información incompleta, líneas 32–35; Pases y días, líneas 57–61; aceptación, línea 116.

**Contradicción:** conservar información incierta frente a desactivar su vía de consulta. Se exige mantener visible un pase con inicio desconocido y no descartarlo automáticamente, pero su día se cierra administrativamente y «Todos» solo incluye días activos. La película puede seguir apareciendo en Explorar por ese mismo horario desconocido, mientras el pase deja de encontrarse por su fecha. El documento no determina qué regla domina ni cómo distinguir ese resultado del fin efectivo del festival.

**Resolución propuesta — segmentación:** separar «día operativo cerrado» de «pase de horario pendiente». Mantener el cierre administrativo exigido, pero definir un grupo consultable «Horario sin confirmar» que no dependa de los chips de días activos, con aviso de incertidumbre. Añadir un caso de aceptación después de medianoche con un pase sin inicio y otro sin duración; especificar también fecha inválida, que no tiene una medianoche de referencia válida.

**Costes secundarios:** grupo adicional, reglas de contadores y copy; conservar un pase pendiente indefinidamente puede generar ruido. Si se prefiere que solo sea recuperable en histórico, cambiar explícitamente el alcance de «mantener visible» y probar esa decisión. Los datos actuales completos no cubren este escenario por sí solos.

### 2. Major — Recuperar un dato histórico desactiva también la protección operativa

**Destino:** Ajustes, líneas 41–45; fichas, línea 51; Mi programa, líneas 66–72.

**Contradicción:** permitir editar una entrada pasada frente a impedir nuevas elecciones caducadas. Para recuperar el evento y editar «Tengo entrada», se manda desactivar una preferencia global; esa misma acción restaura la elegibilidad histórica y modifica Explorar, Pases y sugerencias. Consultar una entrada antigua acaba alterando el contexto de planificación completo. El documento adopta este acoplamiento sin comparar una alternativa local.

**Resolución propuesta — extracción:** conservar el checkbox global requerido, pero evaluar un acceso local «Ver pases anteriores» o «Consultar histórico» en ficha/parrilla. Esa consulta mostraría y permitiría editar o quitar elecciones existentes sin activar acciones de añadir un pase pasado; la elegibilidad histórica completa seguiría dependiendo del ajuste global. Registrar por qué se acepta o descarta esta alternativa.

**Costes secundarios:** dos alcances de visibilidad que explicar y probar, más controles y riesgo de confusión si se presentan igual. La opción global actual cuesta menos interfaz; esa simplicidad debe compararse con el cambio de contexto impuesto para una consulta puntual, no darse por inevitable.

### 3. Major — Separar la parrilla visible no basta para separar los cálculos operativos

**Destino:** Mi programa, líneas 67–71; integración, líneas 86–87; plan, línea 98; aceptación, líneas 121–123.

**Contradicción:** conservar íntegra la selección para exportar frente a eliminar su influencia operativa una vez terminada. La intención está expresada, pero no se concreta el límite de cálculo. En el código leído, `renderProgram()` usa `allEvents` para cobertura y análisis, mientras `evaluatePlanChoice()` reconstruye una parrilla hipotética desde `plannedScreenings`; el parámetro `events` no determina esa reconstrucción. Pasar una lista temporal a un renderizador o filtrar `visiblePlanChoices()` no demuestra que el encaje deje de depender del histórico.

**Resolución propuesta — segmentación:** precisar un contrato de contexto operativo compartido por conflictos, orden por encaje y sugerencias, conservando por separado el contrato completo de exportación. Definir qué sucede con una película cuyo pase elegido terminó pero que tiene otro futuro: ¿se considera cubierta por una elección histórica o pendiente de nueva elección? Añadir un examen que recorra selección pasada, candidato futuro, sugerencia y exportación, sin imponer una función concreta.

**Costes secundarios:** más parámetros o una estructura de contexto; dos proyecciones con riesgo de divergir. Una prueba de comportamiento conjunta evita convertir la segmentación en mera duplicación de filtros. No se afirma que cualquier evento pasado produzca hoy un conflicto falso: depende de fechas y del camino de cálculo.

### 4. Major — No hay presupuesto ni plazo para comparar la solución con una alternativa más barata

**Destino:** plan, líneas 95–101; actualización, líneas 76–80; estado de entrega, líneas 130–133.

**Criterio Heilmeier:** coste y plazo carecen de respuesta explícita. La secuencia de cinco pasos y los criterios de aceptación cubren el orden y buena parte de los exámenes, pero no estiman esfuerzo, duración, recursos de validación ni riesgos que puedan consumir el presupuesto. Es especialmente relevante porque el documento está fechado el día anterior al comienzo de la edición.

**Alternativa a contrastar — acción preliminar:** comparar la conversión de horarios en ejecución con generar instantes absolutos en `build.py`, preservando fechas y horas originales para presentación y el tratamiento de datos desconocidos. El empaquetado ya procesa los datos y el calendario es estático; esto podría reducir la lógica de zona horaria en cada cliente. No se recomienda elegirla sin comparar los caminos reales de carga y actualización.

**Costes secundarios:** el preprocesado traslada complejidad a Python, depende de disponibilidad de datos de zona horaria y exige coherencia entre HTML empaquetado y cualquier carga directa de JSON. La conversión en cliente mantiene una sola representación de entrada, a cambio de lógica y pruebas de zona en navegador. Ambas requieren validación de límites.

**Acción:** añadir una estimación por rangos para cada hito, responsable, disponibilidad de Chromium y criterio de recorte si no se llega al estreno; incluir una pequeña comparación de ambas opciones. Mantener como examen intermedio el modelo temporal antes de integrar UI y como examen final el HTML offline en navegador. No hace falta inventar métricas de uso ni introducir telemetría.

## Preguntas para resolver al final

1. Tras el cierre administrativo de un día, ¿dónde se consulta un pase de inicio desconocido con el ajuste activo? ¿Cómo se distingue esa incertidumbre del festival terminado?
2. ¿Se acepta deliberadamente cambiar la planificación global para editar una entrada antigua, o merece la pena una consulta local del histórico?
3. Si una película tiene un pase guardado terminado y otro futuro, ¿debe aparecer pendiente de encajar, cubierta por el histórico o en un estado explícito distinto?
4. ¿Qué esfuerzo y fecha de entrega se presupuestan, y qué parte se pospondría si no llega al inicio del festival?
5. ¿Qué ventaja concreta tiene convertir Europe/Madrid en cada cliente frente a precomputar instantes al construir este catálogo estático?
