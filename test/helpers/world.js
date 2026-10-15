// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake LaMetric clocks on a
// fake network and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless `timers: true` (with node:test mock
// timers): the tests read the clocks with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { deviceIds } from '../../src/devices.js';
import { API_KEY, FakeLaMetric, OTHER_KEY, createNetwork, fixture } from './fakeLaMetric.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const IP_1 = '192.0.2.10';
export const IP_2 = '192.0.2.11';
export const IP_3 = '192.0.2.12';

/** A manual clock. */
export function createClock(start = Date.UTC(2026, 9, 15, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {Record<string, FakeLaMetric>} [options.clocks] by IP address
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.ssdp] the core relays the SSDP answers of the clocks
 */
export async function createWorld({
  clock = createClock(),
  clocks,
  config = { clock_1_address: IP_1, clock_1_api_key: API_KEY, language: 'en' },
  devices = [],
  connect = true,
  ssdp = true,
  timers = false,
  timings = {},
} = {}) {
  const network = createNetwork(clocks ?? { [IP_1]: new FakeLaMetric() });
  const gladys = createFakeGladys({
    config,
    devices,
    scanResults: { ssdp: ssdp ? network.ssdpResults() : [] },
  });
  const app = registerHandlers(gladys, {
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  const world = { gladys, fake: gladys.fake, network, app, hub: app.hub, clock };
  /** Make the core's SSDP answers follow the network (a clock added, moved...). */
  world.updateSsdp = () => {
    gladys.fake.scanResults.ssdp = ssdp ? network.ssdpResults() : [];
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** External ids of the clock with this serial number. */
export const ids = (gladys, serial = 'SA0000000000TEST001') => deviceIds(gladys, serial);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, FakeLaMetric, OTHER_KEY, fixture };
