// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors of commands and scene actions, the report of the
// "Test the connection" button. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". `{name}` placeholders are
// filled by `format`. test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './lametric/client.js';

export const LANGS = ['en', 'fr', 'de', 'es'];

/** The text of a multi-language object in `language`, English as a fallback. */
export function pick(texts, language) {
  return texts?.[language] ?? texts?.en ?? '';
}

/** Fill the `{name}` placeholders of a text. */
export function format(text, values = {}) {
  return text.replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined || values[key] === null ? match : String(values[key]),
  );
}

/** A multi-language object, each language filled with its own values. */
export function localize(texts, values = {}) {
  return Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      format(pick(texts, lang), typeof values === 'function' ? values(lang) : values),
    ]),
  );
}

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noClock: {
    en: 'Enter the API key of your LaMetric in the configuration.',
    fr: 'Saisissez la clé d’API de votre LaMetric dans la configuration.',
    de: 'Gib den API-Schlüssel deiner LaMetric in der Konfiguration ein.',
    es: 'Introduzca la clave de API de su LaMetric en la configuración.',
  },
  // One problem per clock: "{clock}: {problem}", joined with "; ".
  clockProblem: {
    en: '{clock}: {problem}',
    fr: '{clock} : {problem}',
    de: '{clock}: {problem}',
    es: '{clock}: {problem}',
  },
};

// One short explanation per problem of a clock.
export const PROBLEM_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused',
    fr: 'clé d’API refusée',
    de: 'API-Schlüssel abgelehnt',
    es: 'clave de API rechazada',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'request refused by the clock',
    fr: 'requête refusée par l’horloge',
    de: 'Anfrage von der Uhr abgelehnt',
    es: 'solicitud rechazada por el reloj',
  },
  [ERROR_KINDS.INVALID]: {
    en: 'this address is not a LaMetric',
    fr: 'cette adresse n’est pas une LaMetric',
    de: 'diese Adresse ist keine LaMetric',
    es: 'esta dirección no es una LaMetric',
  },
  invalidAddress: {
    en: 'address not understood, e.g. 192.168.1.20',
    fr: 'adresse incomprise, ex. 192.168.1.20',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20',
    es: 'dirección no válida, p. ej. 192.168.1.20',
  },
  missingKey: {
    en: 'enter its API key',
    fr: 'saisissez sa clé d’API',
    de: 'gib ihren API-Schlüssel ein',
    es: 'introduzca su clave de API',
  },
  notFound: {
    en: 'not found on the network: enter its address',
    fr: 'introuvable sur le réseau : saisissez son adresse',
    de: 'nicht im Netzwerk gefunden: Gib ihre Adresse ein',
    es: 'no encontrado en la red: introduzca su dirección',
  },
  waiting: {
    en: 'not read yet',
    fr: 'pas encore lue',
    de: 'noch nicht gelesen',
    es: 'aún no leído',
  },
};

// Errors of the commands, the scene actions and the widget buttons.
export const ERROR_TEXT = {
  unknownClock: {
    en: 'This LaMetric is no longer in the configuration of the integration.',
    fr: 'Cette LaMetric n’est plus dans la configuration de l’intégration.',
    de: 'Diese LaMetric ist nicht mehr in der Konfiguration der Integration.',
    es: 'Esta LaMetric ya no está en la configuración de la integración.',
  },
  noClock: {
    en: 'No LaMetric answers: see the Configuration screen of the integration.',
    fr: 'Aucune LaMetric ne répond : voir l’écran Configuration de l’intégration.',
    de: 'Keine LaMetric antwortet: Sieh dir die Konfiguration der Integration an.',
    es: 'Ninguna LaMetric responde: consulte la pantalla de configuración de la integración.',
  },
  emptyText: {
    en: 'The text to show is empty.',
    fr: 'Le texte à afficher est vide.',
    de: 'Der anzuzeigende Text ist leer.',
    es: 'El texto que mostrar está vacío.',
  },
  noApp: {
    en: 'The {app} app is not installed on {clock}.',
    fr: 'L’application {app} n’est pas installée sur {clock}.',
    de: 'Die App {app} ist auf {clock} nicht installiert.',
    es: 'La aplicación {app} no está instalada en {clock}.',
  },
  failed: {
    en: '{clock}: {problem}.',
    fr: '{clock} : {problem}.',
    de: '{clock}: {problem}.',
    es: '{clock}: {problem}.',
  },
  unknownCommand: {
    en: 'Unknown command.',
    fr: 'Commande inconnue.',
    de: 'Unbekannter Befehl.',
    es: 'Comando desconocido.',
  },
};

// The names of the driven apps, as the LaMetric app calls them.
export const APP_NAMES = {
  stopwatch: { en: 'Stopwatch', fr: 'Chronomètre', de: 'Stoppuhr', es: 'Cronómetro' },
  timer: { en: 'Timer', fr: 'Minuteur', de: 'Timer', es: 'Temporizador' },
  radio: { en: 'Radio', fr: 'Radio', de: 'Radio', es: 'Radio' },
};

// The report of the "Test the connection" button (≤ 1000 characters, one
// line per clock).
export const REPORT_TEXT = {
  ok: {
    en: '{clock}: OK, {model}, firmware {firmware}, at {address}.',
    fr: '{clock} : OK, {model}, firmware {firmware}, à l’adresse {address}.',
    de: '{clock}: OK, {model}, Firmware {firmware}, unter {address}.',
    es: '{clock}: OK, {model}, firmware {firmware}, en {address}.',
  },
  problem: {
    en: '{clock}: {problem}.',
    fr: '{clock} : {problem}.',
    de: '{clock}: {problem}.',
    es: '{clock}: {problem}.',
  },
  found: {
    en: 'Found on the network, not configured: {list}. Enter its API key (developer.lametric.com, Devices) in an empty slot.',
    fr: 'Trouvée sur le réseau, non configurée : {list}. Saisissez sa clé d’API (developer.lametric.com, Devices) dans un emplacement libre.',
    de: 'Im Netzwerk gefunden, nicht konfiguriert: {list}. Gib ihren API-Schlüssel (developer.lametric.com, Devices) in einem freien Platz ein.',
    es: 'Encontrada en la red, sin configurar: {list}. Introduzca su clave de API (developer.lametric.com, Devices) en un espacio libre.',
  },
  noneFound: {
    en: 'No LaMetric answered the network search (it may not announce itself: enter its address).',
    fr: 'Aucune LaMetric n’a répondu à la recherche réseau (elle ne s’annonce peut-être pas : saisissez son adresse).',
    de: 'Keine LaMetric hat auf die Netzwerksuche geantwortet (vielleicht kündigt sie sich nicht an: Gib ihre Adresse ein).',
    es: 'Ninguna LaMetric respondió a la búsqueda en la red (quizá no se anuncia: introduzca su dirección).',
  },
  searchUnavailable: {
    en: 'The network search is not available on this Gladys.',
    fr: 'La recherche réseau n’est pas disponible sur ce Gladys.',
    de: 'Die Netzwerksuche ist auf diesem Gladys nicht verfügbar.',
    es: 'La búsqueda en la red no está disponible en este Gladys.',
  },
};

// The answer of a scene action or a widget button, ≤ 200 characters.
export const DONE_TEXT = {
  shown: {
    en: 'Shown on {count} LaMetric.',
    fr: 'Affiché sur {count} LaMetric.',
    de: 'Auf {count} LaMetric angezeigt.',
    es: 'Mostrado en {count} LaMetric.',
  },
  timer: {
    en: 'Timer of {duration} started on {count} LaMetric.',
    fr: 'Minuteur de {duration} lancé sur {count} LaMetric.',
    de: 'Timer von {duration} auf {count} LaMetric gestartet.',
    es: 'Temporizador de {duration} iniciado en {count} LaMetric.',
  },
  dismissed: {
    en: '{count} notification(s) cleared.',
    fr: '{count} notification(s) effacée(s).',
    de: '{count} Benachrichtigung(en) gelöscht.',
    es: '{count} notificación(es) borrada(s).',
  },
  switched: {
    en: 'Done.',
    fr: 'C’est fait.',
    de: 'Erledigt.',
    es: 'Hecho.',
  },
};
