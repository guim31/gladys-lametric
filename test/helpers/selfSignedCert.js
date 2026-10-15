// -----------------------------------------------------------------------------
// A throw-away self-signed certificate, generated at test time with
// node:crypto only (an EC P-256 key, a minimal X.509 v3 certificate encoded
// by hand in DER): a real HTTPS server on the loopback interface, like the
// device API of a LaMetric, without a private key stored in the repository.
// -----------------------------------------------------------------------------

import { generateKeyPairSync, sign } from 'node:crypto';

function length(n) {
  if (n < 0x80) {
    return Buffer.from([n]);
  }
  const bytes = [];
  for (let rest = n; rest > 0; rest >>= 8) {
    bytes.unshift(rest & 0xff);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
};
const sequence = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
const integer = (n) => tlv(0x02, Buffer.from([n]));
const utf8 = (text) => tlv(0x0c, Buffer.from(text, 'utf8'));
const bitString = (bytes) => tlv(0x03, Buffer.concat([Buffer.from([0]), bytes]));
const explicit = (n, inner) => tlv(0xa0 + n, inner);
const utcTime = (date) =>
  tlv(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));

function oid(dotted) {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const value of rest) {
    const encoded = [value & 0x7f];
    for (let v = value >> 7; v > 0; v >>= 7) {
      encoded.unshift((v & 0x7f) | 0x80);
    }
    bytes.push(...encoded);
  }
  return tlv(0x06, Buffer.from(bytes));
}

const toPem = (label, der) =>
  `-----BEGIN ${label}-----\n${der
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END ${label}-----\n`;

/**
 * @param {string} [commonName]
 * @returns {{ key: string, cert: string }} PEM, for https.createServer
 */
export function createSelfSignedCertificate(commonName = 'lametric.test') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecdsaWithSha256 = sequence(oid('1.2.840.10045.4.3.2'));
  const name = sequence(set(sequence(oid('2.5.4.3'), utf8(commonName))));
  const now = Date.now();
  const tbs = sequence(
    explicit(0, integer(2)), // v3
    integer(1), // serial number
    ecdsaWithSha256,
    name, // issuer: itself
    sequence(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 86_400_000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const certificate = sequence(tbs, ecdsaWithSha256, bitString(sign('sha256', tbs, privateKey)));
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: toPem('CERTIFICATE', certificate),
  };
}
