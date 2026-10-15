// -----------------------------------------------------------------------------
// The scene actions, as a scene runs them (the SDK's fake Gladys relays the
// resolved fields): "Show on the LaMetric" and "Start the LaMetric timer".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from '../src/hub.js';
import { API_KEY, FakeLaMetric, IP_1, IP_2, createWorld, ids } from './helpers/world.js';

const twoClocks = () => ({
  [IP_1]: new FakeLaMetric(),
  [IP_2]: new FakeLaMetric({ device: 'device-sky', serial: 'SA0000000000TEST003', apps: null }),
});
const twoClocksConfig = (language = 'en') => ({
  clock_1_address: IP_1,
  clock_1_api_key: API_KEY,
  clock_2_address: IP_2,
  clock_2_api_key: API_KEY,
  language,
});

test('show a text with every option on the chosen clock', async () => {
  const w = await createWorld({ clocks: twoClocks(), config: twoClocksConfig() });
  const answer = await w.fake.sceneAction('show_notification', {
    device: ids(w.gladys).device,
    text: 'Washing machine done',
    icon: 'a7956',
    sound: 'positive2',
    priority: 'warning',
    repeat: 3,
    duration: 10,
  });
  assert.deepEqual(answer, { success: true, data: { outputs: { count: 1 } } });
  assert.deepEqual(w.network.clocks[IP_1].notifications, [
    {
      id: '1',
      priority: 'warning',
      icon_type: 'none',
      model: {
        frames: [{ text: 'Washing machine done', icon: 'a7956', duration: 10_000 }],
        cycles: 3,
        sound: { category: 'notifications', id: 'positive2', repeat: 1 },
      },
    },
  ]);
  assert.equal(w.network.clocks[IP_2].notifications.length, 0);
});

test('no device chosen: every clock that answers; the SKY gets it without sound', async () => {
  const w = await createWorld({ clocks: twoClocks(), config: twoClocksConfig() });
  const answer = await w.fake.sceneAction('show_notification', {
    text: 'Door open',
    sound: 'open_door',
  });
  assert.deepEqual(answer.data.outputs, { count: 2 });
  assert.equal(w.network.clocks[IP_1].notifications[0].model.sound.id, 'open_door');
  assert.equal(w.network.clocks[IP_2].notifications[0].model.sound, undefined);
});

test('one clock of two down: the other shows it, the count says one', async () => {
  const w = await createWorld({ clocks: twoClocks(), config: twoClocksConfig() });
  w.network.clocks[IP_2].online = false;
  const answer = await w.fake.sceneAction('show_notification', { text: 'Hi' });
  assert.deepEqual(answer.data.outputs, { count: 1 });
});

test('the action fails, in the language of the configuration, when nothing can show it', async () => {
  const w = await createWorld({ clocks: twoClocks(), config: twoClocksConfig('fr') });
  assert.deepEqual(await w.fake.sceneAction('show_notification', { text: '   ' }), {
    success: false,
    error: 'Le texte à afficher est vide.',
  });
  w.network.clocks[IP_1].online = false;
  const failed = await w.fake.sceneAction('show_notification', {
    device: ids(w.gladys).device,
    text: 'Hi',
  });
  assert.deepEqual(failed, {
    success: false,
    error: 'LaMetric 1 (Living room) : ne répond pas.',
  });
  const unknown = await w.fake.sceneAction('show_notification', {
    device: 'ext:test-integration:lametric:gone',
    text: 'Hi',
  });
  assert.equal(unknown.error, 'Cette LaMetric n’est plus dans la configuration de l’intégration.');
});

test('start the timer for minutes and seconds', async () => {
  const w = await createWorld();
  const answer = await w.fake.sceneAction('start_timer', { minutes: 10, seconds: 30 });
  assert.deepEqual(answer, { success: true, data: { outputs: { count: 1 } } });
  assert.deepEqual(w.network.clocks[IP_1].actions, [
    {
      package: 'com.lametric.countdown',
      widgetId: '6_com.lametric.countdown',
      id: 'countdown.configure',
      params: { duration: 630, start_now: true },
      activate: true,
    },
  ]);
  await w.fake.sceneAction('start_timer', { minutes: 0, seconds: 0 });
  assert.equal(w.network.clocks[IP_1].actions[1].params.duration, 1, 'one second at least');
});

test('the timer on a clock without the Timer app fails with its name', async () => {
  const w = await createWorld({
    clocks: { [IP_1]: new FakeLaMetric({ apps: null }) },
    config: { clock_1_address: IP_1, clock_1_api_key: API_KEY, language: 'de' },
  });
  const answer = await w.fake.sceneAction('start_timer', { minutes: 1 });
  assert.deepEqual(answer, {
    success: false,
    error: 'Die App Timer ist auf LaMetric 1 (Living room) nicht installiert.',
  });
});

test('durations read the same in the four languages', () => {
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(300), '5 min');
  assert.equal(formatDuration(90), '1 min 30 s');
});
