// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once, a user action one line. Never an API key, at any
// level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY, FakeLaMetric, IP_1, createAll, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at a level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

const BASIC = Buffer.from(`dev:${API_KEY}`).toString('base64');

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  await createAll(w);
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();

  const clock = w.network.clocks[IP_1];
  for (let i = 0; i < 5; i += 1) {
    clock.device.wifi.strength = 60 + i;
    clock.device.display.brightness = 50 + i;
    clock.switchApp(1);
    w.clock.advance(30_000);
    await w.hub.refresh();
    await w.fake.widgetGet('lametric', { language: 'en' });
  }
  assert.deepEqual(logs.texts(), []);
});

test('a clock that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  logs.clear();
  const clock = w.network.clocks[IP_1];
  clock.online = false;
  clock.announces = false;
  w.updateSsdp();
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.refresh();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  assert.match(
    logs.lines[0].text,
    /\[WARN\].*LaMetric 1 \(Living room, 192\.0\.2\.10\): .*does not answer/,
  );

  logs.clear();
  clock.online = true;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /\[INFO\].*answers again/);
});

test('a refused key is logged once, its repeats only at debug, never the key', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ apiKey: 'the-right-one' }) },
  });
  for (let i = 0; i < 4; i += 1) {
    await w.hub.refresh();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /refused the API key/);
  const all = logs.texts().join('\n');
  assert.ok(!all.includes(API_KEY) && !all.includes(BASIC), 'never the key');
});

test('a user action writes one line', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  await createAll(w);
  logs.clear();
  const device = w.fake.discoveredDevices[0];
  const feature = device.features.find((f) => f.external_id.endsWith(':volume'));
  await w.fake.setValue(device, feature, 20);
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  logs.clear();
  await w.fake.sceneAction('show_notification', { text: 'Dinner is ready' });
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.ok(!logs.texts()[0].includes('Dinner'), 'the text itself only at debug');
});

test('LOG_LEVEL=debug shows the readings; never the API key, in any form', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await createWorld({
    config: { clock_1_api_key: API_KEY, clock_2_address: '192.0.2.99', clock_2_api_key: API_KEY },
  });
  await createAll(w);
  await w.hub.refresh();
  await w.hub.refresh();
  await w.fake.sceneAction('show_notification', { text: 'Hello', icon: 'nope', sound: 'cat' });
  await w.fake.action('test_connection', {});
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\]/);
  assert.match(text, /does not answer .*\(again\)/);
  assert.ok(!text.includes(API_KEY), 'never the key');
  assert.ok(!text.includes(BASIC), 'never the Basic authorization');
  assert.ok(!text.includes(API_KEY.slice(0, 16)), 'not even a part of it');
});
