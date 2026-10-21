# Roadmap

Qué está hecho, qué está en curso y qué quedó como decisión pendiente. Las etiquetas de estado son
las del [tutorial](tutorial.md).

## Hecho

| Versión | Qué tiene | Estado |
| --- | --- | --- |
| 0.2 | Primer diseño Liquid Glass. | Aprobado por el dueño. |
| 0.3 | Solo íconos, 4 fotos locales rotando, clima de Open-Meteo, Personalizar. | **Verificado en la TV**: instalada y abierta por CLI; el dueño confirmó que le gustó. |
| 0.4.1 | Ícono de Bedrock Records para Transitions. | Verificado en Brave; 77 pruebas aprobadas, IPK verificado e instalación/apertura aceptadas por CLI. Confirmación visual en TV pendiente. |
| 0.5.0 | Panel Luces y servicio local WiZ. | El dueño confirmó lectura y brillo del 50 % en las seis lámparas del living desde la TV. |
| 0.5.1 | Acompañar el color del fondo de Mi pantalla. | 147 pruebas aprobadas, IPK verificado e instalado; el dueño confirmó que el modo funciona en la TV. |
| 0.6.0 | Revisar captura, transporte HyperHDR local, Pantalla completa y fase 1 de Home. | 234 pruebas aprobadas; IPK verificado de 56 archivos, 17 del servicio. Root, PicCap y HyperHDR reales; activación física de las seis lámparas y restauración al volver a Manual. El arranque en frío ejecutó el hook de Home y abrió Mi pantalla; el dueño confirmó después la tecla Home. Foco, repetición, standby, HDMI, contenido protegido y persistencia de Pantalla completa pendientes. |
| 0.7.0 | Halos de pantalla completa y foco optimizados solo para TV; correcciones del watcher. | 243 pruebas aprobadas; IPK de 56 archivos, 17 del servicio, instalado y abierto por `ares-launch`; watcher con `boot: accepted`. Navegación confirmada por el dueño. El encendido tras apagar 20 s con el control falló; 0.7.1 corrigió ese caso y el dueño lo confirmó después. |
| 0.7.1 | Monitor LS2 de potencia para Quick Start y diagnóstico de Home. | 254 pruebas aprobadas; IPK verificado de 57 archivos, 18 del servicio, instalado por CLI. Watcher PID 13691 con `boot: accepted` y monitor `luna-send` esperado. El dueño confirmó encendido tras apagar 20 s con el control y YouTube → Home → Mi pantalla tras esperar 2 s. |
| 0.7.2 | Home nativo y watcher sin polling de input. | Instalada; verificación original del IPK: 257 pruebas, 57 archivos, 18 del servicio y 1.690.292 bytes. Suite posterior: 269/269 con 12 tests de guardia externa al IPK. El usuario confirmó Home desde YouTube y encendido tras apagar 20 s directos a Mi pantalla, sin LG primero en esos casos. |
| — | Nuvio oficial 1.2.9 | Instalada, hash verificado, apertura aceptada. Sin probar login ni reproducción. |
| — | Inventario y limpieza acotada | Inventario previo de 124 apps, posterior de 121; tres apps LG ausentes. `homeAutoLaunch` se reaplicó `off` con lectura confirmada y después volvió a leerse `on`: estado final `on`, sin causa aislada. El default Home propio y los demás ajustes verificados siguen intactos. Diez candidatas de terceros conservadas. Ver [cleaning.md](cleaning.md). |

El uso, los modos y sus límites están en [Luces WiZ](lights.md). HDMI y contenido protegido siguen
pendientes. El dueño confirmó previamente que Home abre Mi pantalla; falta revalidar foco y uso
repetido en la versión actual. El arranque en frío anterior se verificó; el caso de 20 s con el
control falló en 0.7.0 y quedó confirmado físicamente en 0.7.1. En esta última el dueño también
confirmó que Home desde YouTube termina en Mi pantalla tras esperar 2 s.

## 0.7.2: Home nativo

En esta TV, `general.defaultApps.home` pasó de `com.webos.app.fullhome` a `com.frxn.mipantalla`, preservando los
demás defaults. La metadata permite ese valor (`valueCheck: false`); el compositor consulta la
preferencia para abrir Home. El marcador `/var/lib/mipantalla-maintenance/native-home/enabled`
activa `--native-home`: sin input ni polling/discovery, conservando boot y power/wake.
Se reaplicó `homeAutoLaunch: off` con lectura confirmada; después volvió a leerse `on`, estado
final sin causa aislada. El default Home propio sigue intacto y ambos casos físicos funcionaron así.
El usuario confirmó Home desde YouTube y encendido tras apagar 20 s directos a Mi pantalla,
sin LG primero en esos dos casos; no acredita cold boot nuevo, foco, repetición u otros ciclos.
La guardia externa está desplegada y su entrypoint manual confirmó app presente sin Luna;
el fallback en frío con la app ausente sigue sin prueba física. Antes de desinstalar hay que revertir solo el default Home y retirar el
marcador. [Mecanismo, límites y recuperación](home-takeover.md).
SHA-256 del IPK 0.7.2:
`61a3deb0458378b0885d65df6d64390e1f8f07b1264fe722aa21add2a22303b7`.

## 0.7.1: Quick Start con eventos de potencia

`home-power.js` (84 líneas) se suscribe a `tvpower/power/getPowerState` con `subscribe: true`:
el primer `Active` establece la base y una transición no activo → `Active` solicita wake una vez.
Reconecta tras fallo a los 5 s; mientras el monitor está listo, inhibe el fallback por gap del
heartbeat. El dueño confirmó físicamente en 0.7.1 que abre sola tras apagar 20 s con el control
y encender, y que YouTube → Home termina en Mi pantalla tras esperar 2 s. El hijo `luna-send`
es esperado, no otro watcher. Home registra aceptación o rechazo sin texto crudo. Estas pruebas
no acreditan otros ciclos de standby ni ausencia de una aparición inicial del Home de LG.
SHA-256 del IPK 0.7.1:
`1331e3b7f0684125708544489cab9c0171bf6030421c8250f2b6c5593289045b`.

## 0.7: navegación y watcher

Se optimizaron los halos de pantalla completa y las transiciones de foco, instantáneas solo en TV.
Se conservan el vidrio estático, las fotos, su fundido y el clima. La muestra CDP en la TV real
(Chromium 68, 1920×1080, flechas cada 120 ms durante 3,5 s) registró 209 intervalos: media
16,7457 ms, p95 16,666 ms, máximo 33,332 ms, uno mayor de 25 ms; p95 del handler 13,7 ms.
No equivale a una prueba con control físico ni a una garantía universal. El dueño confirmó que
la navegación responde bien; la reapertura tras apagar 20 s con el control falló.

El watcher actualiza la referencia de heartbeat en cada tick para evitar acumular falsos gaps;
boot, Home y wake comparten un lanzamiento en curso. Wake reintenta solo después de fallo,
hasta cuatro intentos, y cancela la campaña ante aceptación; polling por defecto de 100 ms.
La aceptación no acredita app visible ni standby. [Evidencia y pendientes](home-takeover.md).
SHA-256 del IPK 0.7.0:
`0e8f831ad05993c56aade1792e920677ced1e173273058c8bd32803feb9393f3`.

## 0.6: Pantalla completa y recuperación

El panel incorpora **Revisar captura**, una consulta que se ejecuta únicamente al pulsarla. El
adaptador autentica HyperHDR en `127.0.0.1:19444`, confirma la instancia cero y comprueba el
perfil, las lámparas, la atestación física y dos muestras frescas de PicCap. El ejemplo
`screen-config.example.json` viene deshabilitado; la configuración opcional privada
`services/com.frxn.mipantalla.lights/screen-config.json` queda fuera de Git.

`start` guarda el estado anterior, exige frames frescos y `hardwareVerified`, activa `LEDDEVICE`
y confirma el cambio. Manual apaga la salida y restaura cada lámpara; un fallo conserva la
recuperación pendiente y un segundo Manual reanuda lo que falta. El servicio necesita permiso de
rol para consultar `org.webosbrew.piccap.service`; sin él el probe falla cerrado.

Pasaron 234 pruebas y se verificó el IPK de 56 archivos, incluidos 17 del servicio. La activación
física encendió las seis lámparas con colores de pantalla y la restauración las apagó. La primera
parada devolvió `SCREEN_RESTORE_PENDING` y el segundo intento confirmó Manual. HDMI, contenido
protegido, persistencia de Pantalla completa tras reinicio y el mapeo exacto de cada lámpara
siguen pendientes.

La misma compilación incluye la fase 1 de Home. En un arranque en frío, HBC ejecutó el hook, abrió
Mi pantalla y dejó un solo watcher; con la app en primer plano se midieron 60,29 FPS. El dueño
confirmó previamente la tecla Home. Foco y repetición requieren revalidación; el retorno tras
20 s con el control falló en 0.7.0. [Detalles y límites](home-takeover.md).

El backend exige configuración, atestación física y frames frescos de PicCap antes de encender
`LEDDEVICE`. Root, captura y HyperHDR se ejecutaron en la TV; la activación y la restauración
físicas quedaron confirmadas. [Detalles y límites](screen-sync.md).

## 0.4: Fotos diarias + Transitions (implementado; validación visual en TV pendiente)

La implementación está lista y pasó **77 pruebas**, compilación y verificación del IPK. La TV
aceptó la instalación y la apertura de la 0.4.0; **falta comprobar visualmente las fotos diarias y
abrir Transitions desde el dock**. El formato de enlace de YouTube ya fue verificado por CLI.

### Fotos diarias desde Wikimedia Commons

La base son 4 fotos locales. La 0.4 suma una selección nueva de paisajes cada día, sin
backend propio y sin credenciales.

- **Fuente:** API pública de MediaWiki en Commons, categoría
  [Featured pictures of landscapes](https://commons.wikimedia.org/wiki/Category:Featured_pictures_of_landscapes).
- **Pedido** (está completo en `daily-photos-config.js`):
  `generator=categorymembers`, `gcmlimit=50`, `prop=imageinfo` con `url|size|mime|extmetadata`,
  `iiurlwidth=1920`, `formatversion=2` y **`origin=*`**, que habilita CORS sin autenticación.
- Las miniaturas vienen de `thumb.wikimedia.org` o `upload.wikimedia.org` a 1920 px, el tamaño que la
  TV maneja bien.
- **Hasta seis fotos por día.** Solo si el primer lote no deja ninguna foto utilizable, se pide
  otro con el token de continuación que devuelve la API, con un **máximo de 2 lotes**.
- Una muestra real de la respuesta trajo 45 archivos; 39 eran JPEG apaisados utilizables.

**Licencias.** Solo se aceptan CC0, dominio público, CC BY y CC BY-SA, y cada foto muestra autor,
enlace a la fuente y enlace a la licencia. Las que vienen con Free Art License (FAL) se descartan.

**Metadatos como texto.** Los campos de autor y descripción de Commons vienen con HTML. Se
convierten a texto plano y **nunca se insertan como HTML**.

**Qué se guarda.** En caché diaria van solo los metadatos (URL, autor, licencia), no las imágenes.

**Sin red:** se vuelve a las 4 fotos locales de Unsplash.

Aclaración honesta: no está garantizado que la categoría reciba fotos nuevas todos los días. Lo que
se renueva a diario es **la selección** de seis.

Al cambiar de galería, el controlador descarta los callbacks de la galería anterior
para que una carga vieja no pise a la nueva.

Fuentes:
[API:Categorymembers](https://www.mediawiki.org/wiki/API:Categorymembers) ·
[API:Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo) ·
[CORS sin autenticación](https://www.mediawiki.org/wiki/API:Cross-site_requests#Unauthenticated_CORS_Requests).

### Acceso "Transitions · John Digweed"

Un acceso en el launcher que abre **la app oficial de YouTube** directamente en un episodio de
*Transitions*, el programa de John Digweed.

- `transitions-config.js` tiene 12 episodios (1116 a 1127) verificados en la
  [playlist oficial](https://www.youtube.com/playlist?list=PLg-OduiozGBG0JCQlIMTv7Ipz2xZ74y0z)
  del canal `UCXUO2biGVP7FKCqPEDwmt4w`.
- Cada vez que apretás **OK** elige uno al azar, uniforme, sin repetir el último. El último se
  recuerda en `localStorage`; si no hay almacenamiento, funciona igual en memoria.
- Solo acepta IDs de video de 11 caracteres y URLs que coincidan con ese ID.
- **Se abre solo con OK**, nunca al enfocar. En la vista previa muestra un mensaje y no contacta
  la TV.
- No descarga videos, no hace scraping, no saltea login ni anuncios. YouTube puede mostrar primero
  el selector de perfiles según la sesión.

**Formato de lanzamiento verificado en la TV:** `params: { contentTarget: "https://www.youtube.com/watch?v=<id>" }`.
El formato `contentId` de Connect SDK abrió YouTube pero no el episodio. Detalle en
[what-we-tried.md](what-we-tried.md#youtube-abrir-un-video-puntual).

### Para dar por cerrada la 0.4

- [x] `bridge.js` lanza YouTube con `contentTarget`.
- [x] Pruebas nuevas en verde (fotos diarias y Transitions): 77 en total.
- [x] IPK verificado, instalación y orden de apertura aceptadas en la TV.
- [ ] Instalada en la TV; fotos diarias vistas en pantalla con sus créditos.
- [ ] Transitions abre un episodio desde el launcher, no solo desde `ares-launch`.
- [ ] Sin red, vuelve a las fotos locales.

## Home: fase 1 con root y alternativa sin root

La fase 1 está instalada: HBC ejecuta `home-autostart.sh` y el watcher detecta la tecla HOME por
`/dev/input`. El arranque en frío y la apertura de la app se verificaron, y el dueño confirmó
Home. Falta revalidar foco y repetición; el retorno tras apagar 20 s con el control falló en
0.7.0. En 0.7.1 quedaron confirmados físicamente ese encendido y Home desde YouTube, con destino
final Mi pantalla tras 2 s. [Detalles y reversión](home-takeover.md).

Sin root, lo más cercano sigue siendo **Quick Access** de LG: asignar una app a un número del
control.

- Abrí Mi pantalla, mantené apretado un número libre del **1 al 8** y confirmá.
- Mantener apretado el **0** abre el editor de Quick Access para ver o quitar asignaciones.

**Quick Access no se probó con una app de desarrollo en esta TV.** Es una alternativa sin root;
el arranque mediante el watcher propio sí está instalado. Guía de LG:
https://www.lg.com/es/soporte/guias-y-soluciones/television/webos-3-5-funcion-quick-access/ .

## Root (ejecutado y persistente)

Se obtuvo root, se instaló y elevó HBC 0.7.3 y se comprobó un arranque en frío con SSH root en 22,
sshd de Developer Mode en 9922, hook de Home y Mi pantalla abierta. PicCap y HyperHDR se probaron
en la TV. La integración de Home y su rollback están en [Home](home-takeover.md); las condiciones
y riesgos, en [Root y Home](root-and-home.md).

Lo que encontramos:

- El catálogo [Can I root my TV?](https://cani.rootmy.tv/?q=49UN7310PSC+04.64.00) muestra
  `UN7310PSC.AWZ` con OTA `K6LP` que coincide con esta TV.
- Declara compatible **SlopBro** hasta el firmware 04.64.00. El método anterior, RootMyTV (falla
  en el administrador de fallos, "DejaVuln"), ya está parcheado.
- [SlopBro](https://github.com/throwaway96/slopbro): según su autor es una prueba de concepto con
  pruebas limitadas. Instala Homebrew Channel y root persistente, sin depender de Developer Mode.
- El README de
  [webos-homebrew-channel](https://github.com/webosbrew/webos-homebrew-channel)
  aclara que su modo a prueba de fallos no garantiza una recuperación total.

**Reemplazar Home y arrancar al encender** necesita root:

- [webos-launch-home](https://github.com/gprot42/webos-launch-home#compatibility) vigila el Home y
  agrega hooks de arranque. Para webOS 5 dice "Expected working", que no es una prueba en este
  hardware.
- Su código apunta a `org.webosbrew.lounge.launcher`, no a nuestra app;
  habría que adaptarlo.
- Su [`luna.js`](https://github.com/gprot42/webos-launch-home/blob/main/src/js/luna.js) activa y
  desactiva el watcher y el arranque. Quitar solo el IPK no elimina toda la persistencia.

La revisión encontró defaults de Telnet y SSH que necesitaban cambios. En esta instalación se
mantuvo SSH con clave, se cerró Telnet (`webosbrew_telnet_disabled`) y se verificó el puerto 23
cerrado tras el arranque. El failsafe de HBC no garantiza una recuperación total; conservar el
acceso SSH y el rollback del hook.

## Fuera de alcance

- Reemplazar el sistema operativo o el firmware.
- Borrar componentes del sistema sin identificar dependencias y comprobar recuperación.
- Redistribuir IPK de terceros.
