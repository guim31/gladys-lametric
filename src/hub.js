// -----------------------------------------------------------------------------
// The LaMetric hub: one record per configured slot, each clock read on a
// timer of the container (the interval chosen in the configuration), its
// states published to Gladys when they change, and the commands of the
// dashboard, the widget and the scene actions.
//
// Refreshing: the devices are published with should_poll: true at one
// minute, but the core cannot be trusted to call onPoll (a device created
// without should_poll is never polled, GladysAssistant/Gladys#3198), so the
// hub reads the clocks itself. The core's onPoll stays as a fallback: it reads
// a clock only when the timer has not done it for 90 % of a period, and the
// timer skips a clock the core read less than half a period ago.
//
// Every configured clock is read, added to Gladys or not: the reading feeds
// the Discovery tab, the connection status and the widget. Only the states of
// the devices added to Gladys are published (the core drops the others).
//
// Addresses: a slot without address, or a known clock that stopped answering
// at its address, is looked for on the network (SSDP through the core, at most
// every 5 minutes on its own, at once from the Discover tab or the "Test the
// connection" button).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_PORT, formatAddress } from './config.js';
import {
  APP_COMMANDS,
  FEATURE_KEYS,
  buildDevice,
  deviceIds,
  featureStates,
  modelLabel,
} from './devices.js';
import { discoverClocks } from './discovery.js';
import { createIssueLog } from './issues.js';
import { ERROR_KINDS, LaMetricClient, LaMetricError } from './lametric/client.js';
import { buildNotification, parseApps, parseDevice } from './lametric/model.js';
import {
  APP_NAMES,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  LANGS,
  PROBLEM_TEXT,
  REPORT_TEXT,
  format,
  localize,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'lametric' });

export const WIDGET_KEY = 'lametric';

export const HUB_TIMINGS = {
  // Automatic network search, at most this often (a missing or moved clock).
  scanRetryMs: 5 * 60_000,
  // An unchanged value is sent again this often: the dashboard says "no
  // recent value" past 48 hours.
  heartbeatMs: 6 * 60 * 60_000,
};

// The timer skips a clock read less than this share of a period ago, the
// core's onPoll one read less than that share.
const TIMER_MIN_GAP = 0.5;
const CORE_MIN_GAP = 0.9;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const signature = (clock) => JSON.stringify([clock.address, clock.apiKey]);
const sameSerial = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** "5 min", "1 min 30 s", "45 s": readable in the four languages. */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) {
    return `${rest} s`;
  }
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** An error of a command, the scene or the widget, in the user's language. */
export class UserError extends Error {
  constructor(texts, values = {}, language = 'en') {
    const message = localize(texts, values);
    super(pick(message, language));
    this.name = 'UserError';
    this.texts = message;
  }
}

export class ClockHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/lametric/http.js)
   * @param {boolean} [options.timers] the reading timer (off in most tests)
   * @param {() => number} [options.now]
   * @param {object} [options.timings] HUB_TIMINGS overrides
   */
  constructor({ gladys, request, timers = true, now = () => Date.now(), timings } = {}) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.now = now;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = { clocks: [], invalidSlots: [], pollIntervalMs: 30_000, language: 'fr' };
    /** @type {Map<number, object>} records, by slot */
    this.records = new Map();
    /** Clocks found by the last network search, null when it failed. */
    this.discovered = [];
    this.lastScanAt = null;
    this.publishedDevices = null;
    this.connectionKey = null;
    this.widgetKey = null;
    this.timer = null;
    this.stopped = false;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.publishedDevices = null;
    this.connectionKey = null;
    this.widgetKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const wanted = new Map(config.clocks.map((clock) => [clock.slot, clock]));
    for (const [slot, record] of this.records) {
      const clock = wanted.get(slot);
      if (!clock || signature(clock) !== record.signature) {
        record.dropped = true;
        this.records.delete(slot);
      }
    }
    for (const clock of config.clocks) {
      if (!this.records.has(clock.slot)) {
        this.records.set(clock.slot, this.newRecord(clock));
      }
    }
    await this.refresh({ minGap: 0 });
    this.schedule();
  }

  newRecord(clock) {
    const record = {
      slot: clock.slot,
      clock,
      signature: signature(clock),
      address: null,
      found: false,
      client: null,
      snapshot: null,
      apps: null,
      serial: null,
      error: null,
      polling: null,
      polledAt: null,
      dropped: false,
    };
    if (clock.address) {
      this.setAddress(record, clock.address, false);
    }
    return record;
  }

  setAddress(record, address, found) {
    record.address = address;
    record.found = found;
    record.client = record.clock.apiKey
      ? new LaMetricClient({
          host: address.host,
          port: address.port,
          apiKey: record.clock.apiKey,
          request: this.request,
        })
      : null;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.refresh({ minGap: TIMER_MIN_GAP });
        this.issues.ok('cycle', 'Reading cycle works again');
      } catch (err) {
        this.issues.fail('cycle', `Reading cycle failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, this.config.pollIntervalMs);
  }

  label(record) {
    const name = record.snapshot?.name;
    const where = record.address ? formatAddress(record.address) : null;
    const details = [name, where].filter(Boolean).join(', ');
    return details ? `LaMetric ${record.slot} (${details})` : `LaMetric ${record.slot}`;
  }

  /** The short name of a clock in a user-facing text. */
  clockName(record) {
    return record.snapshot?.name
      ? `LaMetric ${record.slot} (${record.snapshot.name})`
      : `LaMetric ${record.slot}`;
  }

  // --- Reading -------------------------------------------------------------------

  /**
   * One cycle: search the network when needed, read the clocks, publish.
   * @param {object} [options]
   * @param {boolean} [options.scan] search the network whatever happens
   * @param {number} [options.minGap] skip a clock read less than this share of a period ago
   */
  async refresh({ scan = false, minGap = 0 } = {}) {
    if (this.gladys.connected === false) {
      logger.debug('Gladys unreachable: reading skipped');
      return;
    }
    if (scan || this.needsScan()) {
      await this.search();
    }
    const period = this.config.pollIntervalMs;
    await Promise.all(
      [...this.records.values()]
        .filter(
          (record) => record.polledAt === null || this.now() - record.polledAt >= period * minGap,
        )
        .map((record) => this.poll(record)),
    );
    // A known clock that just stopped answering may have a new address
    // (DHCP): look for it now rather than at the next cycle.
    if (this.needsScan()) {
      const before = new Map([...this.records.values()].map((record) => [record, record.client]));
      await this.search();
      await Promise.all(
        [...this.records.values()]
          .filter((record) => record.client && record.client !== before.get(record))
          .map((record) => this.poll(record, { force: true })),
      );
    }
    await this.afterCycle();
  }

  needsScan() {
    const lost = [...this.records.values()].some(
      (record) =>
        record.clock.apiKey &&
        (!record.address || (record.serial && record.error?.kind === ERROR_KINDS.UNREACHABLE)),
    );
    return (
      lost && (this.lastScanAt === null || this.now() - this.lastScanAt >= this.timings.scanRetryMs)
    );
  }

  /**
   * Read one clock. Concurrent callers share the read; `force` waits for a
   * read in progress (it may predate a command) and reads again.
   */
  async poll(record, { force = false } = {}) {
    while (force && record.polling) {
      await record.polling.catch(() => {});
    }
    if (record.polling) {
      return record.polling;
    }
    record.polling = this.read(record).finally(() => {
      record.polling = null;
    });
    return record.polling;
  }

  async read(record) {
    record.polledAt = this.now();
    if (!record.clock.apiKey) {
      this.markFailure(record, { kind: 'missingKey', message: 'no API key in the configuration' });
      return;
    }
    if (!record.client) {
      this.markFailure(record, { kind: 'notFound', message: 'not found on the network' });
      return;
    }
    const client = record.client;
    try {
      const [rawDevice, rawApps] = await Promise.all([
        client.getDevice(),
        client.getApps().catch((err) => err),
      ]);
      if (record.dropped || client !== record.client) {
        return;
      }
      const snapshot = parseDevice(rawDevice);
      const appsKey = `apps:${record.slot}`;
      if (rawApps instanceof Error) {
        this.issues.fail(appsKey, `${this.label(record)}: apps not read (${rawApps.message})`);
      } else {
        record.apps = parseApps(rawApps);
        this.issues.ok(appsKey, `${this.label(record)}: apps read again`);
      }
      this.markSuccess(record, snapshot);
    } catch (err) {
      if (!(err instanceof LaMetricError)) {
        throw err;
      }
      if (!record.dropped && client === record.client) {
        this.markFailure(record, err);
      }
    }
  }

  markSuccess(record, snapshot) {
    const previous = record.error;
    const first = record.snapshot === null;
    record.snapshot = snapshot;
    record.serial = snapshot.serial;
    record.error = null;
    if (previous && !first) {
      logger.info(`${this.label(record)}: answers again`);
    } else if (first) {
      logger.info(
        `${this.label(record)}: connected, ${modelLabel(snapshot)}, firmware ${snapshot.firmware ?? '?'}`,
      );
    }
  }

  markFailure(record, err) {
    const previous = record.error?.kind;
    record.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (previous !== err.kind) {
      logger.warn(`${this.label(record)}: ${err.message}`);
    } else {
      logger.debug(`${this.label(record)}: ${err.message} (again)`);
    }
  }

  // --- Network search ------------------------------------------------------------

  /**
   * Search the network for LaMetric clocks, and give an address to the slots
   * that need one.
   * @returns {Promise<Array|null>} the clocks found, null when the search failed
   */
  async search() {
    this.lastScanAt = this.now();
    let found;
    try {
      found = await discoverClocks(this.gladys, { request: this.request });
      this.issues.ok('scan', 'The network search works again');
    } catch (err) {
      this.issues.fail('scan', `Network search failed (${err.message})`);
      this.discovered = null;
      return null;
    }
    logger.debug(`Network search: ${found.length} LaMetric answered`);
    this.discovered = found;
    await this.matchFound(found);
    return found;
  }

  claimedHosts(except) {
    return new Set(
      [...this.records.values()]
        .filter((record) => record !== except && record.address)
        .map((record) => record.address.host),
    );
  }

  async matchFound(found) {
    for (const record of this.records.values()) {
      if (!record.clock.apiKey) {
        continue;
      }
      // A known clock: follow it by its serial number.
      if (record.serial) {
        const same = found.find((clock) => clock.serial && sameSerial(clock.serial, record.serial));
        const lost = !record.address || record.error?.kind === ERROR_KINDS.UNREACHABLE;
        if (same && lost && record.address?.host !== same.address) {
          this.setAddress(record, { host: same.address, port: DEFAULT_PORT }, true);
          logger.info(`${this.label(record)}: found on the network at a new address`);
        }
        continue;
      }
      if (record.address) {
        continue;
      }
      // A key without address: the clock that accepts the key is the one.
      for (const candidate of found) {
        if (this.claimedHosts(record).has(candidate.address)) {
          continue;
        }
        const client = new LaMetricClient({
          host: candidate.address,
          apiKey: record.clock.apiKey,
          request: this.request,
        });
        try {
          parseDevice(await client.getDevice());
        } catch {
          continue; // another clock (another key), or not a LaMetric
        }
        this.setAddress(record, { host: candidate.address, port: DEFAULT_PORT }, true);
        logger.info(`${this.label(record)}: found on the network`);
        break;
      }
    }
  }

  // --- Publishing ------------------------------------------------------------------

  /** The records whose clock answered, one per clock (two slots may name the same). */
  readRecords() {
    const seen = new Set();
    return [...this.records.values()]
      .sort((a, b) => a.slot - b.slot)
      .filter((record) => {
        if (!record.snapshot || seen.has(record.snapshot.serial.toLowerCase())) {
          return false;
        }
        seen.add(record.snapshot.serial.toLowerCase());
        return true;
      });
  }

  async afterCycle() {
    await this.publishDevices();
    for (const record of this.readRecords()) {
      await this.publishStates(record);
    }
    await this.updateConnectionStatus();
    this.refreshWidget();
  }

  /** Publish the discovered devices when they changed (a name, an app installed...). */
  async publishDevices({ force = false } = {}) {
    const devices = this.readRecords().map((record) =>
      buildDevice(this.gladys, record, this.config.language),
    );
    const key = JSON.stringify(devices);
    if (!force && key === this.publishedDevices) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.publishedDevices = key;
      this.issues.ok('publish', 'Devices published again');
    } catch (err) {
      this.issues.fail('publish', `Publishing the devices failed (${err.message})`);
    }
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** Publish the states of a clock added to Gladys: the changed ones, or all of them. */
  async publishStates(record, { force = false } = {}) {
    if (!record.snapshot || record.error) {
      return;
    }
    const ids = deviceIds(this.gladys, record.snapshot.serial);
    if (!this.isCreated(ids.device)) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates(ids.device);
    }
    const key = `states:${record.slot}`;
    try {
      await this.gladys.publishChangedStates(featureStates(this.gladys, record), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.issues.ok(key, `${this.label(record)}: states accepted again`);
    } catch (err) {
      this.issues.fail(key, `${this.label(record)}: states refused by Gladys (${err.message})`);
    }
  }

  /** The problem of each slot, for the status and the report. */
  problems() {
    const list = this.config.invalidSlots.map((slot) => ({
      name: `LaMetric ${slot}`,
      kind: 'invalidAddress',
    }));
    for (const record of [...this.records.values()].sort((a, b) => a.slot - b.slot)) {
      if (record.error) {
        list.push({ name: this.clockName(record), kind: record.error.kind });
      } else if (!record.snapshot) {
        list.push({ name: this.clockName(record), kind: 'waiting' });
      }
    }
    return list;
  }

  async updateConnectionStatus() {
    let connected;
    let message;
    if (this.records.size === 0 && this.config.invalidSlots.length === 0) {
      connected = false;
      message = CONNECTION_TEXT.noClock;
    } else {
      const problems = this.problems();
      connected = problems.length === 0;
      message = connected
        ? undefined
        : Object.fromEntries(
            LANGS.map((lang) => [
              lang,
              problems
                .map(({ name, kind }) =>
                  format(pick(CONNECTION_TEXT.clockProblem, lang), {
                    clock: name,
                    problem: pick(PROBLEM_TEXT[kind], lang),
                  }),
                )
                .join('; ')
                .slice(0, 200),
            ]),
          );
    }
    const key = JSON.stringify([connected, message]);
    if (key === this.connectionKey) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message);
      this.connectionKey = key;
      this.issues.ok('status', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('status', `Connection status refused (${err.message})`);
    }
  }

  /** Nudge the open dashboards when what the widget shows changed. */
  refreshWidget({ force = false } = {}) {
    const key = JSON.stringify(
      [...this.records.values()].map((record) => [
        record.slot,
        record.error?.kind ?? null,
        record.snapshot,
        record.apps?.current ?? null,
      ]),
    );
    if (!force && key === this.widgetKey) {
      return;
    }
    const first = this.widgetKey === null;
    this.widgetKey = key;
    if (!first || force) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Gladys events -----------------------------------------------------------------

  /** "Search" in the Discover tab: search the network, read every clock, publish. */
  async rediscover() {
    await this.search();
    await Promise.all(
      [...this.records.values()].map((record) => this.poll(record, { force: true })),
    );
    await this.publishDevices({ force: true });
    await this.afterCycle();
  }

  deviceIdOf(record) {
    return deviceIds(this.gladys, record.snapshot.serial).device;
  }

  recordByDeviceId(externalId) {
    return this.readRecords().find(
      (record) => deviceIds(this.gladys, record.snapshot.serial).device === externalId,
    );
  }

  /** The core's onPoll (fallback): read the clock unless the timer just did. */
  async pollDevice(device) {
    const record = this.recordByDeviceId(device.external_id);
    if (!record) {
      logger.debug(`onPoll ignored for ${device.external_id}`);
      return;
    }
    if (
      record.polledAt !== null &&
      this.now() - record.polledAt < this.config.pollIntervalMs * CORE_MIN_GAP
    ) {
      logger.debug(`${this.label(record)}: read ${this.now() - record.polledAt} ms ago, skipped`);
      return;
    }
    await this.poll(record);
    await this.afterCycle();
  }

  /** The user added (or updated) a device: its states sent before were dropped. */
  async onDeviceCreated(device) {
    const record = this.recordByDeviceId(device.external_id);
    if (!record) {
      return;
    }
    await this.poll(record, { force: true });
    await this.publishStates(record, { force: true });
    this.refreshWidget({ force: true });
  }

  // --- Commands ------------------------------------------------------------------------

  language() {
    return this.config.language;
  }

  failure(record, err) {
    if (err instanceof LaMetricError) {
      return new UserError(
        ERROR_TEXT.failed,
        (lang) => ({ clock: this.clockName(record), problem: pick(PROBLEM_TEXT[err.kind], lang) }),
        this.language(),
      );
    }
    return err;
  }

  /** A feature of the dashboard (or a scene "control a device"). */
  async setValue(device, feature, value) {
    const record = this.recordByDeviceId(device.external_id);
    if (!record) {
      throw new UserError(ERROR_TEXT.unknownClock, {}, this.language());
    }
    const prefix = `${device.external_id}:`;
    const key = feature.external_id.startsWith(prefix)
      ? feature.external_id.slice(prefix.length)
      : null;
    await this.command(record, key, value);
  }

  /**
   * Run one command on a clock, then read it back and publish.
   * @param {object} record
   * @param {string} key a FEATURE_KEYS value
   * @param {number} [value]
   */
  async command(record, key, value) {
    if (!record.client || !record.snapshot) {
      throw new UserError(ERROR_TEXT.noClock, {}, this.language());
    }
    const { client, snapshot } = record;
    const on = Number(value) !== 0;
    try {
      if (key === FEATURE_KEYS.BRIGHTNESS) {
        const { min, max } = snapshot.display.brightnessLimit;
        // Setting a brightness means choosing it: automatic brightness off.
        await client.setDisplay({
          brightness: clamp(Math.round(Number(value)), min, max),
          brightness_mode: 'manual',
        });
      } else if (key === FEATURE_KEYS.BRIGHTNESS_AUTO) {
        await client.setDisplay({ brightness_mode: on ? 'auto' : 'manual' });
      } else if (key === FEATURE_KEYS.DISPLAY) {
        await client.setDisplay({ on });
      } else if (key === FEATURE_KEYS.SCREENSAVER) {
        await client.setDisplay({ screensaver: { enabled: on } });
      } else if (key === FEATURE_KEYS.VOLUME && snapshot.audio) {
        const { min, max } = snapshot.audio.range;
        await client.setVolume(clamp(Math.round(Number(value)), min, max));
      } else if (key === FEATURE_KEYS.BLUETOOTH && snapshot.bluetooth) {
        await client.setBluetooth(on);
      } else if (key === FEATURE_KEYS.NEXT_APP) {
        await client.nextApp();
      } else if (key === FEATURE_KEYS.PREVIOUS_APP) {
        await client.previousApp();
      } else if (key === FEATURE_KEYS.DISMISS) {
        await client.dismissAll();
      } else if (APP_COMMANDS[key]) {
        const { app, action } = APP_COMMANDS[key];
        await client.appAction(this.appWidget(record, app), action);
      } else {
        throw new UserError(ERROR_TEXT.unknownCommand, {}, this.language());
      }
    } catch (err) {
      throw this.failure(record, err);
    }
    logger.info(`${this.label(record)}: ${key}${value === undefined ? '' : ` = ${value}`}`);
    await this.poll(record, { force: true });
    await this.afterCycle();
  }

  appWidget(record, app) {
    const widget = record.apps?.widgets?.[app];
    if (!widget) {
      throw new UserError(
        ERROR_TEXT.noApp,
        (lang) => ({ app: pick(APP_NAMES[app], lang), clock: this.clockName(record) }),
        this.language(),
      );
    }
    return widget;
  }

  /**
   * The clocks a scene action or a widget button acts on: the chosen one, or
   * every clock that answers.
   * @param {string} [deviceId] a device external id, empty for all
   */
  targets(deviceId) {
    if (deviceId) {
      const record = this.recordByDeviceId(deviceId);
      if (!record) {
        throw new UserError(ERROR_TEXT.unknownClock, {}, this.language());
      }
      return [record];
    }
    const records = this.readRecords().filter((record) => !record.error);
    if (records.length === 0) {
      throw new UserError(ERROR_TEXT.noClock, {}, this.language());
    }
    return records;
  }

  /** Run `task` on every target; throws the first failure when none succeeded. */
  async onTargets(deviceId, task) {
    const records = this.targets(deviceId);
    const results = await Promise.allSettled(records.map((record) => task(record)));
    const done = results.filter((result) => result.status === 'fulfilled');
    results.forEach((result, index) => {
      if (result.status === 'rejected' && records.length > 1) {
        logger.warn(`${this.label(records[index])}: ${result.reason?.message}`);
      }
    });
    if (done.length === 0) {
      const index = results.findIndex((result) => result.status === 'rejected');
      throw this.failure(records[index], results[index].reason);
    }
    return done.map((result) => result.value);
  }

  /**
   * Show a notification (scene action, widget form, test).
   * @param {string} [deviceId] empty: every clock that answers
   * @param {object} fields text, icon, sound, priority, repeat, duration
   * @returns {Promise<{ count: number, ids: string[] }>}
   */
  async notify(deviceId, fields) {
    try {
      buildNotification(fields);
    } catch {
      throw new UserError(ERROR_TEXT.emptyText, {}, this.language());
    }
    const ids = await this.onTargets(deviceId, async (record) => {
      const { body, warnings } = buildNotification(fields, {
        hasAudio: Boolean(record.snapshot.audio),
      });
      for (const field of warnings) {
        logger.warn(
          `Notification: unknown ${field} "${String(fields[field]).slice(0, 40)}" left out`,
        );
      }
      return record.client.notify(body);
    });
    logger.info(`Notification shown on ${ids.length} LaMetric`);
    return { count: ids.length, ids: ids.filter(Boolean) };
  }

  /**
   * Start the timer app for a duration (scene action).
   * @param {string} [deviceId] empty: every clock that answers
   * @param {number} seconds
   */
  async startTimer(deviceId, seconds) {
    const done = await this.onTargets(deviceId, async (record) => {
      const widget = this.appWidget(record, 'timer');
      try {
        await record.client.appAction(widget, 'countdown.configure', {
          duration: seconds,
          start_now: true,
        });
      } catch (err) {
        throw this.failure(record, err);
      }
      return true;
    });
    logger.info(`Timer of ${formatDuration(seconds)} started on ${done.length} LaMetric`);
    return { count: done.length };
  }

  /** Clear the notifications (widget button). */
  async dismiss(deviceId) {
    const counts = await this.onTargets(deviceId, (record) => record.client.dismissAll());
    const count = counts.reduce((sum, value) => sum + value, 0);
    logger.info(`${count} notification(s) cleared`);
    return { count };
  }

  // --- "Test the connection" -------------------------------------------------------

  /** Search the network, read every clock, and say what works. */
  async testConnection() {
    logger.info('Action test_connection');
    const found = await this.search();
    await Promise.all(
      [...this.records.values()].map((record) => this.poll(record, { force: true })),
    );
    await this.afterCycle();

    const lines = LANGS.map(() => []);
    const add = (texts, values) =>
      LANGS.forEach((lang, i) =>
        lines[i].push(
          format(pick(texts, lang), typeof values === 'function' ? values(lang) : values),
        ),
      );
    for (const slot of this.config.invalidSlots) {
      add(REPORT_TEXT.problem, (lang) => ({
        clock: `LaMetric ${slot}`,
        problem: pick(PROBLEM_TEXT.invalidAddress, lang),
      }));
    }
    for (const record of [...this.records.values()].sort((a, b) => a.slot - b.slot)) {
      if (record.snapshot && !record.error) {
        add(REPORT_TEXT.ok, {
          clock: this.clockName(record),
          model: modelLabel(record.snapshot),
          firmware: record.snapshot.firmware ?? '?',
          address: formatAddress(record.address),
        });
      } else {
        add(REPORT_TEXT.problem, (lang) => ({
          clock: this.clockName(record),
          problem: pick(PROBLEM_TEXT[record.error?.kind ?? 'waiting'], lang),
        }));
      }
    }
    if (found === null) {
      add(REPORT_TEXT.searchUnavailable, {});
    } else {
      const claimed = this.claimedHosts();
      const others = found.filter((clock) => !claimed.has(clock.address));
      if (others.length > 0) {
        const list = others
          .map((clock) => `${clock.name ?? 'LaMetric'} (${clock.address})`)
          .join(', ');
        add(REPORT_TEXT.found, { list });
      } else if (found.length === 0 && this.records.size === 0) {
        add(REPORT_TEXT.noneFound, {});
      } else if (
        found.length === 0 &&
        [...this.records.values()].some((record) => !record.address)
      ) {
        add(REPORT_TEXT.noneFound, {});
      }
    }
    if (lines[0].length === 0) {
      add(CONNECTION_TEXT.noClock, {});
    }
    return Object.fromEntries(LANGS.map((lang, i) => [lang, lines[i].join(' ').slice(0, 1000)]));
  }

  /** The texts of the "done" toasts. */
  static done(key, values) {
    return localize(DONE_TEXT[key], values);
  }
}
