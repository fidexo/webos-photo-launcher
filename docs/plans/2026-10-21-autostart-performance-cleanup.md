# Arranque, respuesta y limpieza de LG

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** abrir Mi pantalla al encender, corregir causas medidas de lentitud y quitar el bloat LG identificado.

**Architecture:** conservar HBC y el hook existente; medir el proceso propio antes de modificarlo.
La limpieza usa APIs del instalador y preferencias soportadas, con inventario y recuperación.
No se eliminan bibliotecas, particiones ni componentes del sistema por su nombre.

**Tech Stack:** webOS 5.6.2, Node 8, JavaScript ES5, shell de HBC y pruebas locales con node:test.

## 1. Estado y medición

- Comprobar SSH root, hook, proceso único, app en primer plano y registro de arranque.
- Medir CPU por proceso, memoria disponible y actividad de swap en un intervalo acotado.
- Consultar inventario actual y distinguir apps LG removibles de componentes del sistema.

## 2. Corregir causas comprobadas

- Revisar `services/com.frxn.mipantalla.lights/home-watch.js` y `home-autostart.sh`.
- Añadir reproducción causal en `tests/home-watch.test.cjs` antes de cambiar el comportamiento.
- Evitar lanzamientos redundantes y trabajo periódico innecesario; conservar Home y el hook.
- Modificar UI solamente si una medición identifica problemas de renderizado o respuesta.
- Guardar los archivos anteriores de la TV antes de instalar la actualización propia.

## 3. Limpieza concreta

- Revalidar LG Sports Playbook, LG Channels y LG Streaming Week como removibles.
- Conservar las apps elegidas y Developer Mode, HBC, PicCap y HyperHDR.
- Registrar resultado por app; usar desinstalación normal, sin borrar directorios por SSH.
- Desactivar promociones o seguimiento solo con claves y efectos identificados.
- Guardar el inventario y las preferencias anteriores en artefactos privados.

## 4. Cierre

- Ejecutar pruebas afectadas, suite completa, build y verificador del IPK.
- Comparar consumo y comprobar un único proceso del hook.
- Probar encendido con el usuario y registrar qué tipo de arranque se verificó.
- Revisar y publicar código y documentación sin configuraciones privadas ni credenciales.

## Cierre: 0.7.1

- 254 pruebas aprobadas; IPK de 57 archivos verificado e instalado.
- El dueño confirmó navegación fluida, apertura automática tras apagar con el control 20 s
  y regreso desde YouTube con Home. La primera prueba de standby en 0.7.0 había fallado.
- Tres apps LG desinstaladas y cinco preferencias confirmadas en `off`, con respaldo privado.
- Inventario posterior: 121 apps. No se eliminaron otras apps ni servicios del sistema.
- La navegación medida quedó en una media de 16,75 ms entre cuadros; no se promete ese
  rendimiento para cualquier carga ni un arranque sin ningún cuadro de HDMI.
