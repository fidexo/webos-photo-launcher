# Colores de YouTube y HDMI

La 0.6.0 habilita **Pantalla completa** solo después de comprobar configuración, atestación
física y frames frescos de PicCap. La activación y la parada se probaron físicamente el
2026-10-21 en la TV con las seis lámparas WiZ del living. No es una promesa de captura universal:
HDMI, contenido protegido, persistencia tras reinicio y el mapeo exacto de cada lámpara siguen
pendientes.

## Estado comprobado

- Root persistente con HBC 0.7.3 elevado; SSH root en 22 y sshd de Developer Mode en 9922.
  PicCap 0.5.3 y HyperHDR Loader 22.0.1 instalados en la TV.
- HyperHDR configurado con el driver WiZ, la instancia `Mi pantalla WiZ Living`, seis LEDs y
  PicCap enviando flatbuffers a `127.0.0.1:19400`.
- Captura de la interfaz y de video con PicCap confirmada a unos 27–30 FPS.
- Sesión física: `LEDDEVICE` activado, seis lámparas encendidas con colores de pantalla y
  brillo 100, y después apagadas al volver a Manual.
- La primera parada devolvió `SCREEN_RESTORE_PENDING`; un segundo Manual restauró el estado.
  La recuperación pendiente no se interpreta como éxito.
- 0.6.0: 234 pruebas aprobadas y paquete verificado de 56 archivos, incluidos 17 del servicio
  (los tres adicionales son el hook de Home, no captura). SHA-256 del IPK de esta compilación:
  `0886c2610526356342e11cf532a5f4a50f0ce5be6e509cf052075d6f41be722e`.
- El modo **Acompañar fondo** de 0.5.1 sigue siendo el modo de color de la foto local; no
  acredita captura de otras apps.

## Qué comprueba Revisar captura

El botón pide `screenStatus` únicamente al pulsarlo. No cambia luces, no activa capturadores y no
habilita la salida. Abrir el panel, enfocar controles u ocultar la app no ejecuta esa revisión.

El diagnóstico comprueba:

1. HyperHDR responde, autentica el token y confirma la instancia cero.
2. El perfil y el driver WiZ coinciden con la configuración privada.
3. Las seis regiones de imagen son válidas y corresponden a las lámparas seleccionadas.
4. La salida `LEDDEVICE` no pertenece ya a otra sesión.
5. `hardwareVerified` está atestiguado en la configuración privada.
6. PicCap informa dos muestras separadas 250 ms con captura conectada, UI o video activo y
   `framerate > 0`.

Solo entonces `ready` es verdadero. Una salida ya habilitada se informa como `output-in-use` y
no se apaga ni se atribuye a esta app. Los motivos posibles incluyen `setup-pending`,
`config-invalid`, `selection-mismatch`, `profile-mismatch`, `instance-mismatch`,
`admin-required`, `hardware-unverified`, `frames-unverified`, `output-in-use`, `timeout` y
`offline`.

`hardwareVerified` es una atestación manual del dueño tras una prueba física; no la deduce el
software. Una captura que responde o un perfil correcto no demuestran imágenes actuales.

## Activación y recuperación

Antes de encender la salida, la sesión guarda el estado anterior de las seis lámparas. `start`
vuelve a comprobar la salida, exige frames frescos y atestación, activa `LEDDEVICE` y confirma el
cambio en `serverinfo`. Si falla después de encender, intenta apagarla.

Para volver a Manual, `stop` apaga `LEDDEVICE` y restaura encendido, brillo y color o blanco de
cada lámpara, confirmando cada lectura. Si alguna restauración falla, conserva la recuperación
pendiente y bloquea nuevas órdenes. Reintentar Manual reanuda solo lo que falta. Cerrar el panel
u ocultar la app no detiene la sesión por lógica de la UI.

## Configuración privada

El ejemplo público [`screen-config.example.json`](../screen-config.example.json) está
deshabilitado y no contiene credenciales. La configuración privada opcional se lee desde
`services/com.frxn.mipantalla.lights/screen-config.json`, excluido de Git. Admite `enabled`,
`token`, `profile` y `hardwareVerified`; no permite elegir otro host ni puerto. Sin configuración
o con `enabled: false` no se abre la conexión.

PicCap no es un servicio público para este rol: el servicio de la app necesita permiso de salida
hacia `org.webosbrew.piccap.service` en
`/var/luna-service2-dev/roles.d/com.frxn.mipantalla.lights.service.json`. Sin ese permiso el probe
falla cerrado y `framesVerified` queda falso. Ese archivo de rol no forma parte del IPK; si una
reinstalación lo regenera, hay que volver a aplicar el permiso.

## Qué falta probar

1. Persistencia tras reinicio: HyperHDR y PicCap siguen arrancándose manualmente.
2. HDMI y contenido protegido, por separado; un frame negro o un fallo del capturador no es un
   color válido.
3. Correspondencia física de cada región con su lámpara.
4. Latencia, carga y fluidez con seis lámparas y el ciclo de suspensión/despertar.
5. Empaquetar o documentar de forma reproducible el permiso de rol de PicCap.

La arquitectura es:

```text
Imagen de la TV → PicCap / hyperion-webos → HyperHDR local → WiZ del living
```

El driver WiZ envía brillo junto con RGB, enciende las lámparas al activarse y puede apagarlas al
detenerse; no restaura por sí solo el estado anterior. Por eso la sesión guarda y restaura el
estado. El suavizado de HyperHDR tiene su propio reloj, con mínimo de 20 Hz; no se midió todavía
su efecto con este grupo.

## Fuentes

- [PicCap: funcionamiento, requisitos y límites de captura](https://github.com/TBSniller/piccap#whats-this).
- [Release PicCap 0.5.3](https://github.com/TBSniller/piccap/releases/tag/0.5.3).
- [HyperHDR Loader 22.0.1 para webOS](https://github.com/webosbrew/hyperhdr-webos-loader/releases/tag/v22.0.1).
- [Driver WiZ de HyperHDR 22](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/net/DriverNetWiz.cpp).
- [Ciclo de encendido y apagado del driver](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/LedDevice.cpp).
- [Reporte de captura en otra placa K6LP; no acredita esta unidad](https://github.com/webosbrew/hyperion-webos/issues/55).
