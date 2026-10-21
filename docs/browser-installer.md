# Asistente local y límites de instalar desde una web

**Estado al 2026-10-21: hay un piloto local implementado**, iniciado con `npm run setup` y
manejado desde Brave. Requiere SSH root ya configurado y admite sólo la LG 49UN7310PSC con el
firmware de referencia. No obtiene root desde cero ni es una web estática universal.
[Guía, operaciones y validación pendiente](local-installer.md) · [camino manual](tutorial.md).

## Tres opciones

| Opción | Alcance | Límite principal | Estado |
| --- | --- | --- | --- |
| Solo navegador | Guía, configuración, descarga de archivos y quizá SSAP emparejado. | Sin SSH/TCP/UDP arbitrarios; TLS, permisos y compatibilidad del TV. | No implementado como instalador autónomo. |
| Web + compañero local | Interfaz y motor local con acciones acotadas por SSH. | Root previo y perfil exacto. Aplicación idempotente de privacidad probada; otras mutaciones pendientes. | Piloto disponible mediante `npm run setup`. |
| CLI con flags de plan/apply/restore | Futuro acceso sin interfaz al mismo flujo. | Necesita un contrato público y validación propia. | No hay esos comandos CLI; hoy son acciones internas de la API local. |

El compañero escucha sólo en loopback, con puerto dinámico y sesión local. No agrega un agente
de instalación permanente en la TV ni permite una shell arbitraria desde la página. El frontend
del launcher y el instalador de PC son programas distintos; Mi pantalla sigue en 0.7.5.

## Qué impide hacerlo todo con JavaScript en el browser

### SSAP no es SSH ni el instalador de paquetes

LG usa WebSocket para su control remoto en red. El código de Connect SDK abre `wss://TV:3001`,
registra un cliente y contempla permisos/emparejamiento. En esta TV el inventario funcionó por
WSS; el canal sin TLS al puerto 3000 cerró durante el upgrade. Eso no demuestra que todos los
modelos se comporten igual. [Cliente oficial de LG](https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVServiceSocketClient.java).

Una conexión SSAP autorizada permite las operaciones que expone y autoriza ese servicio.
**No otorga una shell root ni equivale al protocolo usado por `ares-install`.** La lectura de
apps de nuestro script solo solicita `READ_INSTALLED_APPS`. No corresponde inventar un método
SSAP de instalación universal a partir de que podamos abrir una app.

La API `WebSocket` del navegador acepta sus esquemas de URL y mensajes WebSocket; no expone una
conexión TCP sin protocolo a SSH ni una API UDP para WiZ. Una implementación de SSH en JS
necesitaría un transporte puente compatible: eso ya sería otra pieza instalada, no browser-only.
[Interfaz WebSocket](https://websockets.spec.whatwg.org/#the-websocket-interface).

### Certificado del televisor

El navegador valida TLS de WSS según su plataforma. El constructor WebSocket no tiene una opción
para ignorar certificados o instalar una CA a demanda. No alcanza con copiar al browser nuestro
script Python: ese script controla su contexto TLS, fija el certificado de esa conexión y
comprueba el peer; una página web no recibe esa misma interfaz.
[Handshake WebSocket](https://websockets.spec.whatwg.org/#websocket-opening-handshake).

No validamos una ruta de emparejamiento browser → WSS en esta TV. No proponer desactivar la
seguridad global del navegador ni instalar un certificado indiscriminadamente. El certificado,
la identidad del dispositivo y el permiso en pantalla son verificaciones diferentes.

### HTTPS, CORS, CSP y red local

Una web pública HTTPS que intenta acceder a la LAN está sujeta a controles adicionales. Hay que
probarlos en cada navegador soportado; no suponer que Chromium 68 de la TV funciona igual que el
Brave de la computadora.

- **Contenido mixto:** HTTP/WS desde un contexto HTTPS puede bloquearse. Las excepciones y los
  mecanismos de acceso local dependen del navegador y su implementación; no dar por hecho una
  excepción para cualquier dirección privada. [Mixed Content](https://www.w3.org/TR/mixed-content/).
- **CORS:** leer respuestas HTTP de otro origen requiere cooperación del servidor en los casos
  que establece Fetch. `mode: 'no-cors'` devuelve una respuesta opaca; no es una solución para
  inspeccionar inventarios, confirmar instalación o verificar errores.
  [Fetch/CORS](https://fetch.spec.whatwg.org/#http-cors-protocol).
- **WebSocket:** no usa el mismo mecanismo de autorización CORS que `fetch`; el handshake incluye
  el contexto de origen y el servidor puede rechazarlo. Agregar un header CORS por sí solo no
  arregla certificados, emparejamiento ni permisos SSAP.
  [Handshake](https://websockets.spec.whatwg.org/#websocket-opening-handshake).
- **CSP:** `connect-src` también restringe conexiones WebSocket. Abrirlo a `*` no resuelve las
  demás restricciones y ampliaría innecesariamente los destinos de una futura herramienta.
  [CSP3](https://www.w3.org/TR/CSP3/#directive-connect-src).
- **Acceso a la red local:** la propuesta actual Local Network Access reemplaza el trabajo
  anterior llamado Private Network Access y añade un permiso. Es una especificación en
  evolución; comprobar soporte y comportamiento real por versión. No confundirla con un CORS
  preflight universal ni asumir que aprobar ese permiso habilita SSH.
  [Especificación](https://wicg.github.io/local-network-access/) ·
  [explicación](https://github.com/WICG/local-network-access/blob/main/explainer.md).

El acceso directo de una web a la TV con esos protocolos **no se ensayó** como instalador.
El piloto evita esa ruta: la página habla con su servidor local y OpenSSH conecta con la TV.
Eso no convierte el soporte de red de la página en soporte SSH ni elimina el emparejamiento.

### Root sigue siendo una operación por compatibilidad

Un exploit que usa una página como parte de su entrega no convierte esa página en una API
normal de instalación ni en un método universal. En la unidad de referencia se revisó SlopBro
para un firmware concreto y se obtuvo root/HBC. Ese procedimiento tuvo recuperación y permisos
propios; el ACK de descarga no acreditaba root. [Registro de lo ejecutado](root-and-home.md).

El piloto exige root ya disponible. La automatización desde una **TV original** sigue pendiente:
la ruta upstream investigada produjo un error de firma de Developer Mode que necesitó
recuperación manual. No probar exploits automáticamente, degradar firmware o repetir root sobre
un equipo ya rooteado. [Registro y recuperación](root-and-home.md).

## Qué hace el piloto actual

El motor implementa `status`, `plan`, `apply` y `restore` detrás de la interfaz; no son flags CLI.
El plan vence en cinco minutos y se vuelve a validar antes de escribir. Los pasos tienen journal
privado y respaldo local/remoto. Una consulta de recuperación busca el destino original sin
repetir automáticamente una operación que terminó con timeout.

Puede instalar el IPK público 0.7.5 si la app falta, preparar Home y sus hooks propios, aplicar
el perfil acotado de privacidad y retirar sólo tres apps LG elegidas. Con 0.7.5 presente omite
la instalación; otra versión bloquea ese paso hasta resolver preservación de actualizaciones.
Restaurar no reinstala apps retiradas ni desinstala automáticamente un paquete nuevo.
[Guía exacta, release fijado, SHA-256 y límites](local-installer.md).

`scripts/privacy-audit.cjs` continúa siendo un CLI separado de sólo lectura. No instala ni
modifica ajustes. [Uso](tutorial.md#auditoría-con-root-solo-lectura).
`scripts/serve.cjs` sirve únicamente la vista previa; el asistente usa `installer/server.cjs`.

La revisión pasó **401/401 pruebas** y cerró sin P1/P2. En Brave se verificaron `status` y `plan`
contra la TV y un apply de privacidad idempotente, con respaldo real y snapshot final igual al
inicial.
Tras recargar Brave se recuperó el respaldo por `status` y se restauró. Una lectura SSH
separada confirmó journal `restored` y snapshot completo idéntico al previo. No se aplicaron
Home, instalación ni bajas; no se probó el IPK público en la TV ni partir de una TV original.
Usar una instancia por TV: el journal WAL no reemplaza un lock global ni prueba tolerancia a
pérdida total de alimentación. [Validación y límites](local-installer.md#qué-está-probado-y-qué-falta).

## Qué sigue pendiente

- Probar cambios desde valores originales y su restore, sin heredar pruebas del camino manual.
- Ensayar Home, instalación ausente y bajas permitidas, incluidos sus límites de recuperación manual.
- Probar corte de red, resultados inciertos, reanudación y restauración parcial.
- Actualizar otra versión preservando configuración privada y roles root existentes.
- Ampliar la matriz sólo con pruebas por modelo y firmware; el perfil actual es uno solo.
- Probar Home con app ausente durante boot y restauración física del destino anterior.
- Diseñar un adaptador de root desde cero; hoy es una etapa manual separada.

El release público 0.7.5 sin configuración del hogar ya está disponible y su SHA-256 queda fijado
en el motor. Tener ese paquete y las acciones implementadas no demuestra todavía un recorrido
completo de instalación y restauración sobre una TV original.
