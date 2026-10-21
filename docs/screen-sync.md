# Colores de YouTube y HDMI

El modo actual de Mi pantalla analiza su propio fondo. Cuando se abre otra app, se pausa.
Para acompañar un video hace falta una fuente de imagen que siga trabajando en segundo plano.

La integración prevista es:

```text
Imagen de la TV → PicCap / hyperion-webos → HyperHDR → seis WiZ del living
```

PicCap incluye un servicio nativo de captura; HyperHDR convierte la imagen recibida en colores
y tiene un driver WiZ. Ambos pueden ejecutarse en la TV, sin mantener prendida la computadora.
Nuestra UI serviría para activar y detener ese modo. Esto todavía no está integrado ni probado
en esta unidad: **Pantalla completa permanece deshabilitado**.

## Estado comprobado

- LG 49UN7310PSC, webOS 5.6.2, firmware 04.64.00, placa K6LP_ATSC_BR.
- Seis WiZ RGB seleccionadas por el dueño; consultas locales confirman que las seis responden.
- Control manual y color del fondo comprobados por el dueño en Mi pantalla 0.5.1.
- PicCap 0.5.3 y HyperHDR Loader 22.0.1 descargados desde sus releases oficiales y verificados
  contra los hashes publicados. No se instalaron ni ejecutaron en la TV.
- La fuente exacta de HyperHDR 22 es el tag `v22.0.0.0`, commit
  `e5bda285227cbd38bce60da6a442dde936fd9e7a`. Incluye el driver WiZ. La identificación incrustada
  en el binario del Loader coincide; esto no es una reconstrucción reproducible del binario.
- Root y captura en esta placa siguen sin verificar. Developer Mode por sí solo no concede
  el acceso que necesita PicCap. El intento de crear el directorio de preparación encontró
  un montaje de solo lectura; no se ejecutó la cadena de elevación.

## Qué falta probar

1. Acceso requerido por PicCap y disponibilidad real del backend de captura en esta placa.
2. Captura fresca de una imagen de prueba y después de YouTube. Recibir una conexión o tener
   un proceso activo no acredita que sus imágenes sean actuales y correctas.
3. HDMI por separado. El soporte depende del backend y no se deduce de una prueba del launcher.
4. Envío únicamente a las seis lámparas elegidas; luego medir fluidez y carga en la TV.
5. Detener, volver a Manual, suspender y despertar. Recién después integrar la activación en la UI.

Como punto de partida para una prueba se propone 10 imágenes por segundo, sin suavizado adicional.
Con seis lámparas y un envío por imagen son hasta 60 datagramas RGB por segundo. Es una
configuración inicial por medir, no una latencia ni un rendimiento comprobados.
El suavizado de HyperHDR tiene su propio reloj, con mínimo de 20 Hz: se evaluaría después,
porque activarlo puede aumentar la frecuencia de envío aunque la captura siga en 10 fps.

Para un ambiente uniforme, las seis regiones virtuales pueden cubrir toda la imagen. El mapeo
por promedio de HyperHDR no equivale al histograma de color predominante del fondo del launcher.
También se pueden evaluar regiones distintas cuando se conozca la posición de cada lámpara.

## Comportamientos que hay que integrar

El driver WiZ 22 envía brillo junto con RGB. Al activarse puede encender las lámparas; al
desactivarse envía apagado. No implementa restauración del estado anterior. Por eso no se puede
conectar el botón Manual a desactivar el driver y prometer que las luces conservarán su estado:
antes hace falta guardar y restaurar explícitamente el encendido, brillo y color del grupo.

Los endpoints de HyperHDR deben limitarse al uso local antes de iniciarlo. Elegir el socket
local de PicCap no desactiva por sí solo el receptor TCP ni la interfaz de administración.
La configuración del hogar, identificadores y direcciones queda fuera del repo.

Netflix y otros contenidos protegidos pueden impedir la captura. No se promete sincronización
universal ni se trata un frame negro o un fallo del capturador como un color válido del video.

## Fuentes

- [PicCap: funcionamiento, requisitos y límites de captura](https://github.com/TBSniller/piccap#whats-this).
- [Release PicCap 0.5.3](https://github.com/TBSniller/piccap/releases/tag/0.5.3).
- [HyperHDR Loader 22.0.1 para webOS](https://github.com/webosbrew/hyperhdr-webos-loader/releases/tag/v22.0.1).
- [Driver WiZ de HyperHDR 22](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/net/DriverNetWiz.cpp).
- [Ciclo de encendido y apagado del driver](https://github.com/awawa-dev/HyperHDR/blob/e5bda285227cbd38bce60da6a442dde936fd9e7a/sources/led-drivers/LedDevice.cpp).
- [Reporte de captura en otra placa K6LP; no acredita esta unidad](https://github.com/webosbrew/hyperion-webos/issues/55).
