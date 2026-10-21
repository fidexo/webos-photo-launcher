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

## Preferencias aplicadas

Antes de cambiar ajustes se leyeron y guardaron sus valores en
`artifacts/lg-cleaning-backup.private.json`, junto con los IDs, nombres y versiones de las
tres apps retiradas. Ese respaldo es privado y no debe publicarse.

Los cambios se aplicaron con `setSystemSettings`; una lectura posterior confirmó estos valores:

| Categoría | Clave | Valor previo guardado | Valor confirmado |
| --- | --- | --- | --- |
| `general` | `homeAutoLaunch` | `on` | `off` |
| `general` | `homePromotion` | `on` | `off` |
| `option` | `livePlus` | `on` | `off` |
| `option` | `livePromotion` | `on` | `off` |
| `option` | `webOSPromotionVideo` | `on` | `off` |

Se conservaron `option.quickStartMode: on` y `general.personalRecommend.value: off`, que ya estaban configurados así.
Desactivar `homeAutoLaunch` afecta al Home de LG; el arranque y la reapertura de Mi pantalla
dependen de la configuración descrita en [Root y Home](root-and-home.md).

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

Las apps retiradas se reinstalan desde la tienda de LG si siguen disponibles para este modelo y
región. El respaldo registra cuáles eran; no contiene paquetes ni garantiza recuperar sesiones
o preferencias de las apps. Puede ser necesario volver a iniciar sesión.

## Alcance del resultado

La retirada de apps puede liberar almacenamiento. No se midió ni se promete una mejora de RAM,
FPS o velocidad por esta limpieza. Tampoco se realizó un borrado general de caché o datos.

El documento no incluye IP, MAC, tokens ni credenciales. Conservar los respaldos privados fuera
de publicaciones y adjuntos públicos.
