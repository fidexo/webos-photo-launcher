# Integración de captura: plan de implementación

**Objetivo:** dejar preparada la conexión de Luces con HyperHDR y la transición segura entre
pantalla y control manual. La captura real y el root quedan para una etapa posterior.

**Arquitectura:** servicio Node 8 con transporte JSON TCP únicamente a `127.0.0.1:19444`;
diagnóstico explícito y sin órdenes a lámparas; controlador de sesión que guarda/restaura
el estado del grupo antes de habilitar una salida de video. La UI solo recibe resúmenes.

**Tecnología:** módulos nativos `net` y `fs`, JavaScript ES5 en TV, runner `node:test` local.
No se agregan dependencias. La configuración privada queda excluida de Git.

## 1. Transporte de HyperHDR

- Crear `services/com.frxn.mipantalla.lights/hyperhdr-rpc.js` y pruebas propias.
- Probar primero fragmentación de TCP, correlación exacta de `tan`/`command`, autorización,
  límites de buffer, desconexión y timeout sin reintentar mutaciones.
- Autenticar y seleccionar explícitamente la instancia. No permitir destinos o comandos
  arbitrarios desde la UI. No devolver configuración completa ni errores con secretos.

## 2. Diagnóstico y contrato de captura

- Crear módulo de diagnóstico y configuración de ejemplo deshabilitada.
- Consultar servidor, instancia y configuración WiZ real; exigir que coincidan exactamente
  MAC e IP con las lámparas seleccionadas y leídas en ese momento.
- Una prioridad activa no prueba imagen fresca: hyperion-webOS envía duración indefinida.
  Mantener captura no verificada cuando no haya evidencia de frames y prueba física.
- Añadir `screenStatus` al servicio, protegido por el mismo emisor Luna que los otros métodos.
  El método solo consulta y nunca enciende, apaga o cambia colores.

## 3. Transición y restauración

- Implementar un controlador de sesión independiente de la UI, con pruebas de baseline,
  exclusión de operaciones, fallos parciales y recuperación de una restauración pendiente.
- Antes de iniciar salida de video: validar el grupo, guardar su estado y confirmar preparación.
- Antes de una orden manual o cambiar destinatarios: parar salida y restaurar cada lámpara.
  Un fallo de parada/restauración impide continuar con otras escrituras.
- No conectar activación real mientras falten captura y restauración comprobadas en hardware.

## 4. Interfaz

- Añadir «Revisar captura» en Luces, utilizable sin selección y solo por clic.
- Mostrar códigos de estado traducidos; descartar texto bruto del servidor.
- Corregir el modo local para no ocultar una sesión de pantalla confirmada por el backend.
- Cerrar el panel u ocultar la app no debe parar una futura sesión nativa de pantalla.
- Mantener Pantalla completa deshabilitado mientras la integración no esté verificada.

## 5. Integración y entrega

- Actualizar listas del paquete y su verificador para incluir los módulos nuevos.
- Ejecutar pruebas focales rojo/verde, suite completa y verificación del IPK.
- Revisar cambios y comprobar interfaz en Brave. No ejecutar root ni instalar capturadores.
- Documentar qué está implementado y qué solo pasó con dobles de prueba.

## Resultado de esta etapa: 0.6.0

- 206 pruebas automatizadas aprobadas; revisión independiente del transporte, la sesión y la UI.
- Panel verificado en Brave a 1280×720 y 1920×1080, sin desbordes.
- IPK de 52 archivos comparado contra la compilación y los 13 archivos del servicio.
- Instalación y orden de apertura aceptadas por la TV; el dueño confirmó que «Revisar captura»
  informa que falta configurar la captura.
- Root, capturadores y salida de video no ejecutados. `start` permanece bloqueado hasta implementar
  y verificar la recepción de imágenes frescas y el comportamiento físico de las lámparas.
