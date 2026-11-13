**Dictamen de etapa 8 — Intermediate Zoom Out: requiere revisión antes de implementar.** La propuesta conserva una arquitectura razonable, pero **no resuelve las preocupaciones iniciales ni las decisiones posteriores**. Los informes aportan posibles mitigaciones; su existencia no equivale a que estén incorporadas al diseño.

No identifico un **Blocker** de contexto o viabilidad arquitectónica. Sí persisten **Major** que permiten implementaciones incompatibles entre sí. La prioridad debe ser cerrar contratos de comportamiento y contener el alcance, antes de añadir mecanismos o controles nuevos.

**Qué sigue siendo acertado**

La [especificación](/home/pelayo/projects/ficx64/ficx64-repo/docs/SPEC-FILTRO-TEMPORAL.md:7) explica el problema y mantiene las restricciones expresas: activación por defecto, corte al inicio, cierre del día al finalizar sus sesiones y funcionamiento offline.

La separación entre selección persistida y proyección visible es la decisión principal que conviene conservar. Mantener completo `selectedPlanEvents()`, no borrar entradas ni elecciones y conservar las exportaciones evita convertir una mejora de presentación en una migración de datos. El README leído confirma la coherencia con una aplicación local empaquetada en HTML.

También son mitigaciones pertinentes, **todavía propuestas y no verificadas**, la instantánea única del reloj, la revalidación al pulsar, el recálculo al reanudar, el aviso de almacenamiento y la conservación de foco y ficha abierta.

**Seguimiento de las preocupaciones anteriores**

| Procedencia | Preocupación | Estado en el diseño leído |
| --- | --- | --- |
| Zoom Out inicial | Destino de eventos sin final tras el cierre administrativo | **Abierta.** Se cierra el día, pero no se determina su salida de parrilla y conflictos. |
| Zoom Out inicial | Recuperación histórica frente a nueva elección en compartidos | **Abierta.** Importar conserva el pasado; el marcado individual y masivo no tienen política explícita. |
| Zoom Out inicial | Caché e invalidación prematuras | **Sin corregir.** Siguen prescritas en el paso 1. |
| Catalyst | Histórico local frente a desactivación global | **Sin comparación.** La consulta local es una alternativa, no una decisión aceptada. |
| Catalyst, comprensión y diseño | Contexto operativo, cobertura y conflictos históricos | **Abierta.** Separar la parrilla visible no define todos los cálculos. |
| Comprensión y diseño | Incertidumbre temporal frente a días cerrados | **Abierta.** Falta precedencia por vista. |
| Comprensión | Universo de eventos, edición y fin global | **Abierta.** Las referencias a estructuras no sustituyen el contrato de dominio. |
| Diseño | Histórico de listas dentro de Explorar | **Abierta.** No se concreta la excepción al filtro temporal. |
| Diseño | Conflictos entre fechas al cruzar medianoche | **Abierta y relevante para el alcance.** El código consultado separa fechas diferentes. |
| Comprensión, diseño y estructura | Alternativas y motivos de descarte | **Ausentes.** El plan posterior tampoco incorpora la comparación. |
| Catalyst y estructura | Presupuesto, riesgos y límites | **Parcial.** Hay mitigaciones y pruebas previstas, pero no presupuesto ni evaluación reunida de límites. |

**Hallazgos priorizados**

**1. [Major] Falta una política única para incertidumbre y cierre administrativo.**
Ámbito: líneas 21–35, 57–61, 66 y aceptación 116/125.

La misma sesión puede conservarse como visible por incertidumbre, pertenecer a un día deshabilitado y coexistir con el mensaje «El festival ha terminado». El cierre administrativo tampoco determina si deja de intervenir en conflictos. Una fecha inválida añade otro caso: no tiene una medianoche válida de referencia.

**Razón de simplicidad:** sin precedencia explícita, cada vista necesitará excepciones propias.

**Mitigación prioritaria:** definir una tabla breve por tipo de incertidumbre: presencia en Explorar, Pases y parrilla; participación en conflictos; acceso histórico y efecto sobre el mensaje global. Elegir una política y probarla después del cierre administrativo. No llamar «terminado» a un evento cuyo final sigue siendo desconocido.

El grupo «Horario sin confirmar» sugerido por Catalyst es una opción con coste de interfaz y contadores; **no debe incorporarse automáticamente**. Primero debe decidirse si se necesita conservar esa consulta operativa o si basta el histórico, revisando expresamente la promesa de «mantener visible».

**2. [Major] La frontera operativa sigue siendo insuficiente para evitar cálculos divergentes.**
Ámbito: líneas 65–72 y 98.

La propuesta distingue datos completos y vista temporal, pero no fija qué selección alimenta cobertura, encaje, sugerencias y conflictos en cada modo. Falta resolver, entre otros, el caso de una película con elección pasada y otro pase futuro.

La lectura actual confirma que `evaluatePlanChoice()` reconstruye una selección hipotética desde `choices`; el argumento `events` no gobierna esa reconstrucción. Por tanto, entregar una colección filtrada a un renderizador no garantiza coherencia en el resto del recorrido.

**Razón de simplicidad:** distribuir filtros por funciones deja varias definiciones de «operativo».

**Mitigación prioritaria:** especificar un contexto de cálculo compartido, sin imponer una clase o infraestructura nueva. Debe definir candidatos elegibles, elecciones relevantes y cobertura, tanto con el ajuste activo como inactivo. Conservar aparte la selección completa de exportación.

Añadir un escenario conjunto: elección pasada → candidato futuro → sugerencia/encaje → resumen → exportación. La conservación de IDs no basta para verificar los resultados operativos.

**3. [Major] La recuperación histórica tiene tres fronteras pendientes.**
Ámbito: líneas 49–53, 67–72 y aceptación 122–123.

Quedan sin decidir:

- Si «Mi lista» y «Descartadas» exceptúan la caducidad dentro de Explorar.
- Qué operaciones de compartidos pueden incorporar histórico con el ajuste activo.
- Si desactivar el ajuste recupera también análisis y conflictos históricos.

`matchingFilms()` combina actualmente catálogo, listas y descartes; no son canales independientes que puedan filtrarse indiscriminadamente. `sharedPassState()` ya concentra decisiones de compartidos y constituye un punto de reutilización que conviene preservar.

**Razón de simplicidad:** una regla temporal global sin estas excepciones puede exigir después correcciones por botón y por pantalla.

**Mitigación prioritaria:** documentar una matriz de operaciones: consultar, editar entrada, quitar, sustituir, añadir individualmente, incorporar en masa e importar. Separar recuperación histórica de recomendación operativa.

El acceso local al histórico propuesto por Catalyst puede posponerse si se acepta expresamente el cambio global de contexto. No es necesario añadir un segundo modo de consulta para cerrar el contrato actual.

**4. [Major] El universo temporal y la cobertura de medianoche necesitan una decisión de alcance.**
Ámbito: líneas 24–28, 61, 65–69 y 97.

Falta identificar qué eventos participan en el cierre global, de dónde proceden fecha completa y edición y qué sucede con un programa vacío o incompleto. Derivar fechas desde «datos/edición» expresa una intención, pero no establece la precedencia.

Además, `compareScreenings()` devuelve `separate` cuando las fechas difieren. Mantener visible una sesión que cruza medianoche no proporciona por sí mismo detección de sus solapes con el día siguiente.

**Razón de simplicidad:** mezclar caducidad y reforma del motor de conflictos puede ampliar considerablemente esta entrega.

**Mitigación prioritaria:** definir el conjunto de eventos y elegir entre incluir los conflictos entre fechas —con intervalos absolutos y revisión de traslados— o declarar esa limitación fuera del cambio. Si se excluyen, no presentar los avisos operativos como cobertura de esos solapes.

**5. [Major] Falta comparar las decisiones arquitectónicas que todavía son opcionales.**
Ámbito: líneas 76–80 y 93–101.

Las restricciones del producto no obligan a elegir conversión horaria en cliente, caché invalidable ni un determinado mecanismo de temporización. Los informes convergen en pedir alternativas, pero la especificación mantiene una sola ruta.

**Razón de simplicidad:** sin comparar costes se corre el riesgo de convertir decisiones incidentales en requisitos permanentes.

**Mitigación:** una comparación breve y resolutiva de:

| Decisión | Comparación necesaria |
| --- | --- |
| Conversión horaria | Cliente frente a instantes derivados durante la construcción |
| Actualización | Sondeo acotado frente a próximo límite con revisión del reloj |
| Consulta histórica | Preferencia global frente a acceso local adicional |

No hace falta construir prototipos de todas las opciones. Sí explicar mantenimiento, empaquetado offline, precisión y validación. Actualizar únicamente al interactuar no satisface la actualización automática requerida; puede descartarse por ese motivo.

**6. [Major] La entrega carece de presupuesto y criterio explícito de recorte.**
Ámbito: líneas 93–101 y 130–133.

El plan abarca catálogo, fichas, días, listas, compartidos, recomendaciones, conflictos, almacenamiento y accesibilidad. Su secuencia es útil, pero no permite determinar qué puede entregarse y verificarse con los recursos disponibles.

**Razón de simplicidad:** una mejora transversal necesita un límite de entrega para no absorber refactorizaciones adyacentes.

**Mitigación:** estimar por rangos el modelo temporal, la integración y la validación; identificar disponibilidad de Chromium y fijar qué ampliaciones son prescindibles. Mantener como puertas de avance el modelo temporal probado y, después, el HTML generado verificado en navegador. No recortar conservación de datos, coherencia de acciones o accesibilidad para ganar plazo.

**7. [Nit] Sigue prescrita una caché con invalidación sin evidencia de necesidad.**
Ámbito: línea 95.

El empaquetado consultado incrusta los datos. No se ha demostrado aquí una actualización de horarios en caliente que justifique introducir invalidación.

**Mitigación:** retirar esa obligación. Permitir cálculo directo o derivación única al cargar los datos; medir antes de añadir más estado. Reutilizar `plannedMinutes()` para la duración ocupada, acompañándolo de validación: su implementación actual no constituye por sí sola una política completa para datos inválidos.

**8. [Nit] Reunir riesgos y límites requiere documentación breve, no infraestructura nueva.**
Ámbito: líneas 28–34, 43 y 74–80.

El hallazgo estructural es pertinente, pero no justifica añadir monitorización, servicios remotos ni un sistema de rendimiento. Basta explicitar riesgos aplicables: reloj manipulable, entrada temporal inválida, errores de persistencia, coste de recálculo y renderizado.

La caducidad local es una preferencia de presentación; no debe convertirse en autorización de acceso. La especificación ya conserva las reglas de acceso especial. Las mitigaciones deben distinguirse de las comprobaciones todavía pendientes.

**Alcance recomendado para cerrar esta etapa**

Conservar el modelo offline, una preferencia global inicial, una instantánea por actualización y la selección completa independiente de la presentación. Resolver primero los hallazgos 1–4 y documentar las decisiones 5–6.

Posponer salvo justificación expresa: acceso histórico local adicional, agrupaciones nuevas para horarios inciertos, caché invalidable y una generalización del motor temporal para futuras ediciones. La corrección de conflictos entre fechas exige decisión propia; no debe entrar accidentalmente ni darse por cubierta.

La observación de diseño sobre ausencia de pruebas de fronteras necesita matizarse: aquel informe leyó solo las líneas 1–92. El documento completo **sí propone** pruebas de límites, zonas, reanudación y foco en las líneas 103–128. Eso aporta planificación de validación, pero **no demuestra ejecución ni resuelve los resultados ambiguos** anteriores.

**Lecturas efectivamente realizadas**

Lectura completa, con recuperación de las salidas inicialmente truncadas:

- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/zoom_out.md`.
- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/zoom-out-standard.md`.
- `docs/SPEC-FILTRO-TEMPORAL.md`, líneas 1–133.
- Los cinco informes completos: `zoom_out_findings.md`, `catalyst_findings.md`, `comprehension_findings.md`, `design_findings.md` y `structural_findings.md`, bajo `docs/egm-filtro-temporal/`.

Contraste adicional de reutilización exigido por la persona:

- `README.md`: líneas 1–55.
- `src/app.js`: búsqueda dirigida de símbolos y referencias temporales; lectura de fragmentos 345–368, 918–959, 1069–1136 y 2622–2643.
- `build.py`: coincidencia de empaquetado y fragmento 112–134.
- Comprobación de ausencia de `.codegraph/`; no se utilizó CodeGraph.

No se consultaron memoria, historial ni fuentes externas. No se leyeron las otras personas o estándares citados dentro de los informes; sus conclusiones se trataron como aportaciones previas, no como verificaciones propias de esos estándares. No se ejecutaron pruebas, build ni navegador, ni se modificaron archivos.
