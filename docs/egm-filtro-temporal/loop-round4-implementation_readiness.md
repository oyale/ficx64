**Not clean**: queda una contradicción concreta en el contrato de anuncios accesibles.

- **implementation_readiness-4-1 — Major**
  - **Líneas:** `docs/SPEC-FILTRO-TEMPORAL.md:125`, en relación con la restricción de anuncios temporales de la línea 139.
  - **Rationale:** se ordena retirar `role=status` del contador del catálogo y convertir la región nueva en la única salida viva para resultados. Sin embargo, `src/index.html:313` declara **ambos** atributos: `role="status" aria-live="polite"`. Ejecutar literalmente el cambio deja el contador anunciando actualizaciones por su `aria-live`, además de la región centralizada. La comprobación exigida de «DOM sin regiones vivas de listas/contador» tampoco pasaría.
  - **Remedio preciso:** indicar explícitamente que se retiren **`role` y `aria-live`** de `#film-list-progress`, conservando ID y texto visual. Añadir una aserción que compruebe la ausencia de ambos atributos y que una caducidad sin retirada de día seleccionado ni transición a vacío no modifica la región central de anuncios.

El alcance exclusivamente visual está suficientemente establecido: este hallazgo no requiere modificar encaje, conflictos, elegibilidad ni selecciones.

**Lecturas efectivas:** completos el agente `implementation_readiness.md`, el estándar solicitado, la especificación actual —196 líneas—, `build.py` y las cuatro pruebas permitidas. Lecturas parciales de `src/app.js` centradas en catálogo, fichas, fechas, planificación y compartidos; búsquedas y fragmentos de `src/index.html`, `src/styles.css` y `README.md`. Sin historial, memoria, informes anteriores, escrituras, delegación ni ejecución de pruebas.
