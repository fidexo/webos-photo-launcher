# Navegación y arranque: 0.7.0

La lentitud se reprodujo en la propia TV, con Chromium 68 a 1920×1080. Cada foco regeneraba dos
gradientes de pantalla completa y animaba varias sombras y capas durante 200–600 ms. Además,
se pedía un desplazamiento del dock después de cambiar el foco, aunque ya entraba en pantalla.

En TV ahora el foco cambia al instante, con borde blanco y escala visibles. Se conservan el
vidrio estático, los logos, las fotos, su fundido y el clima. La vista previa de escritorio
mantiene los efectos originales. Personalizar conserva el desplazamiento de sus listas.

## Medición

Se simularon flechas cada 120 ms durante 3,5 segundos y se registraron los intervalos entre
callbacks de `requestAnimationFrame`. Las mediciones A/B temporales se retiraron al terminar.

| Prueba en la TV | Intervalos | Media entre cuadros | Percentil 95 |
| --- | ---: | ---: | ---: |
| Versión anterior, repetición de la prueba | 26 | 127,56 ms | 383,32 ms |
| Solo sin halos de pantalla completa | 93 | 38,17 ms | 100,00 ms |
| 0.7.0 instalada, sin estilos de diagnóstico | 209 | 16,75 ms | 16,67 ms |

En la última muestra hubo un intervalo mayor de 25 ms; el máximo fue 33,33 ms. El percentil 95
del manejador de teclado fue 13,7 ms. Esto acredita esa prueba de navegación con entradas
simuladas, no garantiza 60 FPS en todas las situaciones ni sustituye la prueba con el control.

El dueño probó después las flechas con el control y confirmó que la UI responde bien.

No se atribuye esta mejora a borrar aplicaciones. En una muestra de CPU de cinco segundos,
el watcher consumió aproximadamente 1,4 % de un núcleo y la CPU global estuvo cerca de 5,2 %.
La carga media del sistema era alta, pero no demostraba por sí sola saturación de CPU.

## Encendido

Se conservó el hook de HBC. El watcher usa 100 ms por defecto y comparte un único lanzamiento
entre Home, arranque y despertar. Una aceptación cancela los reintentos; un despertar ya no
provoca cuatro aperturas incondicionales. Se corrigió la acumulación que podía convertir una
demora corta del heartbeat en un despertar falso.

La primera prueba de standby de 0.7.0 falló: Quick Start mantenía vivo el proceso y no aparecía
un salto de reloj. La 0.7.1 agrega una suscripción al estado real de energía. Una transición
de estado no activo a `Active` solicita la apertura; el primer estado recibido solo establece
la referencia. Reconecta si falla el servicio y conserva el salto de reloj como respaldo.

Se desactivó `general.homeAutoLaunch` para que LG no solicite su Home al encender. El hook de
Mi pantalla sigue necesitando que webOS y su administrador de aplicaciones estén disponibles:
no reemplaza la pantalla de arranque del firmware. El dueño confirmó en 0.7.1 que, después de
apagar con el control durante 20 segundos y encender, Mi pantalla abre sola; también confirmó
que Home desde YouTube vuelve a Mi pantalla. No se midió la cantidad de cuadros de HDMI que
puedan aparecer antes de cargar la app. Más detalle en [Home](home-takeover.md).

Las tres apps LG retiradas, los cinco ajustes y su recuperación están en [Limpieza](cleaning.md).
