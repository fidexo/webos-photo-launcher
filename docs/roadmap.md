# Roadmap

Qué está hecho, qué está en curso y qué quedó como decisión pendiente. Las etiquetas de estado son
las del [tutorial](tutorial.md).

## Hecho

| Versión | Qué tiene | Estado |
| --- | --- | --- |
| 0.2 | Primer diseño Liquid Glass. | Aprobado por el dueño. |
| 0.3 | Solo íconos, 4 fotos locales rotando, clima de Open-Meteo, Personalizar. | **Verificado en la TV**: instalada y abierta por CLI; el dueño confirmó que le gustó. |
| — | Nuvio oficial 1.2.9 | Instalada, hash verificado, apertura aceptada. Sin probar login ni reproducción. |
| — | Inventario de apps por SSAP | 124 apps leídas. Ver [cleaning.md](cleaning.md). |

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

## Integración con Home sin root (sin probar)

El botón Home sigue abriendo el Home de LG. Lo más cercano sin root es **Quick Access** de LG:
asignar una app a un número del control.

- Abrí Mi pantalla, mantené apretado un número libre del **1 al 8** y confirmá.
- Mantener apretado el **0** abre el editor de Quick Access para ver o quitar asignaciones.

**No probado con una app de desarrollo en esta TV.** Tampoco configuramos ningún arranque
automático por lógica propia. Guía de LG:
https://www.lg.com/es/soporte/guias-y-soluciones/television/webos-3-5-funcion-quick-access/ .

## Root (no ejecutado)

Esto queda documentado como investigación, **no como instrucciones**. El dueño autorizó root si
fuera necesario. No se ejecutó: las funciones actuales no lo requieren. La integración con Home y
arranque exige trabajo adicional, explicado en [Root y Home](root-and-home.md).

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

Antes de ejecutarlo faltan adaptar y verificar la recuperación y el acceso administrativo. La
revisión encontró defaults de Telnet y SSH que necesitan cambios; no se ejecutan desde este repo.

## Fuera de alcance

- Reemplazar el sistema operativo o el firmware.
- Modificar o borrar apps o servicios del sistema por SSH.
- Redistribuir IPK de terceros.
