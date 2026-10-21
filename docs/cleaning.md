# Limpieza de la TV

El 21 de octubre de 2026 se retiraron tres apps removibles de LG y se desactivaron cinco
preferencias de promociones y apertura del Home de LG. Los resultados se comprobaron con
lecturas posteriores. No se tocaron otras apps ni servicios del sistema.

El acceso y el comportamiento de Mi pantalla con Root/Home se documentan por separado en
[Root y Home](root-and-home.md) y [reemplazo del Home](home-takeover.md).

## Inventario previo

La consulta completa por SSH con root mediante `listApps` devolvió este inventario antes de
la limpieza:

| Marca informada por la TV | Cantidad previa |
| --- | --- |
| Apps totales | 124 |
| `systemApp: true` | 104 |
| `removable: true` | 20 |

La marca `removable` y la selección explícita delimitaron las apps retiradas. El nombre de un
componente no basta para decidir que se puede borrar.

## Apps retiradas y verificadas

| App | ID |
| --- | --- |
| LG Streaming Week | `webos.day` |
| LG Sports Playbook | `epoxyaisports` |
| LG Channels | `lgchannels.home` |

Se usó `com.webos.appInstallService/remove`, con el ID de cada app y `subscribe: true`.
Una consulta posterior a `listApps` confirmó que los tres IDs ya no estaban instalados.
La aceptación inicial de la solicitud no fue la única comprobación.
El inventario posterior contiene 121 apps: 104 de sistema y 17 removibles.

## Preferencias iniciales: historial 0.7.1

Antes de cambiar ajustes se leyeron y guardaron sus valores en
`artifacts/lg-cleaning-backup.private.json`, junto con los IDs, nombres y versiones de las
tres apps retiradas. Ese respaldo es privado y no debe publicarse.

Los cambios iniciales se aplicaron con `setSystemSettings`; una lectura posterior confirmó estos
valores. Se conserva esa evidencia histórica; no representa todas las lecturas actuales:

| Categoría | Clave | Valor previo guardado | Valor confirmado |
| --- | --- | --- | --- |
| `general` | `homeAutoLaunch` | `on` | `off` |
| `general` | `homePromotion` | `on` | `off` |
| `option` | `livePlus` | `on` | `off` |
| `option` | `livePromotion` | `on` | `off` |
| `option` | `webOSPromotionVideo` | `on` | `off` |

Se conservaron `option.quickStartMode: on` y `general.personalRecommend.value: off`, que ya estaban configurados así.

## Lectura y cambios actuales con 0.7.2

`homeAutoLaunch` se leyó intermedio en `on`, se reaplicó `off` con lectura confirmada y después
volvió a leerse `on`: **estado final `on`, sin causa aislada**. No se volvió a cambiar. El default
Home propio sigue intacto y ambos casos físicos funcionaron con esa lectura. `homePromotion`
sigue en `off`; `customizedAd` también se había leído en `off`. `livePlus`, `livePromotion` y
`webOSPromotionVideo` siguen en `off`.
`screenSaverAd` y `adCookie` pasaron de `on` a `off`, con respaldo anterior `settings-before.json`
guardado en el host y en la TV. Los respaldos son privados y no se publican.

El Home nativo ahora usa `general.defaultApps.home: com.frxn.mipantalla`, antes `com.webos.app.fullhome`;
se conservaron los demás defaults. Esto es selección de destino, no desinstalación de Home LG.
La 0.7.2 está instalada: verificación original del IPK con 257 pruebas, 57 archivos, 18 del servicio y 1.690.292 bytes;
SHA-256 `61a3deb0458378b0885d65df6d64390e1f8f07b1264fe722aa21add2a22303b7`.
El dueño confirmó en 0.7.2 Home desde YouTube y encendido tras apagar 20 s directamente en Mi
pantalla, sin LG primero en esos dos casos. La suite posterior del repositorio pasó 269/269,
incluidos 12 tests de una guardia externa al IPK. Esa guardia está desplegada y se comprobó a mano
con app presente, sin Luna; su fallback en frío con app ausente no se probó físicamente.
[Estado y reversión de Home](home-takeover.md).

## Apps conservadas

El criterio de conservación incluye Developer Mode, Homebrew Channel, PicCap y HyperHDR, además de las apps del usuario:
YouTube, Spotify, Nuvio, Netflix, Disney+ y Mi pantalla.

Esta limpieza no solicitó bajas de esos paquetes. El inventario actual no muestra Nuvio ni las
apps de PicCap/HyperHDR: tampoco aparecían en la lectura previa a retirar las tres apps LG.
Antes de retomar captura o Nuvio hay que comprobar su instalación y servicios; las pruebas de
esas funciones documentadas en otras páginas son anteriores a esta limpieza.

Estas diez candidatas de terceros siguen instaladas; no se borraron:

- Prime Video
- Apple Music
- Apple TV
- DGO
- Star+
- Paramount+
- HBO Max
- Stremio
- Movistar TV
- Twitch

No se eliminaron otras apps ni se borraron o deshabilitaron servicios del sistema. Los ajustes de
promociones anteriores son preferencias; no equivalen a retirar sus componentes del sistema.

## Cómo revertir

Para restaurar preferencias, usar los valores anteriores de
`artifacts/lg-cleaning-backup.private.json`: aplicar con `setSystemSettings` únicamente las claves
guardadas dentro de sus categorías `general` y `option`, y comprobar después su lectura.
En este respaldo las cinco claves tenían valor `on`. No hace falta cambiar `quickStartMode` ni
`personalRecommend`, porque se conservaron.

Los cambios de publicidad 0.7.2 se revierten usando sus valores previos en `settings-before.json`.
El respaldo privado `native-home/settings-before.json` guardó `homeAutoLaunch: on`; si se desea
revertir también esa preferencia, restaurar solo esa clave y comprobar su lectura.
Para Home nativo, restaurar solo `home` dentro del `defaultApps` actual, preservando los demás
defaults; retirar el marcador `native-home/enabled` y reiniciar solo el watcher con PID validado.
**Revertir el default Home antes de desinstalar Mi pantalla**: si apunta a una app ausente, falla
su apertura. El procedimiento está en [Home](home-takeover.md#desactivar-y-revertir).

Las apps retiradas se reinstalan desde la tienda de LG si siguen disponibles para este modelo y
región. El respaldo registra cuáles eran; no contiene paquetes ni garantiza recuperar sesiones
o preferencias de las apps. Puede ser necesario volver a iniciar sesión.

## Alcance del resultado

La retirada de apps puede liberar almacenamiento. No se midió ni se promete una mejora de RAM,
FPS o velocidad por esta limpieza. Tampoco se realizó un borrado general de caché o datos.

El documento no incluye IP, MAC, tokens ni credenciales. Conservar los respaldos privados fuera
de publicaciones y adjuntos públicos.
