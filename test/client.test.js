// -----------------------------------------------------------------------------
// The device API client, against the fake clock: what it sends, and how it
// tells the problems apart (the user is told what to do about each one).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, LaMetricClient, errorMessage } from '../src/lametric/client.js';
import { API_KEY, FakeLaMetric, createNetwork } from './helpers/fakeLaMetric.js';

const IP = '192.0.2.10';

function setup(options) {
  const clock = new FakeLaMetric(options);
  const network = createNetwork({ [IP]: clock });
  const client = new LaMetricClient({ host: IP, apiKey: API_KEY, request: network.request });
  return { clock, network, client };
}

test('requests go to https://<ip>:4343 with the key in Basic auth (user dev)', async () => {
  const { client, network } = setup();
  await client.getDevice();
  const [request] = network.log;
  assert.equal(request.url, 'https://192.0.2.10:4343/api/v2/device');
  assert.equal(
    request.headers.authorization,
    `Basic ${Buffer.from(`dev:${API_KEY}`).toString('base64')}`,
  );
});

test('the key never shows in the client, its JSON or its messages', async () => {
  const { client } = setup({ apiKey: 'another' });
  assert.ok(!JSON.stringify(client).includes(API_KEY));
  assert.ok(!Object.keys(client).includes('authorization'));
  await assert.rejects(client.getDevice(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.AUTH);
    assert.ok(!err.message.includes(API_KEY));
    assert.ok(!err.message.includes(Buffer.from(`dev:${API_KEY}`).toString('base64')));
    return true;
  });
});

test('the writes', async () => {
  const { client, clock } = setup();
  await client.setDisplay({ brightness: 40, brightness_mode: 'manual' });
  await client.setVolume(20);
  await client.setBluetooth(true);
  await client.nextApp();
  await client.previousApp();
  await client.appAction(
    { package: 'com.lametric.countdown', widgetId: '6_com.lametric.countdown' },
    'countdown.configure',
    { duration: 90, start_now: true },
  );
  assert.deepEqual(
    clock.requests.map(({ method, path }) => `${method} ${path}`),
    [
      'PUT /api/v2/device/display',
      'PUT /api/v2/device/audio',
      'PUT /api/v2/device/bluetooth',
      'PUT /api/v2/device/apps/next',
      'PUT /api/v2/device/apps/prev',
      'POST /api/v2/device/apps/com.lametric.countdown/widgets/6_com.lametric.countdown/actions',
    ],
  );
  assert.deepEqual(clock.actions, [
    {
      package: 'com.lametric.countdown',
      widgetId: '6_com.lametric.countdown',
      id: 'countdown.configure',
      params: { duration: 90, start_now: true },
      activate: true,
    },
  ]);
  assert.equal(clock.device.display.brightness, 40);
  assert.equal(clock.device.audio.volume, 20);
  assert.equal(clock.device.bluetooth.active, true);
});

test('a notification gets its id; clearing dismisses the queue from the last one', async () => {
  const { client, clock } = setup();
  const body = {
    priority: 'info',
    icon_type: 'none',
    model: { frames: [{ text: 'a' }], cycles: 1 },
  };
  assert.equal(await client.notify(body), '1');
  assert.equal(await client.notify(body), '2');
  assert.equal(await client.dismissAll(), 2);
  assert.deepEqual(
    clock.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/v2/device/notifications/2', '/api/v2/device/notifications/1'],
  );
  assert.equal(clock.notifications.length, 0);
  assert.equal(await client.dismissAll(), 0);
});

test('an app widget that is gone is a refusal, with the message of the clock', async () => {
  const { client } = setup();
  await assert.rejects(
    client.appAction({ package: 'com.lametric.radio', widgetId: 'gone' }, 'radio.play'),
    (err) => {
      assert.equal(err.kind, ERROR_KINDS.REFUSED);
      assert.equal(err.status, 404);
      assert.match(err.message, /Not found/);
      return true;
    },
  );
});

test('the problems are told apart', async () => {
  const answers = [
    [{ status: 503, body: '' }, ERROR_KINDS.UNREACHABLE],
    [{ status: 500, body: '{"errors":[{"message":"Boom"}]}' }, ERROR_KINDS.REFUSED],
    [{ status: 403, body: '' }, ERROR_KINDS.AUTH],
    [{ status: 200, body: '<html>router</html>' }, ERROR_KINDS.INVALID],
  ];
  for (const [answer, kind] of answers) {
    const client = new LaMetricClient({
      host: IP,
      apiKey: API_KEY,
      request: async () => ({ headers: {}, ...answer }),
    });
    await assert.rejects(client.getDevice(), (err) => err.kind === kind, kind);
  }
  const silent = new LaMetricClient({
    host: IP,
    apiKey: API_KEY,
    request: async () => {
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  });
  await assert.rejects(silent.getDevice(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.UNREACHABLE);
    assert.equal(err.message, '192.0.2.10 does not answer (timeout)');
    return true;
  });
});

test('the error messages of the device API', () => {
  assert.equal(errorMessage('{"errors":[{"message":"A"},{"message":"B"}]}'), 'A; B');
  assert.equal(errorMessage('{"error":{"message":"Web"}}'), 'Web');
  assert.equal(errorMessage('{"errors":"x"}'), null);
  assert.equal(errorMessage('not json'), null);
});
