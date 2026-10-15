// -----------------------------------------------------------------------------
// Client of the local device API of a LaMetric TIME or SKY (API v2), as
// documented by LaMetric and implemented by frenck/python-demetriek (MIT):
//
//   https://<address>:4343/api/v2/...   HTTPS, self-signed certificate
//   Authorization: Basic base64("dev:<api key>")
//
// One instance per clock. Reads are plain GETs; the writes are the ones the
// integration offers (display, audio, Bluetooth, app switching, app actions,
// notifications). A failure throws a LaMetricError whose `kind` tells the
// user what to do; its message never holds the API key.
//
// No retry: a read is repeated by the next refresh anyway, and repeating a
// write that may have reached the clock could show a notification twice or
// skip two apps.
// -----------------------------------------------------------------------------

import { DEFAULT_PORT, formatAddress } from '../config.js';
import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer, timeout, or a 502/503/504
  AUTH: 'auth', // 401/403: the API key is refused
  REFUSED: 'refused', // any other HTTP error: the clock understood and said no
  INVALID: 'invalid', // an answer that is not the LaMetric API
});

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export class LaMetricError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(kind, message, { status, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'LaMetricError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The messages of an error answer: the device answers `{ errors: [{ message }] }`.
 * @param {string} body
 * @returns {string|null}
 */
export function errorMessage(body) {
  try {
    const data = JSON.parse(body);
    const errors = Array.isArray(data?.errors) ? data.errors : data?.error ? [data.error] : [];
    const messages = errors
      .map((error) => (typeof error?.message === 'string' ? error.message.trim() : ''))
      .filter(Boolean);
    return messages.length > 0 ? messages.join('; ').slice(0, 200) : null;
  } catch {
    return null;
  }
}

export class LaMetricClient {
  /**
   * @param {object} options
   * @param {string} options.host IP address or host name
   * @param {number} [options.port]
   * @param {string} options.apiKey
   * @param {Function} [options.request] HTTP seam (src/lametric/http.js)
   * @param {number} [options.timeoutMs]
   */
  constructor({ host, port = DEFAULT_PORT, apiKey, request = httpRequest, timeoutMs = 8000 }) {
    this.host = host;
    this.port = port;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.label = formatAddress({ host, port });
    // Kept out of the enumerable properties: a logged client never shows it.
    Object.defineProperty(this, 'authorization', {
      value: `Basic ${Buffer.from(`dev:${apiKey}`).toString('base64')}`,
      enumerable: false,
    });
  }

  get baseUrl() {
    const host = this.host.includes(':') ? `[${this.host}]` : this.host;
    return `https://${host}:${this.port}`;
  }

  /**
   * @param {string} method
   * @param {string} path e.g. `/api/v2/device`
   * @param {unknown} [json] body
   * @returns {Promise<any>} the decoded JSON answer
   */
  async call(method, path, json) {
    let response;
    try {
      response = await this.request(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: this.authorization },
        json,
        insecure: true,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const reason = err?.code === 'ETIMEDOUT' ? 'timeout' : (err?.code ?? err?.message);
      throw new LaMetricError(
        ERROR_KINDS.UNREACHABLE,
        `${this.label} does not answer (${reason})`,
        {
          cause: err,
        },
      );
    }

    const { status, body } = response;
    if (status >= 400) {
      const reason = errorMessage(body) ?? `HTTP ${status}`;
      if (TRANSIENT_STATUSES.has(status)) {
        throw new LaMetricError(
          ERROR_KINDS.UNREACHABLE,
          `${this.label} is temporarily unavailable (${reason})`,
          { status },
        );
      }
      if (status === 401 || status === 403) {
        throw new LaMetricError(ERROR_KINDS.AUTH, `${this.label} refused the API key (${reason})`, {
          status,
        });
      }
      throw new LaMetricError(ERROR_KINDS.REFUSED, `${this.label} refused ${path} (${reason})`, {
        status,
      });
    }
    if (body === '' || body === undefined) {
      return null;
    }
    try {
      return JSON.parse(body);
    } catch (err) {
      throw new LaMetricError(
        ERROR_KINDS.INVALID,
        `${this.label} answered something else than the LaMetric API`,
        { status, cause: err },
      );
    }
  }

  /** State of the clock: display, audio, Bluetooth, Wi-Fi, identity. */
  getDevice() {
    return this.call('GET', '/api/v2/device');
  }

  /** The installed apps, keyed by package, with their widgets and actions. */
  getApps() {
    return this.call('GET', '/api/v2/device/apps');
  }

  /** @param {object} changes e.g. `{ brightness: 50, brightness_mode: 'manual' }` */
  setDisplay(changes) {
    return this.call('PUT', '/api/v2/device/display', changes);
  }

  /** @param {number} volume */
  setVolume(volume) {
    return this.call('PUT', '/api/v2/device/audio', { volume });
  }

  /** @param {boolean} active */
  setBluetooth(active) {
    return this.call('PUT', '/api/v2/device/bluetooth', { active });
  }

  nextApp() {
    return this.call('PUT', '/api/v2/device/apps/next');
  }

  previousApp() {
    return this.call('PUT', '/api/v2/device/apps/prev');
  }

  /**
   * Run an action of an installed app (stopwatch, timer, radio...).
   * @param {{ package: string, widgetId: string }} widget
   * @param {string} action e.g. `countdown.configure`
   * @param {object} [params]
   */
  appAction(widget, action, params) {
    const path =
      `/api/v2/device/apps/${encodeURIComponent(widget.package)}` +
      `/widgets/${encodeURIComponent(widget.widgetId)}/actions`;
    // `activate`: show the app while it runs the action, so the user sees
    // the stopwatch start or the radio play.
    return this.call('POST', path, { id: action, ...(params ? { params } : {}), activate: true });
  }

  /**
   * @param {object} notification body built by buildNotification (model.js)
   * @returns {Promise<string|null>} the id the clock gave the notification
   */
  async notify(notification) {
    const answer = await this.call('POST', '/api/v2/device/notifications', notification);
    const id = answer?.success?.id;
    return id === undefined || id === null ? null : String(id);
  }

  /**
   * Dismiss every notification of the queue, the one on screen included.
   * @returns {Promise<number>} how many were dismissed
   */
  async dismissAll() {
    const queue = await this.call('GET', '/api/v2/device/notifications');
    const ids = (Array.isArray(queue) ? queue : [])
      .map((notification) => notification?.id)
      .filter((id) => id !== undefined && id !== null && /^\d+$/.test(String(id)));
    // From the last one: dismissing the first lets the next show for an instant.
    for (const id of ids.reverse()) {
      await this.call('DELETE', `/api/v2/device/notifications/${id}`);
    }
    return ids.length;
  }
}
