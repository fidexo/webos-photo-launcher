# Limpieza de la TV

El 21 de octubre de 2026 se retiraron tres apps removibles de LG y, en otra ronda con selección
explícita del dueño, cuatro apps de terceros que no usa. El inventario pasó de **124 a 117 apps**;
se conservaron las 104 de sistema. Las bajas y la presencia de los paquetes protegidos se
comprobaron con lecturas posteriores. Los ajustes publicitarios tienen su historial separado
abajo. No se borraron ni deshabilitaron servicios del sistema ni se modificó el firmware.

El acceso y el comportamiento de Mi pantalla con Root/Home se documentan por separado en
[Root y Home](root-and-home.md) y [reemplazo del Home](home-takeover.md).

## Inventario previo

La consulta completa por SSH con root mediante `listApps` devolvió este inventario antes de
la limpieza:

| Marca informada por la TV | Inicial | Tras retirar tres LG | Actual |
| --- | ---: | ---: | ---: |
| Apps totales | 124 | 121 | 117 |
| `systemApp: true` | 104 | 104 | 104 |
| `removable: true` | 20 | 17 | 13 |

La marca `removable` y la selección explícita delimitaron las apps retiradas. El nombre de un
componente no basta para decidir que se puede borrar.

## Apps LG retiradas y verificadas

| App | ID |
| --- | --- |
| LG Streaming Week | `webos.day` |
| LG Sports Playbook | `epoxyaisports` |
| LG Channels | `lgchannels.home` |

Se usó `com.webos.appInstallService/remove`, con el ID de cada app y `subscribe: true`.
Una consulta posterior a `listApps` confirmó que los tres IDs ya no estaban instalados.
La aceptación inicial de la solicitud no fue la única comprobación.
Ese inventario intermedio contenía 121 apps: 104 de sistema y 17 removibles. Los tres IDs
siguen ausentes en la lectura actual.

## Apps de terceros retiradas por selección del dueño

El dueño pidió conservar Prime Video, Paramount+, HBO Max, Movistar TV, Stremio y Twitch.
De las diez candidatas de terceros, se retiraron únicamente las otras cuatro:

| App | ID | Versión previa |
| --- | --- | --- |
| Apple Music | `com.apple.applemusic` | `0.0.12` |
| Apple TV | `com.apple.appletv` | `15.1.0` |
| DGO | `com.directvgo.webostv-rt` | `2.24.1` |
| Star+ | `com.disney.alch.prod.lrd.app` | `23.12.0` |

Son apps de terceros que podían estar instaladas o venir ofrecidas con la TV; no son servicios
internos de LG. Que no las use este dueño no las convierte en componentes espía.

La ronda se hizo con Mi pantalla **0.7.5** ya instalada, sin cambiar su versión ni generar otro
IPK. Este fue el procedimiento:

1. Leer nuevamente `listApps` y resolver los IDs reales de la selección.
2. Exigir para cada baja `systemApp: false` y `removable: true`; rechazar cualquier coincidencia
   con los 13 paquetes protegidos.
3. Guardar inventario y selección previa, con ID, título y versión, en
   `artifacts/removal-selected-<UTC14>.private.json`, fuera del repositorio público.
4. Retirar cada ID con `com.webos.appInstallService/remove` y `subscribe: true`.
5. Volver a leer el inventario y comprobar ausencia de las cuatro, presencia de los 13 protegidos
   y permanencia de las 104 apps de sistema. Resultado: **117 apps, 13 removibles**.

El respaldo guarda metadata e inventario, no los paquetes IPK ni sesiones recuperables.

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

## Historial de ajustes y Home desde 0.7.2

`homeAutoLaunch` se leyó intermedio en `on`, se reaplicó `off` con lectura confirmada y después
volvió a leerse `on`: **estado final `on`, sin causa aislada**. No se volvió a cambiar. El default
Home propio sigue intacto y ambos casos físicos funcionaron con esa lectura. `homePromotion`
sigue en `off`; `customizedAd` también se había leído en `off`. `livePlus`, `livePromotion` y
`webOSPromotionVideo` siguen en `off`.
`screenSaverAd` y `adCookie` pasaron de `on` a `off`, con respaldo anterior `settings-before.json`
guardado en el host y en la TV. Los respaldos son privados y no se publican.

El Home nativo ahora usa `general.defaultApps.home: com.frxn.mipantalla`, antes `com.webos.app.fullhome`;
se conservaron los demás defaults. Esto es selección de destino, no desinstalación de Home LG.
La verificación original del IPK 0.7.2 pasó 257 pruebas, con 57 archivos, 18 del servicio y 1.690.292 bytes;
SHA-256 `61a3deb0458378b0885d65df6d64390e1f8f07b1264fe722aa21add2a22303b7`.
El dueño confirmó en 0.7.2 Home desde YouTube y encendido tras apagar 20 s directamente en Mi
pantalla, sin LG primero en esos dos casos. La suite posterior del repositorio pasó 269/269,
incluidos 12 tests de una guardia externa al IPK. Esa guardia está desplegada y se comprobó a mano
con app presente, sin Luna; su fallback en frío con app ausente no se probó físicamente.
[Estado y reversión de Home](home-takeover.md).

## Apps conservadas y verificadas

La comprobación posterior confirmó presentes los 13 paquetes protegidos:

| Grupo | Apps conservadas |
| --- | --- |
| Seis elegidas expresamente en esta ronda | Prime Video, Paramount+, HBO Max, Movistar TV, Stremio y Twitch |
| Siete principales y herramientas | YouTube, Spotify, Netflix, Disney+, Homebrew Channel, Developer Mode y Mi pantalla |

Nuvio y las apps de PicCap/HyperHDR no aparecían en el inventario previo ni en la auditoría
documentada anterior a esta ronda; esta limpieza no solicitó desinstalarlas. Antes de retomar
esas funciones hay que comprobar su instalación y servicios. Un acceso del dock o una prueba
histórica de captura no acredita que hoy esté instalado el paquete.

No se eliminaron otras apps ni se borraron o deshabilitaron servicios del sistema. Los ajustes
de promociones son preferencias; no equivalen a retirar sus componentes del sistema.

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

Las siete apps retiradas se reinstalan desde la tienda de LG si siguen disponibles para este
modelo y región. Usar el respaldo de la ronda correspondiente para identificar el paquete y la
versión anterior; no garantiza que esa versión siga ofrecida ni recuperar sesiones o preferencias.
Puede ser necesario volver a iniciar sesión. No se redistribuyen paquetes de terceros.

## Alcance del resultado

La retirada de apps puede liberar almacenamiento. No se midió ni se promete una mejora de RAM,
FPS o velocidad por esta limpieza. Tampoco se realizó un borrado general de caché o datos.

El documento no incluye IP, MAC, tokens ni credenciales. Conservar los respaldos privados fuera
de publicaciones y adjuntos públicos.

## Auditoría posterior con 0.7.5

La lectura inicial de esta auditoría confirmó 121 apps (104 de sistema, 17 removibles), Homebrew Channel 0.7.3
y Home nativo propio. Las preferencias de promociones, Live Plus, cookies publicitarias,
anuncios personalizados y salvapantallas siguen en `off`; `personalRecommend.value` está en
`off`. `homeAutoLaunch` se conserva en `on`, sin volver a cambiarlo.

Se revisó **Life's Good Without Spying** del catálogo Homebrew. No se habilitó: la versión
revisada aplica el conjunto al cambiar un toggle y sus defaults incluyen voz y purga de
archivos. El análisis de código, las limitaciones de reversión y el perfil conservador
propuesto están en [privacidad](privacy-cleanup.md). No se aplicaron bloqueos DNS ni se
detuvieron servicios en esta ronda.

El auditor público `scripts/privacy-audit.cjs` se probó por SSH en esta TV. Es de sólo lectura
y muestra ajustes, inventario resumido y recursos; no constituye un instalador ni certifica
ausencia de comunicaciones. [Uso](privacy-cleanup.md#auditor-reutilizable-desde-la-computadora).
Después el dueño eligió conservar seis de las diez candidatas y se retiraron las otras cuatro,
como se detalla arriba. La lectura final confirmó **117 apps, 104 de sistema y 13 removibles**,
con los 13 paquetes protegidos presentes. La app siguió en 0.7.5; esta limpieza fue mantenimiento
de la TV, separado del IPK del launcher.

También se desactivaron los ajustes RDX `analyticsLog` y `crashLog`, con lectura posterior de
ambos en `false` y respaldo previo de ambos `true` en
`/var/lib/mipantalla-maintenance/privacy-rdxd/settings-before.json` (root, modo `600`). `rdxd`
siguió activo, sin reiniciarlo. El hook `61-mipantalla-privacy-rdxd` se ejecutó manualmente y
confirmó `already-applied`; su ejecución durante un arranque físico sigue pendiente. Esto no
demuestra cero telemetría. [Alcance, script y reversión](diagnostic-privacy.md).
