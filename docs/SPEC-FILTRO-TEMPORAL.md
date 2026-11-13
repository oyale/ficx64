# Programa actualizado según la hora

Estado: implementado localmente y validado; sin publicar. Actualizado: 13/11/2026.

Resultados y límites de la implementación: [validation.md](egm-filtro-temporal/validation.md).

## Cambio autorizado: pases en curso

Los pases permanecen visibles en Pases, fichas, opciones presentadas y Explorar desde su inicio hasta el final calculado, con «En curso · hasta las HH:mm» en horario de Madrid. Si cruzan medianoche se añade la fecha de final. La película sigue visible mientras tenga un pase futuro o en curso. Se ocultan exactamente al terminar; el filtro desactivado permite recuperar los terminados. Un final desconocido conserva el pase con «Iniciado · fin sin confirmar». No cambian encaje, selecciones, exenciones de listas ni reglas de incorporación de compartidos.

## Decisiones confirmadas tras la revisión EGM

El filtro cambia exclusivamente lo que se muestra. No modifica elegibilidad, selección, cobertura, encaje, sugerencias calculadas, conflictos ni sus algoritmos. Las vistas específicas de Mi lista y Descartadas quedan exentas del filtro. Desactivarlo recupera la presentación completa, incluidos los conflictos y pendientes históricos. En compartidos, los eventos pasados se muestran en un grupo plegado y sin marcar por defecto; pueden seleccionarse explícitamente. No desmarcar elecciones ya guardadas por el paso del reloj.

Comprobación de data/screenings.json el 13/11/2026: 278 pases, ninguno con fecha, hora o duración ausente o inválida (duración positiva); ninguno empieza entre 00:00 y 05:59. Cuatro alcanzan o cruzan medianoche: Mouse (15/11, final calculado 16/11 00:00), Princesa Burro (16/11, final 17/11 00:00), bloque Awaken thee, Romanian! / Vade Retro (18/11, final 19/11 00:10) y Mujer desconocida (18/11, final 19/11 00:22). Finales calculados con duración del pase y minutos de encuentro; no son horarios de final publicados.

No se requiere offset para los horarios actuales: el día se mantiene visible hasta el máximo final calculado de sus sesiones, aunque sea al día siguiente. No se amplía el alcance al motor de conflictos entre fechas. Los casos de horario incompleto son defensivos, no registros detectados en el catálogo actual. Ante datos futuros incompletos se conservan visibles, sin inventar su final ni declarar automáticamente cerrado el día afectado; se elimina el cierre administrativo por medianoche.

## Objetivo

Mostrar por defecto lo que aún se puede ver durante el festival, actualizando la interfaz sin recargar. Permitir consultar todo el histórico desactivando una opción en Ajustes. Debe funcionar sin conexión y sin requerir servidor ni telemetría.

La petición establece la activación por defecto, el corte de los pases al terminar y el cierre de los días al terminar su última sesión. El comportamiento detallado siguiente es la propuesta de implementación, no funcionalidad existente.

## Reglas temporales

Una única lectura del reloj por actualización determina todos los estados:

| Elemento | Regla con el ajuste activo |
| --- | --- |
| Pase futuro | `ahora < inicio`: visible en las vistas filtradas. |
| Pase iniciado | Se mantiene visible y se etiqueta en curso; no cambia su elegibilidad interna. |
| Pase en curso | `inicio <= ahora < fin`: visible con «En curso · hasta las HH:mm» en Pases, ficha, opciones y parrilla. |
| Pase terminado | `ahora >= fin`: se oculta de la vista habitual de la parrilla, conservando todos sus datos. |
| Película | Se oculta de Explorar cuando todos sus pases con final conocido han terminado y no tiene pases de final desconocido. |
| Día | Se desactiva cuando han terminado todas sus sesiones, no cuando empieza la última. |

El inicio es el horario del pase, incluido el inicio de un encuentro cuando así está definido en los datos. El final usa la duración ocupada del pase: duración más los minutos de encuentro, según `plannedMinutes()`. No cambia la duración cinematográfica de la ficha. Para bloques de varias películas se usa la duración del pase, no la suma improvisada de fichas.

Se toma el máximo de los finales de todas las sesiones de la fecha: no necesariamente termina la última que empieza. El cierre del día no depende de los filtros de sede, acceso, entradas o listas de cada persona. Una sesión que comienza el 15 y termina el 16 sigue perteneciendo al día 15 hasta acabar.

Los horarios son de **Europe/Madrid**, independientemente de dónde esté el dispositivo. No interpretar `date + time` en la zona local del navegador. El reloj del dispositivo es la referencia; no se consulta una hora remota. Adelantar o atrasar el reloj puede ocultar o volver a mostrar elementos.

### Información incompleta

- Inicio desconocido o inválido: mantener el pase visible, sin afirmar que ha pasado; no descartarlo automáticamente.
- Duración desconocida: el pase permanece visible al empezar con final sin confirmar, pero no se inventa su final ni cambia su elegibilidad interna. En la parrilla se indica «Iniciado · fin sin confirmar».
- Si alguna sesión no permite determinar el fin, mantener el día afectado sin cierre automático; en la parrilla el pase permanece visible con aviso de incertidumbre. En Pases y fichas, el final conocido determina cuándo se oculta. Una fecha inválida no se asigna artificialmente a otro día. No hay casos así en el catálogo comprobado.
- Películas sin sesiones: conservarlas con «Sin pases publicados». No confundir ausencia de horarios con sesiones agotadas.

## Comportamiento de la interfaz

### Ajustes

Checkbox **«Ocultar lo que ya ha pasado»**, activado por defecto. Ayuda: «Los pases se muestran como en curso desde que empiezan y se ocultan al terminar. Desactívalo para consultar todo el festival. Horarios de Xixón».

Persistir un booleano en `ficx64-hide-past-v1`. Ausencia, lectura fallida o valor inválido equivalen a activado; solo `false` lo desactiva. Si falla la escritura, aplicar el cambio durante la sesión y usar el aviso de almacenamiento existente. Cambiarlo actualiza las vistas inmediatamente y se sincroniza entre pestañas mediante `storage` cuando esté disponible.

Es una preferencia local de presentación: no se añade a enlaces compartidos ni a exportaciones de listas. «Restablecer filtros» no la modifica. «Borrar mis datos» la restablece al valor por defecto, documentándolo en su alcance.

### Explorar y fichas

- En Explorar general, filtrar películas sin pases futuros o en curso, respetando las excepciones de horarios desconocidos o sin sesiones; aplicar la misma colección visible a contadores, paginación y navegación anterior/siguiente. El acceso especial mantiene sus reglas actuales: el tiempo no convierte un pase privado en público.
- Una película con solo pases futuros especiales sigue visible, con el aviso de acceso correspondiente. La caducidad no depende de activar el acceso especial en la planificación.
- En las fichas, ocultar los pases terminados de las opciones para elegir. Si no quedan, mostrar «No quedan pases pendientes o en curso» y acceso a Ajustes para consultar los anteriores.
- Si vence la película de una ficha abierta, mantenerla abierta y actualizar sus pases y aviso; al cerrarla desaparece de los resultados. No desplazar automáticamente al usuario a otra película.
- Las vistas específicas de Mi lista y Descartadas no aplican el filtro temporal y siguen siendo consultables como histórico; mostrar «Sin próximos pases» cuando corresponda. No convertir automáticamente una película en vista, descartada o eliminada.

### Pases y días

- Excluir los pases terminados además de los filtros actuales. «Todos» significa todos los días aún activos.
- Mantener visibles los chips de días cerrados, atenuados y con `disabled`, con una explicación textual accesible. No distinguirlos únicamente por color.
- Un día cuya última sesión está en curso permanece habilitado, aunque ya no tenga pases por empezar. En ese caso: «Ya han empezado todos los pases de este día».
- Al cerrarse un día seleccionado, retirarlo de `activeDates`; conservar los demás. Si no queda ninguno, pasar a «Todos» y anunciar brevemente el cambio.
- Al terminar el festival: «El festival ha terminado. Desactiva “Ocultar lo que ya ha pasado” en Ajustes para consultar el programa completo». Diferenciarlo de cero resultados por búsqueda o filtros.

### Mi programa, datos y compartidos

- Mantener íntegros `plannedScreenings`, `plannedStandalone`, `ownedTickets`, intenciones, prioridades y descartes. El reloj solo cambia la proyección visible.
- La parrilla muestra los eventos futuros y en curso. Los terminados se recuperan al desactivar el ajuste. Los selectores de día usan el cierre global del día y no dejan un día caducado seleccionado.
- Ocultar visualmente los pases terminados en las vistas filtradas, sin modificar el cálculo de encaje, sugerencias, cobertura o conflictos. No añadir guardas temporales a las acciones: esta funcionalidad es solo un filtro de presentación.
- Conservar la elección de un pase pasado y permitir quitarla o sustituirla por uno futuro. «Tengo entrada» se conserva y sigue siendo editable al consultar el histórico.
- Distinguir total guardado y pases visibles cuando sea necesario para explicar la vista. Los conflictos, cobertura, pendientes y encaje mantienen sus cálculos actuales sobre la selección completa; no recalcularlos sobre la proyección filtrada.
- La vista de compartidos agrupa los eventos pasados bajo «Eventos pasados», plegado inicialmente y sin nuevas casillas marcadas por defecto. Permite desplegar y seleccionar explícitamente el histórico. Las acciones masivas por defecto no seleccionan ese grupo. No desmarcar elecciones persistidas existentes. Importar una copia completa conserva sus elecciones, incluso históricas; no confundir restauración con preselección de nuevos eventos compartidos.
- JSON, enlaces compartidos, PDF, ICS y pases de cartera conservan su alcance actual y todos los datos guardados. No filtrar `selectedPlanEvents()` globalmente: también alimenta cálculos y exportaciones.
- Desactivar el ajuste restablece la presentación histórica completa; no restaura selecciones de filtros que se hubieran retirado al caducar.

## Actualización y accesibilidad

Evaluar al arrancar, al cambiar el ajuste, al recibir `storage`, al recuperar foco, en `pageshow` y al volver a estar visible. Programar el siguiente inicio o final relevante mediante un único temporizador, con revisión máxima cada 30 segundos para detectar cambios del reloj. Recalcular desde la hora real, no acumular ticks.

En primer plano, actualizar en el primer turno disponible después del límite temporal. En segundo plano los navegadores pueden suspender temporizadores: recalcular al regresar, sin prometer ejecución mientras la app esté cerrada. Detener el temporizador al desactivar la función salvo que exista una revisión de compartidos abierta; en ese caso mantenerlo para clasificar sus eventos. Evitar temporizadores duplicados.

No repintar toda la aplicación cada segundo. Actualizar solo si cambian estados; preservar búsqueda, scroll, foco, desplegables y ficha abierta. Si desaparece un control enfocado, llevar el foco al siguiente control disponible o al encabezado de resultados. Un mensaje `aria-live="polite"` informa de cambios relevantes sin anunciar cada pase individualmente. No abrir diálogos por el paso del tiempo.

## Puntos de integración comprobados en el código

- `src/app.js`: almacenamiento con `saveLocalValue()`; catálogo con `matchingFilms()`, `filmsForSection()` y `renderFilms()`; fichas con `renderFilmScreenings()` y `filmNavigationIds`.
- Pases: `renderDateChoices()` contiene actualmente las fechas 13–21 de noviembre; `updateSessionSummary()` combina los filtros existentes.
- Planificación: `visiblePlanChoices()`, `renderProgram()`, `renderPassQuickActions()` y `handleQuickAction()`. Aplicar el filtro únicamente al presentar opciones; conservar sin cambios los evaluadores de sugerencias y orden por encaje.
- `selectedPlanEvents()` devuelve actualmente la selección completa. Conservar ese contrato. `plannedMinutes()` define la duración ocupada.
- `src/index.html`: panel Ajustes y ayuda. `src/styles.css`: estados desactivados y mensajes siguiendo los estilos existentes.
- `build.py`: empaqueta la app en un HTML offline. Pruebas existentes: `tests/test_pass_filters_browser.cjs`, `tests/test_owned_tickets.cjs`, `tests/test_storage_failure.cjs`, entre otras.

Los puntos anteriores se identificaron durante el diseño estático; la implementación y las comprobaciones posteriores constan en validation.md.

## Contratos y límites de implementación

### Dominio y colecciones

«Pase», «sesión» y «evento» designan un registro de `screeningRecords`, incluso actividades sin película. `plannedScreenings` vincula películas a pases elegidos; `plannedStandalone` conserva actividades elegidas sin película. Ambos participan en la parrilla y se preservan íntegros. Intenciones y descartes son estados de películas, no estados temporales.

La fecha completa procede de `screening.date`; la hora de `screening.time`. Los chips se derivan de las fechas válidas de los registros, no de un calendario nuevo ni del huso local. Un día se cierra solo si tiene sesiones y todas tienen inicio y final conocidos y vencidos. El mensaje de festival terminado requiere un conjunto no vacío de sesiones y todos sus días cerrados, sin registros de fecha o final desconocido. Un catálogo vacío muestra «No hay horarios publicados»; no se interpreta como festival terminado.

La colección persistida es siempre la entrada de los algoritmos existentes. El filtro se aplica después del cálculo, al producir el marcado de catálogo, pases, opciones y agenda. No se modifican `compareScreenings()`, `evaluatePlanChoice()`, `programFitRank()`, `selectedPlanEvents()` ni los handlers de selección por razones temporales. Un conflicto con un evento oculto puede seguir apareciendo: debe indicarse «Los cálculos incluyen tu programa completo» cuando sea necesario para interpretar ese aviso. Desactivar el ajuste elimina exclusivamente esta proyección visual.

Las fichas abiertas desde Mi lista o Descartadas heredan su exención, incluidos pases, contadores y navegación. Mantener `filmDialogTemporalExempt` separado de `onlyMyLists/showDiscarded`: `openFilmFromList()` lo activa; las aperturas desde catálogo lo toman del modo de origen; desde Pases, Mi programa y compartidos lo desactivan. La navegación conserva este contexto y el cierre lo limpia; la siguiente apertura siempre lo establece explícitamente. En Explorar general se conserva abierta la ficha que deje de pertenecer a resultados; si su ID deja de pertenecer al orden visible, ambas flechas y los gestos anterior/siguiente quedan desactivados hasta cerrar la ficha. Si pertenece, usan el orden visible actualizado. Las listas pendientes de Mi programa conservan su composición; solo las filas de opciones de pase se filtran visualmente. No se inventa una nueva categoría de pendientes ni se recalcula cobertura.

En compartidos, «pasado» significa inicio conocido menor o igual al instante actual. El grupo plegado se mantiene también al desactivar el filtro, pues permite revisar una propuesta recibida sin preseleccionar históricos. El marcado masivo excluye ese grupo; marcar un histórico individualmente sigue permitido por las reglas actuales. Si una casilla ya marcada por el usuario cruza el inicio mientras está abierta la revisión, conserva su estado. Restaurar un JSON no es preseleccionar una propuesta: conserva todo el contenido importado.

Cuando la agenda filtrada queda vacía pero hay selección completa, distinguir: si la proyección temporal de toda la selección está vacía, mostrar «Tus pases anteriores siguen guardados. Desactiva “Ocultar lo que ya ha pasado” en Ajustes para verlos», con botón que desactive el checkbox mediante su mismo manejador. Si hay eventos temporalmente visibles pero ninguno coincide con día/entradas, conservar el mensaje actual de filtros. Si no hay selección completa, conservar el vacío inicial. Mostrar «X visibles de Y guardados» siempre que ambos totales difieran, sin sustituir contadores internos.

En una película pendiente con candidatos existentes pero cero opciones visibles por tiempo: «No quedan pases pendientes o en curso. Consulta los anteriores desactivando el filtro». Conservar los mensajes existentes de ausencia real o acceso especial cuando el tiempo no sea la causa. Si renderMaybeSuggestion calcula una recomendación ya terminada, no elegir otra por tiempo: ocultar solo su detalle de pase, acción e insignia de encaje; mostrar «La sugerencia calculada ya ha terminado. Consulta todos los pases desactivando el filtro». Mantener título, intención y controles de lista. Esto se aplica aunque exista otra alternativa futura; no crear un desplegable vacío ni insinuar que no existen otros pases. Probar estos tres vacíos y una recomendación terminada con alternativa futura.

La misma política se aplica a la rama `blocked` de renderMaybeSuggestion: si su alternativa más cercana ya terminó, ocultar fecha, hora, detalle e insignia de conflictos de ese pase y sustituirlos por «La alternativa calculada ya ha terminado. Consulta todos los pases desactivando el filtro». Conservar el título y controles de lista; no escoger otra alternativa ni cambiar los conflictos calculados. Probar alternativa pasada y otra futura también conflictiva.

Separar la inicialización de una nueva propuesta compartida de su repintado. Solo la primera limpia sharedSelection e inicializa la preselección de futuros state.listed. Cada repintado posterior deriva checked de sharedSelection y no de state.listed, sin clear ni preselección adicional. Conservar también las casillas que el usuario desmarcó, aunque sigan state.listed. Probar desmarcado de futuro preseleccionado seguido de actualización temporal.

Montar el diálogo de película en un contenedor estable independiente de #film-list; renderFilms solo reemplaza tarjetas. Extraer dentro de app.js la generación/actualización de ficha a un renderizador que recibe filmById.get(expandedId), aunque su película no esté en matchingFilms. No añadirla a resultados ni contadores. Conservar el nodo de dialog durante actualizaciones temporales; al navegar cambiar contenido dentro del mismo nodo. Las aperturas desde listas construyen su orden desde la lista de origen sin filtro temporal. Al extraer el diálogo, mantener una función de delegación de acciones reutilizada por #film-list y el host: resolver filmId primero desde data-film-id del diálogo y luego desde .film-row para tarjetas; no depender de una fila ancestro dentro del host. Actualizar syncFilmDialog, ajuste de sinopsis, cierre, retorno de foco y acuse de descarte para buscar por host/expandedId y conservar contexto de retorno a listas, Pases, programa o compartidos. Los listeners de clic actuales de lista se conectan también al host sin registrar duplicados; Escape sigue pasando por el cierre existente. Probar botón de cierre, Escape, intención, prioridad, descarte/deshacer y apertura de pases tras caducar la película, sin reemplazar el nodo dialog. Añadir en index.html el host estable y probar identidad del nodo antes/después de caducidad y apertura de histórico fuera del catálogo visible.

Centralizar anuncios: retirar aria-live de las listas completas de Pases/compartidos y role=status y aria-live del contador #film-list-progress del catálogo, conservando sus IDs y texto visual. Retirar también role=status y cualquier aria-live de #shared-pass-filter-summary; syncSharedPassFilterSummary conserva su texto visual pero sus anuncios por interacción pasan a la región central. Retirar también role=status de .pass-conflict-popover generado por passConflictWarning, conservando contenido y apertura manual. Auditar descendientes de resultados con role=status/alert/log o aria-live distinto de off; no basta inspeccionar el contenedor. Probar conflicto desplegado durante actualización, manteniendo apertura sin un segundo canal vivo. La región de estado nueva es la única salida viva para resultados. Los handlers de usuario publican allí el resumen que antes anunciaban aquellas regiones; los refrescos temporales solo publican los dos cambios permitidos. No alternar aria-live alrededor de innerHTML. Comprobar DOM sin regiones vivas de listas/contador y contenido de la región única al vencer un pase, al cerrar día seleccionado y al quedar resultados vacíos. La prueba DOM verifica el contrato de anuncios, no sustituye una prueba manual con lector de pantalla.

La presentación de fecha desconocida usa «Fecha sin confirmar», omite datetime y nunca llama Intl con una fecha inválida ni usa slice sobre valores ausentes. Usar el mismo validador temporal antes del formato en screeningCard, updateSessionSummary, formatProgramDate y render de compartidos. Las filas con fecha inválida van al final, en un grupo «Fecha sin confirmar» fuera de chips de días válidos, también en la parrilla; no se reasignan a hoy. Una selección explícita de fechas válidas excluye ese grupo; «Todos» permite consultarlo. En fichas y compartidos aparece sin fecha ficticia y sin clasificación como pasado. En grupos de parrilla de fecha desconocida renderizar filas sin cálculos de trayecto entre ellas. Esta protección es de presentación y no sanea ni reescribe los datos de entrada de los algoritmos existentes. Añadir fixtures de navegador con fecha ausente, cadena inválida y fecha imposible; verificar Pases, ficha, parrilla y compartidos sin excepciones de formato ni normalización silenciosa. Los cálculos con datos malformados siguen fuera de la garantía de esta entrega; no presentar su resultado como validado.

### Modelo temporal local

Mantener funciones puras dentro de `src/app.js`: `screeningTiming(screening)` devuelve `{startMs, endMs}`, con `null` para desconocido; `screeningTemporalState(timing, nowMs)` devuelve `unknown`, `future`, `ongoing`, `startedUnknownEnd` o `ended`. `buildTemporalView(records, nowMs)` devuelve estados por candidateId, cierre por fecha, `festivalEnded` y próximo límite futuro. Ninguna función lee ni escribe selecciones.

Validar fecha ISO completa por componentes y hora HH:mm entre 00:00 y 23:59. Duración finita y positiva; encuentro ausente equivale a cero, encuentro negativo o no finito hace desconocido el final. La suma utiliza la semántica de `plannedMinutes()` sin cambiar esa función para otros consumidores. Un inicio válido con fin desconocido puede ocultarse de búsqueda, pero nunca se declara terminado.

Conversión explícita sin dependencia: usar `Intl.DateTimeFormat` con `timeZone: "Europe/Madrid"`, calendario gregoriano, dígitos latinos y ciclo h23. Partir de componentes UTC, obtener offsets candidatos de Madrid a ambos lados de la fecha y verificar por round-trip todos los componentes. Aceptar solo una coincidencia exacta; cero o varias coincidencias —hora inexistente o repetida por cambio estacional— dan inicio desconocido. No ajustar silenciosamente ni asumir +01:00 para cualquier edición. Calcular el final sumando minutos transcurridos al instante de inicio. Fixtures: 13/11/2026 09:00 Madrid = 08:00Z; 01/07/2026 09:00 = 07:00Z; 29/03/2026 02:30 y 25/10/2026 02:30 se tratan como desconocidos.

### Estado de presentación y reloj

Un `refreshTemporalView()` obtiene una sola vez `Date.now()`, deriva la proyección y actualiza solo regiones con cambios. Su firma de comparación contiene IDs visibles, estados, días cerrados y preferencia; no el instante bruto. El temporizador único espera el mínimo entre próximo límite y 30 segundos. Se cancela al ocultarse el documento y se recalcula al volver. Con ajuste inactivo solo se mantiene el temporizador mientras exista una revisión de compartidos abierta; al cerrarla se cancela. Antes del marcado masivo se recalcula la clasificación con una sola lectura del reloj, incluso tras suspensión. Conservar decisiones individuales aunque el evento cambie de grupo. En las demás vistas, las etiquetas se actualizan al navegar o recuperar foco.

Antes de reemplazar una región mediante los renderizadores existentes, capturar foco por ID o clave semántica (candidateId/filmId más acción), estados `details.open` por clave y posición de scroll de ventana y contenedores. Restaurar apertura y foco con `preventScroll`; si el control desaparece, enfocar el siguiente de la misma colección y, si no existe, su encabezado con tabindex=-1. Restaurar scroll tras el render, limitado al máximo disponible. No reconstruir un diálogo abierto: actualizar sus pases y navegación conservando nodo, título y lectura. Anunciar únicamente retirada del día seleccionado y cambio a resultados vacíos; no cada pase ni cada revisión del reloj.

La preferencia se guarda como cadena `"true"` o `"false"`; solo la segunda desactiva. Usar el resultado booleano de `saveLocalValue()`, que captura errores internamente. Un evento `storage` de esta clave actualiza memoria y checkbox sin escribir de vuelta; `newValue === null` restaura el valor por defecto. Un evento con `key === null` (clear de otra pestaña) también lo restaura sin escritura de vuelta. Añadir «Restablecer filtro temporal» junto al checkbox, siempre disponible, incluso sin listas: guarda true mediante el mismo helper. «Borrar mis datos», cuando esté disponible, hace lo mismo al completar el borrado; la ausencia de datos no obliga a mostrar su botón. Una escritura correcta retira el fallo de esa clave del aviso; una fallida conserva preferencia de sesión y aviso.

### Alternativas y límites

Se elige una proyección local en app.js frente a repartir decisiones en evaluadores: conserva el encaje y evita alterar contratos de exportación. Se mantiene la conversión en cliente frente a precomputar instantes en Python: evita cambiar datos y build en esta entrega y permite fixtures inyectados con el mismo contrato. El temporizador por límites con revisión acotada evita repintar continuamente y detecta cambios del reloj. No se añade histórico local adicional: basta el ajuste global y las vistas de listas exentas.

No se añade offset: el máximo final del día cubre las sesiones actuales hasta las 00:22. Corregir conflictos entre fechas es otra tarea. No se crean cachés invalidables, servicios de hora, dependencias, telemetría ni migraciones. El reloj local no es una autorización de acceso y no sustituye reglas de acceso especial. El coste esperado es lineal sobre 278 registros en cada revisión y solo se repinta si cambia la firma. Comprobar en navegador que las revisiones sin cambios no reemplazan nodos; no afirmar rendimiento medido antes de implementarlo.

## Plan de implementación

Lista cerrada de archivos de producción a modificar: `src/app.js` (modelo, preferencia y presentación), `src/index.html` (checkbox, restablecimiento, ayuda y región de anuncios), `src/styles.css` (chips desactivados y grupo histórico). No se crean módulos de producción, no se modifican datos, build.py, service worker ni algoritmos de encaje.

1. **Modelo aislado.** Crear `tests/test_temporal_filter.cjs` con extracción VM de las funciones puras, siguiendo el patrón actual de pruebas. Añadir el modelo a app.js sin conectarlo aún. Ejecutar `node tests/test_temporal_filter.cjs`: límites exactos, Madrid/UTC/América, verano/invierno, horas ambiguas, campos inválidos, encuentros y cierre máximo. Puerta: reglas deterministas sin nuevos efectos de presentación.
2. **Preferencia y actualización.** Conectar lectura, checkbox, restablecimiento, almacenamiento y ciclo de reloj. Crear `tests/test_temporal_filter_browser.cjs` con infraestructura CDP del test de Pases. Inyectar antes de la carga un Date controlado y una cola de timers que avance al mismo instante; conservar Date constructor, parse y UTC. El reloj de prueba vive exclusivamente en el script de prueba. Probar un temporizador activo, reanudación y ausencia de repintado sin cambio. Antes de la puerta ejecutar `python3 build.py` y `node tests/test_temporal_filter_browser.cjs` sobre dist recién generado. Puerta: persistencia y ciclo correctos, sin pérdida de datos.
3. **Vistas filtradas.** Integrar proyección en matchingFilms y renderizadores con exención explícita de onlyMyLists/showDiscarded; conservar firmas previas y separar cómputos de marcado. Actualizar fichas, chips, agenda y opciones presentadas sin cambiar sus evaluadores. Probar la misma selección antes/después de un inicio y comprobar igualdad de resultados de encaje/conflictos y exportación. En esta fase modificar test_pass_filters_browser.cjs para reloj fijo previo al festival y test_film_ordering.cjs para inyectar contexto temporal en VM. Antes de la puerta ejecutar `python3 build.py`, ambos tests temporales y esas dos regresiones. Probar ficha histórica abierta mediante openFilmFromList con filtros de catálogo apagados y ficha intermedia que desaparece del orden, tanto con botones como gestos. Puerta: cambio exclusivamente visual y preservación de foco/scroll/aperturas a 390 y 1280 px.
4. **Compartidos y regresión.** Agrupar pasados en render de compartidos sin cambiar sharedPassState ni handlers de incorporación individual. Excluirlos únicamente de preselección masiva, conservando decisiones explícitas durante la revisión. Añadir casos a la prueba nueva de navegador. Las adaptaciones de tests/test_pass_filters_browser.cjs y tests/test_film_ordering.cjs ya se completaron en fase 3; mantenerlas en la regresión. Ampliar `tests/test_owned_tickets.cjs` y `tests/test_storage_failure.cjs` para probar invariancia de entradas y fallo de la nueva clave. Antes de la puerta ejecutar `python3 build.py`. Puerta: pasan las seis suites test_temporal_filter.cjs, test_temporal_filter_browser.cjs, test_pass_filters_browser.cjs, test_film_ordering.cjs, test_owned_tickets.cjs y test_storage_failure.cjs, sin depender de fecha real. Incluir compartidos abiertos con ajuste apagado y cruce del inicio: reclasificación, exclusión masiva y conservación de elección individual.
5. **Build y aceptación.** Ejecutar `python3 build.py`, los dos tests nuevos y las cuatro suites existentes anteriores con `node tests/<nombre>.cjs`; ejecutar `python3 -m unittest discover -s tests -p 'test_update_build.py'` y `git diff --check`. Servir dist con `python3 -m http.server 8765 --directory dist` y comprobar index.html por HTTP; copiar solo `dist/ficx64-portable.html` a un directorio temporal y abrirlo mediante file://, sin acompañantes ni red. Verificar filtro, preferencias, exportación histórica y PDF en ambos productos. Capturas de inicio/final, listas exentas, ficha abierta y compartidos en 390/1280 px. Registrar comandos, resultados y rutas en `docs/egm-filtro-temporal/validation.md` cuando se implemente; actualizar estado de esta spec.

Archivos de pruebas autorizados: crear los dos tests temporales citados; modificar únicamente los cuatro tests existentes enumerados en fase 4. Generados por build: `dist/` (sin borrar `.vercel` ni alterar linkage local). Documentación a modificar al implementar: esta spec y crear validation.md. Cualquier ampliación de esta lista debe justificarse antes de tocar archivos adicionales.

Hitos relativos: modelo → preferencia → vistas → compartidos/regresión → aceptación. No se fija fecha ni presupuesto de ejecución sin medir el primer hito. Si el esfuerzo crece, posponer mejoras adyacentes de histórico o conflictos; no recortar conservación de datos ni pruebas de invariancia. No hay autorización para commit, push o publicación.

## Criterios de aceptación y pruebas

| Caso | Resultado requerido |
| --- | --- |
| Instalación nueva y actualización de una existente | Ajuste activo salvo `false` guardado; listas anteriores intactas. |
| Inicio exacto | El pase sigue visible y aparece la etiqueta en curso sin interacción. |
| Un milisegundo antes del final y final exacto | Visible hasta el final, oculto exactamente al terminar. |
| Final de último pase de una película | Desaparece de Explorar; ficha abierta y listas se conservan. |
| Dos pases del mismo título en días diferentes | Sigue visible hasta que termina el último pase. |
| Última sesión iniciada, aún no terminada | Día activo; sesión guardada «En curso»; visible en los resultados de búsqueda. |
| Final exacto del último pase del día | Día desactivado, filtros saneados y parrilla actualizada. |
| Pase temprano que termina después del último inicio | El día espera al máximo final. |
| Encuentro y bloque de varias películas | Fin calculado con la duración ocupada del pase, sin duplicarla. |
| Sesión que cruza medianoche | Sigue en curso y su día activo hasta su final. |
| Horarios/duración ausentes o inválidos | Política conservadora sin cierre administrativo inventado. |
| Navegador en Madrid, UTC y América | Misma caducidad para un mismo instante; probar también conversión en invierno/verano. |
| Pestaña suspendida, restauración y reloj adelantado/atrasado | Recalcula al regresar; elementos pueden reaparecer. |
| Desactivar/reactivar y recargar | Visibilidad inmediata y preferencia persistida. |
| Fallo de localStorage y cambio en otra pestaña | Preferencia de sesión operativa, aviso y sincronización sin bucles. |
| Búsqueda, acceso especial, entradas y filtros combinados | Intersección correcta sin modificar sus reglas. |
| Vistas específicas Mi lista y Descartadas | Contenido completo, exento del filtro temporal. |
| Encaje y conflictos antes/después del paso del reloj | Mismos resultados internos; solo cambia la presentación. |
| Compartidos con eventos pasados | Grupo plegado y sin nuevas selecciones por defecto; selección explícita permitida. |
| El reloj cruza el inicio de un pase | Se oculta su presentación donde corresponda, sin modificar selección ni reglas de encaje. |
| Exportar, importar y compartir un histórico | Mismos IDs y elecciones; no pierde entradas ni sesiones. |
| App offline y archivo `file://` | Misma lógica temporal sin solicitudes nuevas. |
| Fin del festival | Vacío explicativo y acceso a Ajustes; histórico recuperable. |
| Teclado, ficha abierta, móvil 390 px y escritorio 1280 px | Sin cierre forzado, pérdida de foco, saltos innecesarios ni desbordamientos. |

Pruebas nuevas propuestas: `tests/test_temporal_filter.cjs` para reglas y persistencia, y `tests/test_temporal_filter_browser.cjs` para integración con reloj controlado. Capturar pantallas antes/después de inicio y final. La suite no debe depender de esperar hasta una fecha real ni introducir un reloj de simulación en la interfaz de producción.

## Estado de entrega

- Specs y plan redactados a partir del código actual.
- Implementación local, pruebas nuevas, regresiones, build y comprobación en Chromium realizados tras autorización del autor.
- Persiste un fallo visual preexistente en test_film_swipe.cjs, reproducido contra HEAD; véase validation.md. Sin commit, push ni publicación.
