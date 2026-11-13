1. **[Major] Líneas 49 y 109–110 — Regla abreviada ambigua.** «Filtrar películas sin futuros pases» y «Desaparece de Explorar» omiten las excepciones de horarios desconocidos y películas sin sesiones (líneas 21 y 32–35). Repetir la condición completa o remitir expresamente a esas reglas evita que implementación y pruebas interpreten requisitos distintos.

2. **[Nit] Línea 7 — CALIBRATE.** «Funciona sin conexión y no requiere servidor ni telemetría» presenta como existente una capacidad pendiente de implementación. Formularlo como requisito: «Debe funcionar sin conexión y sin requerir servidor ni telemetría».

3. **[Nit] Líneas 52, 60, 66 y 72 — Terminología temporal variable.** «Vence», «cerrado», «caducado» e «históricas» describen estados diferentes sin una correspondencia terminológica estable. Usar «película sin próximos pases», «día cerrado» y «pase iniciado/terminado», según corresponda, permite relacionar cada instrucción con las reglas temporales.

4. **[Nit] Líneas 76, 80 y 126 — Criterios cualitativos imprecisos.** «Cambios relevantes», «siguiente control disponible» y «saltos innecesarios» dejan al lector decidir qué comportamiento se acepta. Enumerar qué cambios se anuncian, definir el orden de recuperación del foco y concretar qué posición de desplazamiento debe conservarse.

5. **[Nit] Líneas 24 y 95–97 — Registro innecesariamente coloquial o mixto.** «Suma improvisada de fichas», «helpers», «cachear» y «snapshot» dificultan mantener una redacción técnica uniforme. Sustituirlos por «suma de las duraciones de las películas», «funciones auxiliares», «almacenar en caché» y «estado temporal común».
