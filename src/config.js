// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to three clocks, each in its own slot: an address (optional, found on
// the network when empty) and the API key of the device. The slot is only a
// way to reach a clock: the Gladys device is keyed on the serial number the
// clock reports, so moving a clock to another slot keeps its history.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const SLOTS = [1, 2, 3];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['15', '30', '60', '120', '300'];

// The device API of LaMetric listens on HTTPS, port 4343, with a
// self-signed certificate.
export const DEFAULT_PORT = 4343;

export const DEFAULT_CONFIG = {
  clock_1_address: '',
  clock_1_api_key: '',
  clock_2_address: '',
  clock_2_api_key: '',
  clock_3_address: '',
  clock_3_api_key: '',
  poll_interval: '30',
  language: 'fr',
};

/**
 * Parse the address typed by the user: an IP or a host name, optionally with
 * a port, or the URL copied from a browser (`https://192.0.2.10:4343/api/v2`).
 * @param {unknown} raw
 * @returns {{ host: string, port: number }|null} null when unusable
 */
export function parseAddress(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // The device API is HTTPS only: a port typed for http:// (8080) is dropped.
  const port = url.protocol === 'https:' && url.port ? Number(url.port) : DEFAULT_PORT;
  // IPv6 comes in brackets: kept bare, they are added back where needed.
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
}

/** `host` or `host:port` when the port is not the default one. */
export function formatAddress({ host, port }) {
  const shown = host.includes(':') ? `[${host}]` : host;
  return port === DEFAULT_PORT ? shown : `${shown}:${port}`;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const clocks = [];
  const invalidSlots = [];
  for (const slot of SLOTS) {
    const typedAddress = text(`clock_${slot}_address`);
    // An API key is 64 hexadecimal characters: the spaces around it come
    // from a copy and paste, never from the key.
    const apiKey = text(`clock_${slot}_api_key`);
    if (!typedAddress && !apiKey) {
      continue;
    }
    const address = typedAddress ? parseAddress(typedAddress) : null;
    if (typedAddress && !address) {
      invalidSlots.push(slot);
      continue;
    }
    clocks.push({ slot, address, apiKey });
  }

  return {
    clocks,
    invalidSlots,
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
