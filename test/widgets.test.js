// -----------------------------------------------------------------------------
// The dashboard widget: its content fits the core vocabulary and budget
// (validateWidgetContent of the SDK) in every state and language, and its
// buttons act on the clock it shows.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ACTIONS } from '../src/widgets.js';
import { API_KEY, FakeLaMetric, IP_1, IP_2, createWorld, ids } from './helpers/world.js';

const get = async (w, request = {}) => {
  const answer = await w.fake.widgetGet('lametric', { language: 'en', ...request });
  assert.equal(answer.success, true, answer.error);
  return answer.data.content;
};
const tap = (w, actionKey, context = {}) =>
  w.fake.widgetAction('lametric', actionKey, {}, { settings: {}, ...context });

test('the content fits the vocabulary and the budget, in the four languages', async () => {
  const w = await createWorld();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const content = await get(w, { language });
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.equal(content.components.length, 8);
  }
});

test('what the widget shows', async () => {
  const w = await createWorld();
  w.network.clocks[IP_1].device.update_available = { version: '3.3.0' };
  await w.hub.refresh();
  const content = await get(w);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((c) => [c.label, c.value, c.unit]),
    [
      ['Brightness', 100, '%'],
      ['Volume', 46, '%'],
      ['Wi-Fi', 64, '%'],
    ],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(status.items, [
    { label: 'Living room', value: 'Connected', color: 'success' },
    { label: 'On screen', value: 'Clock' },
    { label: 'Firmware', value: '3.2.6' },
    { label: 'Update available', value: '3.3.0', color: 'warning' },
  ]);
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((c) => c.action.key),
    [ACTIONS.PREVIOUS, ACTIONS.NEXT, ACTIONS.MESSAGE, ACTIONS.DISMISS],
  );
  const form = buttons[2].action.fields;
  assert.deepEqual(
    form.map((field) => field.key),
    ['text', 'icon', 'sound'],
  );
  for (const field of form) {
    assert.deepEqual(Object.keys(field.label), ['en', 'fr', 'de', 'es'], field.key);
  }
  for (const option of form[2].options) {
    assert.deepEqual(Object.keys(option.label), ['en', 'fr', 'de', 'es'], option.value);
  }
});

test('a SKY, an unreachable clock, nothing configured, a clock removed: still valid', async () => {
  const sky = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ device: 'device-sky', apps: null }) },
  });
  const skyContent = await get(sky);
  assert.deepEqual(validateWidgetContent(skyContent), []);
  assert.equal(skyContent.components.filter((c) => c.type === 'value').length, 2, 'no volume');

  const down = await createWorld();
  down.network.clocks[IP_1].online = false;
  await down.hub.refresh();
  const downContent = await get(down, { language: 'fr' });
  assert.deepEqual(validateWidgetContent(downContent), []);
  assert.deepEqual(downContent.components.find((c) => c.type === 'status').items[0], {
    label: 'Living room',
    value: 'Injoignable',
    color: 'danger',
  });

  const empty = await createWorld({ config: {} });
  const emptyContent = await get(empty, { language: 'es' });
  assert.deepEqual(validateWidgetContent(emptyContent), []);
  assert.match(emptyContent.components[0].text, /clave de API/);

  const removed = await get(down, { settings: { device: 'ext:test-integration:lametric:gone' } });
  assert.deepEqual(validateWidgetContent(removed), []);
  assert.match(removed.components[0].text, /no longer in the configuration/);
});

test('the chosen clock is the one shown and the one acted on', async () => {
  const w = await createWorld({
    clocks: {
      [IP_1]: new FakeLaMetric(),
      [IP_2]: new FakeLaMetric({ serial: 'SA0000000000TEST005', name: 'Kitchen' }),
    },
    config: {
      clock_1_address: IP_1,
      clock_1_api_key: API_KEY,
      clock_2_address: IP_2,
      clock_2_api_key: API_KEY,
      language: 'en',
    },
  });
  const settings = { device: ids(w.gladys, 'SA0000000000TEST005').device };
  const content = await get(w, { settings });
  assert.equal(content.components.find((c) => c.type === 'status').items[0].label, 'Kitchen');

  const answer = await tap(w, ACTIONS.MESSAGE, { settings, values: { text: 'Hello' } });
  assert.deepEqual(answer.data, {
    message: {
      en: 'Shown on 1 LaMetric.',
      fr: 'Affiché sur 1 LaMetric.',
      de: 'Auf 1 LaMetric angezeigt.',
      es: 'Mostrado en 1 LaMetric.',
    },
  });
  assert.equal(w.network.clocks[IP_2].notifications.length, 1);
  assert.equal(w.network.clocks[IP_1].notifications.length, 0);
});

test('the buttons: previous, next, message with icon and sound, clear', async () => {
  const w = await createWorld();
  const clock = w.network.clocks[IP_1];
  assert.equal((await tap(w, ACTIONS.NEXT)).success, true);
  assert.equal(clock.visibleApp().pkg, 'com.lametric.weather');
  await tap(w, ACTIONS.PREVIOUS);
  assert.equal(clock.visibleApp().pkg, 'com.lametric.clock');

  await tap(w, ACTIONS.MESSAGE, { values: { text: 'Dinner', icon: 'i2867', sound: 'win' } });
  assert.deepEqual(clock.notifications[0].model, {
    frames: [{ text: 'Dinner', icon: 'i2867' }],
    cycles: 1,
    sound: { category: 'notifications', id: 'win', repeat: 1 },
  });

  const cleared = await tap(w, ACTIONS.DISMISS);
  assert.equal(cleared.data.message.en, '1 notification(s) cleared.');
  assert.equal(clock.notifications.length, 0);
});

test('a message tapped on a Gladys without forms asks to update Gladys', async () => {
  const w = await createWorld();
  const answer = await tap(w, ACTIONS.MESSAGE);
  assert.match(answer.data.message.en, /Update Gladys to 5\.2\.0/);
  assert.equal(w.network.clocks[IP_1].notifications.length, 0);
});

test('a button on a clock that does not answer fails', async () => {
  const w = await createWorld();
  w.network.clocks[IP_1].online = false;
  const answer = await tap(w, ACTIONS.NEXT);
  assert.equal(answer.success, false);
  assert.match(answer.error, /does not answer/);
});
