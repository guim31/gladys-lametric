// -----------------------------------------------------------------------------
// The built-in sounds of a LaMetric, as the scene action and the widget form
// offer them: "No sound" first, then the notification sounds, then the
// alarms. The manifest repeats this list (static JSON): test/manifest.test.js
// keeps both the same.
// -----------------------------------------------------------------------------

import { NO_SOUND, SOUNDS } from './lametric/model.js';

const numbered = (texts, n) =>
  Object.fromEntries(Object.entries(texts).map(([lang, text]) => [lang, `${text} ${n}`]));

const NAMES = {
  bicycle: { en: 'Bicycle', fr: 'Vélo', de: 'Fahrrad', es: 'Bicicleta' },
  car: { en: 'Car', fr: 'Voiture', de: 'Auto', es: 'Coche' },
  cash: { en: 'Cash register', fr: 'Caisse enregistreuse', de: 'Kasse', es: 'Caja registradora' },
  cat: { en: 'Cat', fr: 'Chat', de: 'Katze', es: 'Gato' },
  dog: { en: 'Dog', fr: 'Chien', de: 'Hund', es: 'Perro' },
  energy: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },
  'knock-knock': { en: 'Knock knock', fr: 'Toc toc', de: 'Klopf klopf', es: 'Toc toc' },
  letter_email: { en: 'Letter', fr: 'Courrier', de: 'Brief', es: 'Carta' },
  lose: { en: 'Lose', fr: 'Défaite', de: 'Verloren', es: 'Derrota' },
  negative: { en: 'Negative', fr: 'Négatif', de: 'Negativ', es: 'Negativo' },
  notification: {
    en: 'Notification',
    fr: 'Notification',
    de: 'Benachrichtigung',
    es: 'Notificación',
  },
  open_door: {
    en: 'Door opening',
    fr: 'Porte qui s’ouvre',
    de: 'Tür öffnet sich',
    es: 'Puerta que se abre',
  },
  positive: { en: 'Positive', fr: 'Positif', de: 'Positiv', es: 'Positivo' },
  statistic: { en: 'Statistic', fr: 'Statistique', de: 'Statistik', es: 'Estadística' },
  thunder: { en: 'Thunder', fr: 'Tonnerre', de: 'Donner', es: 'Trueno' },
  water: { en: 'Water', fr: 'Eau', de: 'Wasser', es: 'Agua' },
  win: { en: 'Win', fr: 'Victoire', de: 'Gewonnen', es: 'Victoria' },
  wind: { en: 'Wind', fr: 'Vent', de: 'Wind', es: 'Viento' },
  wind_short: { en: 'Short wind', fr: 'Vent court', de: 'Kurzer Wind', es: 'Viento corto' },
  alarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
};

export const NO_SOUND_LABEL = { en: 'No sound', fr: 'Aucun son', de: 'Kein Ton', es: 'Sin sonido' };

/** The label of a sound id: `dog2` is "Dog 2", `alarm13` "Alarm 13". */
export function soundLabel(id) {
  if (NAMES[id]) {
    return NAMES[id];
  }
  const match = id.match(/^([a-z_]+?)(\d+)$/);
  if (match && NAMES[match[1]]) {
    return numbered(NAMES[match[1]], match[2]);
  }
  return { en: id, fr: id, de: id, es: id };
}

export const SOUND_OPTIONS = Object.freeze([
  { value: NO_SOUND, label: NO_SOUND_LABEL },
  ...SOUNDS.map(({ id }) => ({ value: id, label: soundLabel(id) })),
]);
