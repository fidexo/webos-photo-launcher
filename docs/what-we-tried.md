# Lo que probamos, lo que falló y por qué cambiamos

Bitácora técnica del proyecto. Está ordenada por tema, no por hora. Cada punto dice qué pasó y
cómo quedó en el código. Las etiquetas de estado son las del [tutorial](tutorial.md).

## La pregunta inicial

"¿Se puede hackear webOS para tener una interfaz propia?" La respuesta corta: **sin root, se puede
instalar una app que funcione como inicio**, no reemplazar el sistema. El objetivo era una pantalla
limpia con lo que realmente se usa: YouTube, Spotify, Nuvio, Netflix, Disney+ y HDMI 1.

Lo que no cambia una app de Developer Mode:

- el botón Home y el encendido siguen abriendo el Home de LG;
- los menús de imagen, sonido y configuración son los de LG;
- dentro de Netflix, YouTube, etc., ves la interfaz de cada app.

## Diseño: tres iteraciones

1. **Editorial oliva**: primer diseño, tipográfico y sobrio. Se descartó.
2. **Liquid Glass 0.2**: vidrio esmerilado sobre fondo, implementado con Claude Opus 5.5 (high).
   Gustó.
3. **0.3, solo íconos**: sin títulos grandes ni nombres debajo, fotos de fondo y clima. El dueño
   la vio en la TV y confirmó que le gustó. Cada ícono conserva su nombre en `aria-label` y la
   pantalla Personalizar muestra los nombres completos.

## Chromium 68: vidrio sin `backdrop-filter`

webOS 5 usa Chromium 68. Ahí `backdrop-filter` no está disponible, y es justo lo que hace el efecto
de vidrio en navegadores modernos.

Solución: por cada foto de fondo se dibuja una miniatura de **160 px** en un `<canvas>` detrás del
dock, con un único desenfoque (`ctx.filter`) que se calcula una vez por foto. El navegador la
escala con CSS y queda como vidrio esmerilado. Nunca se leen ni exportan píxeles del canvas.

Es mejora progresiva: en navegadores modernos se usa `backdrop-filter` real; en la TV, el canvas.

También evitamos CSS que Chromium 68 no soporta bien, como `gap` en flexbox: los espacios se
hacen con márgenes.

## Fotos de fondo: memoria y decodificación

**Primer intento:** fotos de Unsplash a 3000 px. Eran unos 4 MB en total, pero cada imagen
decodificada ocupa alrededor de 24 MB de memoria. Para una TV de gama media es mucho.

**Cambio:** las bajamos del CDN de Unsplash a **1920 px de ancho**. Quedaron entre 247 y 629 KB
cada una (JPEG progresivo) y el paquete entero pesa 1,64 MB.

**`img.decode()` que nunca termina:** en Chromium, con JPEG grandes, la promesa de `decode()` puede
no resolverse nunca. Si el código la espera, la rotación se congela.
Ahora decide `onload`: si la imagen cargó, sirve; `decode()` se espera **como máximo 2 s** como
mejora, no como requisito.

**Rotación:** dos capas `<img>` con fundido de 1,2 s cada 5 minutos. La siguiente foto se precarga
cuando termina el fundido. Sin video, WebGL ni filtros CSS.

**App oculta:** con `visibilitychange` se cancela el temporizador de precarga mientras la app no se
ve. Si volvés en medio de una carga, la rotación se recupera en vez de quedar trabada en "ocupada".

**Fallbacks:** una foto que no carga se salta. Si ninguna carga, o falta `wallpapers.js`, se usa
`assets/wallpaper.svg`.

## Dos bugs de capas

**La sombra quedaba debajo de la foto.** Un contexto de apilamiento (*stacking context*) hacía que
la capa de oscurecimiento se pintara detrás del fondo. Se fijó un orden explícito:

| Capa | `z-index` |
| --- | --- |
| Fondo (fotos) | 0 |
| Aura | 1 |
| Sombra | 2 |
| Interfaz | 3 |

**1 px de scroll fantasma.** Un SVG global con la clase `sr-only` (solo para lectores de pantalla)
agregaba un píxel de alto y aparecía una barra de scroll. Se fijó con `position: fixed; top: 0;
left: 0`.

## Clima: qué es "dato actual"

Open-Meteo, por HTTPS, sin API key ni backend. Pedimos `temperature_2m`, `apparent_temperature`,
`weather_code` e `is_day` con `timezone=auto`, cada 15 minutos.

Reglas que salieron de pensar los casos raros:

- **Sin configuración o sin red, se muestra "–", nunca 0.** 0 °C es un valor válido y no se puede
  usar como "no sé".
- **La frescura la define el proveedor**, no la hora de descarga. Se usa `current.time` más
  `utc_offset_seconds`. Si la API devuelve una respuesta vieja repetida, bajarla de nuevo no la
  convierte en actual.
- Con más de **30 minutos** se marca "Último dato HH:MM". Con más de **3 horas** ya no se muestra
  como clima actual.
- Una hora **más de 5 minutos en el futuro** se rechaza. Y una caché con fecha futura no puede
  "envenenar" la recuperación: no bloquea que entre un dato bueno después.
- Una respuesta más vieja no reemplaza a una más nueva.
- En `localStorage` se guardan solo el último valor y sus metadatos de tiempo, nada personal.
- Los datos son de modelo, en intervalos de 15 minutos. No se presentan como observación de una
  estación meteorológica.

Fallas transitorias (red, timeout, 5xx, 429) reintentan a 1, 2, 4 y 8 minutos. Un 4xx espera la
cadencia normal.

## Pruebas: rojo antes de verde

La 0.3 tiene 35 pruebas (`node --test`) sobre el puente con la TV, el build, el clima y los fondos.
En las cuatro áreas, las regresiones importantes se escribieron primero como prueba que fallaba y
después se corrigieron.

Las pruebas usan dobles simulados del SDK. **No reemplazan probar en la TV.**

En 0.4 la suite pasó a **77 pruebas**, todas en verde. Las fotos diarias y Transitions se verificaron
también en Brave. Antes de cerrar la integración corregimos tres regresiones:

- El puente seguía usando `contentId`: ahora envía el `contentTarget` que abrió el video en la TV.
- Si `localStorage` dejaba leer pero rechazaba escrituras, el sorteo podía repetir el episodio:
  ahora el último elegido en memoria tiene prioridad sobre el valor viejo guardado.
- Si Commons respondía con un lote vacío cuando la app ya estaba oculta, podía disparar el segundo
  pedido igualmente: ahora esa continuación espera a que la app vuelva a estar visible.

Las tres fallaron antes de la corrección y pasaron después. La 0.4.0 también se empaquetó y verificó
contra `dist/`; la TV aceptó su instalación y apertura. Falta confirmar visualmente las fotos
diarias y abrir un episodio desde el dock. Las cuatro fotos locales siguen como respaldo.

## Puente con la TV: estado "desconocido"

La app consulta `getAppLoadStatus` para saber si una app existe. Si esa consulta falla (timeout,
permisos), el estado queda **desconocido** (`data-state="unknown"`), no "no instalada". Solo se
muestra "No encontrada" cuando la TV responde explícitamente que el ID no existe.

Todas las llamadas Luna tienen timeout de 7 s y no se reintentan solas.

## YouTube: abrir un video puntual

Para el acceso a Transitions (ver [roadmap.md](roadmap.md)) necesitábamos que YouTube abriera
**un episodio específico**, no solo la app. Lo probamos en la TV real con `ares-launch`.

**Intento 1: `contentId` (formato de Connect SDK).**

```sh
ares-launch --device mi-tv youtube.leanback.v4 \
  --params '{"contentId":"<videoId>&pairingCode=<uuid>&t=0.0"}'
```

Connect SDK, la biblioteca oficial de LG, arma ese `contentId` para lanzar YouTube por SSAP (el
protocolo de control en red). Resultado: **abrió YouTube, pero no el episodio**. El dueño lo
confirmó en la pantalla. El ejemplo SSAP también lleva `contentId` en el nivel superior del payload;
esa petición no es idéntica a la enviada por Luna. No aislamos la causa interna del comportamiento de YouTube.

**Intento 2: `contentTarget` con la URL completa.**

```sh
ares-launch --device mi-tv youtube.leanback.v4 \
  --params '{"contentTarget":"https://www.youtube.com/watch?v=2TcoICioKpM"}'
```

Resultado: apareció el **selector de perfiles de YouTube** y, después de elegir, **se abrió el
video**. El dueño confirmó las dos cosas. **Este es el formato verificado en esta TV.**

Lo encontramos en el mantenedor de `lgtv2`:
https://github.com/hobbyquaker/lgtv2/issues/41#issuecomment-5370241499 .

Estado del código: `bridge.js` (0.4) ya envía `contentTarget` con la URL del video. Lo probado en
la TV fue el comando `ares-launch`; abrir el episodio desde el launcher 0.4 todavía no se probó.

Los ejemplos anteriores usan sintaxis POSIX (macOS/Linux o Git Bash). En nuestra prueba desde
PowerShell pasamos el objeto con `JSON.stringify` y `child_process.spawnSync` de Node, evitando
que el shell reinterpretara comillas y ampersands.

## Inventario de apps

Para limpiar la TV primero había que saber qué tiene instalado. Fue lo que más vueltas dio.

| Intento | Resultado |
| --- | --- |
| `ares-install --list` | Solo lista **apps de desarrollo** (en nuestro caso, 2). No sirve para la tienda ni el sistema. |
| SSH como `prisoner` y buscar `/usr/palm/applications` | El usuario `prisoner` está en un *chroot*: que esa carpeta no exista ahí **no prueba nada**. |
| WebSocket sin TLS al puerto 3000 | El TCP abre, pero la TV cierra la conexión en el *upgrade*. |
| `WebSocket` global de Node | Falló contra la TV. |
| **WSS al puerto 3001 desde Python** | **Funcionó.** |

Cómo quedó `scripts/inventory_tv.py`:

- Usa el paquete `websockets` de Python. **No es dependencia de la app**, solo del script.
- La TV usa un certificado propio. El script baja ese certificado, lo usa como única raíz de
  confianza **solo en memoria** para esa conexión y verifica que el certificado del canal sea
  exactamente ese, byte a byte. No toca el almacén de certificados del sistema ni guarda nada.
- La primera lectura del certificado es confianza en el primer uso, no una validación de identidad
  contra una CA pública. Hay que comprobar la IP de la TV y su aviso físico de emparejamiento.
- Manda `hello` con un `appId` y nombre propios, y `register` con un manifiesto mínimo:
  `{ manifestVersion: 1, permissions: ["READ_INSTALLED_APPS"] }`. Es el registro sin firma que LG
  documenta en Connect SDK. **No falsifica la firma de LG.**
- Espera `registered`, hace una sola consulta `ssap://com.webos.applicationManager/listApps` y
  cierra. No imprime ni guarda la *client-key* de emparejamiento.
- La TV pide permiso en pantalla. Es el emparejamiento normal de una app de control remoto, sin root.

Resultado en esta TV: **124 apps**, 104 con `systemApp: true` y 20 con `removable: true`.
Qué hicimos con eso: [cleaning.md](cleaning.md).

## Nuvio

Nuvio publica un IPK oficial 1.2.9 compatible con webOS 5 (2020+,
Chromium 68), `appId` `space.nuvio.webos`.

- Se bajó del release oficial y el SHA-256 coincidió con el publicado.
- La instalación y la orden de apertura fueron aceptadas.
- Al primer inicio no trae contenido configurado.
- **No verificamos login ni reproducción.**
- El paquete incluye su servicio acompañante; no hace falta otro backend.

Este repo no redistribuye el IPK. Link al release oficial en el [tutorial](tutorial.md#10-nuvio-opcional).

## Empaquetado

- El CLI avisa que falta `requiredACG`. En webOS 5 no aplica (LG: ACG no se usa en webOS TV 25 ni
  anteriores). No es un error.
- `scripts/verify_package.py` revisa el IPK sin ejecutarlo: estructura `ar`, `appinfo.json`,
  timestamps posteriores al año 2000 y que cada archivo sea idéntico al de `dist/`.

## Lo que decidimos no hacer

- **Root.** En la etapa 0.4 se dejó como decisión aparte. Después se ejecutó para 0.6 y quedó
  persistente con HBC; ver [root-and-home.md](root-and-home.md) y
  [roadmap.md](roadmap.md#root-ejecutado-y-persistente).
- **Reemplazar el botón Home o arrancar solo al prender.** Sin root no había un mecanismo
  verificado para webOS 5. Con root se instaló la fase 1: el arranque en frío se verificó y la
  pulsación física de Home sigue pendiente. Ver [home-takeover.md](home-takeover.md).
- **Borrar apps.** Hay 13 candidatas, pero no se borró ninguna todavía.
