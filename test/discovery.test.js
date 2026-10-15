// -----------------------------------------------------------------------------
// The network search: the SSDP answers relayed by the core, the UPnP
// description of each clock, and what the hub does with them (an address for
// a slot that only has a key, a clock that moved, a clock still to configure).
// No timer runs in these worlds: the tests drive the cycles.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  SSDP_SEARCH_TARGET,
  discoverClocks,
  parseDescription,
  parseSsdpHeaders,
  ssdpCandidates,
} from '../src/discovery.js';
import { createNetwork, fixtureText } from './helpers/fakeLaMetric.js';
import { API_KEY, FakeLaMetric, IP_1, IP_2, OTHER_KEY, createWorld, ids } from './helpers/world.js';

const answer = (ip, headers = fixtureText('ssdp-response.txt').replaceAll('192.0.2.10', ip)) => ({
  source_ip: ip,
  source_port: 1900,
  headers,
});

test('the SSDP answer of a LaMetric', () => {
  const headers = parseSsdpHeaders(fixtureText('ssdp-response.txt'));
  assert.equal(headers.st, SSDP_SEARCH_TARGET);
  assert.match(headers.location, /^http:\/\/192\.0\.2\.10:44057\/.*device_description\.xml$/);
});

test('only the LaMetric answers count, one per address, described by that address only', () => {
  const candidates = ssdpCandidates([
    answer(IP_1),
    answer(IP_1),
    answer(
      '192.0.2.30',
      'HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nLOCATION: http://192.0.2.30/\r\n',
    ),
    answer(IP_2, `ST: ${SSDP_SEARCH_TARGET}\r\nLOCATION: http://198.51.100.1:44057/desc.xml\r\n`),
    { source_ip: 'not-an-ip', headers: `ST: ${SSDP_SEARCH_TARGET}` },
    null,
  ]);
  assert.deepEqual(candidates, [
    {
      address: IP_1,
      location:
        'http://192.0.2.10:44057/465d585b-1c05-444a-b14e-6ffb875b46a6/device_description.xml',
    },
    { address: IP_2, location: null },
  ]);
  assert.deepEqual(ssdpCandidates(undefined), []);
});

test('the UPnP description: serial number, name, model', () => {
  assert.deepEqual(parseDescription(fixtureText('device-description.xml')), {
    serial: 'SA0000000000TEST001',
    name: 'LaMetric Time (LM0001)',
    model: 'LaMetric Time',
  });
  assert.deepEqual(parseDescription('<friendlyName>A &amp; B</friendlyName>'), {
    serial: null,
    name: 'A & B',
    model: null,
  });
});

test('discoverClocks asks the core, then reads each description', async () => {
  const network = createNetwork({
    [IP_1]: new FakeLaMetric(),
    [IP_2]: new FakeLaMetric({ serial: 'SA0000000000TEST005', name: 'Kitchen' }),
  });
  const gladys = createFakeGladys({ scanResults: { ssdp: network.ssdpResults() } });
  await gladys.connect();
  const found = await discoverClocks(gladys, { request: network.request });
  assert.deepEqual(found, [
    {
      address: IP_1,
      serial: 'SA0000000000TEST001',
      name: 'LaMetric Time (Living room)',
      model: 'LaMetric Time',
    },
    {
      address: IP_2,
      serial: 'SA0000000000TEST005',
      name: 'LaMetric Time (Kitchen)',
      model: 'LaMetric Time',
    },
  ]);
  assert.deepEqual(gladys.fake.scans.at(-1), { type: 'ssdp', timeout_seconds: 5 });
});

test('an API key without address: the clock that accepts the key gets the slot', async () => {
  const w = await createWorld({
    clocks: {
      [IP_1]: new FakeLaMetric({ apiKey: OTHER_KEY, serial: 'SA0000000000TEST005' }),
      [IP_2]: new FakeLaMetric(),
    },
    config: { clock_1_api_key: API_KEY, language: 'en' },
  });
  assert.equal(w.hub.records.get(1).address.host, IP_2);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.discoveredDevices[0].external_id, ids(w.gladys).device);
  assert.deepEqual(w.fake.discoveredDevices[0].params[0], {
    name: 'LAMETRIC_ADDRESS',
    value: IP_2,
  });
});

test('a key without address and no clock on the network: the status says so', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ announces: false }) },
    config: { clock_1_api_key: API_KEY, language: 'en' },
  });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(
    w.fake.connectionStatus.message.en,
    'LaMetric 1: not found on the network: enter its address',
  );
  assert.deepEqual(w.fake.discoveredDevices, []);
});

test('a clock that moved (DHCP) is found again by its serial number', async () => {
  const clock = new FakeLaMetric();
  const w = await createWorld({ clocks: { [IP_1]: clock } });
  assert.equal(w.hub.records.get(1).address.host, IP_1);

  // The router gives it another address.
  w.network.clocks = { [IP_2]: clock };
  w.updateSsdp();
  await w.hub.refresh();
  assert.equal(w.hub.records.get(1).address.host, IP_2, 'followed at once');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.discoveredDevices[0].params[0], {
    name: 'LAMETRIC_ADDRESS',
    value: IP_2,
  });
});

test('the automatic search runs at most every 5 minutes', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ announces: false }) },
    config: { clock_1_api_key: API_KEY, language: 'en' },
  });
  const scans = () => w.fake.scans.length;
  assert.equal(scans(), 1);
  await w.hub.refresh();
  w.clock.advance(60_000);
  await w.hub.refresh();
  assert.equal(scans(), 1);
  w.clock.advance(4 * 60_000);
  await w.hub.refresh();
  assert.equal(scans(), 2);
  // The Discover tab searches at once.
  await w.fake.scanRequest();
  assert.equal(scans(), 3);
});

test('a Gladys that refuses the search: the configured addresses still work', async () => {
  const w = await createWorld({ connect: false });
  w.gladys.scanNetwork = async () => {
    throw new Error('HTTP 403');
  };
  await w.gladys.connect();
  await w.app.ready;
  await w.fake.scanRequest();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const report = await w.fake.action('test_connection', {});
  assert.match(report.data.message.en, /OK, LaMetric TIME \(sa8\).* not available on this Gladys/);
});
