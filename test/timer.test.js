// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys never polls a device created
// without should_poll (GladysAssistant/Gladys#3198, not fixed in 5.2.1): the
// clocks must be read by the hub's own timer, with no onPoll at all; the
// core's onPoll stays a fallback that never doubles the readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_TIMINGS } from '../src/hub.js';
import { API_KEY, FakeLaMetric, IP_1, createAll, createWorld, ids } from './helpers/world.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

async function timedWorld(t, { interval = 30 } = {}) {
  // Date too: the SDK dates the published states (heartbeat) with Date.now.
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 15, 10) });
  const clock = { now: () => Date.now() };
  const lametric = new FakeLaMetric();
  const w = await createWorld({
    clock,
    clocks: { [IP_1]: lametric },
    config: { clock_1_address: IP_1, clock_1_api_key: API_KEY, poll_interval: String(interval) },
    timers: true,
  });
  t.after(() => w.app.stop());
  await createAll(w);
  const reads = () => lametric.requests.filter((r) => r.path === '/api/v2/device').length;
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  return { ...w, lametric, reads, tick };
}

test('the internal timer reads the clocks without any onPoll from Gladys', async (t) => {
  const w = await timedWorld(t);
  const polled = t.mock.method(w.hub, 'pollDevice');
  const before = w.reads();
  for (const signal of [50, 55, 60]) {
    w.lametric.device.wifi.strength = signal;
    await w.tick(30_000);
    assert.equal(w.fake.lastState(ids(w.gladys).feature('wifi_signal')), signal);
  }
  assert.equal(w.reads() - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('the interval of the configuration is followed', async (t) => {
  const w = await timedWorld(t, { interval: 120 });
  const before = w.reads();
  await w.tick(60_000);
  assert.equal(w.reads(), before);
  await w.tick(60_000);
  assert.equal(w.reads(), before + 1);
});

test("the core's onPoll right after the timer does not read the clock again", async (t) => {
  const w = await timedWorld(t);
  const device = w.fake.discoveredDevices[0];
  await w.tick(30_000);
  const before = w.reads();
  await w.tick(10_000);
  await w.fake.poll(device);
  assert.equal(w.reads(), before, 'the timer read it 10 s ago');

  // The timer stalls: the core takes over, once a period.
  w.app.stop();
  await w.tick(20_000);
  await w.fake.poll(device);
  assert.equal(w.reads(), before + 1);
});

test('a core poll arriving between two timer readings is not doubled', async (t) => {
  const w = await timedWorld(t);
  const device = w.fake.discoveredDevices[0];
  const before = w.reads();
  await w.tick(29_000);
  await w.fake.poll(device); // 29 s after the start reading: due for the core
  assert.equal(w.reads(), before + 1);
  await w.tick(1_000); // the timer, 1 s later: skipped
  assert.equal(w.reads(), before + 1);
  await w.tick(30_000);
  assert.equal(w.reads(), before + 2);
});

test('unchanged values are sent again once per heartbeat (no "no recent value")', async (t) => {
  const w = await timedWorld(t);
  const first = w.fake.states.length;
  await w.tick(30_000);
  assert.equal(w.fake.states.length, first, 'nothing changed, nothing sent');
  assert.ok(HUB_TIMINGS.heartbeatMs <= 12 * 60 * 60_000);
  await w.tick(HUB_TIMINGS.heartbeatMs);
  assert.ok(w.fake.states.length >= first * 2, 'everything sent again');
});

test('the timer stops with the integration', async (t) => {
  const w = await timedWorld(t);
  await w.fake.shutdown();
  const before = w.lametric.requests.length;
  await w.tick(10 * 60_000);
  assert.equal(w.lametric.requests.length, before);
});
