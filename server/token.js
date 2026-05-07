'use strict';
/**
 * Lightweight HMAC-SHA256 token module.
 * Tokens are base64url-encoded: <payload>.<signature>
 * Payload contains { oid, exp } where exp is a Unix ms timestamp.
 */
const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  const fixed = pad ? `${b64}${'='.repeat(4 - pad)}` : b64;
  return Buffer.from(fixed, 'base64').toString('utf8');
}

function signToken(payloadObj, secret) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let data;
  try {
    data = JSON.parse(fromB64url(payload));
  } catch {
    return null;
  }
  if (!data?.exp || Date.now() > data.exp) return null;
  return data;
}

module.exports = { signToken, verifyToken, b64url, fromB64url };

