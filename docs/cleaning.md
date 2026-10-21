# Limpiar la TV sin romper nada

La idea era dejar solo las apps que se usan. Antes de borrar algo hacía falta saber qué hay
instalado y qué se puede quitar sin riesgo. **Hasta ahora no se borró ninguna app.**

## Cómo obtuvimos el inventario

`ares-install --list` solo muestra las apps de desarrollo, y por SSH el usuario de Developer Mode
está encerrado en un *chroot*. La lista completa salió del protocolo de control remoto en red de
LG (SSAP), con `scripts/inventory_tv.py`:

```sh
python -m pip install websockets
python scripts/inventory_tv.py --host IP_DE_TU_TV
```

Aceptá el aviso en la TV. El script solo lee la lista y escribe `artifacts/tv-app-inventory.json`
(en `.gitignore`). Por qué este método y cómo maneja el certificado de la TV:
[what-we-tried.md](what-we-tried.md#inventario-de-apps).

**No publiques el JSON crudo.** Acá va solo el resumen.

## Lo que hay en esta TV

| | Cantidad |
| --- | --- |
| Apps totales | 124 |
| Con `systemApp: true` | 104 |
| Con `removable: true` | 20 |

`removable` lo informa la TV. Es la única marca que usamos para decidir qué se puede borrar.

### Se conservan (7 removibles)

YouTube · Spotify · Nuvio · Netflix · Disney+ · Mi pantalla · Developer Mode

Developer Mode tiene que quedar: si se va, se van con ella Mi pantalla y Nuvio.

### Candidatas a borrar (13, sin borrar)

- Prime Video
- Apple Music
- Apple TV
- DGO
- Star+
- Paramount+
- HBO Max
- LG Sports Playbook
- Stremio
- LG Channels
- Movistar TV
- Twitch
- LG Streaming Week

Estado: **pendiente de que el dueño elija**. Se pueden borrar todas, algunas o ninguna.

### No tocar

Las otras 104 son del sistema (`removable: false`). Entre ellas hay nombres que parecen
prescindibles, como componentes de publicidad o LivePlus. **No asumas que algo sobra por su nombre
o porque parece inactivo**: puede ser parte de cómo funciona la TV. No se borra nada del sistema,
ni por la interfaz ni por SSH.

## Cómo borrar una app (método de LG)

1. Apretá **Home** en el control.
2. Mové el foco hasta la app.
3. Mantené **OK** apretado unos 3 segundos hasta que entre en modo edición.
4. Elegí el ícono de borrar (X o papelera) sobre la app y confirmá.

Guía de LG:
https://www.lg.com/au/support/product-support/troubleshoot/help-library/cs-CT52001891-20154523932778/ .

Antes de borrar, anotá cuáles vas a quitar. Las apps de tienda se pueden volver a
instalar desde LG Content Store.

## Qué esperar (y qué no)

- **Se pierden sesiones y preferencias** de la app borrada. Si la reinstalás, tenés que volver a
  iniciar sesión.
- **Libera almacenamiento**, pero no garantiza que la TV vaya más rápida ni que use menos RAM.
- **Home Promotion** (General > Home Settings) se puede desactivar para ver menos promociones en el
  Home de LG. Guía:
  https://www.lg.com/sg/support/product-support/troubleshoot/help-library/cs-CT52001362-20153529303128LST/ .
- **Home Auto Launch** controla si se abre el Home de LG al prender. **No tiene que ver con Mi
  pantalla**: no hace que nuestra app arranque sola.
- En Developer Mode hay una opción para borrar caché y datos. Afecta a **todas** las apps: es una
  herramienta de prueba, no de limpieza general.

## Resumen

| Acción | Estado |
| --- | --- |
| Inventario completo por SSAP | Hecho, solo lectura |
| Elegir qué borrar | Pendiente |
| Borrar candidatas por la interfaz de LG | No hecho |
| Tocar apps o servicios del sistema | Fuera de alcance |
