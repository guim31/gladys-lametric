import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, formatAddress, normalizeConfig, parseAddress } from '../src/config.js';

test('an address: an IP, a name, a port, or the URL copied from a browser', () => {
  assert.deepEqual(parseAddress('192.0.2.10'), { host: '192.0.2.10', port: 4343 });
  assert.deepEqual(parseAddress(' lametric.local '), { host: 'lametric.local', port: 4343 });
  assert.deepEqual(parseAddress('192.0.2.10:4344'), { host: '192.0.2.10', port: 4344 });
  assert.deepEqual(parseAddress('https://192.0.2.10:4343/api/v2'), {
    host: '192.0.2.10',
    port: 4343,
  });
  // The HTTP port of the clock (8080) is not the API: HTTPS 4343 instead.
  assert.deepEqual(parseAddress('http://192.0.2.10:8080'), { host: '192.0.2.10', port: 4343 });
  assert.deepEqual(parseAddress('[2001:db8::1]'), { host: '2001:db8::1', port: 4343 });
  assert.equal(formatAddress({ host: '2001:db8::1', port: 4343 }), '[2001:db8::1]');
});

test('an unusable address is refused, credentials included', () => {
  for (const raw of ['', '  ', 'ftp://192.0.2.10', 'https://dev:key@192.0.2.10', 'http://', 42]) {
    assert.equal(parseAddress(raw), null, String(raw));
  }
});

test('the address shown to the user', () => {
  assert.equal(formatAddress({ host: '192.0.2.10', port: 4343 }), '192.0.2.10');
  assert.equal(formatAddress({ host: '192.0.2.10', port: 4344 }), '192.0.2.10:4344');
});

test('the defaults', () => {
  assert.deepEqual(normalizeConfig(), {
    clocks: [],
    invalidSlots: [],
    pollIntervalMs: 30_000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig({}));
  assert.equal(DEFAULT_CONFIG.poll_interval, '30');
});

test('three slots: a key without address, an address without key, an invalid address', () => {
  const config = normalizeConfig({
    clock_1_address: '',
    clock_1_api_key: '  abc  ',
    clock_2_address: '192.0.2.11',
    clock_3_address: 'ftp://nope',
    clock_3_api_key: 'def',
    poll_interval: 60,
    language: 'de',
  });
  assert.deepEqual(config.clocks, [
    { slot: 1, address: null, apiKey: 'abc' },
    { slot: 2, address: { host: '192.0.2.11', port: 4343 }, apiKey: '' },
  ]);
  assert.deepEqual(config.invalidSlots, [3]);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'de');
});

test('an interval or a language outside the lists falls back to the default', () => {
  const config = normalizeConfig({ poll_interval: '7', language: 'it' });
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.language, 'fr');
});
