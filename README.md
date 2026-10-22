# webos-photo-launcher — "Mi pantalla"

**ES · EN** — [Español](#español) · [English](#english)

---

## Español

Un inicio personalizado para **LG webOS 4** (probado en una LG LM6350PSB): reloj, clima, tus apps de streaming
y de fondo una rotación de fotos de destinos de viaje. Está pensado para TVs viejas (HTML/CSS/JS ES5, sin
dependencias) y se maneja con el control remoto o con el Magic Remote.

> Es una versión **modificada** del proyecto [frxnnk/webos-liquid-glass-launcher](https://github.com/frxnnk/webos-liquid-glass-launcher),
> que fue pensado para otro modelo (webOS 5.6). Los documentos originales están en `docs/upstream/` y **no describen esta TV**.

### Qué hace
- **Fotos de viaje:** 50 destinos de Wikimedia Commons (ciudades de EE. UU. y Europa, Asia, Sudamérica y maravillas
  naturales). Orden aleatorio sin repetir, cambio cada 12 s con fundido y el nombre del lugar al pie; autor, licencia y origen de cada foto están en Personalizar → Fuentes.
  Funciona sin conexión con 4 fotos incluidas. El botón **rojo** del control descarta un destino.
- **Fila de apps** (Netflix, HBO Max, Prime Video, Movistar TV, YouTube, Disney+, Apple TV, Spotify) con scroll
  horizontal que mantiene visible la tarjeta enfocada, y un acceso al inicio original de LG.
- **Solo fondo:** tras 45 s sin actividad queda la foto a pantalla completa; una tecla o mover el puntero vuelve.
- **Personalizar:** ocultar y ordenar apps. **Clima** de tu ciudad (Open-Meteo), en Celsius.
- **Inicio automático** al encender la TV y **botón Home** que abre Mi pantalla (opcional, reversible).
- **Bloqueo opcional** de dominios de publicidad/ACR de LG (opcional, reversible).

### Requisitos y advertencias
- Una TV LG **con root** (por ejemplo con DejaVuln) y [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) + SSH.
  **Hacer root y modificar una TV tiene riesgos. Hacelo bajo tu responsabilidad.** Este proyecto no está afiliado a LG.
- Probado **solo** en: LG LM6350PSB, firmware 05.40.97, webOS 4.x, Node 0.12.2. En otros modelos puede no funcionar.
- No instala ni cambia el root. Los scripts de la TV asumen `ssh` como root con clave y `scp`.

### Paquete listo para instalar
`releases/` trae el `.ipk` ya armado (sin íconos de marcas ni tu clima: al instalar con `scripts/tv-install.sh` se copian los íconos desde tu TV).
El clima aparece como "no disponible" hasta que armes tu propio paquete con `weather-config.js`.

### Uso rápido
```bash
npm test                    # Node 18+; 205 tests (1 omitido)
npm run build               # genera dist/
python scripts/make_ipk.py  # genera artifacts/<id>_<versión>_all.ipk
export TV_HOST=192.168.1.50 TV_KEY=~/.ssh/mi_clave     # IP de la TV y clave SSH de root
sh scripts/tv-install.sh artifacts/com.fidexo.photolauncher_1.12.0_all.ipk
sh scripts/tv-home.sh status | mipantalla | lg          # a qué app llama el botón Home
sh scripts/tv-privacy.sh status | apply | remove        # bloqueo de dominios (opcional)
```
Para **volver atrás**: `tv-install.sh` con un `.ipk` anterior (bajar de versión no está probado), `tv-home.sh lg`
y `tv-privacy.sh remove`. Copiá `weather-config.example.js` a `weather-config.js` y poné tu ciudad.

### Íconos oficiales
Los íconos de Netflix, YouTube, etc. **no están en este repositorio ni en el paquete** (son marcas de sus dueños). Al instalar,
`scripts/tv-install.sh` los copia automáticamente desde tu propia TV (cada app trae el suyo) a la app instalada. Si instalás el `.ipk`
por otro medio, cada app se muestra como una tarjeta de color con su nombre.

### Personalizar
- Apps: `config.js` (IDs de apps verificados en la TV con `tv-scripts/query-user-apps.sh`).
- Fotos: `daily-photos-config.js` (hasta 50 `pageids` de Commons, con el nombre del lugar) y `wallpapers.js`.
- Tiempos: `ROTATE_MS` en `backgrounds.js` y `IDLE_MS` en `app.js`.
- El ID del paquete es `com.fidexo.photolauncher`; cambialo en `appinfo.json` (y en `config`/scripts) si querés el tuyo.

### Carpetas
`app.js`, `backgrounds.js`, `daily-photos.js`, `apple-tv.css`… (la app) · `services/` (inicio automático, Node 0.12) ·
`scripts/` (build, empaquetado e instalación) · `tv-scripts/` (debloat y autostart, específicos de esta TV) ·
`tests/` · `docs/upstream/` (documentación del proyecto original).

### Limitaciones conocidas
Lo probado es lo de esta TV; no se midió el rendimiento más allá de "se siente fluido". El bloqueo de dominios no
tiene un efecto medido. Las apps preinstaladas cifradas (p. ej. Claro Video) no se pueden desinstalar en este firmware.
Ver [NOTICE.md](NOTICE.md) para créditos y licencias.

### Autoría
Desarrollado con **Codex** (OpenAI), que hizo la primera adaptación a esta TV (root, debloat, inicio automático y el primer diseño),
y **Claude** (Anthropic), que continuó el trabajo (dock, fotos, Home, pruebas y publicación), sobre el proyecto base de **frxnnk**.

---

## English

A custom home screen for **LG webOS 4** (tested on an LG LM6350PSB): clock, weather, your streaming apps and a rotating
background of travel-destination photos. Built for old TVs (plain ES5 HTML/CSS/JS, no dependencies), controlled with the
remote or the Magic Remote.

> This is a **modified** fork of [frxnnk/webos-liquid-glass-launcher](https://github.com/frxnnk/webos-liquid-glass-launcher),
> written for a different model (webOS 5.6). The original docs live in `docs/upstream/` and **do not describe this TV**.

### Features
- **Travel photos:** 50 Wikimedia Commons destinations, shuffled without repeats, 12 s fade rotation, place name on screen (author, licence and origin in Customize → Sources); 4 bundled offline photos; the **red** remote key discards a destination.
- **App row** with horizontal scrolling that keeps the focused card visible, plus a shortcut to LG's original home.
- **Photo-only mode** after 45 s idle; any key or pointer movement brings the UI back.
- **Customize** (hide/reorder apps), **weather** (Open-Meteo), **auto-start** on power-on, and an optional **Home button**
  that opens this launcher. Optional, reversible **LG ad/ACR domain blocking**.

### Requirements and warnings
- A **rooted** LG TV (e.g. DejaVuln) with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) and SSH.
  **Rooting and modifying a TV is risky; do it at your own risk.** Not affiliated with LG.
- Tested **only** on LG LM6350PSB, firmware 05.40.97, webOS 4.x, Node 0.12.2. Other models may not work.
- Nothing here roots your TV. Scripts need key-based root `ssh`/`scp`.

### Ready-made package
`releases/` has the built `.ipk` (no brand icons and no weather location: `scripts/tv-install.sh` copies the icons from your TV when installing).
Weather shows as unavailable until you build your own package with a `weather-config.js`.

### Quick start
```bash
npm test && npm run build && python scripts/make_ipk.py
export TV_HOST=192.168.1.50 TV_KEY=~/.ssh/my_key
sh scripts/tv-install.sh artifacts/com.fidexo.photolauncher_1.12.0_all.ipk
sh scripts/tv-home.sh status | mipantalla | lg
sh scripts/tv-privacy.sh status | apply | remove
```
To roll back: reinstall an older `.ipk` (downgrades are untested), `tv-home.sh lg`, `tv-privacy.sh remove`.
Copy `weather-config.example.js` to `weather-config.js` with your city.

### Official icons
App icons (Netflix, YouTube, …) are **not in this repo or the package** (trademarks). `scripts/tv-install.sh` copies them automatically
from your own TV into the installed app; if you install the `.ipk` some other way, each app is a coloured card with its name.

### Known limits
Only verified on one TV. Performance was judged by feel, not benchmarks. Domain blocking has no measured benefit.
Encrypted preinstalled apps cannot be uninstalled on this firmware. See [NOTICE.md](NOTICE.md) for credits and licences.

### Authors
Built with **Codex** (OpenAI), which did the first adaptation to this TV (root, debloat, auto-start and the first design), and
**Claude** (Anthropic), which continued (dock, photos, Home, tests and publishing), on top of **frxnnk**'s base project.
