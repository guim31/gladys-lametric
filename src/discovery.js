// -----------------------------------------------------------------------------
// Finding the clocks on the network: a LaMetric answers the SSDP search for
// `urn:schemas-upnp-org:device:LaMetric:1` (the one Home Assistant listens
// to), with the address of its UPnP description, which holds its serial
// number and its name.
//
// The integration container sits on a bridge network and never sees SSDP:
// the core sends the M-SEARCH and relays the raw answers (mediated discovery,
// manifest `network_discovery`). The description is then read in unicast,
// which crosses the bridge, and only from the very address that answered.
//
// A found clock is not usable on its own: its API key is only on
// developer.lametric.com. Discovery fills in the address of a configured
// slot that has a key but no address, follows a clock whose address changed
// (DHCP), and lists the clocks still to configure.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';
import { httpRequest } from './lametric/http.js';

export const SSDP_SEARCH_TARGET = 'urn:schemas-upnp-org:device:LaMetric:1';
export const SCAN_TIMEOUT_SECONDS = 5;
export const MAX_CANDIDATES = 16;
const DESCRIPTION_TIMEOUT_MS = 3000;
const DESCRIPTION_MAX_BYTES = 64 * 1024;

/** Headers of one raw SSDP answer, keys lower-cased. */
export function parseSsdpHeaders(raw) {
  const headers = {};
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) {
      const key = line.slice(0, at).trim().toLowerCase();
      if (!(key in headers)) {
        headers[key] = line.slice(at + 1).trim();
      }
    }
  }
  return headers;
}

/** The description URL, only when the answering address serves it over HTTP(S). */
function sameHostLocation(location, address) {
  try {
    const url = new URL(location);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return ['http:', 'https:'].includes(url.protocol) && host === address ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The LaMetric answers among the raw results of `scanNetwork('ssdp')`, one
 * per address.
 * @param {Array<{ source_ip: string, headers: string }>} results
 * @returns {Array<{ address: string, location: string|null }>}
 */
export function ssdpCandidates(results) {
  const byAddress = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    const address = result?.source_ip;
    if (typeof address !== 'string' || !isIP(address)) {
      continue;
    }
    const headers = parseSsdpHeaders(result.headers);
    const target = `${headers.st ?? ''} ${headers.nt ?? ''} ${headers.usn ?? ''}`;
    if (!target.includes(SSDP_SEARCH_TARGET)) {
      continue;
    }
    const location = headers.location ? sameHostLocation(headers.location, address) : null;
    const known = byAddress.get(address);
    if (known) {
      known.location ??= location;
      continue;
    }
    if (byAddress.size < MAX_CANDIDATES) {
      byAddress.set(address, { address, location });
    }
  }
  return [...byAddress.values()];
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(raw) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : '';
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** serialNumber, friendlyName and modelName of the root device of a description. */
export function parseDescription(xml) {
  const read = (tag) => {
    const match = String(xml ?? '').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    const value = match ? decodeXml(match[1]) : '';
    return value ? value.slice(0, 64) : null;
  };
  return {
    serial: read('serialNumber'),
    name: read('friendlyName'),
    model: read('modelName'),
  };
}

/**
 * Ask the core for an SSDP search, and read the description of each clock
 * that answered.
 * @param {object} gladys GladysIntegration
 * @param {object} [options]
 * @param {Function} [options.request] HTTP seam
 * @returns {Promise<Array<{ address: string, serial: string|null, name: string|null, model: string|null }>>}
 */
export async function discoverClocks(gladys, { request = httpRequest } = {}) {
  const results = await gladys.scanNetwork('ssdp', { timeoutSeconds: SCAN_TIMEOUT_SECONDS });
  return Promise.all(
    ssdpCandidates(results).map(async ({ address, location }) => {
      const description = location ? await readDescription(request, location) : null;
      return {
        address,
        serial: description?.serial ?? null,
        name: description?.name ?? null,
        model: description?.model ?? null,
      };
    }),
  );
}

async function readDescription(request, location) {
  try {
    const response = await request(location, {
      timeoutMs: DESCRIPTION_TIMEOUT_MS,
      insecure: true,
      headers: { accept: 'text/xml, application/xml' },
    });
    if (response.status !== 200) {
      return null;
    }
    return parseDescription(String(response.body ?? '').slice(0, DESCRIPTION_MAX_BYTES));
  } catch {
    // A clock that answers SSDP but not over HTTP is still a candidate:
    // its address is known, the API key will tell who it is.
    return null;
  }
}
