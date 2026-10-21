# Fuentes

Todo lo que usamos para decidir cómo construir, instalar y limpiar. Cuando algo no tiene fuente
pública, es una prueba hecha en la TV y así se marca en las otras docs.

## LG webOS TV (oficial)

- Portal de desarrolladores: https://webostv.developer.lge.com/
- Developer Mode (activación, Key Server, vencimiento de sesión):
  https://webostv.developer.lge.com/develop/getting-started/developer-mode-app
- Application Manager (`launch`, `getAppLoadStatus`):
  https://webostv.developer.lge.com/develop/references/application-manager
- Motor web por versión de webOS (Chromium 68 en webOS 5):
  https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- ACG (no aplica a webOS TV 25 ni anteriores):
  https://webostv.developer.lge.com/develop/guides/acg-guide
- CLI `@webos-tools/cli` 3.2.6 (`ares-setup-device`, `ares-novacom`, `ares-device`,
  `ares-package`, `ares-install`, `ares-launch`), usado vía `npm exec`.
- SDK `webOSTV.js` 1.2.13 (Apache-2.0): procedencia y licencia en `vendor/SOURCE.md` y
  `vendor/LICENSE-2.0.txt`.

## LG soporte

- Borrar apps desde Home:
  https://www.lg.com/au/support/product-support/troubleshoot/help-library/cs-CT52001891-20154523932778/
- Home Settings / Home Promotion:
  https://www.lg.com/sg/support/product-support/troubleshoot/help-library/cs-CT52001362-20153529303128LST/
- Quick Access:
  https://www.lg.com/es/soporte/guias-y-soluciones/television/webos-3-5-funcion-quick-access/

## Connect SDK y SSAP (inventario y YouTube)

- Registro `hello` / `register` del cliente SSAP:
  - https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVServiceSocketClient.java#L222
  - https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVServiceSocketClient.java#L478
  - https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVServiceSocketClient.java#L629
- Permisos del manifiesto (`READ_INSTALLED_APPS`):
  https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVDeviceService.java#L87
- Lanzamiento de YouTube con `contentId` (el formato que **no** abrió el episodio por Luna):
  https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java#L537
- `lgtv2`, `contentTarget` con la URL del video (el formato que **sí** funcionó en la TV):
  - https://github.com/hobbyquaker/lgtv2/issues/41#issuecomment-5370241499
  - https://github.com/hobbyquaker/lgtv2#commands

## Clima

- Open-Meteo, API de pronóstico: https://open-meteo.com/en/docs

## Fotos

- Fondos locales: licencia Unsplash, https://unsplash.com/license . Autores y enlaces de cada
  foto en `assets/wallpapers/CREDITS.md`.
- Fotos diarias (0.4, implementado; prueba visual en TV pendiente):
  - Categoría: https://commons.wikimedia.org/wiki/Category:Featured_pictures_of_landscapes
  - https://www.mediawiki.org/wiki/API:Categorymembers
  - https://www.mediawiki.org/wiki/API:Imageinfo
  - https://www.mediawiki.org/wiki/API:Cross-site_requests#Unauthenticated_CORS_Requests

## Transitions

- Playlist oficial del canal de John Digweed (`UCXUO2biGVP7FKCqPEDwmt4w`):
  https://www.youtube.com/playlist?list=PLg-OduiozGBG0JCQlIMTv7Ipz2xZ74y0z

## Nuvio

- Release oficial 1.2.9 (IPK y SHA-256): https://github.com/NuvioMedia/NuvioTVSmart/releases/tag/1.2.9
- Manifiesto con el `appId`: https://github.com/NuvioMedia/NuvioTVSmart/blob/main/appinfo.json

## Root y reemplazo de Home (investigado, no ejecutado)

Fuentes fijadas, hallazgos y límites de la revisión: [root-and-home.md](root-and-home.md).

- Compatibilidad por modelo y firmware: https://cani.rootmy.tv/?q=49UN7310PSC+04.64.00
- SlopBro: https://github.com/throwaway96/slopbro
- Homebrew Channel (failsafe): https://github.com/webosbrew/webos-homebrew-channel
- webos-launch-home (requiere root):
  - https://github.com/gprot42/webos-launch-home#compatibility
  - https://github.com/gprot42/webos-launch-home/blob/main/src/js/luna.js

## Marcas

YouTube, Spotify, Netflix, Disney+, Nuvio, LG y webOS son marcas de sus dueños. Este proyecto no
está afiliado a ninguno de ellos.
