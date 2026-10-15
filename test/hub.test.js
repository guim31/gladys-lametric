// -----------------------------------------------------------------------------
// The integration end to end, on the SDK's fake Gladys and fake clocks:
// discovery, states, commands of the dashboard, connection status,
// reconfiguration. No timer runs here (see test/timer.test.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY,
  FakeLaMetric,
  IP_1,
  IP_2,
  createAll,
  createWorld,
  fixture,
  ids,
} from './helpers/world.js';

const featureOf = (world, key) => {
  const device = world.fake.discoveredDevices[0];
  return { device, feature: device.features.find((f) => f.external_id.endsWith(`:${key}`)) };
};

async function setValue(world, key, value) {
  const { device, feature } = featureOf(world, key);
  return world.fake.setValue(device, feature, value);
}

test('one device per clock, named after the clock, with what this model has', async () => {
  const w = await createWorld();
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.name, 'Living room');
  assert.equal(device.external_id, 'ext:test-integration:lametric:sa0000000000test001');
  assert.deepEqual(device.params, [
    { name: 'LAMETRIC_ADDRESS', value: IP_1 },
    { name: 'LAMETRIC_MODEL', value: 'LaMetric TIME (sa8)' },
  ]);
  assert.deepEqual(
    device.features.map((f) => [f.external_id.split(':').pop(), f.name]),
    [
      ['brightness', 'Brightness'],
      ['brightness_auto', 'Automatic brightness'],
      ['display', 'Screen'],
      ['screensaver', 'Screensaver'],
      ['volume', 'Volume'],
      ['bluetooth', 'Bluetooth'],
      ['wifi_signal', 'Wi-Fi signal'],
      ['current_app', 'App on screen'],
      ['next_app', 'Next app'],
      ['previous_app', 'Previous app'],
      ['dismiss_notifications', 'Clear notifications'],
      ['stopwatch_start', 'Start the stopwatch'],
      ['stopwatch_pause', 'Stop the stopwatch'],
      ['stopwatch_reset', 'Reset the stopwatch'],
      ['timer_start', 'Start the timer'],
      ['timer_pause', 'Stop the timer'],
      ['timer_reset', 'Reset the timer'],
      ['radio_play', 'Play the radio'],
      ['radio_stop', 'Stop the radio'],
      ['radio_next', 'Next radio station'],
    ],
  );
  assert.equal(device.should_poll, true);
  assert.equal(device.poll_frequency, 60_000);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a SKY: no volume, no Bluetooth, no screensaver, and no apps list', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ device: 'device-sky', apps: null }) },
  });
  const keys = w.fake.discoveredDevices[0].features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, [
    'brightness',
    'brightness_auto',
    'display',
    'wifi_signal',
    'current_app',
    'next_app',
    'previous_app',
    'dismiss_notifications',
  ]);
  assert.deepEqual(w.fake.connectionStatus, { connected: true }, 'the apps are optional');
});

test('the states of a device added to Gladys, and only of it', async () => {
  const w = await createWorld();
  assert.equal(w.fake.states.length, 0, 'nothing before the device exists in Gladys');
  await createAll(w);
  const id = ids(w.gladys);
  assert.equal(w.fake.lastState(id.feature('brightness')), 100);
  assert.equal(w.fake.lastState(id.feature('brightness_auto')), 1);
  assert.equal(w.fake.lastState(id.feature('display')), 1);
  assert.equal(w.fake.lastState(id.feature('screensaver')), 1);
  assert.equal(w.fake.lastState(id.feature('volume')), 46);
  assert.equal(w.fake.lastState(id.feature('bluetooth')), 0);
  assert.equal(w.fake.lastState(id.feature('wifi_signal')), 64);
  assert.equal(w.fake.lastState(id.feature('current_app')), 'Clock');
  assert.equal(w.fake.states.length, 8, 'the push buttons have no state');
});

test('only what changed is published again', async () => {
  const w = await createWorld();
  await createAll(w);
  const before = w.fake.states.length;
  await w.hub.refresh();
  assert.equal(w.fake.states.length, before);
  w.network.clocks[IP_1].device.wifi.strength = 70;
  await w.hub.refresh();
  assert.deepEqual(w.fake.states.slice(before), [
    { device_feature_external_id: ids(w.gladys).feature('wifi_signal'), state: 70 },
  ]);
});

test('brightness: a value within the limit of the clock, automatic brightness off', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ device: 'device-computer-powered' }) },
  });
  await createAll(w);
  const clock = w.network.clocks[IP_1];
  const id = ids(w.gladys, 'SA0000000000TEST002');
  assert.deepEqual(await setValue(w, 'brightness', 100), { success: true });
  assert.equal(clock.device.display.brightness, 76, 'the USB limit');
  assert.equal(clock.device.display.brightness_mode, 'manual');
  assert.equal(w.fake.lastState(id.feature('brightness')), 76, 'read back');
  assert.equal(w.fake.lastState(id.feature('brightness_auto')), 0);
  await setValue(w, 'brightness', 0);
  assert.equal(clock.device.display.brightness, 2);
});

test('the switches: automatic brightness, screen, screensaver, Bluetooth; the volume', async () => {
  const w = await createWorld();
  await createAll(w);
  const clock = w.network.clocks[IP_1];
  const id = ids(w.gladys);
  await setValue(w, 'brightness_auto', 0);
  assert.equal(clock.device.display.brightness_mode, 'manual');
  await setValue(w, 'display', 0);
  assert.equal(clock.device.display.on, false);
  assert.equal(w.fake.lastState(id.feature('display')), 0);
  await setValue(w, 'screensaver', 0);
  assert.equal(clock.device.display.screensaver.enabled, false);
  await setValue(w, 'bluetooth', 1);
  assert.equal(clock.device.bluetooth.active, true);
  assert.equal(w.fake.lastState(id.feature('bluetooth')), 1);
  await setValue(w, 'volume', 25);
  assert.equal(clock.device.audio.volume, 25);
  assert.equal(w.fake.lastState(id.feature('volume')), 25);
});

test('the push buttons: apps, notifications, stopwatch, timer, radio', async () => {
  const w = await createWorld();
  await createAll(w);
  const clock = w.network.clocks[IP_1];
  const id = ids(w.gladys);

  await setValue(w, 'next_app', 1);
  assert.equal(w.fake.lastState(id.feature('current_app')), 'Weather', 'the next widget');
  await setValue(w, 'previous_app', 1);
  assert.equal(w.fake.lastState(id.feature('current_app')), 'Clock');

  clock.notifications.push({ id: '7', model: { frames: [{ text: 'x' }] } });
  await setValue(w, 'dismiss_notifications', 1);
  assert.equal(clock.notifications.length, 0);

  for (const key of [
    'stopwatch_start',
    'stopwatch_pause',
    'stopwatch_reset',
    'timer_start',
    'timer_pause',
    'timer_reset',
    'radio_play',
    'radio_stop',
    'radio_next',
  ]) {
    assert.deepEqual(await setValue(w, key, 1), { success: true }, key);
  }
  assert.deepEqual(
    clock.actions.map((a) => `${a.widgetId} ${a.id} ${a.activate}`),
    [
      '5_com.lametric.stopwatch stopwatch.start true',
      '5_com.lametric.stopwatch stopwatch.pause true',
      '5_com.lametric.stopwatch stopwatch.reset true',
      '6_com.lametric.countdown countdown.start true',
      '6_com.lametric.countdown countdown.pause true',
      '6_com.lametric.countdown countdown.reset true',
      '4_com.lametric.radio radio.play true',
      '4_com.lametric.radio radio.stop true',
      '4_com.lametric.radio radio.next true',
    ],
  );
});

test('a command on a clock that stopped answering fails with a readable message', async () => {
  const w = await createWorld();
  await createAll(w);
  w.network.clocks[IP_1].online = false;
  const answer = await setValue(w, 'volume', 10);
  assert.equal(answer.success, false);
  assert.equal(answer.error, 'LaMetric 1 (Living room): does not answer.');
});

test('a command for an app removed since the last reading says which app', async () => {
  const w = await createWorld({
    config: { clock_1_address: IP_1, clock_1_api_key: API_KEY, language: 'fr' },
  });
  await createAll(w);
  w.hub.records.get(1).apps.widgets.radio = null;
  const answer = await setValue(w, 'radio_play', 1);
  assert.equal(answer.success, false);
  assert.equal(
    answer.error,
    'L’application Radio n’est pas installée sur LaMetric 1 (Living room).',
  );
});

test('a clock that stops answering: the status says so, and its return clears it', async () => {
  const w = await createWorld();
  await createAll(w);
  const states = w.fake.states.length;
  w.network.clocks[IP_1].online = false;
  w.network.clocks[IP_1].announces = false;
  w.updateSsdp();
  await w.hub.refresh();
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: {
      en: 'LaMetric 1 (Living room): does not answer',
      fr: 'LaMetric 1 (Living room) : ne répond pas',
      de: 'LaMetric 1 (Living room): antwortet nicht',
      es: 'LaMetric 1 (Living room): no responde',
    },
  });
  assert.equal(w.fake.states.length, states, 'no stale state published');
  w.network.clocks[IP_1].online = true;
  await w.hub.refresh();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a refused key, an invalid address, a slot without key: one status line each', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ apiKey: 'another' }) },
    config: {
      clock_1_address: IP_1,
      clock_1_api_key: API_KEY,
      clock_2_address: IP_2,
      clock_3_address: 'ftp://x',
      clock_3_api_key: API_KEY,
      language: 'fr',
    },
  });
  assert.equal(
    w.fake.connectionStatus.message.en,
    'LaMetric 3: address not understood, e.g. 192.168.1.20; LaMetric 1: API key refused; ' +
      'LaMetric 2: enter its API key',
  );
  assert.deepEqual(w.fake.discoveredDevices, []);
});

test('nothing configured: the status asks for the API key', async () => {
  const w = await createWorld({ config: {} });
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: {
      en: 'Enter the API key of your LaMetric in the configuration.',
      fr: 'Saisissez la clé d’API de votre LaMetric dans la configuration.',
      de: 'Gib den API-Schlüssel deiner LaMetric in der Konfiguration ein.',
      es: 'Introduzca la clave de API de su LaMetric en la configuración.',
    },
  });
});

test('two slots naming the same clock make one device', async () => {
  const clock = new FakeLaMetric();
  const w = await createWorld({
    clocks: { [IP_1]: clock, [IP_2]: clock },
    config: {
      clock_1_address: IP_1,
      clock_1_api_key: API_KEY,
      clock_2_address: IP_2,
      clock_2_api_key: API_KEY,
      language: 'en',
    },
  });
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('an app installed later adds its buttons to the device', async () => {
  const clock = new FakeLaMetric({ apps: 'apps-time-fw3' });
  delete clock.apps['com.lametric.radio'];
  const w = await createWorld({ clocks: { [IP_1]: clock } });
  const count = () => w.fake.discoveredDevices[0].features.length;
  assert.equal(count(), 17);
  clock.apps['com.lametric.radio'] = fixture('apps-time-fw3')['com.lametric.radio'];
  await w.hub.refresh();
  assert.equal(count(), 20);
});

test('a device added again gets all its states at once', async () => {
  const w = await createWorld();
  await createAll(w);
  const first = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.equal(w.fake.states.length, first * 2);
  assert.ok(w.fake.widgetRefreshes.length >= 1, 'the widget is told');
});

test('Gladys restarts: everything is sent again on reconnection', async () => {
  const w = await createWorld();
  await createAll(w);
  const first = w.fake.states.length;
  const statuses = w.fake.connectionStatuses.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length, first * 2);
  assert.equal(w.fake.connectionStatuses.length, statuses + 1);
});

test('a new configuration: another clock, the language of the names', async () => {
  const w = await createWorld();
  w.network.clocks[IP_2] = new FakeLaMetric({ serial: 'SA0000000000TEST005', name: 'Kitchen' });
  await w.fake.configUpdated({
    clock_1_address: IP_1,
    clock_1_api_key: API_KEY,
    clock_2_address: IP_2,
    clock_2_api_key: API_KEY,
    language: 'de',
  });
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Living room', 'Kitchen'],
  );
  assert.equal(devices[1].features[0].name, 'Helligkeit');
});

test('onPoll from the core reads the clock, unless the timer just did', async () => {
  const w = await createWorld();
  await createAll(w);
  const reads = () =>
    w.network.clocks[IP_1].requests.filter((r) => r.path === '/api/v2/device').length;
  const device = w.fake.discoveredDevices[0];
  const before = reads();
  assert.deepEqual(await w.fake.poll(device), { success: true });
  assert.equal(reads(), before, 'read less than a period ago');
  w.clock.advance(30_000);
  assert.deepEqual(await w.fake.poll(device), { success: true });
  assert.equal(reads(), before + 1);
});
