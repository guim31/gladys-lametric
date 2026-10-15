# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- LaMetric TIME and LaMetric SKY clocks, over their local device API (API
  v2): up to three clocks, each with its API key, the address optional.
- One device per clock: brightness and automatic brightness, screen,
  screensaver, volume, Bluetooth, Wi-Fi signal, the app on screen, and push
  buttons for the next and previous app, clearing the notifications, the
  stopwatch, the timer and the radio (each when the clock has it).
- Scene action "Show on the LaMetric": a text with an icon, a sound, a
  priority, a number of passes and a duration, on one clock or on all.
- Scene action "Start the LaMetric timer", for a chosen duration.
- Dashboard widget "LaMetric": the state of a clock, previous and next app, a
  message written from a form, and clearing the notifications.
- Network search (SSDP, through Gladys): the address of a clock given by its
  API key only, and of a clock whose address changed.
- "Test the connection" button, and a connection status naming the clock and
  the problem.
- English, French, German and Spanish, documentation included.

[Unreleased]: https://github.com/guim31/gladys-lametric/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-lametric/releases/tag/v1.0.1
