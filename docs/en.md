# LaMetric

This integration connects the **LaMetric TIME** and **LaMetric SKY** smart
clocks to Gladys, over your local network, through the local device API of
the clocks (API v2). No cloud, no LaMetric account in Gladys: only the API
key of each clock.

- Your scenes write on the clocks: a text, with an icon, a sound and a
  priority.
- The brightness, the volume, the screen and Bluetooth are Gladys features
  you can show on a dashboard and drive from scenes.
- Push buttons switch apps, clear the notifications, and drive the
  stopwatch, the timer and the radio.
- A dashboard widget writes a message on the clock in two taps.

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against answers of real clocks published by the
> python-demetriek library and Home Assistant, not against a clock. Please
> report what works and what does not in the
> [issues](https://github.com/guim31/gladys-lametric/issues).

This integration is not affiliated with LaMetric. LaMetric, LaMetric TIME and
LaMetric SKY are trademarks of their owner.

## What you need

- Gladys Assistant **5.2.0** or later.
- A **LaMetric TIME** or **LaMetric SKY**, on the same local network as
  Gladys (up to three clocks).
- The **API key** of each clock: sign in on
  [developer.lametric.com](https://developer.lametric.com) with the account
  of the LaMetric app, open **Devices**, and copy the API key shown for the
  clock. Each clock has its own key.

## Set up

1. In Gladys, open **Integrations** → **Install from GitHub** and enter
   `https://github.com/guim31/gladys-lametric` (or install **LaMetric** from
   the catalog).
2. In **Configuration**, paste the **API key** of the first clock. Its
   **Address** (an IP address such as `192.168.1.20`) is optional: left
   empty, Gladys looks for the clock on the network. Up to two more clocks
   below.
3. Choose the **Refresh interval** (30 seconds by default) and the
   **Language of the feature names**, then save.
4. Click **Test the connection**: each clock says OK, with its model and its
   firmware, or what is wrong.
5. Open the **Discover** tab and add the clocks.

### Addresses and network search

The clocks announce themselves on the network (SSDP). Gladys relays that
search for the integration, which runs in its own container: it finds the
address of a clock whose address is left empty (the clock that accepts the
API key is the right one), and follows a clock whose address changed (a new
IP given by the router), by its serial number. The search runs when a clock
needs it, at most every 5 minutes, and at once from **Scan** in the Discover tab or the
**Test the connection** button, which also lists the clocks found but not
configured yet.

A clock that does not announce itself is reached at the address you enter.
Give your clocks a fixed IP address in your router if you can.

## The device of each clock

One device per clock, named after the clock. Each feature appears only when
the clock has it:

| Feature                                                      | What it does                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Brightness                                                   | slider 0-100; setting it turns the automatic brightness off. On a computer's USB port, the clock stops at 76. |
| Automatic brightness                                         | on: the clock follows the light of the room                                                                   |
| Screen                                                       | turns the display on or off (firmware 3 and later)                                                            |
| Screensaver                                                  | turns the screensaver of the LaMetric app on or off (TIME)                                                    |
| Volume                                                       | slider 0-100 (TIME: the SKY has no speaker)                                                                   |
| Bluetooth                                                    | turns Bluetooth on or off (TIME)                                                                              |
| Wi-Fi signal                                                 | the Wi-Fi signal, in percent                                                                                  |
| App on screen                                                | the name of the app shown on the clock                                                                        |
| Next app, Previous app                                       | push buttons: switch the app on screen                                                                        |
| Clear notifications                                          | push button: dismisses the notifications on screen and waiting                                                |
| Start the stopwatch, Stop the stopwatch, Reset the stopwatch | push buttons, when the Stopwatch app is installed                                                             |
| Start the timer, Stop the timer, Reset the timer             | push buttons, when the Timer app is installed (the duration set in the app)                                   |
| Play the radio, Stop the radio, Next radio station           | push buttons, when the Radio app is installed                                                                 |

"Stop" pauses: "Start" goes on from there, "Reset" goes back to zero.

The clocks are read every refresh interval, by the integration itself: the
values change in Gladys only when they change on the clock, and are sent
again every 6 hours otherwise. A command is read back at once. The names of
the features are given when the device is created; changing the language
later does not rename them.

## Dashboard widget

Add the **LaMetric** widget to a dashboard. It shows the brightness, the
volume and the Wi-Fi signal of a clock, its state, the app on screen and its
firmware (and the update the clock offers, if any), with four buttons:

- **Previous** and **Next**: switch the app on screen;
- **Message…**: opens a form, with the text, an optional icon code and a
  sound, and shows it on the clock;
- **Clear**: dismisses the notifications.

In the widget settings, choose the clock; left empty, the widget shows the
first clock of the configuration.

## Scenes

The integration adds two actions to the scene editor, under the
**Integrations** category. Both act on the chosen clock, or on every clock
that answers when the LaMetric field is left empty, and return the number of
clocks that did it (`count`).

### Show on the LaMetric

Shows a text. The text can hold scene variables (a temperature, a name…).

- **Icon**: the code of an icon of the
  [LaMetric gallery](https://developer.lametric.com/icons), `i` then the
  number for a still icon (`i2867`), `a` for an animated one (`a7956`). An
  unknown code is left out: the text still shows.
- **Sound**: one of the notification sounds or alarms of the clock. A SKY
  has no speaker: the text shows without sound.
- **Priority**: Information, Warning or Critical. Critical also shows over
  the screensaver and at night.
- **Number of times shown**: 1 by default; 0 keeps it on screen until
  someone presses the button of the clock.
- **Duration of each pass (s)**: empty for the duration of the clock. A text
  longer than the screen scrolls anyway.

### Start the LaMetric timer

Starts the Timer app of the clock for the minutes and seconds you choose.
The app must be installed on the clock (it is by default).

### Scene ideas

- **The washing machine is done**: when the power of its plug drops below
  5 W, **Show on the LaMetric** "Washing done", icon `a7956`, sound
  "Positive 1".
- **Someone at the door**: when the doorbell rings, show "Door" with the
  sound "Knock knock", priority Critical, on every clock.
- **Tea time**: from a button on the dashboard or a voice command, **Start
  the LaMetric timer** for 4 minutes.
- **Night**: at 23:00, set the **Brightness** to 5, or turn the **Screen**
  off; at 7:00, turn **Automatic brightness** back on.

## Troubleshooting

- **"API key refused"**: copy the key again from developer.lametric.com →
  Devices; it belongs to one clock only. A clock reset to factory settings
  gets a new key.
- **"not found on the network: enter its address"**: the clock does not
  answer the network search (or Gladys cannot search): enter its IP address,
  shown in the LaMetric app (clock settings → Wi-Fi).
- **"does not answer"**: check that the clock is on, on the same network as
  Gladys, and that nothing blocks the TCP port **4343** between them.
- **"this address is not a LaMetric"**: another device answers at this
  address.
- **A command fails right after a firmware update**: click **Test the
  connection**, then **Scan** in the Discover tab: a feature that appeared
  (the Screen switch after firmware 3) makes Gladys offer to update the
  device.
- The integration logs only what matters (start, connection, loss and return
  of a clock, user actions). For every reading, set `LOG_LEVEL=debug` in the
  integration settings. The logs never show an API key.

## Limits

- Local network only. The cloud features of LaMetric (apps of the store,
  account) are not used.
- Up to three clocks.
- The device API reports no battery level: there is no battery feature.
- The stopwatch, the timer and the radio do not report their state to the
  integration: they are push buttons, without a state in Gladys.
- The integration does not create apps on the clock (no "My Data DIY"
  frames): it shows notifications.
- The clocks use a self-signed HTTPS certificate: the integration accepts it
  for their address. Keep the clocks on a network you trust.
- The local API of LaMetric has no documented rate limit; the integration
  reads each clock twice per refresh interval (its state and its apps), and
  writes only on your commands.
