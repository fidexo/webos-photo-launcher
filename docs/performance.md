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

En la limpieza anterior se desactivó `general.homeAutoLaunch`; en la lectura posterior de la
0.7.2 volvió a aparecer `on`. Se volvió a dejar en `off` y se comprobó la lectura, pero tras las
pruebas del usuario apareció nuevamente en `on`. No se aisló la causa ni se acredita que `off`
persista. El destino `defaultApps.home` sí conservó Mi pantalla. El hook de
Mi pantalla sigue necesitando que webOS y su administrador de aplicaciones estén disponibles:
no reemplaza la pantalla de arranque del firmware. El dueño confirmó en 0.7.1 que, después de
apagar con el control durante 20 segundos y encender, Mi pantalla abre sola; también confirmó
que Home desde YouTube vuelve a Mi pantalla. No se midió la cantidad de cuadros de HDMI que
puedan aparecer antes de cargar la app. Más detalle en [Home](home-takeover.md).

La 0.7.2 configura `general.defaultApps.home` para que el compositor abra Mi pantalla directamente
al soltar Home. Con `--native-home`, el watcher conserva arranque y potencia, pero deja de abrir
dispositivos de entrada y de revisarlos cada 100 ms. La prueba automática desde YouTube volvió
a Mi pantalla sin una nueva detección del watcher. El dueño confirmó después que Home desde
YouTube va directo a Mi pantalla y que apagar 20 s con el control y encender también abre Mi
pantalla directamente. Son confirmaciones de esos casos: no se midió la latencia ni se revalidó
un arranque en frío con esta configuración.

Las tres apps LG retiradas, los ajustes publicitarios adicionales y su recuperación están en
[Limpieza](cleaning.md).

## 0.7.3: primer fondo

La 0.7.3 está instalada y `ares-launch` aceptó su apertura. Las mediciones siguientes son
`Page.reload` por CDP en la TV real, con tiempos relativos a `performance.now()`. **No miden
desde power-on ni acreditan un arranque físico en frío.** La prueba perceptual del usuario sigue pendiente.

En la referencia anterior se cargó primero un JPEG local y, después de mostrarlo, se pidió la
foto del día. Estas son las marcas anteriores, en milisegundos desde el inicio de esa medición:

| Etapa de referencia | Marca o duración |
| --- | ---: |
| Solicitud del JPEG local | 717 ms |
| Carga del JPEG local | 1.085 ms |
| Decode del JPEG local | 1.407 ms |
| Vidrio/frente local | 1.773 ms |
| Foto local completamente opaca | 2.861 ms |
| Solicitud de la foto del día | 3.177 ms |
| Duración de esa solicitud | 20,1 ms; `cacheDisk: true` |
| Decode de la foto del día | 3.373 ms |
| Foto del día al frente | 3.524 ms |

La foto del día de esa muestra ya estaba en la caché HTTP del navegador; también existía la
metadata diaria. El tiempo observado incluía el orden de carga local → remota, decode, vidrio
y fundido. Esa evidencia no demuestra que todas las fotos estén descargadas ni una falla de red.

La implementación monta `Daily.mount` antes de los fondos y entrega su caché válida
síncrona como `Backgrounds.initialList`. Restaura directamente la última foto del día validada;
la primera carga evita la espera de `decode()` y el fundido inicial. Las rotaciones posteriores
conservan su fundido. La primera remota tiene límite de 1.500 ms y su primer fallo vuelve de
inmediato a la base local; sin galería diaria válida en caché, la primera local también es inmediata.

Se reutilizan metadata y caché HTTP existentes, sin introducir IndexedDB ni convertir los assets.
Se conservan créditos, licencias, renovación diaria y acompañamiento de color. No cambia Home.

### Resultado con la misma foto diaria en caché

La primera solicitud fue directamente la foto del día, sin JPEG local previo, con
`fromDiskCache: true` y sin `decode()` para esa primera imagen:

| Etapa 0.7.3 | Marca |
| --- | ---: |
| Asignación de la foto diaria | 804 ms |
| Carga | 906 ms |
| Foto diaria al frente | 1.255 ms |
| Foto diaria opaca | 1.262 ms |

La foto diaria pasó de estar al frente a 3.524 ms en la referencia a 1.255 ms en esta recarga.
La capa local anterior había quedado opaca a 2.861 ms: era otra etapa, no la foto diaria final.
No se presenta esta comparación como una reducción de 3,5 a 1,3 s desde el encendido de la TV.

La siguiente foto se precargó a 2.660 ms; su `decode()` transcurrió entre 2.663 y 2.816 ms,
quedando reservada para la rotación de cinco minutos. La primera imagen se mostró directamente
y las rotaciones posteriores conservan su fundido.

### Fallback y límites

Los tests validan el límite inicial remoto de 1.500 ms, el fallback local ante errores de carga y la
preservación de créditos y licencias. **No se verificó de forma concluyente el modo offline en
la TV**: `Network.emulateNetworkConditions` con `offline: true` no impidió transferencias en esta sesión. Otra observación sin
caché HTTP tuvo frente a 1.311 ms y opacidad a 1.316 ms; es una muestra, no una prueba offline.

La suite completa pasó **280/280**. El IPK verificado contiene **57 archivos**, incluidos **18 del
servicio**, y ocupa **1.690.546 bytes**. Los tests de la guardia externa pertenecen al repositorio,
no al contenido del IPK. SHA-256:
`7d9ef901916a6d258967be8e9d175e76ba3686926855c3d1396f4c0218a07175`.
