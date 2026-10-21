# Luces WiZ del living

La 0.5 incorpora el botón **Luces**, junto a Personalizar. El dueño comprobó en la TV que las
seis lámparas seleccionadas responden al brillo del 50 %. Ese control manual no necesita root.
Después de instalar la 0.5.1, el dueño también confirmó que Acompañar fondo funciona. El primer
intento no lo mostró; sin un mensaje de error no se atribuye una causa a esa demora.

## Elegir y controlar las lámparas

1. Abrí Luces. La primera consulta puede tardar unos segundos mientras el servicio busca las
   lámparas guardadas. Una consulta que falla deja el estado desconocido; no significa apagado.
2. Pulsá **Buscar lámparas** para consultar la red local. Marcá las que correspondan al living.
   Buscar no cambia luces ni selecciona automáticamente todos los dispositivos encontrados.
3. Usá encendido, brillo, colores o temperatura de blanco. Cada orden requiere una respuesta
   y una lectura posterior; los errores se muestran por lámpara. No se reintentan órdenes manuales.

La selección se guarda en la TV. El repo no contiene direcciones ni identificadores del hogar.
Un `lights-config.js` local y excluido de Git puede definir `window.LAUNCHER_LIGHTS.selectedIds`
como selección inicial: solo se usa si todavía no hay una selección guardada. Una selección
vacía guardada se respeta.

## Dos alcances distintos para los colores

**Acompañar fondo**, incorporado en 0.5.1, analiza la foto que muestra Mi pantalla y envía su
color predominante a las lámparas seleccionadas. Se activa al pulsar el botón; no cambia luces
al instalar o abrir la app. Solo se muestra activado después de confirmar el primer color.

Se lee una muestra de 32×18 píxeles y se agrupan colores próximos. No se guardan ni envían
imágenes; el servicio recibe únicamente RGB. Mantiene el brillo y el encendido existentes.
Las fotos remotas necesitan permitir lectura por CORS: si no la permiten, se informa el error
y no se inventa un color. El análisis se hace al cambiar la foto, con un solo envío pendiente.
Después de la activación inicial hay como máximo un reintento por foto ante un fallo.

El modo se pausa cuando Mi pantalla queda oculta. Cambiar la selección o usar un control
manual detiene el acompañamiento; las luces conservan su último estado. Una orden ya enviada
puede terminar después de detenerlo: detener el motor no revierte una orden física en curso.
El modo no se reactiva automáticamente después de cerrar por completo o reiniciar la app.

**Sincronizar pantalla** sigue deshabilitado. El canvas del launcher no ve YouTube, Netflix
ni HDMI. Para esas fuentes se está evaluando captura local con root, PicCap y HyperHDR;
no hay compatibilidad de captura comprobada para esta unidad. Las restricciones de contenido
protegido deben probarse por separado. Un color del fondo no acredita sincronización del video.
El estado y las pruebas pendientes están en [Colores de YouTube y HDMI](screen-sync.md).

## Cómo se comunica

La app llama a `luna://com.frxn.mipantalla.lights`. Su servicio Node usa UDP local, puerto 38899,
con consultas `getPilot`/`getSystemConfig` y órdenes `setPilot`. No depende de la nube WiZ ni
de un servidor en la computadora. El servicio acepta únicamente al identificador de nuestra app,
valida los parámetros y vuelve a comprobar la identidad de cada lámpara antes de escribir.

El servicio ofrece cinco métodos: `capabilities`, `discover`, `getState`, `setState` y `setMode`.
No admite comandos de shell, puertos ni destinos arbitrarios. Solo permite direcciones privadas
de la red local; la selección persistida usa identificadores, no direcciones IP.

El protocolo UDP local no incorpora autenticación criptográfica. El control presupone una red
doméstica de confianza. La comprobación del emisor Luna no protege frente a quien ya tenga root.

La vista previa en Brave no descubre ni modifica lámparas reales. Las pruebas automatizadas
usan transporte y respuestas simuladas; la confirmación del brillo en las seis es una prueba
adicional en hardware, con alcance diferente.

## Empaquetar el servicio junto a la app

```sh
npm test
npm run build
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package dist services/com.frxn.mipantalla.lights -o artifacts --no-minify
python scripts/verify_package.py
```

El verificador compara tanto los archivos de `dist/` como los siete archivos del servicio.
No publiques un IPK que incluya tu configuración del hogar. El código del servicio solo usa
módulos de Node disponibles en webOS 5; no agrega dependencias npm.

Referencias: [servicios JavaScript de LG](https://webostv.developer.lge.com/develop/guides/js-service-basics),
[empaquetado de servicios](https://webostv.developer.lge.com/develop/guides/js-service-usage),
[identidad del emisor Luna](https://webostv.developer.lge.com/develop/references/webos-service-reference#messagesender),
[implementación del protocolo WiZ en pywizlight](https://github.com/sbidy/pywizlight).
