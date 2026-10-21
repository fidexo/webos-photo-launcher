# Instalador local para 49UN7310PSC Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Construir un asistente local de navegador para el modelo y firmware ya comprobados,
con diagnóstico, instalación, Home, privacidad y un adaptador de root acotado, y verificar
el estado real de captura antes de afirmar que las luces siguen video.

**Architecture:** UI servida únicamente por el compañero local en loopback, con acciones
enumeradas y sesión autenticada. Un motor comparte comprobación de modelo, respaldo,
plan/aplicación/reversión y transporte SSH; root usa sólo fuentes fijadas y no se repite
en una TV con privilegios ya comprobados. Las credenciales y el journal son privados.

**Tech Stack:** Node incorporado, OpenSSH, CLI LG fijada, Python 3 para el adaptador de root;
frontend de TV ES5/Chromium 68, sin nuevas dependencias de interfaz.

## Task 1: Diagnóstico actual y límites

- Leer estado por SSH sin iniciar captura ni cambiar luces: inventario, configuración presente,
  procesos y resultado de `screenStatus` si el servicio responde.
- Identificar qué está instalado y qué sólo tiene evidencia histórica.
- Registrar resultados saneados y mantener privados los datos del hogar.

## Task 2: Servidor y transporte

Files: `installer/server.cjs`, `installer/transport.cjs`, pruebas focales en `tests/`.

1. Escribir pruebas de Host/Origin/token, tamaño/tiempo de petición, exclusión de mutaciones
   y destino SSH no inyectable; comprobar rojo.
2. Implementar servidor loopback y transporte asíncrono acotados, sin consola remota genérica.
3. Comprobar verde y revisar integración con el motor.

## Task 3: Perfil y motor del modelo

Files: `installer/engine.cjs`, helpers acotados y perfil del modelo, pruebas en `tests/`.

1. Probar rechazo de modelo/firmware desconocidos, plan viejo y respuestas incompletas.
2. Implementar inventario, respaldo privado previo, pasos idempotentes y lectura posterior.
3. Ofrecer instalación de paquete verificado, Home y privacidad por separado. Conservar apps
   elegidas, configuraciones y permisos existentes; limpieza con selección explícita.
4. Probar fallos parciales y restauración sin sobrescribir cambios ajenos.

## Task 4: Root específico

Files: `installer/root-adapter.cjs`, fuentes/manifiesto fijados y pruebas focales.

1. Comprobar modelo/firmware antes de ofrecer el adaptador.
2. Fijar fuente y paquetes mediante SHA-256; conservar las licencias correspondientes.
3. No reutilizar el autoroot que dañó Developer Mode sin corregir esa ruta.
4. No ejecutar root en nuestra TV ya rooteada. Un test simulado no acredita una instalación
   original, persistencia física ni unroot completo.

## Task 5: UI local y rendimiento del inicio

Files: `installer/ui/`, cambios mínimos en `app.js`, `lights-panel.js` y `styles.css`.

1. Mostrar conectar, comprobar, revisar plan, aplicar y resultado/restaurar, con estados reales.
2. Aplicar dirección Apple TV con menos trabajo gráfico, conservando accesos sin títulos.
3. Construir Luces al abrirlo y verificar primer uso, reapertura y Atrás.
4. Comparar en Brave 1080p/720p y, si está disponible, en la TV real con el mismo recorrido.

## Cierre

Revisar el cambio exacto, ejecutar pruebas apropiadas y suite completa, comprobar que el repo
no contenga datos privados y actualizar tutorial. No marcar root desde cero, restauración
física o captura de contenido protegido como probados sin evidencia de ese caso.

## Resultado de esta entrega

- Diagnóstico actual: la captura de video no está activa; faltan PicCap, HyperHDR y su configuración.
- Servidor, transporte, perfil, motor y UI del compañero local implementados sin dependencias nuevas.
- Verificados en Brave y TV: status, plan y un ciclo de privacidad idempotente con respaldo,
  recuperación tras recargar y restauración. El snapshot posterior coincide con el previo.
- Suite completa: 401/401. Revisión independiente de los fallos de recuperación y recibos cerrada.
- Task 4 continúa pendiente: no se creó `root-adapter.cjs` ni se automatizó el exploit o la reparación
  de Developer Mode. El piloto exige root existente y no vuelve a ejecutar root sobre esta TV.
- Task 5 se completó para la UI del compañero de PC. La aplicación de TV sigue en 0.7.5;
  la dirección Apple TV y sus mediciones de rendimiento quedan para la siguiente implementación.
- No se probaron con este piloto instalación desde cero, cambios de Home, borrado de apps,
  hooks nuevos ni un arranque físico. No se acredita recuperación ante corte eléctrico completo
  o ejecución concurrente de dos instancias sobre la misma TV.
