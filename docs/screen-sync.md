# Colores de YouTube y HDMI

La 0.6.0 prepara el diagnóstico y la gestión de una futura sesión de pantalla. **Pantalla completa
permanece deshabilitado**: el backend rechaza siempre el arranque porque todavía no puede probar
imágenes frescas ni su funcionamiento en esta TV. El usuario pospuso expresamente root.
No se ejecutaron root, captura ni HyperHDR reales.

El modo comprobado sigue siendo **Acompañar fondo** de 0.5.1: analiza la foto de Mi pantalla y se
pausa cuando otra app la oculta. Ese color no acredita sincronización de YouTube ni HDMI.

## Estado comprobado

- Control manual y color del fondo confirmados por el dueño en Mi pantalla 0.5/0.5.1, con las
  seis lámparas WiZ del living.
- 0.6.0: 206 pruebas aprobadas y paquete verificado de 52 archivos, incluidos 13 del servicio.
  El CLI aceptó la instalación y la orden de apertura. El usuario comprobó en la TV que
  Revisar captura informa falta de configuración (`setup-pending`). No volvió a validar
  los controles manuales ni el fondo en esta versión.
- Vista previa de 0.6.0 revisada en Brave a 1280×720 y 1920×1080: botón visible y sin desbordes.
  Esa vista previa no contacta lámparas reales ni prueba el backend en la TV.
- Transporte autenticado HyperHDR, diagnóstico y sesión de parada/restauración probados con
  dobles. No se validaron captura, sincronización ni restauración física.
- PicCap 0.5.3 y HyperHDR Loader 22.0.1 descargados desde sus releases oficiales y verificados
  contra los hashes publicados. No se instalaron ni ejecutaron en la TV.
- La fuente exacta de HyperHDR 22 es el tag `v22.0.0.0`, commit
  `e5bda285227cbd38bce60da6a442dde936fd9e7a`. Incluye el driver WiZ. La identificación incrustada
  en el binario del Loader coincide; esto no es una reconstrucción reproducible del binario.
- Root y captura en esta placa siguen sin verificar. Developer Mode por sí solo no concede
  el acceso que necesita PicCap. La preparación anterior encontró un montaje de solo lectura;
  no se ejecutó la cadena de elevación.

## Qué hace Revisar captura

El botón pide `screenStatus` únicamente al pulsarlo. Se puede consultar sin selección guardada;
si la revisión necesita lámparas, lo informa. No cambia luces, activa capturadores ni habilita
la salida de HyperHDR. Abrir el panel, enfocar controles u ocultar la app no ejecuta esa revisión.

El transporte usa solo `127.0.0.1:19444`, autentica el token y confirma la instancia cero.
El diagnóstico comprueba el perfil, el driver WiZ, las regiones de imagen y la correspondencia
con las lámparas seleccionadas. Una salida que ya está habilitada se informa como ocupada;
la revisión no la apaga ni se la atribuye como una sesión propia.

El panel muestra preparación, falta de verificación o un error mediante códigos permitidos.
Descarta tokens, direcciones, campos extra y respuestas de error crudas. Que HyperHDR responda,
que el perfil coincida o que exista una fuente activa no demuestra imágenes actuales.
El backend conserva `ready`, `framesVerified`, `hardwareVerified` y `active` en falso, con
frescura desconocida. No hay una opción de configuración que permita saltar ese bloqueo.

El ejemplo público [`screen-config.example.json`](../screen-config.example.json) está deshabilitado
y no contiene credenciales. La configuración privada opcional se lee desde
`services/com.frxn.mipantalla.lights/screen-config.json`, excluido de Git. Admite `enabled`,
`token` y `profile`; no permite elegir otro host ni puerto. Sin configuración o con `enabled: false`
no se abre la conexión. El IPK 0.6.0 verificado no incluye ese archivo privado; si se agrega para
un paquete local, ese paquete no debe publicarse.

## Sesión y recuperación preparadas

El contrato de sesión guarda el estado anterior del grupo antes de iniciar una salida. Para
volver a Manual debe confirmar la parada, restaurar encendido, brillo y color o blanco, y
confirmar cada restauración. Si algo falla, conserva la recuperación pendiente y bloquea la
nueva orden; una respuesta incompleta no acredita restauración.

El backend conserva los destinatarios originales. Una recuperación pendiente mantiene el modo
de pantalla y bloquea cambios de selección y búsqueda. **Manual** sigue disponible aunque el
almacenamiento de la app no tenga lámparas elegidas. Cerrar el panel u ocultar la app no detiene
una sesión de pantalla por lógica de la UI. Esto permite preparar el contrato de trabajo en
segundo plano; hoy no existe un arranque real habilitado.

Las pruebas usan dobles de backend y lámparas. Comprobar persistencia, orden de operaciones y
lecturas simuladas no demuestra que la TV y las lámparas restauren físicamente el estado.

## Qué falta probar

La arquitectura prevista es:

```text
Imagen de la TV → PicCap / hyperion-webos → HyperHDR local → WiZ del living
```

1. Retomar el acceso requerido por PicCap cuando el usuario retome root y verificar el backend
   de captura de esta placa.
2. Implementar y comprobar una prueba de imágenes frescas con una imagen conocida y después
   con YouTube. Tener un proceso, una conexión o una fuente activa no alcanza.
3. Probar HDMI por separado y evaluar las restricciones de contenido protegido. No tratar
   un frame negro o un fallo del capturador como un color válido del video.
4. Verificar físicamente el envío solo al grupo elegido, el brillo, la carga y la fluidez.
5. Validar parada y restauración real, fallas parciales, recuperación tras reinicio y el ciclo
   de suspensión/despertar antes de habilitar Pantalla completa.

Como punto de partida se propuso 10 imágenes por segundo, sin suavizado adicional. Con seis
lámparas y un envío por imagen serían hasta 60 datagramas RGB por segundo: es una propuesta
por medir, no una frecuencia efectiva, latencia ni rendimiento comprobados. El suavizado de
HyperHDR tiene su propio reloj, con mínimo de 20 Hz; se evaluaría después.

Las seis regiones virtuales podrían cubrir toda la imagen para un ambiente uniforme. El promedio
de HyperHDR no equivale al histograma de color predominante del fondo del launcher. Su driver
WiZ envía brillo junto con RGB, puede encender las lámparas al activarse y apagarlas al detenerse;
no restaura por sí solo el estado anterior. Por eso se preparó la sesión de recuperación.

Los receptores y la interfaz de administración de HyperHDR también requieren configuración
local antes de usarlo. Que nuestro cliente solo conecte a loopback no configura esos listeners.
No se promete captura universal ni compatibilidad de hardware a partir de esta preparación.

## Fuentes

- [PicCap: funcionamiento, requisitos y límites de captura](https://github.com/TBSniller/piccap#whats-this).
- [Release PicCap 0.5.3](https://github.com/TBSniller/piccap/releases/tag/0.5.3).
- [HyperHDR Loader 22.0.1 para webOS](https://github.com/webosbrew/hyperhdr-webos-loader/releases/tag/v22.0.1).
- [Driver WiZ de HyperHDR 22](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/net/DriverNetWiz.cpp).
- [Ciclo de encendido y apagado del driver](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/LedDevice.cpp).
- [Reporte de captura en otra placa K6LP; no acredita esta unidad](https://github.com/webosbrew/hyperion-webos/issues/55).
