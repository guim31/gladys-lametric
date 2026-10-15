# LaMetric

Esta integración conecta los relojes inteligentes **LaMetric TIME** y
**LaMetric SKY** a Gladys, en su red local, mediante la API local de los
relojes (API v2). Sin nube, sin cuenta LaMetric en Gladys: solo la clave de
API de cada reloj.

- Sus escenas escriben en los relojes: un texto, con un icono, un sonido y
  una prioridad.
- El brillo, el volumen, la pantalla y el Bluetooth son funciones de Gladys
  que puede mostrar en un panel y controlar desde las escenas.
- Unos pulsadores cambian de aplicación, borran las notificaciones y
  controlan el cronómetro, el temporizador y la radio.
- Un widget del panel escribe un mensaje en el reloj con dos toques.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** La
> integración se ha construido y probado con respuestas de relojes reales
> publicadas por la biblioteca python-demetriek y por Home Assistant, no con
> un reloj. Indique lo que funciona y lo que no en las
> [issues](https://github.com/guim31/gladys-lametric/issues).

Esta integración no está afiliada a LaMetric. LaMetric, LaMetric TIME y
LaMetric SKY son marcas de su propietario.

## Requisitos

- Gladys Assistant **5.2.0** o posterior.
- Una **LaMetric TIME** o una **LaMetric SKY**, en la misma red local que
  Gladys (hasta tres relojes).
- La **clave de API** de cada reloj: inicie sesión en
  [developer.lametric.com](https://developer.lametric.com) con la cuenta de la
  aplicación LaMetric, abra **Devices** y copie la clave de API del reloj.
  Cada reloj tiene su propia clave.

## Configuración

1. En Gladys, abra **Integraciones** → **Instalar desde GitHub** e introduzca
   `https://github.com/guim31/gladys-lametric` (o instale **LaMetric** desde
   el catálogo).
2. En **Configuración**, pegue la **Clave de API** del primer reloj. Su
   **Dirección** (una dirección IP como `192.168.1.20`) es opcional: vacía,
   Gladys busca el reloj en la red. Hasta dos relojes más debajo.
3. Elija el **Intervalo de actualización** (30 segundos por defecto) y el
   **Idioma de los nombres de funciones**, y guarde.
4. Haga clic en **Probar la conexión**: cada reloj responde OK, con su modelo
   y su firmware, o dice qué falla.
5. Abra la pestaña **Descubrir** y añada los relojes.

### Direcciones y búsqueda en la red

Los relojes se anuncian en la red (SSDP). Gladys hace esta búsqueda para la
integración, que funciona en su propio contenedor: encuentra la dirección de
un reloj sin dirección (es el reloj que acepta la clave de API) y sigue a un
reloj cuya dirección ha cambiado (una nueva IP dada por el router), por su
número de serie. La búsqueda se hace cuando un reloj la necesita, como
máximo cada 5 minutos, y en el acto desde **Buscar** en la pestaña Descubrir
o el botón **Probar la conexión**, que también lista los relojes encontrados
pero aún sin configurar.

Un reloj que no se anuncia se alcanza en la dirección introducida. Si puede,
dé a sus relojes una dirección IP fija en su router.

## El dispositivo de cada reloj

Un dispositivo por reloj, con el nombre del reloj. Cada función solo aparece
si el reloj la tiene:

| Función                                                                     | Qué hace                                                                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Brillo                                                                      | control deslizante 0-100; ajustarlo desactiva el brillo automático. En el puerto USB de un ordenador, el reloj se detiene en 76. |
| Brillo automático                                                           | activado: el reloj sigue la luz de la habitación                                                                                 |
| Pantalla                                                                    | enciende o apaga la pantalla (firmware 3 y posterior)                                                                            |
| Salvapantallas                                                              | activa o desactiva el salvapantallas de la aplicación LaMetric (TIME)                                                            |
| Volumen                                                                     | control deslizante 0-100 (TIME: la SKY no tiene altavoz)                                                                         |
| Bluetooth                                                                   | activa o desactiva el Bluetooth (TIME)                                                                                           |
| Señal Wi-Fi                                                                 | la señal Wi-Fi, en porcentaje                                                                                                    |
| Aplicación mostrada                                                         | el nombre de la aplicación en pantalla                                                                                           |
| Aplicación siguiente, Aplicación anterior                                   | pulsadores: cambian la aplicación en pantalla                                                                                    |
| Borrar las notificaciones                                                   | pulsador: retira las notificaciones mostradas y en espera                                                                        |
| Iniciar el cronómetro, Detener el cronómetro, Reiniciar el cronómetro       | pulsadores, si la aplicación Cronómetro está instalada                                                                           |
| Iniciar el temporizador, Detener el temporizador, Reiniciar el temporizador | pulsadores, si la aplicación Temporizador está instalada (la duración ajustada en la aplicación)                                 |
| Reproducir la radio, Detener la radio, Emisora de radio siguiente           | pulsadores, si la aplicación Radio está instalada                                                                                |

«Detener» pone en pausa: «Iniciar» continúa desde ahí, «Reiniciar» vuelve a
cero.

La propia integración lee los relojes en cada intervalo de actualización:
los valores solo cambian en Gladys cuando cambian en el reloj, y si no se
vuelven a enviar cada 6 horas. Un comando se vuelve a leer en el acto. Los
nombres de las funciones se asignan al crear el dispositivo; cambiar de
idioma después no los renombra.

## Widget del panel

Añada el widget **LaMetric** a un panel. Muestra el brillo, el volumen y la
señal Wi-Fi de un reloj, su estado, la aplicación en pantalla y su firmware
(y la actualización que ofrece el reloj, si la hay), con cuatro botones:

- **Anterior** y **Siguiente**: cambian la aplicación en pantalla;
- **Mensaje…**: abre un formulario, con el texto, un código de icono
  opcional y un sonido, y lo muestra en el reloj;
- **Borrar**: retira las notificaciones.

En la configuración del widget, elija el reloj; vacío, el widget muestra el
primer reloj de la configuración.

## Escenas

La integración añade dos acciones al editor de escenas, en la categoría
**Integraciones**. Ambas actúan sobre el reloj elegido, o sobre todos los
relojes que responden cuando el campo LaMetric está vacío, y devuelven el
número de relojes que lo hicieron (`count`).

### Mostrar en la LaMetric

Muestra un texto. El texto puede contener variables de escena (una
temperatura, un nombre…).

- **Icono**: el código de un icono de la
  [galería de LaMetric](https://developer.lametric.com/icons), `i` y el número
  para un icono fijo (`i2867`), `a` para uno animado (`a7956`). Un código
  desconocido se omite: el texto se muestra igualmente.
- **Sonido**: uno de los sonidos de notificación o alarmas del reloj. Una SKY
  no tiene altavoz: el texto se muestra sin sonido.
- **Prioridad**: Información, Advertencia o Crítica. Crítica también se
  muestra sobre el salvapantallas y de noche.
- **Número de veces mostrado**: 1 por defecto; 0 lo mantiene en pantalla
  hasta que alguien pulse el botón del reloj.
- **Duración de cada pase (s)**: vacío para la duración del reloj. Un texto
  más largo que la pantalla se desplaza de todos modos.

### Iniciar el temporizador de la LaMetric

Inicia la aplicación Temporizador del reloj durante los minutos y segundos
elegidos. La aplicación debe estar instalada en el reloj (lo está por
defecto).

### Ideas de escenas

- **La lavadora ha terminado**: cuando la potencia de su enchufe baja de
  5 W, **Mostrar en la LaMetric** «Colada lista», icono `a7956`, sonido
  «Positivo 1».
- **Llaman a la puerta**: cuando suena el timbre, mostrar «Puerta» con el
  sonido «Toc toc», prioridad Crítica, en todos los relojes.
- **La hora del té**: desde un botón del panel o un comando de voz,
  **Iniciar el temporizador de la LaMetric** durante 4 minutos.
- **La noche**: a las 23:00, ajustar el **Brillo** a 5, o apagar la
  **Pantalla**; a las 7:00, volver a activar el **Brillo automático**.

## Solución de problemas

- **«clave de API rechazada»**: copie de nuevo la clave desde
  developer.lametric.com → Devices; pertenece a un solo reloj. Un reloj
  restablecido de fábrica recibe una nueva clave.
- **«no encontrado en la red: introduzca su dirección»**: el reloj no
  responde a la búsqueda en la red (o Gladys no puede buscar): introduzca su
  dirección IP, que aparece en la aplicación LaMetric (ajustes del reloj →
  Wi-Fi).
- **«no responde»**: compruebe que el reloj está encendido, en la misma red
  que Gladys, y que nada bloquea el puerto TCP **4343** entre ambos.
- **«esta dirección no es una LaMetric»**: otro dispositivo responde en esa
  dirección.
- **Un comando falla justo después de una actualización del firmware**: haga
  clic en **Probar la conexión** y después en **Buscar** en la pestaña
  Descubrir: una función nueva (el interruptor Pantalla a partir del
  firmware 3) hace que Gladys proponga actualizar el dispositivo.
- La integración solo registra lo esencial (inicio, conexión, pérdida y
  regreso de un reloj, acciones del usuario). Para cada lectura, ajuste
  `LOG_LEVEL=debug` en la configuración de la integración. Los registros
  nunca muestran una clave de API.

## Límites

- Solo red local. No se usan las funciones en la nube de LaMetric
  (aplicaciones de la tienda, cuenta).
- Hasta tres relojes.
- La API del dispositivo no indica ningún nivel de batería: no hay función
  de batería.
- El cronómetro, el temporizador y la radio no comunican su estado a la
  integración: son pulsadores, sin estado en Gladys.
- La integración no crea aplicaciones en el reloj (sin fotogramas «My Data
  DIY»): muestra notificaciones.
- Los relojes usan un certificado HTTPS autofirmado: la integración lo acepta
  para su dirección. Mantenga los relojes en una red de confianza.
- La API local de LaMetric no tiene un límite de solicitudes documentado; la
  integración lee cada reloj dos veces por intervalo de actualización (su
  estado y sus aplicaciones), y solo escribe cuando usted da una orden.
