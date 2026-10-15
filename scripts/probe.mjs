#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of a real LaMetric, with the very client of the
// integration: what a clock answers, to check the assumptions taken without
// the hardware. Only GET requests, plus one SSDP search; nothing is written
// to the clock. The output hides what identifies the clock or the home
// (serial number, MAC, IP addresses, Wi-Fi and Bluetooth names) and never
// prints the API key.
//
//   LAMETRIC_API_KEY=<key> node scripts/probe.mjs 192.168.1.20
//   node scripts/probe.mjs 192.168.1.20      without key: checks the refusal
//   node scripts/probe.mjs --ssdp            the network search only
//
// Requires Node 22+, on a machine of the clock's network.
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';
import { parseAddress } from '../src/config.js';
import { SSDP_SEARCH_TARGET, parseDescription, parseSsdpHeaders } from '../src/discovery.js';
import { LaMetricClient } from '../src/lametric/client.js';
import { httpRequest } from '../src/lametric/http.js';
import { parseApps, parseDevice } from '../src/lametric/model.js';

const SECRET_KEYS =
  /^(serial_number|serialNumber|address|mac|ip|ipv4|essid|ssid|netmask|name|id|UDN)$/i;

/** The shape of an answer: keys and value types, identifying values hidden. */
function shape(value, key = '') {
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [shape(value[0], key), `(${value.length} items)`];
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
  }
  if (SECRET_KEYS.test(key) && typeof value === 'string') {
    return `<${key}, ${value.length} chars>`;
  }
  return value;
}

const mask = (text) =>
  String(text)
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b([0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '<mac>')
    .replace(/\bSA[0-9A-Z]{10,}\b/g, '<serial>');

function ssdpSearch(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const answers = [];
    socket.on('message', (message, remote) => {
      answers.push({ source_ip: remote.address, headers: message.toString('utf8') });
    });
    socket.on('error', (err) => {
      console.log(`SSDP: ${err.message}`);
      socket.close();
      resolve(answers);
    });
    socket.bind(() => {
      const request = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\n' +
          `MX: 2\r\nST: ${SSDP_SEARCH_TARGET}\r\n\r\n`,
      );
      socket.send(request, 1900, '239.255.255.250');
      setTimeout(() => {
        socket.close();
        resolve(answers);
      }, timeoutMs);
    });
  });
}

async function probeSsdp() {
  console.log(`\n== SSDP search for ${SSDP_SEARCH_TARGET}`);
  const answers = await ssdpSearch();
  console.log(`${answers.length} answer(s)`);
  for (const answer of answers) {
    const headers = parseSsdpHeaders(answer.headers);
    console.log('headers:', mask(JSON.stringify(headers)));
    if (headers.location) {
      try {
        const response = await httpRequest(headers.location, { insecure: true, timeoutMs: 3000 });
        const description = parseDescription(response.body);
        console.log(`description: HTTP ${response.status},`, {
          serial: description.serial ? `<${description.serial.length} chars>` : null,
          name: description.name ? mask(description.name) : null,
          model: description.model,
          tags: [...new Set(response.body.match(/<([A-Za-z]+)>/g) ?? [])].join(' '),
        });
      } catch (err) {
        console.log(`description: ${err.code ?? err.message}`);
      }
    }
  }
}

async function probeClock(raw) {
  const address = parseAddress(raw);
  if (!address) {
    console.log(`Address not understood: ${raw}`);
    process.exitCode = 2;
    return;
  }
  const apiKey = process.env.LAMETRIC_API_KEY ?? '';
  const client = new LaMetricClient({ ...address, apiKey: apiKey || 'not-a-key' });
  console.log(`== https://<ip>:${address.port}/api/v2, ${apiKey ? 'with' : 'without'} API key`);

  const paths = [
    '/api/v2',
    '/api/v2/device',
    '/api/v2/device/apps',
    '/api/v2/device/display',
    '/api/v2/device/audio',
    '/api/v2/device/bluetooth',
    '/api/v2/device/wifi',
    '/api/v2/device/notifications',
  ];
  for (const path of apiKey ? paths : paths.slice(0, 2)) {
    try {
      const answer = await client.call('GET', path);
      console.log(`\nGET ${path}: OK`);
      console.log(mask(JSON.stringify(shape(answer), null, 1)));
      if (path === '/api/v2/device') {
        const snapshot = parseDevice(answer);
        console.log(
          'parsed:',
          mask(JSON.stringify({ ...snapshot, serial: '<serial>', name: '<name>' })),
        );
      }
      if (path === '/api/v2/device/apps') {
        console.log('parsed:', JSON.stringify(parseApps(answer)));
      }
    } catch (err) {
      console.log(`\nGET ${path}: ${err.kind ?? 'error'}: ${mask(err.message)}`);
    }
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: LAMETRIC_API_KEY=<key> node scripts/probe.mjs <ip> | --ssdp');
  process.exitCode = 2;
} else {
  for (const arg of args) {
    if (arg === '--ssdp') {
      await probeSsdp();
    } else {
      await probeClock(arg);
    }
  }
}
