**NO LIMPIO** — dos lagunas de implementación, ambas dentro del alcance de presentación.

1. **implementation_readiness-3-1 — Major**  
   **Líneas:** `docs/SPEC-FILTRO-TEMPORAL.md:117` y `:147`.  
   **Razón:** se concreta cómo ocultar una recomendación iniciada cuando existe `recommendation`, pero queda sin resolver la rama sin recomendación por conflictos. Actualmente `renderMaybeSuggestion()` elige `blocked` y muestra su fecha, hora y conflictos como «alternativa más cercana» (`src/app.js:1461–1468`). Si ese pase ya comenzó, falta decidir qué presentación sustituye ese detalle. La regla general de ocultación y la conservación de conflictos no determinan inequívocamente el resultado.  
   **Remedio:** especificar el mensaje y los fragmentos que se conservan u ocultan cuando `blocked` ya empezó, manteniendo intactos su elección y el cálculo de conflictos. Añadir el caso de alternativa pasada con otra futura también conflictiva.

2. **implementation_readiness-3-2 — Major**  
   **Líneas:** `docs/SPEC-FILTRO-TEMPORAL.md:113`, `:129` y `:148`.  
   **Razón:** falta concretar cómo actualizar compartidos sin reinicializar las decisiones. El renderizador identificado ejecuta `sharedSelection.clear()` y vuelve a preseleccionar los pases `state.listed`; además, el checkbox se construye desde `state.listed`, no desde `sharedSelection` (`src/app.js:2729`, `:2791` y `:2800`). Reutilizarlo al reclasificar por tiempo perdería elecciones y desmarcados explícitos. El documento exige conservarlos, pero no distingue la inicialización de una propuesta de sus posteriores actualizaciones.  
   **Remedio:** indicar que únicamente la apertura de una propuesta nueva inicializa y preselecciona; las actualizaciones conservan `sharedSelection` y derivan de ella los checkboxes. Probar también un pase futuro preseleccionado que el usuario desmarca antes de una actualización temporal.

**Lecturas efectivas:** persona y estándar completos; especificación completa, líneas 1–188; las cuatro pruebas indicadas completas; README y build; fragmentos pertinentes de `src/app.js`, `src/index.html` y `src/styles.css`. Revisión estática, sin ejecutar pruebas, consultar historial o memoria, escribir ni delegar.
