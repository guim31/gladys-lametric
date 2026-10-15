// -----------------------------------------------------------------------------
// In-memory LaMetric clocks behind the `request` seam of the client
// (src/lametric/http.js), on a fake network of IP addresses. Answers are the
// real ones of test/fixtures/lametric/, with the behaviors that matter: the
// API key (Basic auth, user `dev`), the display, audio and Bluetooth writes,
// app switching and app actions, the notification queue (a SKY refuses a
// sound: it has no speaker), the UPnP description served for SSDP, and a
// clock that stops answering.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/lametric/${name}.json`, import.meta.url), 'utf8'));
export const fixtureText = (name) =>
  readFileSync(new URL(`../fixtures/lametric/${name}`, import.meta.url), 'utf8');

// Invented, 64 hexadecimal characters like a real key.
export const API_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
export const OTHER_KEY = 'f'.repeat(64);

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? '' : JSON.stringify(body),
});
const errorAnswer = (status, message) => json(status, { errors: [{ message }] });

export class FakeLaMetric {
  /**
   * @param {object} [options]
   * @param {string} [options.device] fixture of GET /api/v2/device
   * @param {string|null} [options.apps] fixture of GET /api/v2/device/apps, null for a 404
   * @param {string} [options.apiKey]
   * @param {string} [options.serial] overrides the serial number of the fixture
   * @param {string} [options.name] overrides the name of the fixture
   * @param {boolean} [options.announces] answers SSDP searches
   */
  constructor({
    device = 'device-time-fw3',
    apps = 'apps-time-fw3',
    apiKey = API_KEY,
    serial,
    name,
    announces = true,
  } = {}) {
    this.device = fixture(device);
    if (serial) {
      this.device.serial_number = serial;
    }
    if (name) {
      this.device.name = name;
    }
    this.apps = apps === null ? null : fixture(apps);
    this.apiKey = apiKey;
    this.announces = announces;
    this.online = true;
    this.notifications = [];
    this.nextNotificationId = 1;
    this.actions = [];
    /** @type {Array<{ method: string, path: string, json?: unknown }>} */
    this.requests = [];
  }

  get serial() {
    return this.device.serial_number;
  }

  authorized(headers = {}) {
    const expected = `Basic ${Buffer.from(`dev:${this.apiKey}`).toString('base64')}`;
    return headers.authorization === expected;
  }

  /** The UPnP description, served on port 44057 like a real clock. */
  description() {
    return fixtureText('device-description.xml')
      .replace('SA0000000000TEST001', this.serial)
      .replace('LaMetric Time (LM0001)', `LaMetric Time (${this.device.name})`);
  }

  visibleApp() {
    const widgets = this.orderedWidgets();
    return widgets.find((widget) => widget.widget.visible) ?? null;
  }

  orderedWidgets() {
    return Object.entries(this.apps ?? {})
      .flatMap(([pkg, app]) =>
        Object.entries(app.widgets ?? {}).map(([id, widget]) => ({ pkg, id, widget })),
      )
      .sort((a, b) => a.widget.index - b.widget.index);
  }

  switchApp(step) {
    const widgets = this.orderedWidgets();
    if (widgets.length === 0) {
      return;
    }
    const at = Math.max(
      0,
      widgets.findIndex((entry) => entry.widget.visible),
    );
    for (const entry of widgets) {
      entry.widget.visible = false;
    }
    widgets[(at + step + widgets.length) % widgets.length].widget.visible = true;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {object} options `{ headers, json }`
   */
  handle(method, path, { headers, json: body } = {}) {
    this.requests.push({ method, path, json: body });
    if (!this.authorized(headers)) {
      return errorAnswer(401, 'Authorization is required');
    }
    const display = this.device.display;

    if (method === 'GET' && path === '/api/v2/device') {
      return json(200, this.device);
    }
    if (method === 'GET' && path === '/api/v2/device/apps') {
      return this.apps === null ? errorAnswer(404, 'Not found') : json(200, this.apps);
    }
    if (method === 'PUT' && path === '/api/v2/device/display') {
      if (body.brightness !== undefined) {
        const { min, max } = display.brightness_limit;
        if (body.brightness < min || body.brightness > max) {
          return errorAnswer(400, 'Brightness is out of range');
        }
        display.brightness = body.brightness;
      }
      if (body.brightness_mode !== undefined) {
        display.brightness_mode = body.brightness_mode;
      }
      if (body.on !== undefined) {
        display.on = body.on;
      }
      if (body.screensaver?.enabled !== undefined && display.screensaver) {
        display.screensaver.enabled = body.screensaver.enabled;
      }
      return json(200, { success: { data: display, path } });
    }
    if (method === 'PUT' && path === '/api/v2/device/audio') {
      if (!this.device.audio || this.device.audio.available === false) {
        return errorAnswer(400, 'Audio is not available');
      }
      this.device.audio.volume = body.volume;
      return json(200, { success: { data: this.device.audio, path } });
    }
    if (method === 'PUT' && path === '/api/v2/device/bluetooth') {
      this.device.bluetooth.active = body.active;
      return json(200, { success: { data: this.device.bluetooth, path } });
    }
    if (
      method === 'PUT' &&
      (path === '/api/v2/device/apps/next' || path === '/api/v2/device/apps/prev')
    ) {
      this.switchApp(path.endsWith('next') ? 1 : -1);
      return json(200, { success: { data: {}, path } });
    }
    const action = path.match(/^\/api\/v2\/device\/apps\/([^/]+)\/widgets\/([^/]+)\/actions$/);
    if (method === 'POST' && action) {
      const pkg = decodeURIComponent(action[1]);
      const widgetId = decodeURIComponent(action[2]);
      const app = this.apps?.[pkg];
      if (!app?.widgets?.[widgetId] || !(body.id in (app.actions ?? {}))) {
        return errorAnswer(404, 'Not found');
      }
      this.actions.push({ package: pkg, widgetId, ...body });
      return json(200, { success: { data: {}, path } });
    }
    if (method === 'POST' && path === '/api/v2/device/notifications') {
      if (!Array.isArray(body?.model?.frames) || body.model.frames.length === 0) {
        return errorAnswer(400, 'Frames are required');
      }
      if (body.model.sound && this.device.audio?.available === false) {
        return errorAnswer(400, 'Sound is not supported');
      }
      const id = String(this.nextNotificationId++);
      this.notifications.push({ id, ...body });
      return json(201, { success: { id } });
    }
    if (method === 'GET' && path === '/api/v2/device/notifications') {
      return json(200, this.notifications);
    }
    const one = path.match(/^\/api\/v2\/device\/notifications\/(\d+)$/);
    if (method === 'DELETE' && one) {
      const before = this.notifications.length;
      this.notifications = this.notifications.filter((n) => n.id !== one[1]);
      return before === this.notifications.length
        ? errorAnswer(404, 'Notification not found')
        : json(200, { success: { id: one[1] } });
    }
    return errorAnswer(404, 'Not found');
  }
}

/**
 * A fake network: clocks by IP address, reached through the `request` seam.
 * @param {Record<string, FakeLaMetric>} clocks
 */
export function createNetwork(clocks) {
  const network = {
    clocks,
    /** Every request, with its URL and headers, to check what left the container. */
    log: [],
    async request(url, options = {}) {
      const target = new URL(url);
      network.log.push({ url, headers: options.headers ?? {}, json: options.json });
      const clock = network.clocks[target.hostname];
      if (!clock || !clock.online) {
        const error = new Error(`connect ECONNREFUSED ${target.hostname}:${target.port}`);
        error.code = clock ? 'ETIMEDOUT' : 'ECONNREFUSED';
        throw error;
      }
      if (target.port === '44057') {
        return { status: 200, headers: { 'content-type': 'text/xml' }, body: clock.description() };
      }
      if (target.protocol !== 'https:' || target.port !== '4343') {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      // A JSON round trip, like the wire.
      const body =
        options.json === undefined ? undefined : JSON.parse(JSON.stringify(options.json));
      return clock.handle(options.method ?? 'GET', target.pathname, {
        headers: options.headers,
        json: body,
      });
    },
    /** The raw SSDP answers the core would relay. */
    ssdpResults() {
      return Object.entries(network.clocks)
        .filter(([, clock]) => clock.announces && clock.online)
        .map(([address]) => ({
          source_ip: address,
          source_port: 1900,
          headers: fixtureText('ssdp-response.txt').replaceAll('192.0.2.10', address),
        }));
    },
  };
  return network;
}
