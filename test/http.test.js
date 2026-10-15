// -----------------------------------------------------------------------------
// The real transport against a fake LaMetric served in HTTPS, with a
// self-signed certificate like the clocks, on the loopback interface: the
// client reads it, the API key travels in Basic auth, a timeout and a closed
// port are told apart. Nothing leaves the machine.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { httpRequest } from '../src/lametric/http.js';
import { ERROR_KINDS, LaMetricClient } from '../src/lametric/client.js';
import { API_KEY, FakeLaMetric } from './helpers/fakeLaMetric.js';
import { createSelfSignedCertificate } from './helpers/selfSignedCert.js';

const credentials = createSelfSignedCertificate();

/** A fake LaMetric on https://127.0.0.1:<port>, answering through its handler. */
async function withHttpsClock(clock, run) {
  const server = https.createServer(credentials, (req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const answer = clock.handle(req.method, req.url, {
        headers: req.headers,
        json: body ? JSON.parse(body) : undefined,
      });
      res.writeHead(answer.status, answer.headers);
      res.end(answer.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('the client reads a clock served in HTTPS with a self-signed certificate', async () => {
  const clock = new FakeLaMetric();
  await withHttpsClock(clock, async (port) => {
    const client = new LaMetricClient({ host: '127.0.0.1', port, apiKey: API_KEY });
    const device = await client.getDevice();
    assert.equal(device.serial_number, 'SA0000000000TEST001');

    await client.setVolume(30);
    assert.equal(clock.device.audio.volume, 30);
    assert.deepEqual(clock.requests.at(-1), {
      method: 'PUT',
      path: '/api/v2/device/audio',
      json: { volume: 30 },
    });
  });
});

test('the certificate is refused unless the request accepts it', async () => {
  await withHttpsClock(new FakeLaMetric(), async (port) => {
    await assert.rejects(httpRequest(`https://127.0.0.1:${port}/api/v2/device`), (err) => {
      assert.match(err.code, /SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY/);
      return true;
    });
  });
});

test('a wrong API key is an authentication error that does not show the key', async () => {
  await withHttpsClock(new FakeLaMetric(), async (port) => {
    const client = new LaMetricClient({ host: '127.0.0.1', port, apiKey: 'wrong-key' });
    await assert.rejects(client.getDevice(), (err) => {
      assert.equal(err.kind, ERROR_KINDS.AUTH);
      assert.match(err.message, /refused the API key \(Authorization is required\)/);
      assert.ok(!err.message.includes('wrong-key'));
      return true;
    });
  });
});

test('a clock that does not answer in time is unreachable', async () => {
  const server = http.createServer(() => {
    // Never answers.
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await assert.rejects(httpRequest(`http://127.0.0.1:${port}/`, { timeoutMs: 100 }), (err) => {
      assert.equal(err.code, 'ETIMEDOUT');
      return true;
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a closed port is unreachable', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  const client = new LaMetricClient({ host: '127.0.0.1', port, apiKey: API_KEY });
  await assert.rejects(client.getDevice(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.UNREACHABLE);
    assert.match(err.message, /127\.0\.0\.1:\d+ does not answer \(ECONNREFUSED\)/);
    return true;
  });
});
