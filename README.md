# Mi pantalla

Inicio personalizado para LG 49UN7310PSC, webOS 5.6.2-21 / firmware 04.64.00.
Diseño Liquid Glass y tutorial escritos con **Claude Opus 5.5 high**, con revisión e integración de
Codex. Es una app de inicio: no reemplaza el firmware ni los menús de webOS.

La **0.3** fue instalada y el dueño confirmó que le gustó en la TV. La **0.4.0** agrega una selección
diaria de paisajes y un acceso que elige un episodio de Transitions de John Digweed al azar.
La 0.4 pasó **77 pruebas**, compilación y verificación del IPK; se instaló y recibió su orden de
apertura en la TV. Falta confirmar visualmente allí las fotos diarias y abrir Transitions desde el
dock. El enlace al episodio sí se probó por CLI: apareció el selector de perfiles y después el video.

El dueño confirmó físicamente en 0.7.1 que Home desde YouTube termina en Mi pantalla tras esperar
2 s, y que apagar con el control 20 s y encender vuelve a abrirla sola. Root y HBC
quedaron persistentes y se instaló el hook de arranque de la fase 1: en un arranque en frío HBC
ejecutó el watcher y Mi pantalla abrió en primer plano. Faltan el foco, la repetición y otros ciclos de standby.
La versión actual **0.7.2** usa Home nativo con `general.defaultApps.home: com.frxn.mipantalla`;
el watcher conserva boot y power/wake, sin polling de input. La prueba de HOME por entrada de red
terminó en Mi pantalla. El dueño confirmó después Home físico desde YouTube y encendido
tras apagar 20 s directamente en Mi pantalla, sin Home de LG primero en esos dos casos.
Se retiraron tres apps removibles de LG y se desactivaron cinco preferencias de promociones/Home;
los cambios se comprobaron con lecturas posteriores. [Detalle y reversión](docs/cleaning.md).
La investigación y las condiciones están en [Root y Home](docs/root-and-home.md)
y [Home e inicio automático](docs/home-takeover.md).

**Tutorial completo:** [docs/tutorial.md](docs/tutorial.md) · qué probamos y qué falló:
[docs/what-we-tried.md](docs/what-we-tried.md) · limpieza: [docs/cleaning.md](docs/cleaning.md) ·
roadmap: [docs/roadmap.md](docs/roadmap.md) · fuentes: [docs/sources.md](docs/sources.md).

La vista previa 0.4 se verificó en Brave a 1920×1080, 1280×720, 728 y 360 px. La aceptación del
instalador y del comando de apertura no acredita por sí sola el funcionamiento visual en hardware.

**0.4.1:** ícono de Bedrock para Transitions, revisado en Brave a 1280×720. Pasaron las 77 pruebas
y la verificación del IPK; instalación y orden de apertura aceptadas por la TV.

**0.5:** panel Luces WiZ diseñado con Opus, servicio UDP local y selección del living. El dueño
confirmó que las seis lámparas responden al brillo del 50 % desde la TV. **0.5.1** agrega
acompañamiento del color del fondo de Mi pantalla: 147 pruebas aprobadas, paquete de 46 archivos
verificado, instalación y apertura aceptadas por la TV. El dueño confirmó después que el modo
de color del fondo funciona. El primer intento no lo mostró; no se obtuvo un error para atribuir
una causa a esa demora.
La captura de la interfaz y del video de la TV está verificada; HDMI y el contenido protegido
siguen pendientes. [Uso y límites de Luces](docs/lights.md).

**0.6.0:** agrega **Revisar captura**, transporte autenticado a HyperHDR local y el modo
**Pantalla completa** con comprobación de configuración, atestación física y frames frescos de
PicCap. Esta compilación incorpora además la fase 1 de **Home**: watcher de la tecla y arranque
automático mediante HBC. Pasaron **234 pruebas** y se verificó el IPK de **56 archivos**,
incluidos **17 del servicio**. SHA-256:
`0886c2610526356342e11cf532a5f4a50f0ce5be6e509cf052075d6f41be722e`.
Sobre un arranque en frío, HBC ejecutó el hook, abrió Mi pantalla y dejó un solo watcher; con la
app en primer plano se midieron **60,29 FPS**. Root, PicCap y HyperHDR se ejecutaron en la TV; la
activación encendió las seis lámparas con colores de pantalla y Manual las apagó y restauró. La
primera parada pidió reintentar la restauración. La pulsación física de Home ya fue confirmada por
el dueño; faltan el foco, Home repetido/mantenido, standby, HDMI, contenido protegido y la
persistencia de Pantalla completa tras reinicio.
[Estado de captura](docs/screen-sync.md) · [Home](docs/home-takeover.md).

**0.7.0:** optimiza los halos de pantalla completa y hace instantáneas las transiciones de foco
solo en la TV; conserva el vidrio estático, las fotos, el fundido y el clima. Pasaron **243 pruebas**
y se verificó el IPK de **56 archivos**, incluidos **17 del servicio**. Instalación y apertura por
`ares-launch` aceptadas; el watcher registró `boot: accepted`. El dueño confirmó que la navegación
responde bien. Al apagar con el control durante 20 s y encender, **Mi pantalla no abrió sola**:
el retorno desde standby de esa versión falló y motivó la corrección 0.7.1, confirmada después para ese caso.
El watcher corrige la acumulación de falsos gaps, comparte un lanzamiento entre boot/Home/wake
y reintenta wake solo tras fallo, hasta cuatro intentos; cancela la campaña al recibir aceptación.
El polling por defecto es 100 ms. Ese ACK no acredita por sí solo visibilidad ni despertar.

En la TV real, Chromium 68 a 1920×1080, una navegación por CDP con flechas cada 120 ms durante
3,5 s registró 209 intervalos: media **16,7457 ms**, p95 **16,666 ms**, máximo **33,332 ms**,
uno mayor de 25 ms y p95 del handler **13,7 ms**. Es una muestra acotada, no una prueba con el
control físico ni una garantía universal. [Evidencia y pendientes de Home](docs/home-takeover.md).

**0.7.1:** instalada por CLI, con watcher PID `13691` y `boot: accepted` en esa comprobación.
El hijo `luna-send` hacia `getPowerState` con `subscribe: true` es el monitor esperado. El nuevo
`home-power.js` usa la transición no activo → `Active` para Quick Start, sin depender de que la CPU
se suspenda: el primer `Active` fija la base, reconecta tras fallo a los 5 s y, mientras está listo,
inhibe el fallback por gap. Pasaron **254 pruebas**; IPK de **57 archivos**, **18 del servicio**.
El dueño confirmó físicamente en **0.7.1**: tras apagar 20 s con el control, **abre sola al encender**;
desde **YouTube → Home**, tras esperar 2 s, termina **en Mi pantalla**. Esto no acredita otros
ciclos de standby ni ausencia de una aparición inicial del Home de LG. El watcher registra
`home: accepted` o `home: rejected`. La navegación fluida confirmada es la de 0.7.

**0.7.2:** instalada; **257 pruebas**, **57 archivos**, **18 del servicio**, **1.690.292 bytes**.
Home nativo cambia solo `general.defaultApps.home` de `com.webos.app.fullhome` a `com.frxn.mipantalla`.
Se reaplicó `homeAutoLaunch: off` con lectura confirmada, pero una lectura posterior volvió a
mostrar `on`: estado final sin causa aislada. Home nativo sigue intacto y los dos casos físicos funcionaron así.
El marcador `/var/lib/mipantalla-maintenance/native-home/enabled` activa `--native-home`: conserva
boot y power/wake y omite abrir input, su polling y discovery. HOME enviado por entrada de red
desde YouTube terminó en nuestra app sin un nuevo `home: detected`; solo acredita destino final,
no ausencia de Home LG ni latencia. Después, **el usuario confirmó ambos casos físicos directos**:
Home desde YouTube y encendido tras apagar 20 s, sin LG primero en esas observaciones. Antes de
desinstalar, restaurar el Home anterior preservando los demás defaults. [Detalle y reversión](docs/home-takeover.md).
La suite actual del repositorio pasó **269/269**, incluidos 12 tests de la guardia externa al IPK;
las 257 pruebas anteriores corresponden a la verificación original del paquete.

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
  "foto de hoy". Se usa la fecha local de la TV.
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

- Desde 0.4.1 usa el símbolo **B de Bedrock Records** (`assets/logos/transitions.svg`), tomado del SVG
  de [la web oficial del sello](https://bedrock.org.uk/), centrado para el dock. La marca pertenece a
  su titular. En Personalizar se sigue llamando "Transitions · John Digweed".
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
ocupan entre 247 y 629 KB y conservan JPEG progresivo. Esas cuatro están incluidas en el paquete;
las fotos diarias de Commons sí se descargan desde la TV.

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

No hace falta una TV para ver el diseño. No hay dependencias npm que instalar.
Para activar el clima, copiá `weather-config.example.js` a `weather-config.js` y completá las
coordenadas del centro de tu ciudad. Ese archivo local está excluido de Git; el ejemplo usa `null`.

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

Los IDs de `config.js` coinciden con el inventario real por SSAP de esta TV, incluidos Spotify,
Disney+ y HDMI 1. En otro modelo o región pueden variar; la app consulta `getAppLoadStatus` antes
de mostrar un estado confirmado.
Un error o falta de permisos conserva estado desconocido, no lo convierte en app ausente.
El inventario previo a la limpieza de esta TV (124 apps, consultado por SSAP y después por SSH
root con `listApps`) está resumido en
[docs/cleaning.md](docs/cleaning.md); el JSON crudo no se publica.

- https://github.com/NuvioMedia/NuvioTVSmart/blob/main/appinfo.json
- https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java
- https://webostv.developer.lge.com/develop/references/application-manager
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine

## Estado de instalación y próximos pasos

1. 0.3 confirmada visualmente por el dueño. 0.4.0 instalada y apertura aceptada mediante
   Developer Mode; falta confirmar sus fotos diarias y Transitions desde el dock en hardware.
2. Inventario de apps hecho ([docs/cleaning.md](docs/cleaning.md)). Falta confirmar control remoto,
   audio y reproducción.
3. 0.7.2 instalada, con Home nativo y watcher sin polling de input; ambos casos físicos confirmados.
   La navegación de 0.7 fue confirmada por el dueño.
   Root, HBC, PicCap y HyperHDR ya estaban operativos; en 0.6.0 Pantalla completa encendió
   las seis lámparas y Manual las restauró. La primera parada pidió reintentar. El arranque en
   frío ejecutó el hook de Home y abrió Mi pantalla. HDMI, contenido protegido y persistencia de
   Pantalla completa tras reinicio siguen pendientes.
4. Home: el arranque en frío histórico y las pruebas físicas 0.7.1 siguen como evidencia anterior.
   En 0.7.2 el usuario confirmó Home desde YouTube y encendido tras apagar 20 s directamente
   en Mi pantalla, sin LG primero en esos casos. Foco, repetición y otros ciclos siguen sin prueba específica.
5. Limpieza aplicada y verificada: LG Streaming Week, LG Sports Playbook y LG Channels retiradas;
   cinco preferencias inicialmente confirmadas en `off`. `homeAutoLaunch` se leyó después en `on`,
   sin causa atribuida, se volvió a poner en `off` con lectura fresca y después volvió a leerse `on`:
   estado final sin causa aislada. `screenSaverAd` y `adCookie` siguen en `off`.
   Diez candidatas de terceros siguen instaladas.
   No se tocaron otras apps ni servicios del sistema. [Respaldo y reversión](docs/cleaning.md).

Nuvio oficial 1.2.9 también se instaló y recibió su orden de apertura. El paquete se verificó contra
el SHA-256 publicado `895d3e7a884c9fed8162b2a3af96f9ae502a83b33956715ffcbac02ef755d2ac`.
Esto confirma instalación, no inicio de sesión ni reproducción.
Fuente: https://github.com/NuvioMedia/NuvioTVSmart/releases/tag/1.2.9 .

El listado anterior de Developer Mode confirmó `com.frxn.mipantalla` y `space.nuvio.webos`;
el inventario actual no muestra Nuvio. El estado actual y la limpieza están documentados
en [cleaning.md](docs/cleaning.md). La 0.7.2 selecciona el destino nativo mediante `defaultApps.home`;
boot y power/wake siguen a cargo del watcher. Desinstalar puede liberar espacio, sin garantía de más fluidez, RAM o FPS.
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

El paquete `.ipk` 0.7.2 se generó con `@webos-tools/cli` 3.2.6 y se verificó contra `dist/` y el
servicio WiZ: 57 archivos, incluidos 18 del servicio; 257 pruebas en la verificación original del IPK;
1.690.292 bytes. La suite posterior del repositorio pasó 269/269, incluidos 12 tests de la guardia
fuera del IPK; no cambia el conteo del paquete. SHA-256:
`61a3deb0458378b0885d65df6d64390e1f8f07b1264fe722aa21add2a22303b7`. El CLI aceptó su
instalación; el watcher registró aceptación de boot y su monitor de potencia quedó activo. La activación y
la restauración de Pantalla completa tienen confirmación física de 0.6.0; los
controles manuales y el fondo se confirmaron en 0.5.1. El arranque en frío confirmó el hook de
Home y la apertura de la app; el dueño confirmó que pulsar Home abre Mi pantalla. Foco,
repetición/mantenimiento y otros ciclos de standby siguen pendientes. En 0.7.1 el dueño confirmó
encendido tras apagar 20 s con el control y regreso desde YouTube con Home tras 2 s; el primer
caso había fallado en 0.7.0. En 0.7.2 confirmó Home desde YouTube y encendido tras apagar 20 s
directamente en Mi pantalla, sin LG primero en esos dos casos. No acredita cold boot nuevo,
foco, repetición ni otros ciclos. La guardia externa está desplegada; su fallback en frío con
la app ausente sigue sin prueba física. El paquete
privado y sus configuraciones del clima y las lámparas no se publican.
Esa herramienta no forma parte de la app ni es necesaria para la vista previa.
Para volver a empaquetar tras cambiar archivos, ejecutar `npm run build` y luego
`npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package dist services/com.frxn.mipantalla.lights -o artifacts --no-minify`.
`python scripts/verify_package.py` comprueba contenido y timestamps del paquete sin ejecutarlo.
La advertencia del CLI sobre `requiredACG` no aplica a webOS 5: LG documenta que
ACG no está soportado en webOS TV 25 o anteriores:
https://webostv.developer.lge.com/develop/guides/acg-guide .
La integración usa HyperHDR en `127.0.0.1:19444`, con autenticación e instancia cero, y PicCap en
`127.0.0.1:19400`. `screen-config.example.json` viene deshabilitado; la configuración opcional
privada se lee desde `services/com.frxn.mipantalla.lights/screen-config.json`, excluido de Git.
Además del token y el perfil, `hardwareVerified` es una atestación manual tras la prueba física.
El permiso de rol hacia `org.webosbrew.piccap.service` no forma parte del IPK y debe existir para
que el probe de frames funcione.

El runtime es HTML/CSS/JavaScript y la biblioteca oficial webOSTV.js 1.2.13 (Apache-2.0).
No requiere Vercel, servidor propio, cuenta nueva, analytics ni servicios de pago. Conexiones externas:
la consulta pública de clima a api.open-meteo.com y, una vez por día, la de fotos a commons.wikimedia.org
más sus miniaturas en upload/thumb.wikimedia.org (HTTPS, sin clave). Sin conexión, el clima conserva
el último dato válido con su antigüedad o muestra "Clima no disponible"; siguen las fotos locales.
Transitions solo
envía a la TV la orden de abrir YouTube; la app no contacta YouTube.
