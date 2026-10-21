# Root, botón Home e inicio automático

Estado al 20 de octubre de 2026: no se ejecutó root en la TV ni se instalaron hooks de Home o de arranque. Se revisaron fuentes y un paquete de Homebrew Channel en el equipo de desarrollo. La autorización para usar root si hace falta ya fue otorgada; las funciones actuales de la línea 0.4 no lo necesitan.

Mi Pantalla sigue siendo una aplicación de webOS. Abrir apps, elegir accesos y personalizar su interfaz no reemplaza el sistema operativo, el firmware ni el Home de LG. Instalar nuestra app tampoco hace que arranque sola o capture el botón Home.

## Qué se revisó

La revisión fue estática: lectura del código, scripts e invocaciones relacionadas. No se ejecutaron exploits, instaladores o dependencias de esos proyectos, y no se probaron estos cambios en hardware.

| Proyecto | Fuente fijada | Alcance |
| --- | --- | --- |
| SlopBro | [`21023d56ca424607bb03d2939609cc658c655fc7`](https://github.com/throwaway96/slopbro/tree/21023d56ca424607bb03d2939609cc658c655fc7) | Cliente, servidor local, página, servicio y script de instalación/elevación. |
| Homebrew Channel 0.7.3 | [`92fcf9fef7ce08dbeae3b0616df8d0c75c11f0b3`](https://github.com/webosbrew/webos-homebrew-channel/tree/92fcf9fef7ce08dbeae3b0616df8d0c75c11f0b3) | Elevación, startup, actividad persistente, servicio y frontend relevante. |
| webOS Launch Home | [`dc33d92743830a4df0299e3d898705dbe9b7feae`](https://github.com/gprot42/webos-launch-home/tree/dc33d92743830a4df0299e3d898705dbe9b7feae) | Watcher de Home, lanzamiento al arrancar y scripts para activar/desactivar ambos. |

El IPK oficial de HBC 0.7.3 descargado coincidió con el SHA-256 publicado por GitHub:

`d10bf3c753551d7c72fb7a92b20fcd2317e502a220ac668ba8e76f6ea78b363c`

Sus scripts de startup, jumpstart y ejecución del servicio coincidieron con la fuente revisada. No se reconstruyeron los binarios ARM ni se verificó reproducibilidad de todo el paquete.

## Qué requeriría integrar Home y arranque

Launch Home requiere HBC elevado para instalar sus hooks. Su watcher espera que el Home de LG aparezca en primer plano, abre el launcher propio, cierra ventanas del Home y vuelve a abrir el launcher para recuperar el foco del control remoto. No reemplaza el sistema operativo ni intercepta directamente la tecla. El orden está documentado para webOS 25 en el [watcher revisado](https://github.com/gprot42/webos-launch-home/blob/dc33d92743830a4df0299e3d898705dbe9b7feae/scripts/home-watcher.sh).

El inicio automático es otro mecanismo: un hook de HBC espera al framework de aplicaciones e intenta abrir el launcher varias veces. El [script de arranque](https://github.com/gprot42/webos-launch-home/blob/dc33d92743830a4df0299e3d898705dbe9b7feae/scripts/boot-launch.sh) no demuestra que funcione al despertar de standby; un arranque completo y Quick Start+ son casos distintos.

Estos scripts tienen fijado el ID de la aplicación de Launch Home. Usarlos con Mi Pantalla requiere una adaptación acotada y su propia revisión. Los hooks persisten fuera del paquete de la app: desinstalar el IPK no constituye una reversión completa. Existen scripts separados para [desactivar el watcher](https://github.com/gprot42/webos-launch-home/blob/dc33d92743830a4df0299e3d898705dbe9b7feae/scripts/disable-home-watcher.sh) y [desactivar el arranque](https://github.com/gprot42/webos-launch-home/blob/dc33d92743830a4df0299e3d898705dbe9b7feae/scripts/disable-boot-launch.sh); su adaptación también debe revisarse.

El proyecto declara webOS 5.x como **“Expected working”**, con webOS 25 como plataforma principal de prueba. Eso no acredita funcionamiento en nuestra TV. Quedan por probar foco, navegación, regreso desde otras apps, Home repetido, arranque completo, standby y recuperación. [Compatibilidad declarada](https://github.com/gprot42/webos-launch-home/blob/dc33d92743830a4df0299e3d898705dbe9b7feae/README.md#compatibility).

## Hallazgos de seguridad y persistencia

- HBC 0.7.3 abre Telnet root sin autenticación por defecto. El flag normal para deshabilitarlo no se consulta en la rama failsafe, que también abre Telnet. Su startup usa Dropbear sin deshabilitar explícitamente las contraseñas; tener una clave autorizada sólo evita que escriba la contraseña predeterminada. [Startup revisado](https://github.com/webosbrew/webos-homebrew-channel/blob/92fcf9fef7ce08dbeae3b0616df8d0c75c11f0b3/services/startup.sh).
- La elevación modifica configuración y permisos LS2 de HBC y habilita un servicio con ejecución root amplia. HBC además puede registrar una actividad persistente para ejecutar su startup y los hooks de usuario. Es un cambio de privilegios del dispositivo, con alcance mayor que nuestra interfaz. [Elevación](https://github.com/webosbrew/webos-homebrew-channel/blob/92fcf9fef7ce08dbeae3b0616df8d0c75c11f0b3/services/elevate-service.ts), [servicio y autostart](https://github.com/webosbrew/webos-homebrew-channel/blob/92fcf9fef7ce08dbeae3b0616df8d0c75c11f0b3/services/service.ts).
- SlopBro descarga HBC sin comprobar su hash. Cambia el estado persistente de Developer Mode y puede renombrar su script de inicio de LG si falla la verificación. No conserva todos los originales ni implementa rollback transaccional. [Autoroot revisado](https://github.com/throwaway96/slopbro/blob/21023d56ca424607bb03d2939609cc658c655fc7/wwwroot/autoroot.sh).
- El cliente de SlopBro desactiva la verificación del certificado WSS y entrega el payload por HTTP. Su mensaje final sólo confirma solicitudes de archivos; no confirma root, instalación ni persistencia. [Cliente revisado](https://github.com/throwaway96/slopbro/blob/21023d56ca424607bb03d2939609cc658c655fc7/slopbro.py).
- El failsafe de HBC omite personalizaciones y hooks durante ese startup, pero no deshace la instalación o elevación. En esta versión elimina su propio flag después de una espera. No se verificó un procedimiento completo de unroot para este hardware.

## Antes de una ejecución futura

Hace falta confirmar nuevamente la compatibilidad exacta y conservar los paquetes, datos y ajustes necesarios de las apps de desarrollo. También hay que resolver la convivencia con Developer Mode sin perderlas; el propio autoroot exige retirar la app de LG antes de reiniciar cuando la detecta instalada.

La preparación técnica debe fijar artefactos y hashes, respaldar el estado que se va a modificar y endurecer el acceso remoto **antes del primer startup de HBC**: clave pública, SSH sin contraseñas y sin Telnet abierto, incluida la recuperación. Un startup personalizado es viable según el código revisado, pero todavía no está implementado ni probado en la TV. Esto tampoco elimina la confianza que exige el transporte local del exploit.

Después se necesita evidencia real de root, acceso de recuperación y persistencia antes de avanzar a Home o arranque. Cada integración deberá tener una forma comprobada de desactivarse y devolver el control al Home de LG. Hasta completar esas pruebas, Home y boot siguen siendo trabajo futuro; la app actual se puede usar sin esos cambios.
