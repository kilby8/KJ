import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

// token.js is CommonJS — use createRequire to import it in ESM test context
const require = createRequire(import.meta.url);
const { signToken, verifyToken, b64url, fromB64url } = require('../../server/token.js');

const SECRET = 'test-secret-do-not-use-in-production';

// ── b64url / fromB64url round-trip ────────────────────────────────────────────
describe('b64url / fromB64url', () => {
  it('round-trips ASCII strings', () => {
    const input = '{"oid":"abc123","exp":9999999999999}';
    expect(fromB64url(b64url(input))).toBe(input);
  });

  it('produces URL-safe output (no +, /, or =)', () => {
    const encoded = b64url('hello world test padding!!');
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

// ── signToken / verifyToken ───────────────────────────────────────────────────
describe('signToken + verifyToken', () => {
  it('signs and verifies a valid token', () => {
    const exp = Date.now() + 60_000;
    const token = signToken({ oid: 'order-1', exp }, SECRET);
    const result = verifyToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result.oid).toBe('order-1');
    expect(result.exp).toBe(exp);
  });

  it('returns null for an expired token', () => {
    const exp = Date.now() - 1; // already expired
    const token = signToken({ oid: 'order-2', exp }, SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('returns null when token is missing the exp field', () => {
    const token = signToken({ oid: 'order-3' }, SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('returns null for a tampered payload', () => {
    const exp = Date.now() + 60_000;
    const token = signToken({ oid: 'order-4', exp }, SECRET);
    const [payload, sig] = token.split('.');
    // Flip one char in the payload to simulate tampering
    const tampered = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A');
    expect(verifyToken(`${tampered}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null for a tampered signature', () => {
    const exp = Date.now() + 60_000;
    const token = signToken({ oid: 'order-5', exp }, SECRET);
    const [payload, sig] = token.split('.');
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyToken(`${payload}.${tamperedSig}`, SECRET)).toBeNull();
  });

  it('returns null when signed with a different secret', () => {
    const exp = Date.now() + 60_000;
    const token = signToken({ oid: 'order-6', exp }, 'wrong-secret');
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('returns null for a null token', () => {
    expect(verifyToken(null, SECRET)).toBeNull();
  });

  it('returns null for a token with no dot separator', () => {
    expect(verifyToken('nodothere', SECRET)).toBeNull();
  });

  it('returns null for a completely empty string', () => {
    expect(verifyToken('', SECRET)).toBeNull();
  });

  it('tokens signed with different secrets do not cross-verify', () => {
    const exp = Date.now() + 60_000;
    const t1 = signToken({ oid: 'x', exp }, 'secret-a');
    const t2 = signToken({ oid: 'x', exp }, 'secret-b');
    expect(verifyToken(t1, 'secret-b')).toBeNull();
    expect(verifyToken(t2, 'secret-a')).toBeNull();
  });
});

