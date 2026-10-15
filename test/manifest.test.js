// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MANIFEST_ACTIONS } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES, POLL_INTERVALS } from '../src/config.js';
import { SSDP_SEARCH_TARGET } from '../src/discovery.js';
import { MAX_CYCLES, MAX_DURATION_SECONDS, NO_SOUND, PRIORITIES } from '../src/lametric/model.js';
import { MAX_TIMER_MINUTES, SCENE_ACTIONS } from '../src/scenes.js';
import { SOUND_OPTIONS } from '../src/sounds.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[...(manifest.actions ?? []), ...(manifest.scene_actions ?? [])].flatMap(
    (item) => item.fields ?? [],
  ),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const sceneAction = (key) => manifest.scene_actions.find((action) => action.key === key);
const field = (action, key) => action.fields.find((f) => f.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('identity: short name, local transport, the catalog categories', () => {
  assert.equal(manifest.name, 'LaMetric');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.type, 'device');
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['notifications', 'multimedia']);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-lametric/main/cover.png',
  );
});

test('Gladys 5.2.0 at least: widget, scene actions, and a widget button opening a form', () => {
  // Widgets and scene actions need 5.1.0; the form behind the "Message…"
  // button (GladysAssistant/Gladys#3168) shipped in 5.2.0.
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 2), manifest.gladys_version);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-lametric:${manifest.version}`);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the SSDP search is the one of LaMetric', () => {
  assert.deepEqual(manifest.network_discovery, [{ type: 'ssdp', st: SSDP_SEARCH_TARGET }]);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), Object.values(MANIFEST_ACTIONS));
  // An action applies no default and cannot fill a secret (Gladys#3154, #3155).
  for (const action of manifest.actions) {
    for (const f of action.fields ?? []) {
      assert.notEqual(f.type, 'secret', `${action.key}.${f.key}`);
    }
  }
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widget has a handler, and vice versa', () => {
  const declared = keysOf(manifest.widgets);
  assert.deepEqual(declared, Object.keys(WIDGETS));
  for (const key of declared) {
    assert.equal(typeof WIDGETS[key].get, 'function');
    assert.equal(typeof WIDGETS[key].action, 'function');
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG, and every key is declared', () => {
  const valueFields = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(valueFields.map((f) => f.key).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const f of valueFields) {
    if (f.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[f.key], f.default, `DEFAULT_CONFIG.${f.key}`);
    }
  }
  const options = (key) =>
    manifest.config_schema.find((f) => f.key === key).options.map((o) => o.value);
  assert.deepEqual(options('poll_interval'), POLL_INTERVALS);
  assert.deepEqual(options('language'), LANGUAGES);
});

test('the API keys are secrets, the addresses are not', () => {
  for (const slot of [1, 2, 3]) {
    const byKey = (key) => manifest.config_schema.find((f) => f.key === key);
    assert.equal(byKey(`clock_${slot}_api_key`).type, 'secret');
    assert.equal(byKey(`clock_${slot}_address`).type, 'string');
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length >= 3);
  for (const section of sections) {
    assert.equal(section.required, undefined, section.key);
    assert.equal(section.default, undefined, section.key);
    assert.equal(section.placeholder, undefined, section.key);
    assert.ok(!(section.key in DEFAULT_CONFIG), section.key);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.equal(dynamic.length, 3, 'two scene actions and the widget');
  for (const f of dynamic) {
    assert.equal(f.source, 'devices');
    assert.equal(f.options, undefined);
  }
});

test('number fields have whole bounds and defaults (the form has no step)', () => {
  for (const f of allFields.filter((x) => x.type === 'number')) {
    for (const bound of ['min', 'max', 'default']) {
      if (f[bound] !== undefined) {
        assert.ok(Number.isInteger(f[bound]), `${f.key}.${bound}`);
      }
    }
  }
});

test('the scene action fields match what the code accepts', () => {
  const show = sceneAction('show_notification');
  assert.deepEqual(
    field(show, 'sound').options,
    SOUND_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    'the sound list of src/sounds.js',
  );
  assert.equal(field(show, 'sound').default, NO_SOUND);
  assert.deepEqual(
    field(show, 'priority').options.map((o) => o.value),
    PRIORITIES,
  );
  assert.equal(field(show, 'repeat').max, MAX_CYCLES);
  assert.equal(field(show, 'duration').max, MAX_DURATION_SECONDS);
  assert.equal(field(show, 'text').required, true);
  assert.equal(field(show, 'device').required, false, 'empty: every clock');
  const timer = sceneAction('start_timer');
  assert.equal(field(timer, 'minutes').max, MAX_TIMER_MINUTES);
  assert.equal(field(timer, 'seconds').max, 59);
  for (const action of manifest.scene_actions) {
    assert.deepEqual(keysOf(action.outputs), ['count'], action.key);
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const f of withPlaceholder) {
    assert.equal(typeof f.placeholder, 'object', f.key);
    assert.ok(f.placeholder.en, f.key);
  }
});
