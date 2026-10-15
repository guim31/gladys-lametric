// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `lametric`.
//
// The use case: from the wall tablet, write a short message on the clock of
// the kitchen ("Dinner is ready"), switch it to the next app, or clear a
// notification that stays. So the widget shows the state of one clock and
// offers four buttons: previous app, next app, Message… (a form: text, icon,
// sound) and clear the notifications.
//
// The clock is the one chosen in the widget settings, or the first one of
// the configuration. Budget (8 components, 6 tiles, 1 status, 4 buttons):
// three tiles (brightness, volume, Wi-Fi signal), one status list (state, app
// on screen, firmware, update) and four buttons. The figures are sent as
// values, not bound to device features, so the widget works before the
// device is added to Gladys.
//
// The "Message…" form (widget action fields, GladysAssistant/Gladys#3168)
// needs Gladys 5.2.0, the minimum of the manifest; a tap received without
// its values is answered by a message asking to update Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from './devices.js';
import { ClockHub, UserError, WIDGET_KEY } from './hub.js';
import { MAX_TEXT_LENGTH, NO_SOUND } from './lametric/model.js';
import { SOUND_OPTIONS } from './sounds.js';
import { ERROR_TEXT, LANGS, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  PREVIOUS: 'previous_app',
  NEXT: 'next_app',
  MESSAGE: 'message',
  DISMISS: 'dismiss',
});

export const TEXT = {
  pick: {
    en: 'Enter the API key of your LaMetric in the configuration of the integration.',
    fr: 'Saisissez la clé d’API de votre LaMetric dans la configuration de l’intégration.',
    de: 'Gib den API-Schlüssel deiner LaMetric in der Konfiguration der Integration ein.',
    es: 'Introduzca la clave de API de su LaMetric en la configuración de la integración.',
  },
  unknown: {
    en: 'This LaMetric is no longer in the configuration: choose another one in the widget settings.',
    fr: 'Cette LaMetric n’est plus dans la configuration : choisissez-en une autre dans les réglages du widget.',
    de: 'Diese LaMetric ist nicht mehr in der Konfiguration: Wähle eine andere in den Widget-Einstellungen.',
    es: 'Esta LaMetric ya no está en la configuración: elija otra en la configuración del widget.',
  },
  updateGladys: {
    en: 'Update Gladys to 5.2.0 or later to write a message.',
    fr: 'Mettez Gladys à jour (5.2.0 ou plus) pour écrire un message.',
    de: 'Aktualisiere Gladys auf 5.2.0 oder neuer, um eine Nachricht zu schreiben.',
    es: 'Actualice Gladys a la versión 5.2.0 o posterior para escribir un mensaje.',
  },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  signal: { en: 'Wi-Fi', fr: 'Wi-Fi', de: 'WLAN', es: 'Wi-Fi' },
  connected: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectada' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  onScreen: { en: 'On screen', fr: 'À l’écran', de: 'Angezeigt', es: 'En pantalla' },
  firmware: { en: 'Firmware', fr: 'Firmware', de: 'Firmware', es: 'Firmware' },
  update: {
    en: 'Update available',
    fr: 'Mise à jour disponible',
    de: 'Update verfügbar',
    es: 'Actualización disponible',
  },
  previous: { en: 'Previous', fr: 'Précédente', de: 'Zurück', es: 'Anterior' },
  next: { en: 'Next', fr: 'Suivante', de: 'Weiter', es: 'Siguiente' },
  message: { en: 'Message…', fr: 'Message…', de: 'Nachricht…', es: 'Mensaje…' },
  dismiss: { en: 'Clear', fr: 'Effacer', de: 'Löschen', es: 'Borrar' },
};

// The fields of the "Message…" form: multi-language labels, like the
// manifest (the core validates them as config fields and drops the button
// otherwise).
export const FORM_TEXT = {
  text: { en: 'Text', fr: 'Texte', de: 'Text', es: 'Texto' },
  icon: { en: 'Icon (code)', fr: 'Icône (code)', de: 'Symbol (Code)', es: 'Icono (código)' },
  iconPlaceholder: { en: 'e.g. a7956', fr: 'ex. a7956', de: 'z. B. a7956', es: 'p. ej. a7956' },
  sound: { en: 'Sound', fr: 'Son', de: 'Ton', es: 'Sonido' },
};

const text = (texts, language) => pick(texts, language);
const percent = (value) => (value === null || value === undefined ? null : value);

/** The record the widget shows: the chosen device, or the first clock. */
function widgetRecord(hub, settings) {
  if (settings?.device) {
    return { record: hub.recordByDeviceId(settings.device) ?? null, chosen: true };
  }
  const records = [...hub.records.values()].sort((a, b) => a.slot - b.slot);
  return { record: records.find((record) => record.snapshot) ?? records[0] ?? null, chosen: false };
}

function messageForm() {
  return [
    { key: 'text', type: 'string', required: true, label: FORM_TEXT.text },
    {
      key: 'icon',
      type: 'string',
      required: false,
      label: FORM_TEXT.icon,
      placeholder: FORM_TEXT.iconPlaceholder,
    },
    {
      key: 'sound',
      type: 'select',
      required: false,
      default: NO_SOUND,
      label: FORM_TEXT.sound,
      options: SOUND_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    },
  ];
}

/**
 * The content of the widget.
 * @param {ClockHub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function buildContent(hub, { settings = {}, language = 'en' } = {}) {
  const lang = LANGS.includes(language) ? language : 'en';
  if (hub.records.size === 0) {
    return { ttl_seconds: 60, components: [{ type: 'text', text: text(TEXT.pick, lang) }] };
  }
  const { record, chosen } = widgetRecord(hub, settings);
  if (!record) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', text: text(chosen ? TEXT.unknown : TEXT.pick, lang) }],
    };
  }

  const snapshot = record.snapshot;
  const reachable = Boolean(snapshot) && !record.error;
  const components = [];
  if (snapshot) {
    const tiles = [
      { label: TEXT.brightness, value: percent(snapshot.display.brightness), icon: 'sun' },
      { label: TEXT.volume, value: percent(snapshot.audio?.volume), icon: 'volume-2' },
      { label: TEXT.signal, value: percent(snapshot.wifi.signal), icon: 'wifi' },
    ];
    for (const tile of tiles) {
      if (tile.value !== null) {
        components.push({
          type: 'value',
          label: text(tile.label, lang),
          value: tile.value,
          unit: '%',
          icon: tile.icon,
        });
      }
    }
  }

  const items = [
    {
      label: (snapshot?.name ?? hub.clockName(record)).slice(0, 40),
      value: text(reachable ? TEXT.connected : snapshot ? TEXT.unreachable : TEXT.waiting, lang),
      color: reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
  ];
  if (reachable && record.apps?.current) {
    items.push({ label: text(TEXT.onScreen, lang), value: record.apps.current.slice(0, 40) });
  }
  if (snapshot?.firmware) {
    items.push({ label: text(TEXT.firmware, lang), value: snapshot.firmware });
  }
  if (snapshot?.update) {
    items.push({
      label: text(TEXT.update, lang),
      value: snapshot.update,
      color: WIDGET_COLORS.WARNING,
    });
  }
  components.push({ type: 'status', items });

  components.push(
    {
      type: 'button',
      label: text(TEXT.previous, lang),
      icon: 'skip-back',
      style: 'secondary',
      action: { key: ACTIONS.PREVIOUS },
    },
    {
      type: 'button',
      label: text(TEXT.next, lang),
      icon: 'skip-forward',
      style: 'secondary',
      action: { key: ACTIONS.NEXT },
    },
    {
      type: 'button',
      label: text(TEXT.message, lang),
      icon: 'message-square',
      style: 'secondary',
      action: { key: ACTIONS.MESSAGE, fields: messageForm() },
    },
    {
      type: 'button',
      label: text(TEXT.dismiss, lang),
      icon: 'x-circle',
      style: 'secondary',
      action: { key: ACTIONS.DISMISS },
    },
  );
  return { ttl_seconds: 30, components };
}

/**
 * A tapped button.
 * @param {ClockHub} hub
 * @param {{ actionKey: string, settings?: object, values?: object }} request
 * @returns {Promise<object>} the toast, in the four languages
 */
export async function runAction(hub, { actionKey, settings = {}, values }) {
  const { record, chosen } = widgetRecord(hub, settings);
  if (!record || (!record.snapshot && !chosen)) {
    throw new UserError(chosen ? ERROR_TEXT.unknownClock : ERROR_TEXT.noClock, {}, hub.language());
  }
  if (actionKey === ACTIONS.PREVIOUS || actionKey === ACTIONS.NEXT) {
    const key = actionKey === ACTIONS.NEXT ? FEATURE_KEYS.NEXT_APP : FEATURE_KEYS.PREVIOUS_APP;
    await hub.command(record, key);
    return ClockHub.done('switched');
  }
  const deviceId = record.snapshot ? hub.deviceIdOf(record) : null;
  if (actionKey === ACTIONS.DISMISS) {
    const { count } = await hub.dismiss(deviceId);
    return ClockHub.done('dismissed', { count });
  }
  if (actionKey === ACTIONS.MESSAGE) {
    if (!values || typeof values !== 'object') {
      return TEXT.updateGladys;
    }
    const { count } = await hub.notify(deviceId, {
      text: typeof values.text === 'string' ? values.text.slice(0, MAX_TEXT_LENGTH) : values.text,
      icon: values.icon,
      sound: values.sound,
    });
    return ClockHub.done('shown', { count });
  }
  throw new UserError(ERROR_TEXT.unknownCommand, {}, hub.language());
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    action: (hub, request) => runAction(hub, request),
  },
};
