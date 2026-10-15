# LaMetric for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
connects the **LaMetric TIME** and **LaMetric SKY** smart clocks through their
local device API (API v2, `https://<ip>:4343/api/v2`), over the local network.
No cloud, no LaMetric account in Gladys: the API key of each clock only.

> **Developed without the hardware: feedback welcome.** The integration is
> built and tested against the answers of real clocks published by
> [python-demetriek](https://github.com/frenck/python-demetriek) and Home
> Assistant, not against a clock. Please report what works and what does not
> in the [issues](https://github.com/guim31/gladys-lametric/issues).

## Features

- **One device per clock** (up to three, each with its own API key):
  brightness (0-100) and automatic brightness, screen on/off (firmware 3+),
  screensaver (TIME), volume and Bluetooth (TIME: the SKY has neither), Wi-Fi
  signal, the app on screen, and push buttons: next / previous app, clear the
  notifications, start / stop / reset the stopwatch and the timer, play /
  stop / next station on the radio (each when its app is installed).
- **Scene action "Show on the LaMetric"**: a text (scene variables allowed)
  with an icon of the LaMetric gallery (`i…` / `a…` code), one of the 48
  built-in sounds, a priority (information, warning, critical), a number of
  passes (0: until dismissed) and a duration; on one clock or on all.
- **Scene action "Start the LaMetric timer"**: the Timer app, for a duration
  chosen in the scene.
- **Dashboard widget** "LaMetric": brightness, volume, Wi-Fi, state, app on
  screen, firmware and update, and four buttons: **Previous**, **Next**,
  **Message…** (a form: text, icon, sound) and **Clear**.
- **Network search**: the clocks announce themselves over SSDP; through the
  mediated discovery of Gladys, the integration finds the address of a clock
  given by its API key only, and follows a clock whose address changed.
- A **Test the connection** button in the Configuration screen, and a
  connection status that names the clock and the problem.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later (the form behind the **Message…**
  button of the widget, GladysAssistant/Gladys#3168, shipped in 5.2.0).
- A LaMetric TIME or SKY on the local network of Gladys.
- The **API key** of each clock: [developer.lametric.com](https://developer.lametric.com)
  → sign in with the account of the LaMetric app → **Devices**.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-lametric`
   (or install **LaMetric** from the catalog once it is listed).
2. In **Configuration**, paste the API key of each clock; its address is
   optional (the network search finds it). Save, then click **Test the
   connection**.
3. Open the **Discover** tab and add the clocks.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every request goes to `https://<address>:4343/api/v2/…` with the API key in
  Basic authentication (user `dev`). The certificate of the clocks is
  self-signed: it is accepted for those requests only (`node:https`, no global
  setting).
- Every refresh interval (15 s to 5 min, 30 s by default, like Home
  Assistant), the container reads each clock with `GET /api/v2/device` and
  `GET /api/v2/device/apps` on its own timer: Gladys does not reliably poll
  external devices (GladysAssistant/Gladys#3198). The devices are still
  published with `should_poll: true` every minute, and the core's `onPoll` is
  a fallback that never doubles a reading.
- Only the changed values are published (the SDK deduplication), with a
  heartbeat every 6 hours; everything is sent again when a device is added in
  Gladys or when Gladys reconnects.
- Commands: `PUT /api/v2/device/display` (brightness, mode, screen,
  screensaver), `/audio`, `/bluetooth`, `/apps/next` and `/apps/prev`, the app
  actions (`POST /api/v2/device/apps/<package>/widgets/<id>/actions`, with
  `activate: true`), `POST` and `DELETE /api/v2/device/notifications`. A
  command is read back at once. No write is ever retried (a notification
  could show twice).
- Identity: the serial number of the clock (`serial_number`), so a clock
  keeps its device when it changes slot or address.
- SSDP: the manifest declares a search for
  `urn:schemas-upnp-org:device:LaMetric:1`; the core relays the answers, the
  integration reads the UPnP description of each clock (its serial number)
  from the address that answered. Automatic searches run at most every 5
  minutes, only when a clock needs one.

## Not verified without the hardware

- The SSDP answer and the UPnP description of a real clock: only the search
  target, the description port and two fields (`friendlyName`,
  `serialNumber`) are known from the Home Assistant tests;
  `test/fixtures/lametric/device-description.xml` is reconstructed.
- The `duration` of a notification frame, the `activate` flag of the app
  actions, and the radio actions on a real clock.
- The behavior of a SKY with the stopwatch, timer and radio apps (none in
  the published fixtures).

`scripts/probe.mjs` checks these on a real clock, read-only:
`LAMETRIC_API_KEY=<key> node scripts/probe.mjs <ip>` and
`node scripts/probe.mjs --ssdp`. It never prints the key and hides the
serial number, the MAC and IP addresses and the network names.

## Limitations

- Local network only; the cloud features of LaMetric are not used.
- Up to three clocks.
- No battery level: the device API reports none.
- The stopwatch, the timer and the radio report no state: push buttons only.
- No "My Data DIY" frames: the integration shows notifications.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and in-memory clocks (`test/helpers/fakeLaMetric.js`) built from the answers
of real clocks (`test/fixtures/lametric/`); `test/http.test.js` serves one in
HTTPS on the loopback interface, with a self-signed certificate generated at
test time. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [python-demetriek](https://github.com/frenck/python-demetriek) by Franck
  Nijhof (MIT): the reference client of the LaMetric device API; its test
  fixtures, anonymized, are the answers of `test/fixtures/lametric/`, and its
  list of sounds and models is reused.
- Home Assistant's
  [`lametric`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/lametric)
  integration (Apache-2.0): the choice of features, the SSDP search target,
  the notification options, and the `computer_powered` fixture.
- The [LaMetric developer documentation](https://lametric-documentation.readthedocs.io)
  of the device API.
- The architecture and the conformity tests follow
  [gladys-wled](https://github.com/guim31/gladys-wled) and
  [gladys-pihole](https://github.com/guim31/gladys-pihole).

## Disclaimer

This project is not affiliated with LaMetric, nor endorsed or sponsored by
it. "LaMetric", "LaMetric TIME" and "LaMetric SKY" are trademarks of their
owner.

## License

Apache-2.0
