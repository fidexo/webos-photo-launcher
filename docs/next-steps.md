# Próximos pasos: rendimiento, diseño e instalación

**Revisión: 2026-10-21.** Investigación y propuestas; no se implementaron estas mejoras ni un
instalador automático ni se cambió la TV en esta ronda. La TV de referencia ya tiene root:
no corresponde repetirlo.

## Primero, medir dónde se pierde tiempo

La última muestra documentada de 0.7.5 dio unos **59,7 FPS** navegando rápido. No es un benchmark
nuevo de esta ronda ni acredita navegación lenta, apertura de Luces o tiempo desde el encendido.
El objetivo es que las acciones cotidianas se sientan rápidas, no sumar efectos para mostrar FPS.

| Prioridad | Investigación o cambio propuesto | Qué hay que comprobar |
| --- | --- | --- |
| 1 | Perfilar `iconnectivity`, que tuvo una muestra previa cercana a 25–26 % de CPU. | Repetir en reposo y durante el uso; identificar trabajo y dependencias antes de atribuirle lentitud o detener algo. La causa sigue desconocida. |
| 2 | Crear el DOM de Luces recién al abrirlo y reutilizarlo después. | Comparar primer foco del inicio, primera apertura del panel y reapertura; conservar estados, Atrás y mensajes. |
| 3 | Comparar dos materiales de tarjeta, manteniendo composición e íconos. | Probar A/B con flechas lentas y rápidas: vidrio discreto frente al actual, sin nuevos filtros ni sombras animadas. |
| 4 | Revisar imágenes retenidas cuando Mi pantalla queda oculta. | Medir RAM frente a la latencia al volver con Home; liberar una foto puede exigir decodificarla de nuevo. |

Antes de tocar cada punto, tomar una base con la misma versión, escenario, fotos y estado de red.
Registrar primer pintado, primer foco utilizable, tiempo hasta la foto y sus percentiles en varias
repeticiones, además de RAM y CPU en reposo. Separar recarga, vuelta con Home y arranque físico.
Una sola muestra no alcanza para prometer una mejora; borrar apps instaladas tampoco demuestra
menos CPU. [Método y resultados anteriores](performance.md).

## Una dirección visual más tranquila

Estas referencias sirven para tomar decisiones, no para copiar su interfaz completa:

| Referencia revisada | Qué tomaría para Mi pantalla |
| --- | --- |
| [Apple TV 4K](https://www.apple.com/apple-tv-4k/) | Composición de TV, fotografía y foco evidente a distancia; una jerarquía sencilla alrededor del dock. |
| [Apps de Bang & Olufsen](https://www.bang-olufsen.com/en/int/story/apps) | Controles claros, calma visual y acentos marfil/ámbar para Luces, sin llenar todo de brillos. |
| [Roon](https://roon.app/en/music) | Jerarquía editorial y carátulas para una futura vista musical de Transitions. |

La propuesta es **composición de Apple TV con la calma de B&O**: menos brillo en los bordes,
radios, tipografía y espaciado consistentes, vidrio más discreto y foco legible. Una vista musical
sería opcional; no hace falta descargar portadas para abrir un episodio. No hay un rediseño nuevo
implementado ni medido a partir de estas referencias.

## ¿Conviene reescribirlo con Flutter?

La [guía oficial de LG para Flutter](https://webostv.developer.lge.com/develop/guides/flutter-for-webos)
describe soporte nativo a partir de **webOS 26 Re:New**, con herramientas
en un host Ubuntu. No documenta soporte nativo para el **webOS 5.6** de esta TV.

[Flutter Web](https://docs.flutter.dev/reference/supported-platforms) publica soporte para las dos
últimas versiones de Chrome; Chrome 95 y anteriores quedan fuera del soporte. Chromium 68 de
esta LG queda fuera de esa matriz. Compilar para web no elimina la antigüedad de su navegador.

**Decisión propuesta:** conservar HTML/CSS/JS ES5 y medir cambios puntuales. No hay evidencia de
que una reescritura mejore aquí CPU, RAM o arranque. Un port nativo con embedder propio y root
sería otro experimento, con compatibilidad, gráficos, entrada e instalación por resolver; no un
atajo respaldado por esa guía. Esta conclusión es una inferencia de compatibilidad, no un A/B
ejecutado con Flutter en la TV.

## Un wizard local que se maneje desde Brave

La opción práctica es un **programa local temporal** que abra Brave y sirva el asistente en
loopback. El programa habla con la TV; la página presenta decisiones y resultados. Una web
estática pública no reemplaza SSH, emparejamiento ni los requisitos de un método de root.

La API local tendría acciones cerradas, sesión autenticada, validación de origen y tiempos
máximos. Las credenciales quedan en la computadora y no aparecen en URLs, logs compartibles o
servidores públicos. Al terminar se cierra el compañero local; no exige un servidor permanente.

| Fase propuesta | Alcance | Condición para avanzar |
| --- | --- | --- |
| 1 | Conectar con una TV ya emparejada, verificar e instalar/actualizar Mi pantalla, preservar configuraciones y auditar RDX sin cambiarlo por defecto. | Paquete y destino comprobados, respaldo privado y lectura posterior. |
| 2 | Ofrecer Home nativo y su restauración como acciones separadas. | Reversión y fallos parciales probados, conservando los demás defaults y el acceso de recuperación. |
| 3 | Adaptador de root para una matriz pequeña de modelos y firmware. | Método revisado para esa combinación, verificación física y recuperación definida. Un equipo desconocido no continúa automáticamente. |

Cada fase necesita **plan / apply / restore**, un journal de pasos completados y resultados
leídos después de escribir. Si falla el tercer paso, mostrar los dos aplicados y qué se pudo
revertir. Cancelar no debe anunciar una TV restaurada sin comprobarlo. El emparejamiento físico
y la identidad del dispositivo siguen formando parte del proceso.

### Qué aporta SlopBro y qué falta

Se revisó [SlopBro, revisión `21023d5`](https://github.com/throwaway96/slopbro/tree/21023d56ca424607bb03d2939609cc658c655fc7).
Su flujo utiliza una computadora con Python/HTTP y SSAP, y obtiene root mediante un payload
ejecutado en la TV. No es una página estática universal que pueda rootear cualquier LG.

Para integrarlo habría que fijar y comprobar firmware, payloads, versiones y hashes, junto con
firmas cuando existan, revisar su licencia AGPL y las obligaciones de distribución, y ensayar
timeout, corte de red y rollback parcial. Root ya existente debe detectarse y reutilizarse.
No se ejecutó otra vez ni existe todavía ese adaptador. [Evaluación completa](browser-installer.md).

## Funciones que sí aportarían en el uso diario

1. **Escenas Cine, Música y Noche:** guardar y aplicar los ajustes elegidos de WiZ con OK,
   respuesta por lámpara y posibilidad de restaurar el estado anterior.
2. **Apps detectadas y recientes locales:** favoritos sin perder orden ni ocultos; distinguir
   instalada, ausente y sin confirmar. Reabrir una app no garantiza retomar un video exacto.
3. **Modo local/offline:** conservar fotos incluidas y WiZ, pausando pedidos de clima y fotos
   diarias. No promete aislar del exterior a LG, YouTube ni otras apps.
4. **Privacidad con estado y reversión:** mostrar valores leídos, fecha y respaldo; restaurar
   únicamente ajustes propios. Desactivar logs o anuncios no acredita cero telemetría.

Estas funciones están propuestas. Su costo, requisitos y aceptación se amplían en
[visión del producto](product-vision.md). El orden recomendado es medir y simplificar primero,
cerrar recuperación e instalador después y sumar funciones sin agregar trabajo al foco del dock.
