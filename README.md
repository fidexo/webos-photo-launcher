# Mi pantalla

Inicio personalizado para LG 49UN7310PSC, webOS 5.6.2-21 / firmware 04.64.00.
Rediseño Liquid Glass implementado por Claude Opus 5.5 high. La versión 0.3.0 (solo íconos, fondos
fotográficos y clima) se instaló correctamente mediante Developer Mode y la TV aceptó su orden de
apertura. Verificación local: 35 pruebas, clima real y navegación en Brave; 1920×1080 y 1280×720 sin
desbordes. La presentación y el clima en el hardware esperan confirmación visual. No contiene root, scripts de borrado,
reasignación de Home, modificaciones del sistema ni hooks de arranque.

**Tutorial completo:** [docs/tutorial.md](docs/tutorial.md) · qué probamos y qué falló:
[docs/what-we-tried.md](docs/what-we-tried.md) · limpieza: [docs/cleaning.md](docs/cleaning.md) ·
roadmap: [docs/roadmap.md](docs/roadmap.md) · fuentes: [docs/sources.md](docs/sources.md).

Cambios de la versión 0.4 (fotos del día de Wikimedia Commons y acceso Transitions): verificados solo
localmente, con 75 pruebas y en Brave (1920×1080, 1280×720, 728 y 360 px). No se probaron en la TV.

## Selección del usuario

YouTube, Spotify, Nuvio, Netflix, Disney+, Transitions · John Digweed y HDMI 1, en ese orden.
Quien ya tenía guardada la selección de 0.3 conserva su orden y lo que ocultó; Transitions aparece
visible al final de las apps, antes de HDMI 1. No se borra ninguna preferencia.
La vista previa permite abrir accesos de demostración, ocultar, mostrar y reordenar.
Ocultar solo guarda preferencias del launcher; no desinstala ninguna app.

## Inicio

Solo íconos: sin títulos grandes ni nombres debajo. Cada ícono conserva su nombre en `aria-label`
y Personalizar muestra los nombres completos. Debajo de un ícono no se muestra disponibilidad;
solo aparece "No encontrada" cuando la TV confirma que el ID no existe, y al enfocarla el pie
explica el error. Un error de consulta sigue siendo estado desconocido y no se marca.

## Fondos fotográficos (`backgrounds.js`)

- Lista en `wallpapers.js` (`window.LAUNCHER_WALLPAPERS`), fotos y créditos en `assets/wallpapers/`.
  Solo se aceptan rutas `assets/wallpapers/*.jpg|jpeg|webp|png`; nada se descarga al abrir.
- Rota cada 5 minutos con un fundido de 1,2 s entre dos capas `<img>` (sin video, WebGL ni filtros CSS).
  La siguiente foto se precarga cuando termina el fundido. Continúa desde la última foto mostrada.
- Se pausa con la app oculta (`visibilitychange`); al volver avanza si ya pasó el intervalo.
- Una sola foto: se muestra sin temporizador. Una foto que no carga se salta; si ninguna carga,
  o falta `wallpapers.js`, se usa `assets/wallpaper.svg`.
- `img.decode()` se espera como máximo 2 s: en Chromium puede no resolverse nunca con JPEG grandes,
  y la carga (`onload`) es la que decide si la foto sirve.
- Vidrio sin `backdrop-filter` (Chromium 68): cada capa pinta una miniatura de 160 px de su foto en un
  `<canvas>` detrás del dock, con un desenfoque único (`ctx.filter`) que se calcula una vez por foto.
  El escalado por CSS la convierte en vidrio esmerilado. Nunca se leen píxeles del canvas.
- El pie muestra "Foto: autor · sitio" salvo cuando hay un mensaje de estado.
- `replace(lista)` cambia la galería (fotos del día) sin cortar un fundido: espera a que termine la foto
  en curso, descarta resultados de cargas de la galería anterior (contador `generation`) y, si ninguna
  foto nueva carga, sigue con la galería local desde la foto a la vista, sin pasar por el SVG.

## Fotos del día (`daily-photos.js`)

- Configuración del proyecto padre en `daily-photos-config.js` (`window.LAUNCHER_DAILY_PHOTOS =
  { endpoint, count }`). Sin ese archivo, o con un endpoint que no sea
  `https://commons.wikimedia.org/w/api.php?…`, no se hace ningún pedido y todo funciona como en 0.3.
- Fuente: paisajes destacados de Wikimedia Commons (`generator=categorymembers` sobre
  `Category:Featured_pictures_of_landscapes` + `prop=imageinfo` con miniatura de 1920 px y
  `extmetadata`). Documentación: https://www.mediawiki.org/wiki/API:Categorymembers y
  https://www.mediawiki.org/wiki/API:Imageinfo . Sin backend, cuenta, clave ni dependencias.
- Lo que se renueva cada día es la selección, no necesariamente las fotos: no se presentan como
  "foto de hoy". Se usa la fecha local de la TV (America/Argentina/Buenos_Aires en esta unidad).
- Una consulta por día. Después de cada respuesta se guarda `continue.gcmcontinue` y `continue` tal como
  los devolvió la API, para pedir la página siguiente al día siguiente; sin continuación se vuelve a la
  primera página. Nunca se fabrica un token. Si un lote no deja ninguna foto útil se pide como máximo
  un segundo lote con su continuación.
- Filtros: JPEG, miniatura de 960 a 1920 px de ancho (se prefieren ≥ 1280), proporción 1,3–2,4,
  URL HTTPS solo de `upload.wikimedia.org` o `thumb.wikimedia.org` (sin los parámetros `utm_*`), página
  de origen en `commons.wikimedia.org/wiki/File:`. Se descartan títulos o descripciones de trenes,
  remadores, pueblos, ciudades, iglesias, templos o personas: se prefieren paisajes. Se evita repetir
  fotos de la selección anterior cuando el lote lo permite. Hasta 6 fotos.
- Licencias admitidas: CC0, dominio público, CC BY y CC BY-SA, con URL de licencia coherente en
  `creativecommons.org` (obligatoria salvo dominio público). FAL, GFDL, NC y ND se descartan.
- Créditos obligatorios: autor, Wikimedia Commons y licencia en el pie; en Personalizar > Fuentes,
  título, autor, licencia con su URL y página original. La metadata de Commons es HTML de terceros:
  se convierte a texto plano acotado (sin etiquetas, scripts ni entidades) y se inserta con `textContent`.
- En localStorage (`mi-pantalla-daily-photos-v1`) solo se guarda la metadata validada (≈ 5 KB), el día,
  el token y la hora de la última falla; nunca imágenes. Al leerla se vuelve a validar; si algo no pasa,
  ese día se vuelve a consultar.
- Al abrir se ve enseguida la galería local; cuando hay metadata válida (guardada o nueva) la galería
  cambia con el mismo fundido. Si las fotos remotas no cargan, sigue la galería local.
- Pausa con la app oculta. Al volver o pasada la medianoche (temporizador), si cambió el día se consulta.
  Ante red caída, error HTTP, respuesta inválida o `maxlag`: se conserva la selección y se reintenta
  como mucho una vez por hora, también entre aperturas. XHR con timeout de 10 s.
- El vidrio de respaldo dibuja la foto remota en el `<canvas>` (queda "tainted"); no importa porque
  nunca se leen ni exportan sus píxeles.

## Transitions · John Digweed (`transitions.js`)

- Ícono propio (`assets/logos/transitions.svg`): un vinilo con ondas, dibujado para este proyecto; no
  usa logos de terceros ni retratos. En Personalizar se llama "Transitions · John Digweed".
- Episodios en `transitions-config.js` (`window.LAUNCHER_TRANSITIONS`), escrito por el proyecto padre
  con los episodios de la lista oficial
  https://www.youtube.com/playlist?list=PLg-OduiozGBG0JCQlIMTv7Ipz2xZ74y0z . Solo se aceptan IDs de 11
  caracteres con título y URL `https://www.youtube.com/watch?v=<ID>` coherente; nada se inventa.
- Al pulsar OK (nunca al enfocar ni al cargar) se elige uno al azar, uniforme entre los episodios
  distintos del último; el último se guarda en `mi-pantalla-transitions-last-v1`. Sin lista válida, el
  pie lo explica. Con localStorage dañado o bloqueado sigue funcionando y recuerda en memoria.
- Vista previa: no contacta la TV ni abre ventanas; el pie indica qué episodio se abriría.
- En la TV: `bridge.launchYouTubeVideo(videoId)` envía a `luna://com.webos.applicationManager/launch`
  `{ id: 'youtube.leanback.v4', params: { contentTarget: 'https://www.youtube.com/watch?v=<ID>' } }`.
  Ese formato se probó en la TV con `ares-launch`: YouTube mostró el selector de perfiles y después
  abrió el episodio. El `contentId` de Connect SDK abrió YouTube pero no el episodio
  ([detalle](docs/what-we-tried.md#youtube-abrir-un-video-puntual)). Desde el launcher 0.4 todavía no
  se probó. Timeout y sin reintentos, como el resto.
  No usa el navegador de la TV ni parámetros arbitrarios.
- La disponibilidad se consulta para YouTube (`youtube.leanback.v4`); si la TV confirma que falta,
  el ícono muestra "No encontrada" y el pie explica que Transitions necesita YouTube.
- Siete accesos (seis apps y HDMI 1) entran en 1920×1080 y 1280×720 sin barras: íconos de 12,5 rem en
  celdas de 14,25 rem.

`npm run build` avisa si una foto supera 2560×1440 o es JPEG progresivo: en la TV conviene
1920×1080 baseline. Las cuatro fotos incluidas se descargaron del CDN oficial a 1920 px de ancho,
ocupan entre 247 y 629 KB y conservan JPEG progresivo. No se descargan fotos desde la TV.

## Clima (`weather.js`)

- Ubicación en `weather-config.js` (`window.LAUNCHER_WEATHER`). Sin coordenadas válidas no se hace
  ningún pedido y el widget dice "Clima no disponible · Falta configurar la zona".
  No usa geolocalización del navegador.
- Pedido real a Open-Meteo, sin clave ni backend:
  `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto`.
  XHR con timeout de 8 s. Se valida que la temperatura sea un número finito en °C (0° es válido),
  que `weather_code` sea un código WMO conocido y que `is_day` sea 0 o 1; si no, la respuesta se descarta.
  Un valor desconocido se muestra como "–", nunca como 0.
- Muestra ícono SVG, temperatura, condición en español, sensación térmica (ST), lugar y hora.
- Refresca cada 15 minutos y al volver visible si el dato venció. Las fallas transitorias (red,
  timeout, 5xx, 429) reintentan a 1, 2, 4 y 8 minutos, hasta la cadencia normal; un 4xx espera 15 minutos.
- La hora y la antigüedad usan `current.time` y `utc_offset_seconds` del proveedor, además de la hora
  de descarga. Repetir una respuesta antigua no la vuelve actual. Se descartan fechas inválidas,
  caché futura y datos de más de tres horas; una respuesta anterior no reemplaza una más reciente.
- El último dato válido se guarda en localStorage con su hora. Con más de 30 minutos se marca
  "Último dato HH:MM"; con más de 3 horas ya no se muestra como clima actual.
- Fuente: [Open-Meteo](https://open-meteo.com/en/docs). Condiciones actuales calculadas por modelos,
  con intervalos de 15 minutos; no se presentan como observación de una estación local.

## Uso local

```powershell
npm start
```

Abrir http://127.0.0.1:43817 en Brave. Usar flechas, Enter/OK y Escape/Atrás.
Personalizar permite ocultar y mover una app antes de la anterior de su categoría.
La selección persiste en localStorage; Restablecer recupera la lista original.

```powershell
npm test
npm run build
```

La compilación copia únicamente los archivos de la app (incluidos `daily-photos.js` y `transitions.js`),
`wallpapers.js`, `weather-config.js`, `daily-photos-config.js` y `transitions-config.js` si existen
(si faltan, quita su `<script>`; un endpoint de fotos fuera de Commons detiene la compilación), los SVG de `assets/`, las fotos y los textos de créditos o licencia
(`.txt`, `.md`) de `assets/wallpapers/`, y el SDK oficial a `dist/`. Rechaza enlaces simbólicos, borra
`dist/` antes de copiar y falla si `wallpapers.js` lista una foto ausente o una ruta no local.

`node scripts/preview.cjs` genera `artifacts/mi-pantalla-preview.html` (vidrio con backdrop-filter
en navegadores modernos) y `artifacts/mi-pantalla-preview-tv.html` (fuerza el vidrio de respaldo que
usa Chromium 68). Ambos son documentos autocontenidos del diseño real, con fotos y configuración en
línea (unos 2,19 MB con las fotos actuales). Las fotos del día no se incrustan: si existe
`daily-photos-config.js`, el documento consulta Wikimedia Commons al abrirse, como la app.
El puente de TV usa `webOS.service.request`, con timeout y sin reintentos automáticos.
Las pruebas del puente, el clima y los fondos usan dobles simulados; no equivalen a pruebas en hardware.
La vista previa nunca contacta la TV. Si existe `weather-config.js`, consulta Open-Meteo igual que la app.

## Identificadores de aplicaciones

En `config.js` se guardan los IDs candidatos. YouTube y Netflix aparecen en Connect SDK;
Nuvio se verificó en su manifest oficial. Spotify, Disney+ y HDMI 1 deben confirmarse
en la TV; la app consulta `getAppLoadStatus` antes de mostrar un estado confirmado.
Un error o falta de permisos conserva estado desconocido, no lo convierte en app ausente.
El inventario completo de esta TV (124 apps, por SSAP y solo lectura) está resumido en
[docs/cleaning.md](docs/cleaning.md); el JSON crudo no se publica.

- https://github.com/NuvioMedia/NuvioTVSmart/blob/main/appinfo.json
- https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java
- https://webostv.developer.lge.com/develop/references/application-manager
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine

## Instalación y limpieza pendientes

1. Instalación y orden de apertura de la versión 0.3.0 completadas mediante Developer Mode.
   Falta confirmar visualmente el clima, las fotos y la apertura de los seis accesos en la TV.
2. Inventario de apps hecho ([docs/cleaning.md](docs/cleaning.md)). Falta confirmar control remoto,
   audio y reproducción.
3. Si se desea root: revisar SlopBro para el firmware exacto y acordar la intervención
   antes de ejecutarla. Nada en este proyecto ejecuta ese procedimiento.
4. Probar un mecanismo de Home y arranque específico para webOS 5, con desactivación
   y recuperación verificadas. Esta versión no lo incluye ni afirma que esté validado.
5. Borrar solo las apps elegidas que LG permita desinstalar por su interfaz: Home,
   seleccionar app, mantener OK unos 3 segundos, elegir X y confirmar.
   Primero registrar cuáles se quitarán. No borrar paquetes ni servicios de sistema por SSH.

Nuvio oficial 1.2.9 también se instaló y recibió su orden de apertura. El paquete se verificó contra
el SHA-256 publicado `895d3e7a884c9fed8162b2a3af96f9ae502a83b33956715ffcbac02ef755d2ac`.
Esto confirma instalación, no inicio de sesión ni reproducción.
Fuente: https://github.com/NuvioMedia/NuvioTVSmart/releases/tag/1.2.9 .

El listado de Developer Mode confirma `com.frxn.mipantalla` y `space.nuvio.webos`; no representa
un inventario completo de las apps de tienda ni del sistema. Para limpieza, recorrer Home y eliminar
individualmente las apps no usadas que LG permita borrar. En webOS 5, General > Home Settings puede
ofrecer Home Promotion; desactivarlo reduce promociones del inicio. Home Auto Launch controla el
Home de LG, no el arranque de nuestra app. Desinstalar libera espacio, sin garantía de más fluidez.
Mantener Developer Mode vigente con EXTEND: al desactivarse se eliminan las apps de desarrollo.
Guía: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app .

Los menús de imagen, audio y configuración y las interfaces dentro de Netflix,
YouTube y otras apps siguen siendo los originales. El launcher sustituye la experiencia
de inicio una vez integrada; no reemplaza toda la interfaz del sistema operativo.

## Evidencia de compatibilidad

- Root registrado para UN7310PSC.AWZ / 04.64.00:
  https://cani.rootmy.tv/?q=49UN7310PSC
- SlopBro: https://github.com/throwaway96/slopbro
- Borrado oficial de apps: https://www.lg.com/ar/soporte/ayuda-producto/CT20084005-20153401974495OLT
- Referencia alternativa: https://github.com/gprot42/webos-launch-home#compatibility
  El autor dice "Expected working" para webOS 5; no es una prueba en esta TV.
- https://github.com/zzeppieri/webos-custom-home declara pruebas en webOS 24.
  No instalar sus hooks en webOS 5 asumiendo compatibilidad.

## Alcance

El paquete `.ipk` se generó con `@webos-tools/cli` 3.2.6 y se instaló en la TV vinculada.
Esa herramienta no forma parte de la app ni es necesaria para la vista previa.
Para volver a empaquetar tras cambiar archivos, ejecutar `npm run build` y luego
`npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package dist -o artifacts --no-minify`.
`python scripts/verify_package.py` comprueba contenido y timestamps del paquete sin ejecutarlo.
La advertencia del CLI sobre `requiredACG` no aplica a webOS 5: LG documenta que
ACG no está soportado en webOS TV 25 o anteriores:
https://webostv.developer.lge.com/develop/guides/acg-guide .
El runtime es HTML/CSS/JavaScript y la biblioteca oficial webOSTV.js 1.2.13 (Apache-2.0).
No requiere Vercel, servidor propio, cuenta nueva, analytics ni servicios de pago. Conexiones externas:
la consulta pública de clima a api.open-meteo.com y, una vez por día, la de fotos a commons.wikimedia.org
más sus miniaturas en upload/thumb.wikimedia.org (HTTPS, sin clave). Sin conexión, el widget muestra
"Clima no disponible", siguen las fotos locales y el resto del inicio sigue igual. Transitions solo
envía a la TV la orden de abrir YouTube; la app no contacta YouTube.
