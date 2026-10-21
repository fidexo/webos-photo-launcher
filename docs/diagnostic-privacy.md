# Reportes de diagnóstico de LG

El 21 de octubre de 2026 se desactivaron dos permisos de `rdxd` en la TV de referencia:
**49UN7310PSC, webOS 5.6.2-21, firmware 04.64.00**. Mi pantalla sigue en **0.7.5**;
esto es mantenimiento separado del IPK, con root ya disponible.

| Ajuste | Lectura anterior | Lectura posterior |
| --- | --- | --- |
| `analyticsLog` | `true` | `false` |
| `crashLog` | `true` | `false` |

Se usaron `com.webos.rdxd/getLogSettings` y `setLogSettings`. Hubo confirmación de la
escritura y una lectura posterior coincidente. `rdxd.service` siguió activo con el mismo
PID: no se reinició ni se deshabilitó el servicio.

## Alcance real

En el [código de LG/webOS OSE revisado](https://github.com/webosose/rdxd/blob/4abd4093adcc0853ccd3de3882e4b98a9ee15c01/src/rdxd/main.cpp),
estos booleanos controlan el procesamiento de reportes analíticos y de fallos. Es una
referencia de implementación, **no el código completo del firmware cerrado de esta TV**.
La existencia de ambos métodos y la lectura de los dos ajustes sí se comprobaron en la TV.

Hay límites concretos:

- El código OSE llama a `upload_overview()` al arrancar sin consultar estos dos permisos.
  Este cambio no acredita bloquear ese envío ni toda la telemetría de LG.
- En esa implementación los permisos empiezan habilitados al iniciar el proceso. No se
  provocó un reinicio de `rdxd` ni un fallo para probar subidas o restablecimientos.
- El hook de Homebrew vuelve a aplicar los valores una vez por arranque. Puede ejecutarse
  después de un envío inicial; no vigila reinicios posteriores del proceso.
- Si Luna o `rdxd` todavía no responden, el hook informa un error y termina. No tiene un
  bucle de reintentos ni certifica persistencia hasta comprobar la lectura en ese arranque.
- No cambia las comunicaciones de YouTube, Netflix u otras apps, los acuerdos de LG,
  DNS, montajes, ejecutables, voz ni ThinQ. Tampoco borra logs o reportes existentes.

## Helper público

El script [privacy-log-settings.js](../scripts/tv/privacy-log-settings.js) usa ES5 y se
comprobó con el Node 8 de esta TV. No requiere dependencias. Sólo permite tres modos:

| Modo | Comportamiento |
| --- | --- |
| `--status` | Consulta los dos booleanos; no crea respaldo ni cambia ajustes |
| `--apply` | Exige root, guarda el estado previo y pide ambos valores en `false` |
| `--restore` | Exige root y un respaldo válido; restaura sus dos valores exactos |

Cada llamada Luna tiene un límite de 2,5 segundos. Una respuesta inválida, un respaldo
inseguro o una lectura posterior distinta produce salida no exitosa. No se interpreta un
valor ausente como `false`. Aplicarlo otra vez conserva el respaldo original.

El directorio es `/var/lib/mipantalla-maintenance/privacy-rdxd`, propiedad de root y modo
`0700`. El respaldo `settings-before.json` es un archivo regular de root, modo `0600`, sin
symlinks ni enlaces adicionales. Se escribe de forma exclusiva y se sincroniza antes del
cambio. El helper rechaza un respaldo existente inválido; no lo reemplaza para continuar.
En esta unidad guardó ambos valores en `true`. Ese archivo es privado y no va a GitHub.

## Reproducir con root ya configurado

Esto no obtiene root ni usa Developer Mode para elevar permisos. Primero completar y
comprobar el [acceso y la recuperación](root-and-home.md), incluida la huella SSH del host.
Usar una clave autorizada; no habilitar acceso sin credenciales ni saltarse esa comprobación.

1. Revisar el script y ejecutar localmente `node --test tests/privacy-log-settings.test.cjs`.
2. En la TV, preparar los dos directorios anteriores: padre de root sin escritura de grupo
   u otros, subdirectorio de root `0700`, ambos directorios reales y sin symlinks.
   Si existen, comprobarlos; no cambiar a ciegas permisos de rutas desconocidas.
3. Copiar por SSH el archivo del repo al subdirectorio con nombre
   `privacy-log-settings.js`, propietario root y modo `0600`. Conservar LF. Comparar su
   SHA-256 local y remoto; no continuar con diferencias ni sobrescribir otro archivo.
4. Desde la sesión SSH root, verificar sintaxis y disponibilidad:

```sh
/usr/bin/node --check /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --status
```

La salida debe incluir `status: "status"` y ambos valores booleanos. Si devuelve
`read-failed`, el método no está confirmado en ese firmware: no continuar con la aplicación.

5. Aplicar y volver a consultar:

```sh
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --apply
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --status
```

Exigir salida exitosa y ambos valores `false`. La primera aplicación informa `applied`
cuando hubo cambio; una ejecución posterior informa `already-applied`. No reiniciar
`rdxd`, cambiar su configuración ni borrar el respaldo para forzar un resultado.

## Reaplicar al arrancar

En esta unidad se creó el archivo de root, modo `0700`:
`/var/lib/webosbrew/init.d/61-mipantalla-privacy-rdxd`.
Su contenido exacto es:

```sh
#!/bin/sh
umask 077
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --apply > /var/lib/mipantalla-maintenance/privacy-rdxd/last-apply.log 2>&1
```

Antes de crearlo, comprobar el directorio de hooks de Homebrew y que ese nombre no exista
como archivo o symlink. No sobrescribir otro hook. Verificarlo con `sh -n` antes de
ejecutarlo. El script de privacidad tiene que seguir presente en su ruta fija.

Se comprobó la sintaxis y se ejecutó el hook manualmente: informó `already-applied` y
`--status` confirmó ambos permisos en `false`. **No se probó un encendido físico posterior
a este cambio.** `last-apply.log` es diagnóstico privado dentro del directorio de root,
no el respaldo `settings-before.json`; se reemplaza en cada ejecución del hook.
Este helper y su hook no se retiran automáticamente al desinstalar Mi pantalla.

## Revertir

1. Comprobar que el hook anterior sea nuestro archivo regular, con el contenido indicado.
   Retirar únicamente ese archivo del directorio `init.d` para evitar otra aplicación al arrancar.
2. Conservar el helper y su respaldo, y ejecutar desde SSH root:

```sh
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --restore
/usr/bin/node /var/lib/mipantalla-maintenance/privacy-rdxd/privacy-log-settings.js --status
```

3. Exigir `restored` o `already-restored` y una lectura coincidente con el respaldo. No
   asumir que los valores originales de otra TV eran `true`.
4. Conservar la copia privada del respaldo hasta cerrar la verificación. El helper no
   elimina archivos ni se autorretira; no borrar directorios completos de mantenimiento.

La restauración está cubierta por pruebas locales, pero **no se ejecutó en la TV** para
no reactivar reportes durante la comprobación. No se midió tráfico para acreditar que
estos dos permisos impidan envíos concretos. La limpieza de apps y los ajustes de anuncios
tienen otros respaldos y su propia [reversión](cleaning.md#cómo-revertir).
