# Mi pantalla

Un inicio personalizado para LG webOS: tus apps, fotos y el control del living en una pantalla
Liquid Glass que se maneja con el control remoto.

**0.7.5 instalada en la TV de referencia.** Incorpora un acceso a Homebrew Channel y un auditor
de privacidad y recursos de sólo lectura. Los ocho accesos entran a 1080p y 720p. El acceso
abrió Homebrew Channel en la TV; no instala paquetes ni obtiene root por sí mismo.

[**Tutorial completo**](docs/tutorial.md) · [Privacidad y limpieza](docs/privacy-cleanup.md) ·
[Funciones futuras](docs/product-vision.md) · [Instalador desde el navegador](docs/browser-installer.md)
· [Próximos pasos: rendimiento, referencias visuales, Flutter y wizard local](docs/next-steps.md)

## Qué ofrece hoy

- Íconos sin títulos, ordenables y ocultables: YouTube, Spotify, Nuvio, Netflix, Disney+,
  Transitions/Bedrock, Homebrew Channel y HDMI 1. Los IDs se verifican por modelo: un acceso
  configurado no significa que la app esté instalada. Nuvio no apareció en el último inventario.
- Ilustración local desde el primer pintado, foto con fundido y una selección diaria de
  Wikimedia Commons con créditos y licencia. Las fotos incluidas funcionan sin esa descarga.
- Clima de la ciudad configurada con Open-Meteo, caché local y estados de dato viejo o sin red.
- Un episodio aleatorio de John Digweed Transitions en YouTube. Puede aparecer primero el
  selector de perfiles de YouTube; ese paso pertenece a esa app.
- Luces WiZ por red local: selección del living, encendido, brillo, color, blancos y
  acompañamiento del fondo de Mi pantalla.
- Home nativo y apertura al encender mediante configuración root separada, con respaldo,
  watcher de potencia y una guardia externa de recuperación.

Mi pantalla es una app, no un firmware. No reemplaza Ajustes ni las interfaces internas de
las apps. El Home original sigue instalado como opción de recuperación.

## Compatibilidad y evidencia

La unidad de referencia es **LG 49UN7310PSC**, webOS **5.6.2-21**, firmware **04.64.00**,
Chromium **68**. El frontend conserva ES5 y no necesita un servidor en la computadora después
de instalarlo. La app y el control manual WiZ pueden usarse con Developer Mode; Home nativo y
captura de otras apps requieren root y configuración adicional.

- El dueño probó **0.7.4** y confirmó que anda bastante bien.
- En **0.7.2**, confirmó Home desde YouTube y encendido tras apagar 20 segundos directamente
  en Mi pantalla. No se extiende a todos los modelos ni ciclos de standby.
- La **0.7.5** se verificó en Brave a 1920×1080 y 1280×720 y se instaló en la TV. Se comprobó
  Homebrew en primer plano después de abrirlo desde el nuevo acceso.
- La muestra de navegación rápida 0.7.5 registró aproximadamente **59,7 FPS** por CDP.
  No es un tiempo desde el encendido ni una garantía de FPS para todos los escenarios.
- Pantalla completa tuvo activación/restauración física en una etapa anterior con PicCap e
  HyperHDR. El inventario actual no muestra sus apps: hay que comprobar de nuevo instalación,
  servicios y configuración. HDMI y contenido protegido siguen pendientes.

[Mediciones y método](docs/performance.md) · [Home y reversión](docs/home-takeover.md) ·
[Luces y sus límites](docs/lights.md) · [Captura](docs/screen-sync.md)

## Instalar

El [tutorial](docs/tutorial.md) incluye Developer Mode, emparejamiento, configuración, paquetes,
Home manual, recuperación y desinstalación. Para la parte local:

```sh
git clone https://github.com/frxnnk/webos-liquid-glass-launcher.git
cd webos-liquid-glass-launcher
npm test
npm run build
npm exec --yes --package=@webos-tools/cli@3.2.6 -- ares-package dist services/com.frxn.mipantalla.lights -o artifacts --no-minify
python scripts/verify_package.py
```

No instalar si falla la verificación. El tutorial explica la conexión `mi-tv` y el comando
`ares-install`. En PowerShell usar `npm.cmd` si la política bloquea `npm.ps1`.

Las configuraciones del hogar no se publican: `weather-config.js`, `lights-config.js` y el
`screen-config.json` del servicio están excluidos de Git. Los ejemplos son una guía; no copiar
tokens, direcciones de lámparas ni atestaciones de hardware de otra TV. Antes de actualizar una
instalación root existente, respaldar y preservar su configuración y permisos específicos.

## Privacidad y limpieza

En la TV se volvieron a leer apagadas las preferencias de promociones, Live Plus, anuncios
personalizados, anuncios del salvapantallas y cookies publicitarias. Se mantienen ausentes
LG Streaming Week, LG Sports Playbook y LG Channels. No se apagaron a ciegas servicios del
sistema ni se purgaron logs. [Acciones y reversión](docs/cleaning.md).

También se retiraron Apple Music, Apple TV, DGO y Star+ por selección del dueño, conservando
las seis apps que indicó y las herramientas principales: el inventario quedó en 117 apps.
Los permisos `analyticsLog` y `crashLog` de LG quedaron en `false`, con respaldo y lectura
posterior. Hay un hook de reaplicación probado manualmente; el arranque físico posterior
está pendiente. [Helper, procedimiento, límites y reversión](docs/diagnostic-privacy.md).

Auditamos **Life’s Good Without Spying**, la app del catálogo Homebrew. Su versión revisada
aplica el conjunto de opciones al cambiar un toggle; los defaults incluyen voz y purga.
No se habilitó. [Código revisado, riesgos concretos y perfil propuesto](docs/privacy-cleanup.md).

También publicamos un auditor de sólo lectura para una TV con SSH root ya autorizado:

```sh
node scripts/privacy-audit.cjs --help
node scripts/privacy-audit.cjs --host IP_DE_TU_TV --identity RUTA_A_TU_CLAVE
```

No obtiene root, instala apps, cambia ajustes ni descubre equipos. Informa preferencias
conocidas, inventario resumido, Home, memoria, disco y una muestra breve de CPU. Exige verificar
el host SSH y no lee la clave; el JSON opcional se crea sólo con `--output`. Mantener los
informes y respaldos privados. El script se probó sobre la TV real.

**Apagar anuncios no demuestra cero telemetría.** LG y las apps de streaming conservan sus
propias conexiones y acuerdos. Nuestra UI consulta Commons y Open-Meteo cuando se configuran
esas funciones; WiZ usa la LAN. Se describe cada límite en la guía de privacidad.

## Hacia dónde seguir

Priorizamos un dock con inventario y recientes locales, un panel de estado/privacidad con
recuperación y escenas WiZ con confirmación y deshacer. Son propuestas con requisitos y
criterios de aceptación, no funciones anunciadas como terminadas.
[Visión del producto](docs/product-vision.md) · [Roadmap](docs/roadmap.md).

Una web sola no hace SSH ni garantiza root para cualquier firmware. La propuesta es empezar
con un instalador local con plan, respaldo, aplicación y reversión; después, si aporta valor,
ponerle una interfaz en el browser. **Ese autoinstalador todavía no existe.**
[Comparación de opciones y fuentes primarias](docs/browser-installer.md).

## Documentación y procedencia

- [Tutorial de principio a fin](docs/tutorial.md).
- [Qué falló y cómo se resolvió](docs/what-we-tried.md).
- [Root y recuperación](docs/root-and-home.md).
- [Limpieza ejecutada](docs/cleaning.md) y [auditoría de privacidad](docs/privacy-cleanup.md).
- [Rendimiento](docs/performance.md), [Luces](docs/lights.md) y [captura](docs/screen-sync.md).
- [Fuentes](docs/sources.md) y [licencia](LICENSE).

El diseño original y el primer tutorial se trabajaron con Claude Opus 5.5 high. Las
integraciones y el rework 0.7.4 se terminaron con Codex; Opus no pudo iniciarse en esa sesión.
No hay afiliación con LG, WiZ ni las marcas de los accesos.
