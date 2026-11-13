**No limpio — 2 hallazgos Major.** Revisión estática de preparación para implementación; sin ampliar el alcance ni cambiar encaje o conflictos.

1. **codebase_details-3-1 · Major — Falta resolver la creación de fichas fuera de los resultados temporales.**  
   **Spec:** líneas 60, 111, 131 y 147.  
   **Evidencia:** `openFilmFromList()` (`src/app.js:1951–1964`) establece `expandedId` y llama a `renderFilms()`. Este último construye tanto las tarjetas como el diálogo exclusivamente recorriendo `matchingFilms()` (`479–589`).  
   **Razón:** separar `filmDialogTemporalExempt` permite decidir qué pases mostrar dentro de una ficha, pero no basta para crearla cuando su película histórica ya está excluida de `matchingFilms()`. El plan tampoco concreta cómo conservar el nodo del diálogo cuando se reconstruye la colección que lo contiene. Queda una decisión estructural necesaria para cumplir la apertura histórica y la conservación de ficha.  
   **Remedio:** especificar un montaje del diálogo independiente de la colección filtrada, o un mecanismo explícito equivalente que conserve su nodo y permita abrir una película excluida sin incorporarla a resultados, contadores o paginación. Probar apertura histórica desde lista, navegación histórica y actualización del catálogo con diálogo abierto, comprobando identidad del nodo.

2. **codebase_details-3-2 · Major — La política de anuncios omite las regiones vivas existentes.**  
   **Spec:** líneas 88, 131 y 143–147.  
   **Evidencia:** `src/index.html:313` contiene un contador con `role="status"`; las listas completas de Pases (`375`) y compartidos (`402`) tienen `aria-live="polite"`. `renderFilms()` actualiza el contador (`src/app.js:590–592`), y los renderizadores de Pases y compartidos reemplazan sus listas.  
   **Razón:** añadir la región de anuncios propuesta no impide que esas regiones existentes anuncien cambios temporales adicionales. El mandato de anunciar únicamente retirada del día seleccionado y transición a resultados vacíos necesita una integración explícita con ellas.  
   **Remedio:** definir cómo las actualizaciones temporales evitan anuncios de listas y contadores existentes, conservando los anuncios correspondientes a acciones del usuario. Añadir comprobaciones de que un vencimiento ordinario no genera anuncios adicionales y de que los dos cambios autorizados sí los generan.

**Lecturas efectivas:** persona y estándar solicitados; especificación completa, líneas 1–188; los cuatro tests completos; `build.py` y `README.md` completos; búsquedas y lectura focalizada de integración en `src/app.js`, `src/index.html` y `src/styles.css`. Estos tres últimos no se leyeron íntegramente. Sin historial, memoria, informes anteriores, escrituras, ejecución de pruebas ni delegación.
