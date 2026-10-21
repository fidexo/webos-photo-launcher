# Asistente local de instalación: piloto

Estado al **2026-10-21**. El programa ya está implementado en `installer/` y se inicia con
`npm run setup`. Sirve una interfaz local para Brave; no instala un agente de instalación
permanente en la TV. Mi pantalla sigue en **0.7.5**: este trabajo no es un rediseño nuevo del Home.

**Requiere root SSH ya configurado. No obtiene root desde cero.** Las operaciones del motor
tienen validación parcial en la TV; ver el alcance exacto y los pendientes abajo.

## Requisitos exactos

- Único perfil admitido: **LG 49UN7310PSC**, firmware **04.64.00**, webOS **5.6.2-21**,
  build `jhericurl-jimna`, board **K6LP_ATSC_BR**. Otra combinación queda bloqueada.
- Computadora con **Node 18+**, npm, OpenSSH y Brave. Sin nuevas dependencias npm.
- TV encendida en la misma red, root por SSH en puerto 22 y una identidad local ya preparada.
  La huella de esa TV debe estar verificada en `known_hosts`: no se acepta automáticamente.
- Si todavía no hay root, seguir el [registro específico de root y recuperación](root-and-home.md).
  El asistente no ejecuta exploits, no degrada firmware y no reinicia la TV.

## Abrirlo

Desde un checkout del repositorio:

```sh
npm run setup
```

En PowerShell usar `npm.cmd run setup` si la política bloquea `npm.ps1`. Abrir en Brave la URL
que muestra la terminal. Escucha sólo `127.0.0.1`, con puerto dinámico; no hay un puerto fijo que
abrir en el router. Mantener la terminal abierta y cerrar el servidor con Ctrl+C al terminar.

1. Ingresar la IPv4 privada de la TV y la **ruta absoluta** al archivo de identidad SSH de la PC.
   No pegar el contenido de la clave. El programa entrega esa ruta a OpenSSH; no lee la clave.
2. Pulsar **Comprobar conexión** y revisar modelo, firmware y acceso root confirmados.
3. Elegir únicamente las acciones deseadas. Todavía no hay cambios en la TV.
4. Pulsar **Preparar plan**. El plan vence a los cinco minutos; cambiar destino u opciones
   exige otro plan. Antes de escribir, el motor vuelve a leer el estado y detecta cambios.
5. Revisar los pasos y pulsar **Aplicar plan revisado**. Un resultado parcial conserva pendientes;
   no significa que todo haya quedado aplicado ni probado físicamente.

`status`, `plan`, `apply` y `restore` son acciones internas de la API local. No existen comandos
CLI públicos `setup --plan`, `--apply` o `--restore`.

## Qué implementa este piloto

| Acción elegida | Alcance y límite |
| --- | --- |
| Instalar Mi pantalla | Si la app está ausente, descarga el IPK público fijo y comprueba SHA-256 antes de instalar. Con 0.7.5 ya instalada omite ese paso. Otra versión queda bloqueada hasta implementar preservación de actualizaciones. |
| Usar Mi pantalla como inicio | Cambia sólo `home` dentro del mapa actual de defaults; prepara Home nativo, arranque y guardia mediante hooks propios 59/60 de HBC. Conserva baselines históricos. |
| Reducir publicidad de LG | Siete preferencias conocidas y los dos permisos RDX `analyticsLog`/`crashLog`; respaldo, lectura posterior y hook propio 61. No apaga todo el tráfico de la TV. |
| Apps LG opcionales | Sólo LG Streaming Week (`webos.day`), LG Sports Playbook (`epoxyaisports`) y LG Channels (`lgchannels.home`), marcadas individualmente. Exige no sistema y removible; no permite IDs arbitrarios. |

No instala Nuvio, PicCap o HyperHDR ni configura captura o lámparas. Captura y Luces permanecen
«Sin verificar» en este asistente: instalar el paquete no acredita su funcionamiento.

## Paquete público fijado

[Release v0.7.5](https://github.com/frxnnk/webos-liquid-glass-launcher/releases/tag/v0.7.5):
`com.frxn.mipantalla_0.7.5_all.ipk`, **56 archivos, 1.693.134 bytes**.

```text
SHA-256: 35aae8525d754a979ade384ab2c7116641a57ef52cef90a49e41214483be6cdb
```

No contiene `weather-config.js`, `lights-config.js` ni `screen-config.json`. Es distinto del IPK
privado instalado durante la sesión anterior: no sobrescribir una instalación 0.7.5 existente
con este paquete para «igualar hashes». El piloto la omite; la actualización con preservación
de configuración privada sigue pendiente. El hash se verifica también antes de la instalación
remota; una descarga fallida o distinta no se instala.

## Respaldos, timeout y restauración

El journal y los snapshots locales quedan en `~/.mi-pantalla-installer/`; los respaldos de la TV,
en `/var/lib/mipantalla-maintenance/setup/ID_DEL_RESPALDO/`. Contienen datos del destino: son
privados, no subirlos a GitHub. En Windows proteger también la carpeta con sus ACL.

El journal usa escritura anticipada (WAL), archivo temporal, `fsync` del archivo y rename.
No hace `fsync` del directorio: no se acredita recuperación ante pérdida total de alimentación.
Usar **una sola instancia del programa por TV**; no hay exclusión global entre procesos.

Los campos de conexión no se persisten en el navegador ni se envían a un servidor público.
La API exige el origen de loopback y una sesión local; no expone una shell arbitraria.

Si aparece timeout o respuesta incierta, **no repetir Aplicar**. Volver al mismo destino y usar
**Revisar estado**: el motor recupera el journal asociado a esa TV y muestra la operación pendiente.
Cambiar de destino no habilita restaurar el respaldo anterior sobre otra TV. La consulta de
recuperación no vuelve a ejecutar la operación que pudo haber terminado.

**Restaurar** usa el respaldo devuelto por la operación. Restaura preferencias y retira los hooks
propios creados por ese plan, conservando archivos y baselines previos. No borra el Home de LG.
Hay dos límites explícitos: las apps retiradas deben reinstalarse manualmente desde su tienda,
si siguen disponibles, y una app instalada por el plan se desinstala manualmente **después de
restaurar y comprobar Home**. No se recuperan sesiones ni datos borrados de otras apps.

## Qué está probado y qué falta

La suite pasó **401/401 pruebas** y la revisión final no encontró hallazgos P1/P2. En Brave,
contra la TV exacta, se comprobaron `status` y `plan`, y se aplicó **sólo privacidad de forma
idempotente**: las siete preferencias ya estaban apagadas y ambos permisos RDX ya en `false`.
Se crearon respaldos reales en PC/TV y el snapshot posterior coincidió con el previo al plan.
Esto no prueba cambiar esos ajustes desde sus valores originales.

Tras recargar Brave y volver a ingresar el destino, `status` recuperó el respaldo real y habilitó
**Restaurar**. El restore terminó completado; una lectura SSH separada confirmó journal en
`restored` y snapshot completo idéntico al previo: mapa de defaults, siete preferencias, RDX,
tres IDs LG, app, release y modelo. No se aplicaron Home, instalación ni bajas de apps con este
piloto. No se probó instalar el IPK público en la TV, partir de una TV original ni un arranque
físico o hook nuevo al encender. Cortes de red también requieren pruebas propias.
[Home y recuperación](home-takeover.md).

En Node 8 de la TV, el primer intento de compilar desde stdin abortó con `SIGABRT`. Los helpers
usan `node -e` leyendo el código por FD 3, stdin en `/dev/null` y `LD_PRELOAD` vacío para ese hijo;
no requieren cambiar globalmente el entorno de Node de la TV.

Root desde cero sigue pendiente: el flujo upstream usado en la investigación provocó un error
de firma de Developer Mode y exigió recuperación manual. No se anuncia «un clic y listo» ni se
vuelve a rootear una TV que ya tenga acceso. La futura dirección visual Apple TV prioriza
rendimiento; **no se instaló otro diseño en la TV** como parte de este programa de PC.
