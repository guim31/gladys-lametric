// -----------------------------------------------------------------------------
// One Gladys device per clock.
//
// Identity: the serial number the clock reports (`serial_number`), never the
// slot nor the address: a clock moved to another slot, or given another IP
// by the router, keeps its device and its history.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js), each only when the clock has it:
//   - brightness, volume: switch/dimmer 0-100, writable (a slider; the
//     `switch` category has no percent unit). Fixed 0-100 bounds: the limit
//     the clock reports moves with its power supply (76 on a computer's USB
//     port), and a structure change would ask the user to update the device;
//     a write is brought into the limit instead;
//   - automatic brightness, screen, screensaver, Bluetooth: switch/binary,
//     writable (the screen switch from firmware 3, the screensaver one on a
//     TIME, the volume and Bluetooth on a TIME: a SKY has neither);
//   - Wi-Fi signal: signal/integer, percent, read-only;
//   - app on screen: text/text, read-only;
//   - next / previous app, clear the notifications, and the stopwatch, timer
//     and radio commands when those apps are installed: button/push (a push
//     button in the dashboard, no state).
//
// Published with should_poll: true at one minute (the core's onPoll is a
// fallback): the integration reads the clocks on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { formatAddress } from './config.js';

export const DEVICE_TYPE = 'lametric';
export const ADDRESS_PARAM = 'LAMETRIC_ADDRESS';
export const MODEL_PARAM = 'LAMETRIC_MODEL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  BRIGHTNESS: 'brightness',
  BRIGHTNESS_AUTO: 'brightness_auto',
  DISPLAY: 'display',
  SCREENSAVER: 'screensaver',
  VOLUME: 'volume',
  BLUETOOTH: 'bluetooth',
  WIFI_SIGNAL: 'wifi_signal',
  CURRENT_APP: 'current_app',
  NEXT_APP: 'next_app',
  PREVIOUS_APP: 'previous_app',
  DISMISS: 'dismiss_notifications',
  STOPWATCH_START: 'stopwatch_start',
  STOPWATCH_PAUSE: 'stopwatch_pause',
  STOPWATCH_RESET: 'stopwatch_reset',
  TIMER_START: 'timer_start',
  TIMER_PAUSE: 'timer_pause',
  TIMER_RESET: 'timer_reset',
  RADIO_PLAY: 'radio_play',
  RADIO_STOP: 'radio_stop',
  RADIO_NEXT: 'radio_next',
});
const K = FEATURE_KEYS;

// The app commands: the app (src/lametric/model.js APPS) and its action.
export const APP_COMMANDS = Object.freeze({
  [K.STOPWATCH_START]: { app: 'stopwatch', action: 'stopwatch.start' },
  [K.STOPWATCH_PAUSE]: { app: 'stopwatch', action: 'stopwatch.pause' },
  [K.STOPWATCH_RESET]: { app: 'stopwatch', action: 'stopwatch.reset' },
  [K.TIMER_START]: { app: 'timer', action: 'countdown.start' },
  [K.TIMER_PAUSE]: { app: 'timer', action: 'countdown.pause' },
  [K.TIMER_RESET]: { app: 'timer', action: 'countdown.reset' },
  [K.RADIO_PLAY]: { app: 'radio', action: 'radio.play' },
  [K.RADIO_STOP]: { app: 'radio', action: 'radio.stop' },
  [K.RADIO_NEXT]: { app: 'radio', action: 'radio.next' },
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [K.BRIGHTNESS]: 'Brightness',
    [K.BRIGHTNESS_AUTO]: 'Automatic brightness',
    [K.DISPLAY]: 'Screen',
    [K.SCREENSAVER]: 'Screensaver',
    [K.VOLUME]: 'Volume',
    [K.BLUETOOTH]: 'Bluetooth',
    [K.WIFI_SIGNAL]: 'Wi-Fi signal',
    [K.CURRENT_APP]: 'App on screen',
    [K.NEXT_APP]: 'Next app',
    [K.PREVIOUS_APP]: 'Previous app',
    [K.DISMISS]: 'Clear notifications',
    [K.STOPWATCH_START]: 'Start the stopwatch',
    [K.STOPWATCH_PAUSE]: 'Stop the stopwatch',
    [K.STOPWATCH_RESET]: 'Reset the stopwatch',
    [K.TIMER_START]: 'Start the timer',
    [K.TIMER_PAUSE]: 'Stop the timer',
    [K.TIMER_RESET]: 'Reset the timer',
    [K.RADIO_PLAY]: 'Play the radio',
    [K.RADIO_STOP]: 'Stop the radio',
    [K.RADIO_NEXT]: 'Next radio station',
  },
  fr: {
    [K.BRIGHTNESS]: 'Luminosité',
    [K.BRIGHTNESS_AUTO]: 'Luminosité automatique',
    [K.DISPLAY]: 'Écran',
    [K.SCREENSAVER]: "Économiseur d'écran",
    [K.VOLUME]: 'Volume',
    [K.BLUETOOTH]: 'Bluetooth',
    [K.WIFI_SIGNAL]: 'Signal Wi-Fi',
    [K.CURRENT_APP]: 'Application affichée',
    [K.NEXT_APP]: 'Application suivante',
    [K.PREVIOUS_APP]: 'Application précédente',
    [K.DISMISS]: 'Effacer les notifications',
    [K.STOPWATCH_START]: 'Démarrer le chronomètre',
    [K.STOPWATCH_PAUSE]: 'Arrêter le chronomètre',
    [K.STOPWATCH_RESET]: 'Remettre le chronomètre à zéro',
    [K.TIMER_START]: 'Démarrer le minuteur',
    [K.TIMER_PAUSE]: 'Arrêter le minuteur',
    [K.TIMER_RESET]: 'Remettre le minuteur à zéro',
    [K.RADIO_PLAY]: 'Lancer la radio',
    [K.RADIO_STOP]: 'Arrêter la radio',
    [K.RADIO_NEXT]: 'Station de radio suivante',
  },
  de: {
    [K.BRIGHTNESS]: 'Helligkeit',
    [K.BRIGHTNESS_AUTO]: 'Automatische Helligkeit',
    [K.DISPLAY]: 'Bildschirm',
    [K.SCREENSAVER]: 'Bildschirmschoner',
    [K.VOLUME]: 'Lautstärke',
    [K.BLUETOOTH]: 'Bluetooth',
    [K.WIFI_SIGNAL]: 'WLAN-Signal',
    [K.CURRENT_APP]: 'Angezeigte App',
    [K.NEXT_APP]: 'Nächste App',
    [K.PREVIOUS_APP]: 'Vorherige App',
    [K.DISMISS]: 'Benachrichtigungen löschen',
    [K.STOPWATCH_START]: 'Stoppuhr starten',
    [K.STOPWATCH_PAUSE]: 'Stoppuhr anhalten',
    [K.STOPWATCH_RESET]: 'Stoppuhr zurücksetzen',
    [K.TIMER_START]: 'Timer starten',
    [K.TIMER_PAUSE]: 'Timer anhalten',
    [K.TIMER_RESET]: 'Timer zurücksetzen',
    [K.RADIO_PLAY]: 'Radio abspielen',
    [K.RADIO_STOP]: 'Radio stoppen',
    [K.RADIO_NEXT]: 'Nächster Radiosender',
  },
  es: {
    [K.BRIGHTNESS]: 'Brillo',
    [K.BRIGHTNESS_AUTO]: 'Brillo automático',
    [K.DISPLAY]: 'Pantalla',
    [K.SCREENSAVER]: 'Salvapantallas',
    [K.VOLUME]: 'Volumen',
    [K.BLUETOOTH]: 'Bluetooth',
    [K.WIFI_SIGNAL]: 'Señal Wi-Fi',
    [K.CURRENT_APP]: 'Aplicación mostrada',
    [K.NEXT_APP]: 'Aplicación siguiente',
    [K.PREVIOUS_APP]: 'Aplicación anterior',
    [K.DISMISS]: 'Borrar las notificaciones',
    [K.STOPWATCH_START]: 'Iniciar el cronómetro',
    [K.STOPWATCH_PAUSE]: 'Detener el cronómetro',
    [K.STOPWATCH_RESET]: 'Reiniciar el cronómetro',
    [K.TIMER_START]: 'Iniciar el temporizador',
    [K.TIMER_PAUSE]: 'Detener el temporizador',
    [K.TIMER_RESET]: 'Reiniciar el temporizador',
    [K.RADIO_PLAY]: 'Reproducir la radio',
    [K.RADIO_STOP]: 'Detener la radio',
    [K.RADIO_NEXT]: 'Emisora de radio siguiente',
  },
};

/** The platform id of a clock: its serial number, lower-cased. */
export function platformId(serial) {
  return String(serial)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The external ids of the clock with this serial number. */
export function deviceIds(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, platformId(serial));
}

/** `TIME` / `SKY` with the hardware model, for the device param and the widget. */
export function modelLabel(snapshot) {
  if (snapshot.modelName && snapshot.model) {
    return `LaMetric ${snapshot.modelName} (${snapshot.model})`;
  }
  return snapshot.modelName ? `LaMetric ${snapshot.modelName}` : (snapshot.model ?? 'LaMetric');
}

const base = { read_only: false, has_feedback: true, keep_history: true, min: 0 };
const dimmer = { ...base, category: CATEGORIES.SWITCH, type: TYPES.SWITCH.DIMMER, max: 100 };
const toggle = { ...base, category: CATEGORIES.SWITCH, type: TYPES.SWITCH.BINARY, max: 1 };
const push = {
  ...base,
  category: CATEGORIES.BUTTON,
  type: TYPES.BUTTON.PUSH,
  max: 1,
  has_feedback: false,
  keep_history: false,
};

/**
 * The features a clock has, in display order.
 * @param {object} snapshot parseDevice
 * @param {object|null} apps parseApps
 * @returns {Array<{ key: string, spec: object }>}
 */
export function featureSpecs(snapshot, apps) {
  const specs = [];
  const add = (key, spec) => specs.push({ key, spec });
  if (snapshot.display.brightness !== null) {
    add(K.BRIGHTNESS, dimmer);
  }
  if (snapshot.display.brightnessAuto !== null) {
    add(K.BRIGHTNESS_AUTO, toggle);
  }
  if (snapshot.display.on !== null) {
    add(K.DISPLAY, toggle);
  }
  if (snapshot.display.screensaver !== null) {
    add(K.SCREENSAVER, toggle);
  }
  if (snapshot.audio) {
    add(K.VOLUME, dimmer);
  }
  if (snapshot.bluetooth) {
    add(K.BLUETOOTH, toggle);
  }
  add(K.WIFI_SIGNAL, {
    ...base,
    category: CATEGORIES.SIGNAL,
    type: TYPES.SIGNAL.QUALITY,
    unit: UNITS.PERCENT,
    max: 100,
    read_only: true,
    has_feedback: false,
  });
  add(K.CURRENT_APP, {
    ...base,
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.TEXT,
    // NOT NULL in the core, even for a text: 0/0 like Zigbee2MQTT.
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  });
  add(K.NEXT_APP, push);
  add(K.PREVIOUS_APP, push);
  add(K.DISMISS, push);
  for (const [key, command] of Object.entries(APP_COMMANDS)) {
    if (apps?.widgets?.[command.app]) {
      add(key, push);
    }
  }
  return specs;
}

/**
 * The discovery payload of one clock.
 * @param {object} gladys GladysIntegration
 * @param {object} record `{ snapshot, apps, address }` (src/hub.js)
 * @param {string} language feature-name language
 */
export function buildDevice(gladys, { snapshot, apps, address }, language) {
  const ids = deviceIds(gladys, snapshot.serial);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: snapshot.name,
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      ...(address ? [{ name: ADDRESS_PARAM, value: formatAddress(address) }] : []),
      { name: MODEL_PARAM, value: modelLabel(snapshot) },
    ],
    features: featureSpecs(snapshot, apps).map(({ key, spec }) => ({
      ...spec,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of a clock, in the publishStates format. Push buttons have no
 * state; an unknown value (no Wi-Fi details while it reconnects, no app on
 * screen) is left out rather than sent as 0 or an empty text.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function featureStates(gladys, { snapshot, apps }) {
  const ids = deviceIds(gladys, snapshot.serial);
  const values = {
    [K.BRIGHTNESS]: snapshot.display.brightness,
    [K.BRIGHTNESS_AUTO]: snapshot.display.brightnessAuto,
    [K.DISPLAY]: snapshot.display.on,
    [K.SCREENSAVER]: snapshot.display.screensaver,
    [K.VOLUME]: snapshot.audio?.volume ?? null,
    [K.BLUETOOTH]: snapshot.bluetooth?.active ?? null,
    [K.WIFI_SIGNAL]: snapshot.wifi.signal,
  };
  const states = [];
  for (const { key } of featureSpecs(snapshot, apps)) {
    const value = values[key];
    if (value === undefined || value === null) {
      continue;
    }
    states.push({
      device_feature_external_id: ids.feature(key),
      state: typeof value === 'boolean' ? Number(value) : value,
    });
  }
  if (apps?.current) {
    states.push({ device_feature_external_id: ids.feature(K.CURRENT_APP), text: apps.current });
  }
  return states;
}
