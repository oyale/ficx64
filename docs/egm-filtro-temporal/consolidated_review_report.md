# Informe consolidado EGM — filtro temporal

## Dictamen

La especificación necesita aclaraciones. El plan no supera aún el estándar de preparación para implementación: permite decisiones divergentes sobre histórico, horarios desconocidos y cálculos operativos. La especificación original y la app no se han modificado.

Revisores con contexto nuevo (`fork_context:false`) lanzados directamente desde la sesión principal. La primera delegación no pudo lanzar revisores anidados; sus registros de no ejecución se sustituyen por informes reales. La exclusión de instrucciones del host no está comprobada. Las lecturas se declaran en los informes. No se ejecutaron pruebas, build ni navegador.

## Fases

- [Perspectiva inicial](zoom_out_report.md): perspectiva global e Inventive Catalyst.
- [Comprensión](comprehension_report.md): solo documento, sin código.
- [Crítica](critic_report.md): diseño, estructura y estilo.
- [Perspectiva intermedia](intermediate_zoom_out_report.md): nuevo revisor con informes anteriores.
- [Preparación para implementación](implementation_readiness_report.md): preparación y detalles del código combinados en un revisor.

Especificación: líneas 1–92; plan y aceptación: 93–133. Algunas revisiones se ejecutaron en paralelo; la perspectiva intermedia recibió los informes previos. No fue una secuencia estrictamente serial ni un ciclo de corrección y reauditoría.

## Acciones y trazabilidad

Referencias: Z=zoom_out_findings; I=catalyst_findings; C=comprehension_findings; D=design_findings; S=structural_findings; E=style_findings; R=implementation_readiness_report. Los números remiten al hallazgo original.

| ID | Prioridad | Acción | Origen |
| --- | --- | --- | --- |
| A1 | Major | Resolver precedencia entre horarios desconocidos, cierre administrativo, visibilidad y fin del festival; cubrir fecha inválida y catálogo vacío. | Z1, I1, C2, C5, D2 |
| A2 | Major | Delimitar histórico en listas, fichas y compartidos; separar recuperación de recomendaciones nuevas. | Z2, I2, D3 |
| A3 | Major | Fijar cobertura, pendientes y conflictos en ambos modos; decidir película con pase histórico elegido y otro futuro. | I3, C4, D4, R4 |
| A4 | Major | Decidir alcance de conflictos y traslados que cruzan medianoche; el comparador actual separa fechas diferentes. | D5 |
| A5 | Major | Cerrar ubicación del modelo, contratos, conversión Madrid, validaciones y archivos por fase. | D6, R1, R2 |
| A6 | Major | Definir actualizaciones de regiones e identidad/restauración de foco, aperturas y scroll. | R3, E4 |
| A7 | Major | Enumerar todos los handlers y candidatos que necesitan revalidación, distinguiendo añadir, quitar e importar. | R4, R5 |
| A8 | Major | Fijar reloj controlado, mocks, suites, comandos y checkpoints; verificar app servida y portable aislado. | R6, R7 |
| A9 | Major | Resolver restablecimiento cuando solo hay preferencia y aviso de almacenamiento por clave. | R8 |
| A10 | Major | Añadir alternativas, glosario y límites proporcionados de seguridad, escala y esfuerzo. | D1, C1, C3, S1, S2, I4 |
| A11 | Nit | Uniformar términos y excepciones; redactar capacidades como requisitos; evitar invalidación de caché sin necesidad. | Z3, E1–E5 |

Major significa que faltan decisiones documentales; no demuestra un defecto ejecutado ni una vulnerabilidad. Seguridad, escala y presupuesto deben tratarse proporcionalmente a una app HTML local. No justifican añadir servidor o telemetría. Las alternativas de los revisores no son decisiones aprobadas.

## Siguiente paso documental

Resolver las decisiones de producto siguientes; después revisar la especificación con ejemplos por vista y modo, y cerrar el plan con archivos, contratos y checkpoints. A5–A9 pueden concretarse mediante análisis técnico sin trasladar cada detalle al usuario. No se han aplicado correcciones ni reauditado una versión revisada.

## Preguntas pendientes de producto

1. ¿Mi lista y Descartadas conservan todo el histórico con el ajuste activo? ¿Basta con el ajuste global para consultar anteriores o quieres un acceso local en la parrilla?
2. Si una película tiene un pase guardado terminado y otro futuro, ¿queda cubierta por el histórico o vuelve a estar pendiente de encajar?
3. Al desactivar el ajuste, ¿se recuperan también conflictos y pendientes históricos?
4. ¿La selección individual de compartidos puede recuperar pases pasados con el ajuste activo, manteniendo las recomendaciones masivas solo para futuros?
5. ¿Los pases de horario incompleto pasan al histórico al cierre administrativo o siguen en una categoría «Horario sin confirmar»?
6. ¿Incluimos los conflictos entre sesiones que se solapan a través de medianoche?

No se requiere al usuario elegir nombres de funciones, archivos o mocks. No hay autorización nueva para implementar, hacer commit, push o publicar.


## Respuestas del autor y actualización — 13/11/2026

La especificación original se ha actualizado después de este informe; las referencias de líneas anteriores corresponden a la versión revisada por los Goldfish. No se ha realizado una nueva revisión independiente.

- Mi lista y Descartadas quedan exentas en sus vistas específicas.
- El cambio es exclusivamente visual: no modifica encaje, selección, cobertura ni algoritmos de conflictos. Esto sustituye las recomendaciones anteriores de filtrar esos cálculos o añadir guardas temporales.
- Desactivar recupera la presentación completa, incluidos conflictos y pendientes históricos.
- Compartidos: eventos pasados plegados y sin nuevas selecciones por defecto; selección explícita permitida, sin desmarcar elecciones persistidas.
- Verificación actual de 278 pases: ninguno tiene fecha/hora/duración incompleta o inválida; ninguno empieza entre 00:00 y 05:59. Los casos incompletos eran preventivos.
- Cuatro sesiones alcanzan o cruzan medianoche; el final máximo llega a las 00:22 del 19/11. Se usa el máximo final real calculado del día sin offset ni modificación del motor de conflictos. Se elimina el cierre administrativo inventado para datos incompletos.

La película con un pase histórico elegido no vuelve a estar pendiente por efecto del filtro: se conserva el comportamiento actual del encaje. Queda trabajo técnico para detallar el plan; no se autoriza implementar.


## Resolución documental — 13/11/2026

Aplicada la resolución de A1–A11: [goldfish_review_report.md](goldfish_review_report.md). Nueve correcciones documentales y dos propuestas fuera de alcance contestadas con las decisiones registradas. La especificación incluye contratos, alternativas y plan concreto. El dictamen inicial permanece como histórico; falta reauditoría independiente para valorar la versión corregida. Sin implementación.


## Reauditoría posterior — límite de cinco rondas

Informes y resoluciones: [loop-resolution.md](loop-resolution.md). Los cuatro revisores completaron cada ronda. No hubo dos rondas globales limpias; no se declara convergencia. Se corrigieron todos los hallazgos documentales recibidos, pero la versión final requiere nueva reauditoría si se desea cerrar formalmente el ciclo. Ningún cambio de aplicación, pruebas o build ejecutados.


## Cierre final EGM — ampliación autorizada

Convergencia alcanzada en rondas 6 y 7, ambas limpias en los cuatro perfiles independientes. Véase [loop-resolution.md](loop-resolution.md) y los ocho informes de esas rondas. La especificación revisada permanece sin cambios entre ambas: 198 líneas, SHA-256 0a1f77f9756dff32544010d6aab1f6a946cddc9ee454d3e2e844d2f4602d9df9.

No quedan hallazgos documentales abiertos. Los dictámenes previos se conservan como historia del proceso. El cierre avala la revisión de specs y plan, no una implementación ni pruebas de ejecución. No se autoriza commit, push, publicación o implementación por este cierre.
