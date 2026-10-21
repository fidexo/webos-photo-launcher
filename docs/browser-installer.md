# ¿Se puede instalar todo desde una página web?

**Evaluación al 2026-10-21; no hay un instalador web implementado.** Podemos simplificar mucho
la instalación, pero una página común no reemplaza SSH ni vuelve compatible cualquier TV con
un método de root. Hoy el camino reproducible es el [tutorial con CLI](tutorial.md).

## Tres opciones

| Opción | Qué podría hacer | Límite principal | Decisión |
| --- | --- | --- | --- |
| Solo navegador | Guía, configuración, descarga de archivos y quizá control SSAP emparejado. | Sin SSH/TCP/UDP arbitrarios; TLS, permisos y compatibilidad del TV. | Útil para el asistente; no prometer «hace todo». |
| Web + compañero local | Interfaz web y proceso local que ejecute CLI/SSH con acciones limitadas. | Instalar un programa local y proteger su canal de control. | Mejor UX futura, después de estabilizar el instalador local. |
| CLI local con `plan` / `apply` / `restore` | Comprobar, empaquetar, respaldar, instalar y verificar sobre una TV preparada. | Root previo y configuración particular; no todos los firmwares. | Primer prototipo recomendado. Todavía no existe. |

La recomendación es una decisión de arquitectura basada en las interfaces existentes. No se
probaron un wizard ni un compañero local en esta ronda. No se abrió un servidor de instalación,
no se agregó ejecución remota ni se descargó un ejecutable de terceros para este fin.

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

El alcance exacto de estos bloqueos en Brave y el browser de esta TV **no se ensayó** para un
instalador. Son condiciones que la arquitectura debe resolver, no fallos observados de un
producto que todavía no existe.

### Root sigue siendo una operación por compatibilidad

Un exploit que usa una página como parte de su entrega no convierte esa página en una API
normal de instalación ni en un método universal. En la unidad de referencia se revisó SlopBro
para un firmware concreto y se obtuvo root/HBC. Ese procedimiento tuvo recuperación y permisos
propios; el ACK de descarga no acreditaba root. [Registro de lo ejecutado](root-and-home.md).

El futuro instalador debe distinguir **TV original**, **Developer Mode**, **root disponible** y
**HBC elevado/persistente**. Si falta un requisito, explicar qué paso manual corresponde.
No probar exploits automáticamente, degradar firmware o repetir root sobre un equipo ya rooteado.

## Propuesta: instalador local primero

Una primera versión debería tener tres operaciones separadas y acotadas:

1. **`plan`:** leer modelo/firmware, transporte, versión de la app, rutas, Home actual y presencia
   de HBC. Mostrar qué cambia, qué necesita root y qué no está acreditado. No escribir ni
   encender luces. La detección no debería escanear indiscriminadamente otras redes.
2. **`apply`:** usar una TV seleccionada y emparejada; verificar paquete, respaldar estado propio,
   instalar y comprobar. Home nativo y privacidad serían etapas opcionales explícitas, cada una
   con lectura posterior. Un paso fallido no se presenta como instalación completa.
3. **`restore`:** usar el respaldo de esa TV. Restaurar solo claves propias conservando el mapa
   actual, retirar únicamente hooks propios y comprobar Home antes de desinstalar. Si cambió
   algo desde el plan, detener ese paso y mostrar el estado encontrado.

**No son comandos disponibles hoy.** El inventario, build y verificador existentes son partes
reutilizables; faltan coordinador, transporte público parametrizado, respaldo/restore común y
pruebas de fallo/actualización. Los scripts privados de nuestra sesión no son un instalador
redistribuible.

Sí hay un primer componente público de diagnóstico: `scripts/privacy-audit.cjs`, un CLI de solo
lectura para una TV ya rooteada, con Node 18+ y OpenSSH. Consulta inventario, preferencias y una
muestra de recursos; no instala ni cambia ajustes. Su existencia no significa que ya estén
implementados `plan`, `apply` o `restore`. [Uso](tutorial.md#auditoría-con-root-solo-lectura).

El primer alcance podría limitarse a instalar/actualizar Mi pantalla por Developer Mode en una
TV ya emparejada. Home con root iría después, al probar reversión y guardia con la app ausente.
La configuración particular de PicCap/HyperHDR y el mapeo físico WiZ debe conservar su etapa de
verificación; no se puede copiar el token o la atestación de otro hogar.

## Si después agregamos la interfaz web

El compañero local ejecutaría solo acciones enumeradas; no una shell arbitraria enviada por una
web. Su control debería estar limitado a loopback, una sesión autenticada y orígenes concretos,
con mensajes tipados, tokens efímeros y límites de tiempo. Hay que probar acceso de otros sitios,
reintentos y cancelación antes de ofrecerlo como seguro. No reenviar llaves ni tokens a un
servidor público ni incluirlos en URLs o logs compartibles.

Puede presentarse como un asistente servido por el propio programa local, evitando depender de
una web pública para manejar credenciales. El modo distribuido seguiría necesitando firma/hash
verificable, versiones fijas y un mecanismo de actualización revisable. Esto es diseño propuesto,
no una garantía implementada.

`scripts/serve.cjs` hoy solo entrega archivos para la vista previa y escucha `127.0.0.1`.
No tiene autenticación de instalador, API de ejecución ni rutas de apply/restore. **No ampliarlo
para ejecutar comandos de la TV sin diseñar y revisar antes ese límite de confianza.**

## Qué falta para decir «reproducible»

- Ensayo desde un checkout limpio, sin los archivos privados de nuestra sesión.
- Matriz pequeña de modelos/firmwares soportados y un resultado claro para los demás.
- Paquete público sin datos del hogar y hashes de la revisión exacta.
- Corte de red, fallo del instalador, timeout y actualización con configuración root existente.
- Restore real, app ausente durante boot y retorno al Home original.
- UX con control remoto, permisos físicos de emparejamiento y explicación de cada alcance.
- Prueba del canal web/local en cada browser soportado si se desarrolla esa variante.

Hasta entonces, el [tutorial](tutorial.md) identifica el tramo automático por CLI y el tramo
manual de root/Home. Es más preciso que anunciar «un clic y listo» con requisitos ocultos.
