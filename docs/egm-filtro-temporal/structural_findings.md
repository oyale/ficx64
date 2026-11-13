# Revisión estructural: filtro temporal

Alcance: `docs/SPEC-FILTRO-TEMPORAL.md`, líneas 1–92 (Feature). Revisión con contexto fresco, sin memoria, historial ni delegación. No se ha revisado contenido posterior al alcance ni ejecutado pruebas. No se han modificado código ni especificación.

## Archivos realmente leídos

- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/structural.md`: completo.
- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/feature-spec-standard.md`: completo.
- `/home/pelayo/projects/ficx64/ficx64-repo/docs/SPEC-FILTRO-TEMPORAL.md`: exclusivamente líneas 1–92.

No se ha leído ningún archivo del baseline permitido: los hallazgos son de organización y conformidad documental, y no requieren contrastar la implementación. Las afirmaciones de integración de las líneas 82–89 no se han verificado independientemente.

## Estructura observada

Un H1 contiene cinco H2: Objetivo; Reglas temporales; Comportamiento de la interfaz; Actualización y accesibilidad; Puntos de integración comprobados en el código. Los H3 se subordinan correctamente a Reglas temporales y Comportamiento de la interfaz. La tabla, las listas y el código en línea presentan una estructura Markdown coherente. No hay enlaces que auditar.

El estándar exige cubrir áreas de contenido cuando sean aplicables; no prescribe títulos literales ni un orden fijo. Por tanto, no se consideran defectos los nombres de las secciones ni la ausencia de encabezados en inglés. El objetivo, las exclusiones de alcance y buena parte del diseño están presentes, aunque distribuidos.

## Hallazgos accionables

1. **Major — Falta la evaluación obligatoria de alternativas. Líneas 5–9, 74–89.** El alcance presenta una única solución y sus puntos de integración, sin una sección que permita localizar otras opciones viables y las razones de su descarte. Esto incumple expresamente «The Alternatives Rule», que condiciona la conformidad del documento. **Acción:** añadir dentro de Feature una sección de alternativas consideradas, comparando la propuesta con opciones como actualización solo al interactuar, sondeo periódico y planificación por próximos límites. Documentar ventajas, costes y motivos técnicos o de alcance de cada descarte; distinguir las decisiones impuestas por la petición de aquellas elegidas por diseño. Si se atribuye un rechazo a una persona mantenedora, enlazar su discusión, issue o PR.

2. **Major — Cobertura incompleta y poco localizable de riesgos y límites. Líneas 28–34, 43, 74–80 y 82–91.** Se describen fallos del reloj, información incompleta, errores de almacenamiento y suspensión de temporizadores, con respuestas concretas. Sin embargo, no aparece una evaluación explícita de implicaciones de seguridad ni de límites de escalabilidad, áreas exigidas por «Risks & Limits». El inventario de funciones de integración no cubre esa evaluación. **Acción:** añadir una sección de riesgos y mitigaciones que reúna o referencie los riesgos ya descritos y declare las implicaciones de seguridad y los límites de coste de cálculo/actualización para el volumen del programa. Si una dimensión no introduce riesgo adicional relevante, justificarlo brevemente. Separar mitigaciones propuestas de validaciones aún pendientes, manteniendo el límite de evidencia estática de la línea 91.

No se identifican Blocker de jerarquía o sintaxis Markdown. La ausencia de alternativas basta para que el alcance no cumpla todavía el estándar.

## Preguntas para el final

1. ¿Qué alternativas se evaluaron para actualizar el estado temporal y qué coste o restricción concreta motivó descartarlas?
2. ¿Qué volumen de pases y qué presupuesto de actualización debe soportar el diseño, y qué implicaciones de seguridad se consideran aplicables o justificadamente no aplicables?
