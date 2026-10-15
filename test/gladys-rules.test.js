// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the answers of real clocks published by python-demetriek and Home
// Assistant): a TIME on firmware 2 and 3, a SKY, a TIME reconnecting to its
// Wi-Fi, a TIME on a computer's USB port, a clock without its apps list, in
// every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { API_KEY, FakeLaMetric, IP_1, IP_2, IP_3, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const threeClocks = (language) => ({
  clock_1_address: IP_1,
  clock_1_api_key: API_KEY,
  clock_2_address: IP_2,
  clock_2_api_key: API_KEY,
  clock_3_address: IP_3,
  clock_3_api_key: API_KEY,
  language,
});

const fleets = {
  'TIME firmware 3, SKY, TIME on USB': () => ({
    [IP_1]: new FakeLaMetric({ device: 'device-time-fw3' }),
    [IP_2]: new FakeLaMetric({ device: 'device-computer-powered', apps: 'apps-time-fw2' }),
    [IP_3]: new FakeLaMetric({ device: 'device-sky', apps: null }),
  }),
  'TIME firmware 2, reconnecting TIME, TIME without apps': () => ({
    [IP_1]: new FakeLaMetric({ device: 'device-time-fw2', apps: 'apps-time-fw2' }),
    [IP_2]: new FakeLaMetric({ device: 'device-wifi-connecting', serial: 'SA0000000000TEST005' }),
    [IP_3]: new FakeLaMetric({
      device: 'device-time-fw3',
      serial: 'SA0000000000TEST006',
      apps: null,
    }),
  }),
};

const scenarios = [];
for (const [fleet, clocks] of Object.entries(fleets)) {
  for (const language of ['en', 'fr', 'de', 'es']) {
    scenarios.push({ label: `${fleet}, ${language} names`, clocks, language });
  }
}

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { fake, app } = await createWorld({
      clocks: scenario.clocks(),
      config: threeClocks(scenario.language),
    });
    try {
      const devices = fake.discoveredDevices;
      assert.equal(devices.length, 3, 'one device per clock');

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
    } finally {
      app.stop();
    }
  });
}
