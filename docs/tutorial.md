# Tutorial: un inicio propio para una LG con webOS 5, sin root

Esta guía explica cómo armamos e instalamos **Mi pantalla** (`com.frxn.mipantalla`), un launcher
estilo "Liquid Glass" para una LG con webOS 5. Es una app web común instalada por **Developer Mode**:
no reemplaza el firmware, no toca el sistema y se puede borrar como cualquier app.

Qué esperar antes de empezar:

- La app se abre desde la lista de apps (o con `ares-launch`). **No reemplaza el botón Home de LG**
  ni arranca sola al prender la TV. Los menús de imagen y sonido, y la interfaz interna de Netflix,
  YouTube y demás, siguen siendo los originales.
- No hay root, ni scripts de arranque, ni apps del sistema borradas.
- Las apps de Developer Mode se borran solas si la sesión de desarrollador vence (ver paso 1).

Estados que vas a ver en estas docs:

| Etiqueta | Significa |
| --- | --- |
| Verificado en la TV | Lo probamos en el televisor real y el dueño lo confirmó. |
| Verificado en Brave | Probado en la vista previa local, en un navegador de escritorio. |
| Instalación y apertura aceptadas por CLI | La TV aceptó esos comandos; falta comprobar visualmente las funciones. |
| Implementado (0.4), pendiente en hardware | Código y pruebas listos; todavía falta la prueba visual de esas funciones en la TV. |

## 0. La TV y lo que necesitás

Hardware probado:

| Dato | Valor |
| --- | --- |
| Modelo | LG 49UN7310PSC |
| webOS | 5.6.2-21 (`jhericurl-jimna`) |
| Firmware | 04.64.00 |
| Board | K6LP_ATSC_BR |
| Motor web | Chromium 68 (según la tabla de LG) |

Los datos de modelo y firmware se leyeron dos veces con `ares-device --system-info`. El motor web
sale de la tabla oficial de LG:
https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine .

En la compu:

- Node.js con npm (probado con Node 24; usamos `npm exec`, sin instalar el CLI globalmente).
- Python 3.10 o más nuevo (probado con 3.13, solo para verificar paquetes y el inventario opcional).
- La compu y la TV en la **misma red local**.
- Una cuenta gratuita de **LG Developer**.

En Windows PowerShell usá `npm.cmd` en lugar de `npm` si la política de scripts bloquea `npm.ps1`.
En macOS o Linux, `npm` normal.

## 1. Activar Developer Mode en la TV

1. En la TV, abrí LG Content Store y buscá **Developer Mode**. Instalala.
2. Abrila e iniciá sesión con tu cuenta de LG Developer.
3. Activá **Dev Mode Status**. La TV se reinicia.
4. Volvé a abrir Developer Mode y activá **Key Server**.
5. Anotá la IP que muestra la app. En estas docs la llamamos `IP_DE_TU_TV`.

La app muestra un contador **Remain Session**. Antes de que llegue a cero, entrá y tocá **EXTEND**.
Si la sesión vence, Developer Mode se desactiva y **se eliminan las apps de desarrollo**, incluida
Mi pantalla. Guía oficial:
https://webostv.developer.lge.com/develop/getting-started/developer-mode-app .

## 2. Emparejar la compu con la TV

Todos los comandos usan el CLI oficial `@webos-tools/cli` 3.2.6 sin instalarlo como dependencia:

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-setup-device
```

Es un asistente interactivo. Elegí agregar un dispositivo y completá:

| Campo | Valor |
| --- | --- |
| Nombre | `mi-tv` (el que quieras; lo usan los demás comandos) |
| IP | `IP_DE_TU_TV` |
| Puerto | `9922` |
| Usuario | `prisoner` |

Después bajá la llave de desarrollo:

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-novacom --device mi-tv --getkey
```

Te va a pedir la **passphrase** que aparece en la app Developer Mode de la TV. Escribila solo en esa
terminal. No la pegues en chats, issues, capturas ni commits: junto con la llave da acceso de
desarrollador a tu TV.

Comprobá que la conexión funciona:

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-device --device mi-tv --system-info
```

Tendría que listar modelo, versión de webOS y firmware. Si falla, revisá que Key Server siga activo
y que la IP no haya cambiado.

## 3. Compilar y probar

Desde la raíz del repo:

```sh
npm test
npm run build
```

- `npm test` corre **77 pruebas** con el runner nativo de Node (`node --test`), todas en verde para
  la 0.4. Usan dobles simulados: no equivalen a probar en la TV.
- `npm run build` copia a `dist/` solo lo que la app necesita: HTML, CSS, JS, configuración,
  íconos SVG, fotos con sus créditos y el SDK oficial `vendor/webOSTV.js` (1.2.13, Apache-2.0,
  procedencia en `vendor/SOURCE.md`). Nunca copia `node_modules`.

La app no tiene dependencias de runtime: es HTML, CSS y JavaScript ES5. Nada de frameworks.

## 4. Empaquetar el IPK y verificarlo

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package dist -o artifacts --no-minify
python scripts/verify_package.py
```

`dist/` y `artifacts/` están en `.gitignore`: **el IPK no viene en el repo, lo generás vos**.

`verify_package.py` abre el paquete sin ejecutar nada y comprueba:

- que sea un archivo `ar` válido de IPK;
- que `appinfo.json` coincida con el del repo (ID y versión);
- que los archivos conserven timestamps posteriores al año 2000, como medida de compatibilidad;
- que no se hayan colado `node_modules` ni el SDK sin descomprimir;
- que el contenido sea idéntico byte a byte a lo que dejó `npm run build`.

El CLI avisa que falta `requiredACG`. **En webOS 5 no es un error**: LG documenta que ACG no se
aplica a webOS TV 25 ni anteriores. https://webostv.developer.lge.com/develop/guides/acg-guide .

## 5. Instalar y abrir

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-install --device mi-tv artifacts/com.frxn.mipantalla_<versión>_all.ipk
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-launch --device mi-tv com.frxn.mipantalla
```

Reemplazá `<versión>` por la de `appinfo.json`. Después de instalarla también aparece en la lista
de apps de la TV y se abre desde ahí con el control.

Estado: la **0.3** se instaló y se abrió así en la TV, y el dueño confirmó que le gustó. La **0.4.0**
también fue instalada y su apertura aceptada por CLI; falta confirmar visualmente fotos diarias y
abrir un episodio desde su dock. No confundimos la respuesta del CLI con esa prueba visual.

Para desinstalar:

```sh
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-install --device mi-tv --remove com.frxn.mipantalla
```

## 6. Cómo se usa

Con el control remoto: flechas para moverte, **OK** para abrir, **Atrás** (tecla 461) para volver.

- El dock muestra solo íconos: YouTube, Spotify, Nuvio, Netflix, Disney+, Transitions y HDMI 1.
- Transitions elige uno de los episodios configurados al pulsar OK, sin repetir el anterior.
- **Personalizar** permite ocultar, mostrar y reordenar. Se guarda en `localStorage` de la app.
  Ocultar no desinstala nada.
- Abrir una app usa la API oficial `luna://com.webos.applicationManager/launch` a través de
  `webOSTV.js`, con un timeout de 7 s y sin reintentos automáticos.
- Antes de marcar una app como "No encontrada" se consulta `getAppLoadStatus`. Si la consulta falla,
  el estado queda **desconocido**: no se asume que la app falta.

## 7. Qué se configura y dónde

| Archivo | Qué controla |
| --- | --- |
| `config.js` | Apps del dock: título, `appId`, logo y color. |
| `weather-config.js` | Lugar del clima: nombre y coordenadas. |
| `wallpapers.js` + `assets/wallpapers/` | Fotos de fondo locales y sus créditos. |
| `daily-photos-config.js` | Fotos diarias de Wikimedia Commons. Implementado en 0.4; prueba visual en TV pendiente. |
| `transitions-config.js` | Episodios de Transitions para el acceso a YouTube. Implementado en 0.4; prueba desde el dock en TV pendiente. |

### Apps (`config.js`)

Los `appId` de YouTube (`youtube.leanback.v4`), Netflix (`netflix`), Nuvio (`space.nuvio.webos`),
Spotify, Disney+ y HDMI 1 están ahí. Si tu TV usa otro ID, cambialo y recompilá. Para saber qué
apps tiene tu TV, mirá [cleaning.md](cleaning.md#cómo-obtuvimos-el-inventario).

### Clima (`weather-config.js`)

Copiá `weather-config.example.js` como `weather-config.js` (`Copy-Item` en PowerShell o `cp` en
macOS/Linux). Completá nombre, latitud y longitud con el **centro de tu ciudad**, sin dirección personal.
La configuración local está en `.gitignore` y no se publica. El ejemplo deja coordenadas `null`.
Sin coordenadas válidas el widget dice "Clima no disponible" y no hace ningún pedido.

Los datos vienen de Open-Meteo (HTTPS, sin API key, sin backend propio):

```
https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…
  &current=temperature_2m,apparent_temperature,weather_code,is_day&timezone=auto
```

Refresca cada 15 minutos. Más detalles de cómo se valida en
[what-we-tried.md](what-we-tried.md#clima-qué-es-dato-actual). Fuente: https://open-meteo.com/en/docs .

### Fondos (`wallpapers.js`)

Cuatro fotos de Unsplash a 1920 px, rotando cada 5 minutos con un fundido de 1,2 s. Solo se aceptan
rutas locales `assets/wallpapers/*.jpg|jpeg|webp|png`. Si cambiás fotos, mantenelas cerca de
1920×1080 y por debajo de ~1 MB: `npm run build` avisa si se pasan. Créditos y licencia en
`assets/wallpapers/CREDITS.md`.

## 8. Vista previa local (sin TV)

```sh
npm start
```

Abrí http://127.0.0.1:43817 en el navegador. Las flechas, Enter y Escape simulan el control.
La vista previa **nunca contacta la TV**: abrir una app solo muestra un mensaje de demostración.
Con configuración, el clima sí consulta Open-Meteo de verdad. Las fotos del día consultan Commons.

Para generar dos HTML autocontenidos (útiles para compartir o revisar el diseño):

```sh
node scripts/preview.cjs
```

- `artifacts/mi-pantalla-preview.html`: vidrio con `backdrop-filter` (navegadores modernos).
- `artifacts/mi-pantalla-preview-tv.html`: fuerza el vidrio de respaldo que usa Chromium 68.

Pesan unos 2,19 MB porque incluyen las fotos. Cualquier captura que veas en este repo de esa vista
es una **vista previa local**, no una foto de la TV.

Probamos 1920×1080, 1280×720 y anchos chicos (728 y 360 px) en Brave, sin desbordes.

## 9. Inventario opcional de apps de la TV

`scripts/inventory_tv.py` lista todas las apps instaladas (de tienda y de sistema) usando el
protocolo de control remoto en red de LG. Solo lee: no abre, borra ni configura nada.

```sh
python -m pip install websockets
python scripts/inventory_tv.py --host IP_DE_TU_TV
```

La TV muestra un aviso para permitir que la app lea la lista de aplicaciones: aceptalo con el
control. El resultado queda en `artifacts/tv-app-inventory.json` (en `.gitignore`). **No lo publiques
crudo**: incluye la lista exacta de lo que tiene tu TV. Cómo llegamos a este método y qué encontramos:
[what-we-tried.md](what-we-tried.md#inventario-de-apps) y [cleaning.md](cleaning.md).

## 10. Nuvio (opcional)

Nuvio publica un IPK oficial compatible con webOS 5 (2020+,
Chromium 68). Bajalo **del release oficial** y verificá el hash antes de instalar:

```sh
curl -LO https://github.com/NuvioMedia/NuvioTVSmart/releases/download/1.2.9/NuvioTV-webOS-1.2.9.ipk
# SHA-256 esperado:
# 895d3e7a884c9fed8162b2a3af96f9ae502a83b33956715ffcbac02ef755d2ac
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-install --device mi-tv NuvioTV-webOS-1.2.9.ipk
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-launch --device mi-tv space.nuvio.webos
```

En PowerShell podés calcular el hash con `Get-FileHash NuvioTV-webOS-1.2.9.ipk -Algorithm SHA256`;
en macOS/Linux con `shasum -a 256` o `sha256sum`.

Estado: el hash coincidió, la instalación y la orden de apertura fueron aceptadas. Al abrirse por
primera vez no trae contenido configurado. **No verificamos login ni reproducción.** El paquete ya
incluye su servicio acompañante; no hace falta otro backend. Este repo no redistribuye el IPK de
Nuvio: release oficial en https://github.com/NuvioMedia/NuvioTVSmart/releases/tag/1.2.9 .

Igual que Mi pantalla, Nuvio es una app de desarrollo y desaparece si vence Developer Mode.

## Siguiente

- [what-we-tried.md](what-we-tried.md): lo que falló, lo que cambiamos y por qué.
- [cleaning.md](cleaning.md): inventario real de la TV y cómo limpiar sin romper nada.
- [roadmap.md](roadmap.md): 0.4 (fotos diarias y Transitions) e integración con Home.
- [root-and-home.md](root-and-home.md): revisión de root y Home, todavía sin ejecutar.
- [sources.md](sources.md): todas las fuentes.
