// -----------------------------------------------------------------------------
// What the integration reads from the answers of a LaMetric, and the
// notification body it sends. Pure functions, tested on the real answers
// published by python-demetriek and Home Assistant (test/fixtures/lametric/).
//
// The device API differs between models and firmwares, and the parsing is
// lenient on purpose: a field a firmware leaves out (Wi-Fi details while it
// reconnects, `display.on` before firmware 3) makes a feature unknown, never
// the whole clock unreadable.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, LaMetricError } from './client.js';

// The model the device reports is a hardware identifier, not a product name:
// a TIME reports "LM 37X8" on firmware 2.x and "sa8" on 3.x, a SKY "sa5".
export const MODEL_NAMES = Object.freeze({
  'LM 37X8': 'TIME',
  sa8: 'TIME',
  sa5: 'SKY',
});
export const SKY_MODEL = 'sa5';

// Apps whose actions the integration drives, and the actions it needs.
export const APPS = Object.freeze({
  stopwatch: {
    package: 'com.lametric.stopwatch',
    actions: ['stopwatch.start', 'stopwatch.pause', 'stopwatch.reset'],
  },
  timer: {
    package: 'com.lametric.countdown',
    actions: ['countdown.configure', 'countdown.start', 'countdown.pause', 'countdown.reset'],
  },
  radio: {
    package: 'com.lametric.radio',
    actions: ['radio.play', 'radio.stop', 'radio.next'],
  },
});

const finiteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value) => (typeof value === 'boolean' ? value : null);
const text = (value, max = 60) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A `{ min, max }` range of the API, or the fallback. */
function range(raw, fallback) {
  const min = finiteNumber(raw?.min);
  const max = finiteNumber(raw?.max);
  return min !== null && max !== null && min <= max ? { min, max } : fallback;
}

/**
 * Parse `GET /api/v2/device`.
 * @param {any} raw
 * @returns {object} the snapshot of the clock
 * @throws {LaMetricError} INVALID when the answer is not a LaMetric's
 */
export function parseDevice(raw) {
  const serial = text(raw?.serial_number, 64);
  const display = raw?.display;
  if (!serial || !display || typeof display !== 'object') {
    throw new LaMetricError(ERROR_KINDS.INVALID, 'the answer is not the state of a LaMetric');
  }
  const model = text(raw.model, 30);
  const audio = raw.audio && typeof raw.audio === 'object' ? raw.audio : null;
  const bluetooth = raw.bluetooth && typeof raw.bluetooth === 'object' ? raw.bluetooth : null;
  const wifi = raw.wifi && typeof raw.wifi === 'object' ? raw.wifi : {};
  const screensaver =
    display.screensaver && typeof display.screensaver === 'object' ? display.screensaver : null;

  // Firmware 2 leaves `audio.available` out: a volume means a speaker.
  const audioAvailable =
    audio !== null && audio.available !== false && finiteNumber(audio.volume) !== null;
  const bluetoothAvailable = bluetooth !== null && bluetooth.available === true;
  // The device endpoint calls it `strength`, the Wi-Fi endpoint `signal_strength`.
  const signal = finiteNumber(wifi.strength ?? wifi.signal_strength ?? wifi.rssi);
  const brightness = finiteNumber(display.brightness);

  return {
    serial,
    name: text(raw.name, 60) ?? 'LaMetric',
    model,
    modelName: MODEL_NAMES[model] ?? null,
    firmware: text(raw.os_version, 30),
    update: text(raw.update_available?.version, 30),
    display: {
      brightness: brightness === null ? null : Math.round(clamp(brightness, 0, 100)),
      brightnessAuto:
        display.brightness_mode === 'auto'
          ? true
          : display.brightness_mode === 'manual'
            ? false
            : null,
      // The range a write may use: 2-100 on mains, up to 76 on a computer's USB port.
      brightnessLimit: range(display.brightness_limit, { min: 0, max: 100 }),
      // Firmware 3 and later only.
      on: bool(display.on),
      // The SKY reports a screensaver it is not known to apply (as in Home Assistant).
      screensaver: model !== SKY_MODEL && screensaver ? bool(screensaver.enabled) : null,
    },
    audio: audioAvailable
      ? {
          volume: Math.round(clamp(audio.volume, 0, 100)),
          range: range(audio.volume_limit ?? audio.volume_range, { min: 0, max: 100 }),
        }
      : null,
    bluetooth: bluetoothAvailable ? { active: bluetooth.active === true } : null,
    wifi: {
      signal: signal === null ? null : Math.round(clamp(signal, 0, 100)),
      ssid: text(wifi.essid ?? wifi.ssid, 64),
    },
  };
}

/**
 * Parse `GET /api/v2/device/apps`: the widget each driven app runs in, and
 * the app on screen.
 * @param {any} raw
 * @returns {{ widgets: Record<string, { package: string, widgetId: string }|null>, current: string|null }}
 */
export function parseApps(raw) {
  const apps = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const widgets = {};
  for (const [key, spec] of Object.entries(APPS)) {
    const app = apps[spec.package];
    const actions = app?.actions && typeof app.actions === 'object' ? app.actions : {};
    const hasActions = spec.actions.every((action) => action in actions);
    // The first widget of the app: an app added twice runs in two widgets.
    const first = Object.entries(app?.widgets ?? {})
      .filter(([, widget]) => widget && typeof widget === 'object')
      .sort(([, a], [, b]) => (finiteNumber(a.index) ?? 0) - (finiteNumber(b.index) ?? 0))[0];
    widgets[key] = hasActions && first ? { package: spec.package, widgetId: first[0] } : null;
  }

  let current = null;
  for (const app of Object.values(apps)) {
    const visible = Object.values(app?.widgets ?? {}).some((widget) => widget?.visible === true);
    if (visible) {
      current = text(app.title, 40) ?? text(app.package, 40);
      break;
    }
  }
  return { widgets, current };
}

// --- Notifications -------------------------------------------------------------

// The built-in sounds of the device (the `id` the API takes), with their
// category: notification sounds play once, alarm sounds are longer.
export const SOUNDS = Object.freeze([
  ...[
    'bicycle',
    'car',
    'cash',
    'cat',
    'dog',
    'dog2',
    'energy',
    'knock-knock',
    'letter_email',
    'lose1',
    'lose2',
    'negative1',
    'negative2',
    'negative3',
    'negative4',
    'negative5',
    'notification',
    'notification2',
    'notification3',
    'notification4',
    'open_door',
    'positive1',
    'positive2',
    'positive3',
    'positive4',
    'positive5',
    'positive6',
    'statistic',
    'thunder',
    'water1',
    'water2',
    'win',
    'win2',
    'wind',
    'wind_short',
  ].map((id) => ({ id, category: 'notifications' })),
  ...Array.from({ length: 13 }, (_, i) => ({ id: `alarm${i + 1}`, category: 'alarms' })),
]);
export const NO_SOUND = 'none';

export const PRIORITIES = Object.freeze(['info', 'warning', 'critical']);
export const MAX_TEXT_LENGTH = 500;
export const MAX_CYCLES = 10;
export const MAX_DURATION_SECONDS = 300;

/**
 * An icon as typed by the user: the code of the LaMetric icon gallery
 * (developer.lametric.com/icons), `i1234` (still) or `a1234` (animated), or
 * its bare number (`1234`, `#1234`).
 * @param {unknown} raw
 * @returns {{ icon: string|number|null, invalid: boolean }}
 */
export function parseIcon(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { icon: null, invalid: false };
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { icon: raw, invalid: false };
  }
  const value = String(raw).trim().toLowerCase();
  if (/^[ia]\d{1,7}$/.test(value)) {
    return { icon: value, invalid: false };
  }
  const bare = value.match(/^#?(\d{1,7})$/);
  if (bare) {
    return { icon: Number(bare[1]), invalid: false };
  }
  return { icon: null, invalid: true };
}

/** A whole number typed in a form or a scene: a number, or a string ("2", "2,0"). */
export function parseWhole(raw, { min, max, fallback }) {
  const number =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw.trim().replace(',', '.'))
        : NaN;
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return clamp(Math.round(number), min, max);
}

/**
 * The body of `POST /api/v2/device/notifications`.
 * @param {object} fields
 * @param {string} fields.text
 * @param {unknown} [fields.icon]
 * @param {string} [fields.sound] one of SOUNDS, or NO_SOUND
 * @param {string} [fields.priority] one of PRIORITIES
 * @param {unknown} [fields.repeat] times shown, 0 until dismissed
 * @param {unknown} [fields.duration] seconds each time, empty for the device default
 * @param {object} [options]
 * @param {boolean} [options.hasAudio] a SKY has no speaker: it refuses a sound
 * @returns {{ body: object, warnings: string[] }}
 * @throws {RangeError} an empty text
 */
export function buildNotification(fields, { hasAudio = true } = {}) {
  const message =
    typeof fields.text === 'string' || typeof fields.text === 'number'
      ? String(fields.text)
          .replace(/[\p{Cc}\s]+/gu, ' ')
          .trim()
      : '';
  if (!message) {
    throw new RangeError('empty text');
  }
  const warnings = [];
  const frame = { text: message.slice(0, MAX_TEXT_LENGTH) };

  const { icon, invalid } = parseIcon(fields.icon);
  if (icon !== null) {
    frame.icon = icon;
  } else if (invalid) {
    warnings.push('icon');
  }

  const duration = parseWhole(fields.duration, {
    min: 1,
    max: MAX_DURATION_SECONDS,
    fallback: null,
  });
  if (duration !== null) {
    frame.duration = duration * 1000;
  }

  const model = {
    frames: [frame],
    cycles: parseWhole(fields.repeat, { min: 0, max: MAX_CYCLES, fallback: 1 }),
  };

  const soundId = typeof fields.sound === 'string' ? fields.sound.trim() : '';
  if (soundId && soundId !== NO_SOUND) {
    const sound = SOUNDS.find((entry) => entry.id === soundId);
    if (!sound) {
      warnings.push('sound');
    } else if (hasAudio) {
      model.sound = { category: sound.category, id: sound.id, repeat: 1 };
    }
  }

  return {
    body: {
      priority: PRIORITIES.includes(fields.priority) ? fields.priority : 'info',
      icon_type: 'none',
      model,
    },
    warnings,
  };
}
