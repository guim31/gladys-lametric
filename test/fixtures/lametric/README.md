# LaMetric fixtures

Answers of real LaMetric clocks to the local device API v2, as published by
the tests of [python-demetriek](https://github.com/frenck/python-demetriek)
(MIT, © Franck Nijhof) and of the
[Home Assistant `lametric` integration](https://github.com/home-assistant/core/tree/dev/tests/components/lametric)
(Apache-2.0). Anonymized: serial numbers, MAC addresses, IP addresses
(`192.0.2.x`, RFC 5737), Wi-Fi names and Bluetooth names are invented.

| File                           | Source                                  | What it shows                                                                    |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------- |
| `device-time-fw2.json`         | demetriek `device_lm37x8.json`          | TIME `LM 37X8`, firmware 2.3.9: no `display.on`, no `audio.available`            |
| `device-time-fw3.json`         | demetriek `device_sa8.json`             | TIME `sa8`, firmware 3.2.6: `display.on`, screensaver, Bluetooth                 |
| `device-sky.json`              | demetriek `device_sa5.json`             | SKY `sa5`, firmware 3.2.7: no speaker, no Bluetooth, no screensaver              |
| `device-wifi-connecting.json`  | demetriek `device_wifi_connecting.json` | a TIME reconnecting to its Wi-Fi (home-assistant/core#97575): null Wi-Fi details |
| `device-computer-powered.json` | Home Assistant `computer_powered.json`  | a TIME on a computer's USB port: brightness limited to 76, Wi-Fi `ssid` / `rssi` |
| `apps-time-fw3.json`           | demetriek `apps_sa8.json`               | installed apps (clock, timer, stopwatch, radio, weather...)                      |
| `apps-time-fw2.json`           | demetriek `apps_lm37x8.json`            | the same on firmware 2: hashed widget ids, a visible My Data DIY widget          |
| `display-set.json`             | demetriek `display_set.json`            | answer of `PUT /api/v2/device/display`                                           |
| `audio-set.json`               | demetriek `audio_set.json`              | answer of `PUT /api/v2/device/audio`                                             |
| `bluetooth-set.json`           | demetriek `bluetooth_set.json`          | answer of `PUT /api/v2/device/bluetooth`                                         |
| `notification-created.json`    | demetriek `notification.json`           | answer of `POST /api/v2/device/notifications`                                    |
| `notification-queue.json`      | demetriek `notification_queue_sa8.json` | `GET /api/v2/device/notifications` on a TIME `sa8`                               |
| `app-action.json`              | demetriek `app_action.json`             | answer of an app action                                                          |
| `apps-next.json`               | demetriek `apps_next.json`              | answer of `PUT /api/v2/device/apps/next`                                         |
| `ssdp-response.txt`            | reconstructed                           | SSDP answer, after the discovery data of the Home Assistant config flow tests    |
| `device-description.xml`       | reconstructed                           | UPnP description: only `friendlyName` and `serialNumber` come from those tests   |

The two reconstructed files follow the UPnP format and the values the Home
Assistant tests use (`ssdp_location` on port 44057, `friendlyName`
`LaMetric Time (LM1245)`, a `serialNumber`); the other fields are
assumptions, to be checked against a real clock (`scripts/probe.mjs`).
