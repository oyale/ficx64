# Validación de la implementación del filtro temporal

Fecha: 13/11/2026. Cambio local, sin commit, push o publicación.

## Resultado

Implementado el ajuste activado por defecto y la proyección temporal de catálogo, fichas, Pases, días, parrilla y compartidos. Mi lista/Descartadas y sus fichas conservan el histórico. Compartidos conserva elecciones explícitas y pliega el pasado sin preseleccionarlo. Los eventos de parrilla permanecen mientras están en curso. No se borran selecciones ni entradas al pasar el tiempo.

Los límites se interpretan en Europe/Madrid: Temporal nativo cuando existe y conversión Intl con verificación de componentes como alternativa offline sin dependencias. Se rechazan horas ambiguas/inexistentes. Los datos derivados se calculan una vez; un único temporizador revisa próximos límites y cambios del reloj, con reanudación y sincronización de preferencia entre pestañas.

## Evidencia automatizada

- `python3 build.py`: 224 películas y 278 pases; genera index.html, portable y recursos PWA. Sin cambios a build.py ni a los JSON.
- `node --check src/app.js` y `git diff --check`: pasan.
- `node tests/test_temporal_filter.cjs`: cinco pruebas de reglas, preferencia y etiqueta de final; límites exactos, Madrid invierno/verano, horas ambiguas/inexistentes, datos inválidos, encuentros, final máximo y catálogo incompleto/vacío.
- `node --test tests/test_temporal_filter.cjs tests/test_film_ordering.cjs tests/test_owned_tickets.cjs tests/test_storage_failure.cjs tests/test_clear_lists.cjs tests/test_service_worker.cjs tests/test_installation_state.cjs`: siete archivos pasan.
- `node tests/test_itinerary_pdf.cjs`: 11 pruebas pasan; incluye pdftotext, paginación, Unicode e histórico completo. Se ejecutó fuera del sandbox por restricción de lanzamiento de pdftotext.
- `python3 -m unittest discover -s tests -v`: 10 pruebas pasan, incluidas actualización reproducible de build y contratos estáticos de accesibilidad.
- `node tests/test_temporal_filter_browser.cjs`: Chromium real con reloj y temporizadores inyectados solo por el test, zona del navegador America/New_York y horarios Madrid. Comprueba cruce exacto de inicio y fin, día hasta último final, identidad del diálogo abierto, navegación desactivada al salir del catálogo, listas/fichas exentas, estados de desplegables independientes, prioridad, conservación de entradas y selecciones, resúmenes de encaje/conflictos y contenido exportado (excluyendo solo exportedAt), preferencia, storage y compartidos con filtro apagado.
- `FICX_TEMPORAL_INVALID=1 node tests/test_temporal_filter_browser.cjs`: fixtures con fecha ausente, cadena inválida y día imposible. Pases, ficha, parrilla y compartidos se pintan sin excepciones de fecha ni normalización silenciosa.
- `FICX_TEMPORAL_URL=http://127.0.0.1:18765/index.html node tests/test_temporal_filter_browser.cjs`: misma comprobación por HTTP local. El puerto 8765 estaba ocupado y no se tocó su servidor.
- Portable copiado como único archivo a `/tmp/ficx-temporal-portable-smhag9tw/ficx64-portable.html`: la prueba de navegador pasa sin acompañantes. No se introducen dependencias de red para el filtro.

Se ejecutaron secuencialmente los 14 archivos `tests/*browser.cjs`; todos pasaron durante la integración. Después de las correcciones de revisión se repitieron las suites afectadas: temporal, fixtures inválidos, Pases, compartidos, entradas y tarjetas/poster. Las suites de red/PDF también comprobaron offline, descarga desde portable aislado y conservación de programa. Los resultados no equivalen a pruebas de todos los navegadores.

## Invariancia y revisión

Comparación literal contra HEAD: nueve funciones permanecen idénticas: compareScreenings, evaluatePlanChoice, programFitRank, selectedPlanEvents, visiblePlanChoices, analyzeProgram, buildExportPayload, buildCalendar y buildItineraryDocument. La prueba de navegador confirma además igualdad de resúmenes y del payload personal al cruzar el inicio.

Revisión independiente de diff contra HEAD en dos ejes, especificación y defectos del código. Se corrigieron las observaciones sobre claves de foco/desplegables (región + película/pase), prioridad de ficha estable, formato de fechas, mensajes vacíos, anuncios por interacción y navegación limitada a su colección de origen. La prueba de las correcciones forma parte de las suites anteriores. No se hizo commit.

## Fallo preexistente y límites

`node tests/test_film_swipe.cjs` pasa sus 20 primeras pulsaciones tras swipe y el desplazamiento vertical, pero falla en «Mobile hides the Synopsis label». Reproducido con el mismo resultado en una copia limpia de los archivos de HEAD bajo `/tmp/ficx-baseline-3rmjq0xe`. No se cambió esa prueba ni el diseño de Sinopsis para ocultar el fallo. Las aserciones posteriores a ese fallo no se ejecutaron. Por ello no se declara la suite global completamente verde.

El primer arranque de Chromium y pdftotext dentro del sandbox falló por restricciones del entorno; las ejecuciones fuera del sandbox sí validaron los comportamientos indicados. Hubo una carrera de limpieza del perfil de la prueba nueva, resuelta con reintentos limitados sobre su directorio temporal después de terminar Chromium.

No se ha probado manualmente con lector de pantalla, Safari/Firefox, dispositivos físicos ni con la app cerrada. Las comprobaciones de anuncios verifican el DOM y la región central; no prueban la salida de un lector real. Un reloj de dispositivo incorrecto cambia lo mostrado. El motor existente de conflictos entre fechas sigue fuera del alcance. Las pruebas de fechas inválidas protegen presentación; no certifican cálculos con datos malformados.

## Artefactos locales

- App: `/home/pelayo/projects/ficx64/ficx64-repo/dist/index.html`.
- Portable: `/home/pelayo/projects/ficx64/ficx64-repo/dist/ficx64-portable.html`.
- Capturas: `/tmp/ficx-temporal-390.png` y `/tmp/ficx-temporal-1280.png`; capturas de regresión de Pases también disponibles en `/tmp/ficx-passes-*.png`. No se incorporan al repositorio.
- Se preservan los archivos ajenos previamente presentes y el enlace local de Vercel. No se editan datos del festival, skills-lock.json, PDF de revisión ni fixtures del usuario.


## Ampliación: mostrar pases en curso hasta el final

Autorizada después de la implementación inicial. Pases, fichas, opciones y catálogo conservan la sesión en curso y la película hasta su final calculado. La etiqueta común muestra «En curso · hasta las HH:mm» en Europe/Madrid y añade dd/mm si termina en otra fecha. La parrilla reutiliza esa etiqueta sin duplicar un final redondeado. El final desconocido se muestra como tal y no se inventa un corte. Compartidos mantiene sus reglas anteriores de agrupación y preselección; los algoritmos siguen intactos.

- Prueba temporal de Chromium: visible en el inicio exacto y hasta un milisegundo antes del final; retirada exacta al finalizar; película en catálogo y ficha abierta coherentes; selecciones, resúmenes y exportaciones conservados.
- Prueba pura nueva: encuentro que cruza medianoche, etiqueta 00:10 · 19/11 y desaparición del estado al finalizar.
- Regresiones ejecutadas: fechas inválidas en Chromium, Pases, compartidos, entradas; suites Node de temporal, orden, entradas y almacenamiento; ocho contratos estáticos de accesibilidad.
- Build regenerado y diff sin errores de espacios. Sigue vigente el fallo visual preexistente de Sinopsis documentado arriba; esta ampliación no lo modifica.

La regresión de Pases completó sus aserciones pero encontró dos veces una carrera ENOTEMPTY al borrar el perfil tras terminar Chromium. Se añadió el mismo reintento limitado de limpieza utilizado por la prueba temporal; no cambia las aserciones ni el comportamiento de la app.
