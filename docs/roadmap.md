# Roadmap

Estado al **2026-10-21**. El dueño probó **0.7.4** y confirmó que anda bastante bien.
La **0.7.5** agrega acceso a Homebrew Channel y actualiza documentación de privacidad e
instalación; su estado de despliegue se informa en el README. Este documento separa funciones
existentes, pruebas concretas y propuestas.

## Entregado

| Etapa | Resultado | Evidencia y límites |
| --- | --- | --- |
| 0.2–0.3 | Diseño Liquid Glass, íconos sin nombres, cuatro fotos, clima y Personalizar. | Aceptación visual en la TV; frontend web, sin reemplazar firmware. |
| 0.4–0.4.1 | Fotos diarias, Transitions y marca Bedrock. | Código/preview/IPK probados. Enlace YouTube por CLI confirmado tras elegir perfil; no atribuir esa prueba al dock. |
| 0.5–0.5.1 | WiZ manual y Acompañar fondo. | El dueño confirmó brillo en seis lámparas y luego color del fondo. |
| 0.6 | PicCap/HyperHDR, Pantalla completa y primera integración de Home. | Root/HBC persistente; activación y restauración físicas de luces. Arranque frío observado. HDMI/DRM y persistencia de pantalla pendientes. |
| 0.7–0.7.1 | Navegación liviana y wake por estado de potencia. | El encendido de 0.7 falló; 0.7.1 corrigió el caso de apagar 20 s con el control. |
| 0.7.2 | Home nativo y watcher sin polling de input. | El dueño confirmó YouTube → Home y apagar 20 s → encender directos a Mi pantalla, sin LG primero en esos casos. |
| 0.7.3 | Primera foto directamente desde la galería diaria validada en caché. | Menor demora en recarga CDP; no mide desde encendido ni acredita offline. |
| 0.7.4 | Fondo SVG inmediato, foto con fundido, foco suave al detenerse y rework Luces. | 295 pruebas; instalado. Muestra de navegación rápida ~59,4 FPS y primer pintado a 554 ms por CDP; el dueño después confirmó buen funcionamiento general. |

El Home nativo usa `general.defaultApps.home` y conserva los demás defaults. El watcher mantiene
boot y power/wake. Una guardia externa intenta restaurar el Home anterior si desaparece la app;
sus tests y ejecución manual con app presente no prueban un arranque físico con app ausente.
[Home y reversión](home-takeover.md) · [rendimiento y metodología](performance.md).

El diseño original y parte de la documentación se hicieron con Opus. El rework 0.7.4 se terminó
con Codex al fallar la autenticación del delegador; no atribuir a Opus ese cambio.

## Ronda 0.7.5

- Acceso a `org.webosbrew.hbchannel`, ocultable/reordenable como los demás. Abrir la tienda es
  una acción explícita: el acceso no instala apps ni activa root.
- Actualizar el tutorial al flujo actual: Developer Mode, compilación, verificación, instalación,
  configuración privada, Home manual con respaldo/guardia y reversión antes de desinstalar.
- Explicar los límites de limpiar apps, desactivar promociones y demostrar tráfico saliente.
- Evaluar instalación desde browser, sin presentar un prototipo como algo implementado.
- Publicar `privacy-audit.cjs` como diagnóstico CLI de solo lectura con root ya disponible;
  no instala ni modifica ajustes y no equivale al futuro `plan/apply/restore`.
- Registrar comprobaciones finales de la versión exacta en el README.

[Automatización evaluada](browser-installer.md) · [visión del producto](product-vision.md).

## Prioridad 1: recuperación y mantenimiento verificables

1. Probar restore de Home y la guardia con la app ausente durante un arranque real, con acceso
   SSH y físico de recuperación. No usar el resultado de `app-present` como prueba de ese caso.
2. Cubrir actualización de IPK con configuración privada y roles ya instalados, fallos de red
   y rollback parcial. Hoy existe procedimiento manual; no instalador público completo.
3. Repetir Home desde varias apps, foco posterior, Home repetido/mantenido y otros ciclos de
   standby/Quick Start. La confirmación de YouTube y apagado de 20 s no acredita todos esos casos.
4. Registrar versiones/hashes de HBC, PicCap e HyperHDR y una matriz limitada de compatibilidad.
   Un modelo que no coincida debe recibir un estado explícito de soporte desconocido.

## Prioridad 2: privacidad con evidencia

- Inventariar primero; distinguir apps removibles, servicios, preferencias y tráfico.
- Mantener un perfil mínimo reversible: ajustes conocidos con backup y readback, sin borrar
  dependencias de imagen, audio, red, DRM, app manager, ajustes o recuperación.
- Si se evalúa una herramienta de limpieza de Homebrew, revisar su versión y cada acción antes
  de aplicarla. Su presencia en una tienda no prueba compatibilidad ni privacidad.
- Para afirmar bloqueo de destinos, registrar qué se observó y cómo se comprobó. Ajustes de
  promociones apagados no demuestran «cero datos compartidos»; DNS no identifica por sí solo
  contenido cifrado ni garantiza que una app no use otro canal.

El inventario histórico pasó de 124 a 121 apps al retirar tres removibles de LG. Las diez
candidatas de terceros no se eliminaron en aquella limpieza. El estado actual y cualquier
nueva acción deben constar en [limpieza](cleaning.md), con sus lecturas posteriores.

## Prioridad 3: rendimiento percibido y medido

- Conservar el fondo local desde primer pintado y diferir red/decode/vidrio sin bloquear flechas.
- Medir navegación lenta y rápida, apertura de Luces y vuelta desde apps con la misma metodología.
- Separar aceptación con control físico, muestras rAF por CDP y tiempo desde power-on.
- Evitar nuevos efectos de pantalla completa, polling y servicios en reposo sin una mejora
  demostrada. Borrar apps instaladas no garantiza menor CPU.
- Mantener modos manuales y un error claro al faltar red, lámparas o fuente de captura.

La 0.7.4 cancela la elevación pendiente al recorrer íconos rápido; el aro responde al instante y
el movimiento llega al detenerse. Animar vidrio durante cada flecha se descartó por su costo.
[Detalle](performance.md#074-fondo-inmediato-foco-y-luces).

## Prioridad 4: instalación reproducible

Primero un CLI local con **plan / apply / restore**, empezando por instalar y actualizar la app
en una TV ya emparejada. Es una propuesta, no comandos existentes. Reutilizar build, verificador
e inventario; faltan transporte público, coordinación, backups y pruebas de fallo/restore.

Después evaluar web + compañero local. Browser-only puede ayudar con guía/configuración y
quizá SSAP autorizado; no reemplaza SSH ni proporciona root universal. No agregar un endpoint
público de shell o instalación. [Comparación y fuentes](browser-installer.md).

## Funciones para evaluar

Las propuestas de experiencia, su utilidad frente al stock y sus costos están en
[visión del producto](product-vision.md). Una idea entra a implementación cuando hay un caso
concreto, navegación con control y un presupuesto de red/CPU. No añadir servicios permanentes
solo para completar una lista de features.

Quick Access de LG es una alternativa sin root para abrir una app con una tecla numérica.
**No se probó con nuestra app de desarrollo en esta TV.**
[Guía de LG](https://www.lg.com/es/soporte/guias-y-soluciones/television/webos-3-5-funcion-quick-access/).

## Fuera de alcance actual

- Reemplazar firmware o los menús internos de las apps.
- Afirmar cero telemetría sin un ensayo de red adecuado.
- Purgar componentes de sistema sin dependencias identificadas y recuperación comprobada.
- Prometer HDMI o contenido protegido en Pantalla completa sin pruebas específicas.
- Redistribuir IPK de terceros o configuraciones, certificados, llaves y tokens del hogar.
- Root automático para cualquier TV o un instalador browser-only anunciado como terminado.
