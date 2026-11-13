# Revisión de comprensión: filtro temporal

## Qué propone

La aplicación activará por defecto una preferencia local que deja de ofrecer pases cuando empiezan y oculta películas que ya no tienen próximos pases conocidos, salvo las excepciones por información incompleta. Los eventos guardados permanecen en la parrilla mientras están en curso; después se ocultan sin borrar elecciones, entradas ni datos exportables. Los días se cierran al máximo final de sus sesiones, con una regla administrativa para finales desconocidos. El reloj del dispositivo, interpretando los horarios en Europe/Madrid, actualiza las vistas sin recarga; desactivar la preferencia permite consultar y elegir pases históricos.

## Cómo funciona el sistema existente, según este documento

El documento describe una aplicación offline empaquetada en un HTML, con catálogo, fichas, filtros de pases, planificación, listas y exportaciones. Ya existen mecanismos de persistencia y aviso de almacenamiento, reglas de acceso especial y funciones que calculan la selección completa y la duración ocupada de los eventos. El selector de fechas contiene actualmente un calendario literal del 13 al 21 de noviembre. La especificación declara que el comportamiento temporal todavía no está implementado ni probado; las afirmaciones sobre el código se toman únicamente de su texto, sin verificación externa.

## Alcance y archivos leídos

Se leyeron íntegramente estos tres archivos, y ningún otro archivo del proyecto, memoria o historial:

- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md`
- `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/feature-spec-standard.md`
- `/home/pelayo/projects/ficx64/ficx64-repo/docs/SPEC-FILTRO-TEMPORAL.md`

Modo REVIEW, perspectiva de lector nuevo. Las líneas citadas corresponden al documento objetivo. La escritura de este informe responde a la instrucción expresa del solicitante; no se modifica código ni especificación.

## Hallazgos accionables

### 1. [Major] Falta la evaluación obligatoria de alternativas

**Líneas objetivo:** 7–9, 41 y 93–101.

Se entiende la solución elegida, pero no sus ventajas frente a otras soluciones viables. La petición fija la activación por defecto y los cortes temporales; no fija necesariamente el alcance global de una preferencia ni la estrategia de actualización. El estándar exige alternativas con motivos concretos de descarte, y el documento no contiene esa evaluación.

**Acción:** añadir alternativas compatibles con los requisitos fijados, por ejemplo preferencias separadas por vista frente a una global y sondeo periódico frente a temporizador por próximo límite. Explicar los costes de coherencia, complejidad y actualización que justifican la elección, distinguiéndolos de las decisiones ya impuestas por la petición.

### 2. [Major] El cierre administrativo no determina qué sucede con los pases de estado desconocido

**Líneas objetivo:** 21–22, 32–35, 57–61 y 66.

Un pase sin inicio válido debe mantenerse visible; otro con duración desconocida debe mostrar «Iniciado · fin sin confirmar». Sin embargo, su día acaba desactivado por cierre administrativo y «Todos» solo incluye días activos. No se explica si esos pases siguen apareciendo en Pases o en la parrilla, ni si una película con un pase desconocido sigue visible en Explorar después de que se declare terminado el festival. Son reglas comprensibles por separado, pero falta su precedencia cuando coinciden.

**Acción:** describir el resultado por vista tras la medianoche administrativa para un pase sin inicio y para uno iniciado sin final. Precisar si el cierre afecta solo al selector o también a la visibilidad y al mensaje de fin del festival; añadir esos casos a aceptación.

### 3. [Major] Falta definir el universo de eventos al que se aplica el tiempo

**Líneas objetivo:** 24–26, 65–71 y 84–87.

El documento alterna «pase», «sesión» y «evento», y enumera `plannedScreenings`, `plannedStandalone` e «intenciones» sin explicar su significado ni relación. Un lector nuevo no puede determinar si los elementos independientes también participan en el cierre global del día, si tienen las mismas reglas de duración o qué se considera conflicto operativo. Citar funciones ayuda a localizar integración, pero no sustituye esta definición de dominio en una revisión sin código.

**Acción:** incluir un glosario breve con los tipos de evento, su relación con una película y su participación en visibilidad, cierre de día y conflictos. Definir las estructuras persistidas solo hasta el detalle necesario para entender qué debe conservarse.

### 4. [Major] Desactivar la preferencia no define el alcance de resúmenes y conflictos

**Líneas objetivo:** 41, 66, 69 y 72.

Se promete recuperar visibilidad y elegibilidad históricas, pero también se indica sin condición que los conflictos operativos se calculan sobre futuros/en curso y que las películas sin futuros pases dejan de contar como pendientes. No queda claro si esos resúmenes mantienen siempre el criterio temporal o si vuelven al comportamiento histórico al desactivar el ajuste. Dos implementaciones distintas cumplirían partes del texto y mostrarían resúmenes diferentes sobre la misma parrilla recuperada.

**Acción:** especificar, para ajuste activo e inactivo, qué eventos alimentan conflictos, pendientes y mensaje de «todo encajado». Aclarar también si las etiquetas temporales siguen visibles al consultar el histórico y añadir un ejemplo con un conflicto pasado.

### 5. [Major] No se define qué fecha anual y qué conjunto de datos cierran el festival

**Líneas objetivo:** 26, 28, 61, 85 y 97.

La zona horaria está definida, pero no se explica de dónde sale el año de una sesión ni qué significa «datos/edición» como fuente única de fechas. Tampoco se concreta cómo distinguir un día vacío, un calendario sin sesiones o un programa con películas aún sin pases de un festival terminado. El máximo final resuelve días con sesiones fechadas, pero no basta por sí solo para establecer esos estados globales.

**Acción:** definir la fuente de la fecha completa y la edición, el conjunto de sesiones que determina el fin global y el resultado cuando ese conjunto está vacío o incompleto. Incluir un ejemplo antes del primer día y otro sin horarios publicados.

## Valoración frente al estándar

El propósito, los límites principales, el plan y la separación entre datos guardados y presentación se entienden. El documento identifica varios fallos y mitigaciones concretas: reloj incorrecto, datos incompletos, almacenamiento fallido y suspensión del navegador. No supera todavía el requisito obligatorio de alternativas; además, los cruces de reglas señalados permiten interpretaciones distintas del comportamiento esperado. No se identificó una sección completa imposible de parafrasear que justifique severidad Blocker. Esta revisión no demuestra defectos del código ni comportamiento real del navegador.

## Preguntas para el autor

1. Tras el cierre administrativo, ¿dónde se consulta con el ajuste activo un pase sin inicio o sin final confirmado, y puede su película seguir en Explorar?
2. ¿Qué representa `plannedStandalone` y participa en el cierre del día y del festival igual que una sesión de película?
3. Al desactivar el ajuste, ¿los conflictos y pendientes incluyen el histórico o mantienen siempre un criterio de futuro/en curso?
4. ¿Qué fuente proporciona el año y la edición, y cuándo se declara terminado un festival con horarios vacíos o incompletos?
5. ¿Qué alternativas se descartaron para el alcance de la preferencia y el mecanismo de actualización, y por qué?
