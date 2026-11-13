# Revisión crítica de diseño: filtro temporal

Alcance: `docs/SPEC-FILTRO-TEMPORAL.md`, líneas 1–92. Revisión estática, sin ejecución de pruebas ni navegador. No se han consultado memoria, historial, otras secciones de la especificación ni fuentes externas. Las carencias señaladas se refieren exclusivamente a este alcance.

## Archivos efectivamente leídos

- Persona completa: `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/agents/design_critic.md`.
- Estándar completo: `/home/pelayo/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/feature-spec-standard.md`.
- Especificación: líneas 1–92.
- `src/app.js`: búsqueda de símbolos y fragmentos de almacenamiento, catálogo, fichas, fechas, filtros, selección, duración, conflictos, recomendaciones, parrilla y restablecimiento de filtros.
- `src/index.html` y `src/styles.css`: coincidencias de ajustes, accesibilidad y estados desactivados; fragmento de variables CSS.
- `README.md` y `build.py`: lectura mediante salida conjunta, parcialmente truncada; lectura adicional del inicio de `build.py`. No se afirma lectura íntegra de ambos.
- `data/screenings.json` y `data/films.json`: carga JSON completa para inspeccionar metadatos y contar campos incompletos; no lectura manual de cada registro.
- `tests/test_pass_filters_browser.cjs`, `tests/test_owned_tickets.cjs` y `tests/test_storage_failure.cjs`: contenido de las pruebas, sin ejecutarlas. No se abrieron los archivos adicionales que estas referencian.

No existe `.codegraph/` en la raíz comprobada. No se delegó trabajo. La escritura de este informe es la excepción expresamente solicitada al protocolo de solo lectura de la persona.

## Hallazgos

1. **Major — Faltan alternativas y sus costes concretos.** Objetivo: líneas 7–9 y 74–89. El alcance propone una única solución transversal sin evaluar alternativas, requisito obligatorio del estándar. La activación y el corte al inicio son restricciones de producto, pero no determinan la arquitectura: todavía caben una proyección temporal central frente a predicados repartidos, temporización periódica frente a próximos límites, y conversión horaria en construcción frente a ejecución. **Acción:** documentar las alternativas viables y justificar su rechazo por consistencia, mantenimiento, dependencias y funcionamiento del HTML offline. No basta atribuir todas las decisiones a la petición.

2. **Major — La conservación de horarios desconocidos entra en conflicto con el cierre de su día.** Objetivo: líneas 32–35, 57–61 y 66. Se exige mantener visible un pase de inicio desconocido, pero su día se cierra administrativamente y «Todos» solo contiene días activos. No se establece si el cierre suprime también ese pase; tampoco se define a qué medianoche remitir un registro cuya fecha sea inválida. Con una duración desconocida, el estado «Iniciado · fin sin confirmar» tampoco tiene una salida explícita para la parrilla al cerrar el día. Los 278 registros actuales tienen fecha, hora y duración presentes; esto no prueba su validez ni resuelve los casos que la propia propuesta promete soportar. **Acción:** definir precedencia entre visibilidad del pase y cierre administrativo, tratamiento de fecha inválida y estado de parrilla posterior al cierre. Añadir ejemplos verificables para cada caso.

3. **Major — La excepción histórica de listas no tiene una frontera de filtrado definida.** Objetivo: líneas 49 y 53; integración en línea 84. Se exige aplicar la misma colección temporal a Explorar y sus contadores, pero también mantener consultables las listas guardadas y descartadas. Actualmente `matchingFilms()` combina el catálogo con `onlyMyLists` y `showDiscarded`; no son necesariamente colecciones independientes. Un filtro temporal incondicional dentro de esa función eliminaría precisamente el histórico que debe conservarse. **Acción:** precisar si estos dos modos de Explorar exceptúan la caducidad con el ajuste activo, o indicar el acceso histórico alternativo. Definir qué colección usa cada contador y la navegación de fichas en esos modos.

4. **Major — No está definido el modo histórico del análisis de conflictos.** Objetivo: líneas 69–72. La especificación limita los conflictos operativos a futuros/en curso, pero al desactivar el ajuste restituye visibilidad y elegibilidad históricas. No aclara si elegir un pase pasado vuelve a mostrar sus solapes históricos y avisos de encaje. En el código, `renderProgram()` analiza la selección completa y el filtro «ocultar conflictos» de Pases consulta también `selectedPlanEvents()`; cambiar solo la parrilla produciría resultados divergentes. **Acción:** fijar por modo el conjunto de eventos para estadísticas, sugerencias, acciones rápidas y exclusión por conflictos. Explicitar si el histórico conserva el comportamiento actual o muestra avisos exclusivamente operativos, y mantener separada la selección completa destinada a exportación.

5. **Major — El soporte de sesiones que cruzan medianoche no cubre su integración con conflictos.** Objetivo: líneas 24–28 y 69. La propuesta mantiene una sesión del 15 hasta su final el 16 y calcula conflictos sobre eventos futuros/en curso. Sin embargo, `compareScreenings()` devuelve inmediatamente `separate` cuando las fechas difieren. Así, una sesión en curso del día anterior puede no bloquear una elección posterior a medianoche, aunque ambas estén dentro del conjunto operativo. **Acción:** decidir expresamente si los conflictos entre fechas se incluyen en el cambio; si se incluyen, comparar intervalos absolutos en Madrid y revisar los traslados asociados. Si se excluyen, declarar esa limitación sin presentar los avisos operativos como cobertura de estos solapes.

6. **Nit — Las fronteras temporales carecen de un contrato verificable en este alcance.** Objetivo: líneas 13, 28 y 76–80. Se especifican resultados y una lista de funciones, pero no dónde se obtiene y comparte la instantánea temporal ni cómo se convierte fecha/hora de Madrid sin depender de la zona del dispositivo. Son puntos especialmente sensibles porque la misma evaluación debe gobernar catálogo, días, ficha abierta y planificación. **Acción:** describir el componente responsable, sus entradas y salidas, y criterios de aceptación con reloj controlado: instante exacto de inicio/final, otra zona del dispositivo, salto del reloj, reanudación y conservación de foco. Las pruebas existentes leídas no constituyen evidencia de esos comportamientos nuevos.

## Preguntas para resolver al final

1. ¿Los modos «Mi lista» y «Descartadas» de Explorar deben conservar todo el histórico aun con el ajuste activo?
2. ¿Qué debe verse tras el cierre administrativo de un día si queda un pase de inicio o final desconocido, y qué ocurre si su fecha es inválida?
3. ¿Desactivar el ajuste recupera también los conflictos históricos y el encaje entre pases pasados?
4. ¿Forma parte del cambio corregir los conflictos y traslados entre sesiones de fechas distintas que se solapan a medianoche?
