# Valetudo

## Presentación

Esta integración controla los robots aspiradores que funcionan con **Valetudo** (valetudo.cloud), el firmware libre que sustituye a la nube del fabricante, mediante su API REST local oficial: sin cuenta, nada sale de su red. Cada robot se convierte en un dispositivo de Gladys con las funciones nativas de robot aspirador (estado, limpieza, vuelta a la base, batería), sus niveles de aspiración y de agua y la vida restante de sus consumibles. Las acciones de escena limpian habitaciones por su nombre y controlan el robot; los desencadenantes de escena avisan cuando empieza o termina una limpieza, cuando el robot está en error o le necesita. Tres widgets del panel muestran el robot, su mapa en directo y su mantenimiento.

Sin relación con el proyecto Valetudo. **Todavía no probada con un robot real**: las peticiones siguen la API oficial de Valetudo 2026.10; sus comentarios son bienvenidos.

## Requisitos previos

- Gladys Assistant 5.3.0 o posterior.
- Un robot aspirador con Valetudo, en la misma red que Gladys, cuya página de Valetudo se abra en un navegador.
- Idealmente, una dirección IP fija para el robot en su router. Limpiar habitaciones requiere un robot con segmentación por habitaciones y un mapa guardado.

## Configuración

1. Instale la integración desde la tienda y abra su configuración.
2. Deje activado **Encontrar los robots automáticamente (mDNS)**. Para un robot en otra red, escriba su dirección (IP o nombre, con `:puerto` si hace falta) en **Direcciones de los robots (opcional)**.
3. Si la autenticación HTTP está activada en Valetudo (Settings → Connectivity → Auth settings), escriba el mismo **Usuario** y la misma **Contraseña**.
4. Elija el **Idioma de los textos de los dispositivos** y pulse **Buscar y probar los robots**: el mensaje lista cada robot encontrado, con su dirección y su batería.
5. Abra la pestaña **Descubrir** y añada sus robots.

## Uso

Cada robot tiene estas funciones, según lo que Valetudo ofrezca para él:

| Función          | Tipo                    | Qué hace                                                                                |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| Estado           | robot aspirador, sensor | Detenido, limpiando, en pausa, error, volviendo, cargando, en la base                   |
| Limpieza         | robot aspirador, lista  | Detener, Limpiar (inicia o reanuda), Cartografiar (una pasada de cartografía, si puede) |
| Volver a la base | robot aspirador, botón  | Envía el robot a su base                                                                |
| Batería          | batería, %              | Nivel de carga                                                                          |
| Aspiración       | lista                   | Los niveles de aspiración del robot                                                     |
| Agua             | lista                   | Los niveles de agua (robots que friegan)                                                |
| Modo             | lista                   | Aspirar, fregar, aspirar y fregar… (robots que lo ofrecen)                              |
| Consumible       | mantenimiento, %        | Vida restante de cada cepillo, filtro, mopa… que la indique                             |

Valetudo envía los cambios en cuanto se producen; los consumibles y las estadísticas se leen cada pocos minutos.

### Widgets del panel

- **Robot aspirador**: estado, batería, superficie y duración de la limpieza en curso, aspiración y agua, el mensaje de error; botones **Iniciar** / **Pausa** / **Reanudar**, **A la base**, **Localizar** y **Limpiar habitación** (elija la habitación y las pasadas).
- **Mapa del robot**: el mapa en directo dibujado por la integración (habitaciones en colores, paredes, trayecto, robot en azul, base en verde, paredes virtuales y zonas prohibidas en rojo), con la habitación en limpieza en ámbar.
- **Mantenimiento del robot**: superficie, tiempo y número de limpiezas totales, cada consumible del más gastado al menos (insignia **Cambiar** por debajo del 10 %, **Pronto** por debajo del 25 %), y **Reiniciar** después de cambiar uno.

![Widgets Valetudo: robot, mapa y mantenimiento de un robot que limpia una habitación (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-valetudo/main/docs/assets/widgets.es.png)

### Escenas

Acciones: **Limpiar habitaciones con un robot aspirador** (nombres de las habitaciones tal como están en Valetudo, sin tener en cuenta tildes ni mayúsculas, o números de habitación, separados por comas; pasadas; aspiración y agua opcionales ajustadas antes; devuelve las habitaciones enviadas) y **Controlar un robot aspirador** (iniciar o reanudar, pausar, detener, volver a la base, localizar, vaciar el depósito en la base, lavar o secar la mopa en la base).

Desencadenantes: **limpieza iniciada**, **limpieza terminada** (con la superficie en m² y la duración en minutos), **error** (con el mensaje del robot), **requiere atención** (depósito de polvo lleno, consumible gastado, recordatorio de la mopa, algo que falta, cambio de mapa por aceptar; filtrable por motivo), **deja de responder** y **vuelve a responder**. El nombre del robot siempre está disponible como variable.

Ejemplos:

- Cuando todos salen de casa → limpiar «Cocina, Salón» dos veces.
- Cuando termina la limpieza → enviar «{{triggerEvent.data.area_m2}} m² limpiados» a su teléfono.
- Cuando el robot requiere atención porque el depósito de polvo está lleno → hacer parpadear la luz del recibidor.

## Solución de problemas

- **No se encuentra ningún robot**: compruebe que su página de Valetudo se abre en su dirección desde otro aparato, luego escriba esa dirección en la configuración y use **Buscar y probar los robots**. El mDNS no atraviesa las VLAN ni las redes de invitados.
- **«rechaza el usuario o la contraseña»**: las credenciales no coinciden con la autenticación HTTP de Valetudo.
- **«no puede hacer esto»**: Valetudo no ofrece esa capacidad para este robot (una función de la base, las habitaciones, la cartografía); el mensaje la nombra.
- **No hay mapa en el widget**: el robot todavía no tiene un mapa guardado; deje que termine una primera limpieza completa.
- Para informar de un problema, indique las versiones de Gladys, de la integración y de Valetudo, el modelo del robot, el mensaje del botón de prueba y los registros (añada `DEBUG=gladys-integration-sdk` en modo desarrollador): [abrir una issue](https://github.com/William-De71/gladys-valetudo/issues).
