// -----------------------------------------------------------------------------
// Reading the answers of real clocks (test/fixtures/lametric/), and the
// notification body sent to them.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPS,
  SOUNDS,
  buildNotification,
  parseApps,
  parseDevice,
  parseIcon,
  parseWhole,
} from '../src/lametric/model.js';
import { ERROR_KINDS } from '../src/lametric/client.js';
import { fixture } from './helpers/fakeLaMetric.js';

test('a TIME on firmware 3 (sa8)', () => {
  const snapshot = parseDevice(fixture('device-time-fw3'));
  assert.deepEqual(snapshot, {
    serial: 'SA0000000000TEST001',
    name: 'Living room',
    model: 'sa8',
    modelName: 'TIME',
    firmware: '3.2.6',
    update: null,
    display: {
      brightness: 100,
      brightnessAuto: true,
      brightnessLimit: { min: 2, max: 100 },
      on: true,
      screensaver: true,
    },
    audio: { volume: 46, range: { min: 0, max: 100 } },
    bluetooth: { active: false },
    wifi: { signal: 64, ssid: 'HomeNetwork' },
  });
});

test('a TIME on firmware 2 (LM 37X8) has no screen switch', () => {
  const snapshot = parseDevice(fixture('device-time-fw2'));
  assert.equal(snapshot.modelName, 'TIME');
  assert.equal(snapshot.display.on, null, 'no display.on before firmware 3');
  assert.deepEqual(snapshot.audio, { volume: 46, range: { min: 0, max: 100 } });
  assert.equal(snapshot.wifi.signal, 18);
});

test('a SKY has no speaker, no Bluetooth, no screensaver', () => {
  const snapshot = parseDevice(fixture('device-sky'));
  assert.equal(snapshot.modelName, 'SKY');
  assert.equal(snapshot.audio, null);
  assert.equal(snapshot.bluetooth, null);
  assert.equal(snapshot.display.screensaver, null);
  assert.equal(snapshot.display.brightness, 8);
  assert.equal(snapshot.display.brightnessAuto, false);
});

test('a TIME reconnecting to its Wi-Fi keeps its signal, loses its network name', () => {
  const snapshot = parseDevice(fixture('device-wifi-connecting'));
  assert.equal(snapshot.wifi.signal, 18);
  assert.equal(snapshot.wifi.ssid, null);
});

test('a TIME on a computer: brightness limited, Wi-Fi in ssid/rssi', () => {
  const snapshot = parseDevice(fixture('device-computer-powered'));
  assert.deepEqual(snapshot.display.brightnessLimit, { min: 2, max: 76 });
  assert.equal(snapshot.wifi.signal, 78);
  assert.equal(snapshot.wifi.ssid, 'My wifi');
  assert.equal(snapshot.firmware, '3.1.3');
});

test('an update offered by the clock is read', () => {
  const raw = { ...fixture('device-time-fw3'), update_available: { version: '3.3.0' } };
  assert.equal(parseDevice(raw).update, '3.3.0');
});

test('an answer that is not a LaMetric state is refused', () => {
  for (const raw of [null, {}, { serial_number: 'X' }, { display: {} }, []]) {
    assert.throws(
      () => parseDevice(raw),
      (err) => err.kind === ERROR_KINDS.INVALID,
    );
  }
});

test('the apps: the widget of each driven app, the app on screen', () => {
  const apps = parseApps(fixture('apps-time-fw3'));
  assert.deepEqual(apps.widgets, {
    stopwatch: { package: APPS.stopwatch.package, widgetId: '5_com.lametric.stopwatch' },
    timer: { package: APPS.timer.package, widgetId: '6_com.lametric.countdown' },
    radio: { package: APPS.radio.package, widgetId: '4_com.lametric.radio' },
  });
  assert.equal(apps.current, 'Clock');
});

test('firmware 2 names its widgets by hash; a DIY widget can be on screen', () => {
  const apps = parseApps(fixture('apps-time-fw2'));
  assert.equal(apps.widgets.timer.widgetId, 'f03ea1ae1ae5f85b390b460f55ba8061');
  assert.equal(apps.current, 'My Data DIY');
});

test('an app without the actions the integration needs is left out', () => {
  const raw = fixture('apps-time-fw3');
  delete raw['com.lametric.radio'].actions['radio.next'];
  delete raw['com.lametric.stopwatch'];
  const apps = parseApps(raw);
  assert.equal(apps.widgets.radio, null);
  assert.equal(apps.widgets.stopwatch, null);
  assert.ok(apps.widgets.timer);
  assert.deepEqual(parseApps(null), {
    widgets: { stopwatch: null, timer: null, radio: null },
    current: null,
  });
});

test('icons: the codes of the gallery, still or animated, or a bare number', () => {
  assert.deepEqual(parseIcon('a7956'), { icon: 'a7956', invalid: false });
  assert.deepEqual(parseIcon(' I2867 '), { icon: 'i2867', invalid: false });
  assert.deepEqual(parseIcon('2867'), { icon: 2867, invalid: false });
  assert.deepEqual(parseIcon('#2867'), { icon: 2867, invalid: false });
  assert.deepEqual(parseIcon(3219), { icon: 3219, invalid: false });
  assert.deepEqual(parseIcon(''), { icon: null, invalid: false });
  assert.deepEqual(parseIcon(undefined), { icon: null, invalid: false });
  assert.deepEqual(parseIcon('sun'), { icon: null, invalid: true });
  assert.deepEqual(parseIcon('https://example.com/a.png'), { icon: null, invalid: true });
});

test('the notification body follows the device API', () => {
  const { body, warnings } = buildNotification({
    text: '  Dinner\nis ready  ',
    icon: 'a7956',
    sound: 'positive1',
    priority: 'warning',
    repeat: 2,
    duration: 5,
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(body, {
    priority: 'warning',
    icon_type: 'none',
    model: {
      frames: [{ text: 'Dinner is ready', icon: 'a7956', duration: 5000 }],
      cycles: 2,
      sound: { category: 'notifications', id: 'positive1', repeat: 1 },
    },
  });
});

test('the defaults: info, shown once, no sound, the duration of the clock', () => {
  assert.deepEqual(buildNotification({ text: 'Hi', sound: 'none', duration: '' }).body, {
    priority: 'info',
    icon_type: 'none',
    model: { frames: [{ text: 'Hi' }], cycles: 1 },
  });
});

test('alarms play as alarms; a SKY gets no sound', () => {
  assert.deepEqual(buildNotification({ text: 'Up', sound: 'alarm3' }).body.model.sound, {
    category: 'alarms',
    id: 'alarm3',
    repeat: 1,
  });
  assert.equal(
    buildNotification({ text: 'Up', sound: 'alarm3' }, { hasAudio: false }).body.model.sound,
    undefined,
  );
});

test('0 passes means until dismissed; out of range values are brought in range', () => {
  assert.equal(buildNotification({ text: 'a', repeat: 0 }).body.model.cycles, 0);
  assert.equal(buildNotification({ text: 'a', repeat: 99 }).body.model.cycles, 10);
  assert.equal(buildNotification({ text: 'a', repeat: '3' }).body.model.cycles, 3);
  assert.equal(
    buildNotification({ text: 'a', duration: 9999 }).body.model.frames[0].duration,
    300_000,
  );
  assert.equal(buildNotification({ text: 'a', priority: 'urgent' }).body.priority, 'info');
});

test('an unknown icon or sound is left out and reported; an empty text is refused', () => {
  const { body, warnings } = buildNotification({ text: 'a', icon: 'sun', sound: 'trumpet' });
  assert.deepEqual(body.model, { frames: [{ text: 'a' }], cycles: 1 });
  assert.deepEqual(warnings, ['icon', 'sound']);
  for (const text of ['', '   ', '\n\t', undefined, null]) {
    assert.throws(() => buildNotification({ text }), RangeError);
  }
  assert.equal(buildNotification({ text: 42 }).body.model.frames[0].text, '42');
  assert.equal(buildNotification({ text: 'x'.repeat(900) }).body.model.frames[0].text.length, 500);
});

test('the sound list is the one of the device', () => {
  assert.equal(SOUNDS.length, 48);
  assert.equal(new Set(SOUNDS.map((sound) => sound.id)).size, 48);
  assert.ok(SOUNDS.some((sound) => sound.id === 'knock-knock'));
});

test('whole numbers typed in a form', () => {
  const range = { min: 0, max: 59, fallback: 7 };
  assert.equal(parseWhole('12', range), 12);
  assert.equal(parseWhole('2,6', range), 3);
  assert.equal(parseWhole(-4, range), 0);
  assert.equal(parseWhole('abc', range), 7);
  assert.equal(parseWhole(undefined, range), 7);
});
