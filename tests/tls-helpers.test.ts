/**
 * Unit tests for helpers/tls.ts
 *
 * These tests cover the pure utility functions only — no network calls are
 * made, so they run reliably in CI without external connectivity.
 *
 * Run with:
 *   npm run test:unit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFingerprint, colonSeparated } from '../helpers/tls';

// ─────────────────────────────────────────────────────────────────────────────
// colonSeparated
// ─────────────────────────────────────────────────────────────────────────────

test('colonSeparated: formats 2-char hex string', () => {
  assert.equal(colonSeparated('AB'), 'AB');
});

test('colonSeparated: formats 4-char hex string', () => {
  assert.equal(colonSeparated('AABB'), 'AA:BB');
});

test('colonSeparated: formats 6-char hex string', () => {
  assert.equal(colonSeparated('AABBCC'), 'AA:BB:CC');
});

test('colonSeparated: formats SHA-1 length (40 chars → 20 pairs)', () => {
  const hex = 'A'.repeat(40);
  const result = colonSeparated(hex);
  const pairs = result.split(':');
  assert.equal(pairs.length, 20, 'Should produce 20 pairs for SHA-1');
  assert.ok(pairs.every((p) => p.length === 2), 'Each pair should be 2 chars');
});

test('colonSeparated: formats SHA-256 length (64 chars → 32 pairs)', () => {
  const hex = 'F'.repeat(64);
  const result = colonSeparated(hex);
  const pairs = result.split(':');
  assert.equal(pairs.length, 32, 'Should produce 32 pairs for SHA-256');
  assert.ok(pairs.every((p) => p.length === 2), 'Each pair should be 2 chars');
});

test('colonSeparated: throws on odd-length hex string', () => {
  assert.throws(
    () => colonSeparated('ABC'),
    /colonSeparated/,
    'Should throw for odd-length hex'
  );
});

test('colonSeparated: handles empty string by throwing', () => {
  assert.throws(() => colonSeparated(''), /colonSeparated/);
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFingerprint
// ─────────────────────────────────────────────────────────────────────────────

test('computeFingerprint: SHA-1 of empty buffer produces 40-char hex', () => {
  const result = computeFingerprint(Buffer.alloc(0), 'sha1');
  assert.equal(result.length, 40);
  assert.match(result, /^[0-9A-F]{40}$/);
});

test('computeFingerprint: SHA-256 of empty buffer produces 64-char hex', () => {
  const result = computeFingerprint(Buffer.alloc(0), 'sha256');
  assert.equal(result.length, 64);
  assert.match(result, /^[0-9A-F]{64}$/);
});

test('computeFingerprint: output is upper-cased', () => {
  const result = computeFingerprint(Buffer.from('hello'), 'sha1');
  assert.equal(result, result.toUpperCase());
});

test('computeFingerprint: SHA-1 of known input matches expected digest', () => {
  // SHA-1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
  const result = computeFingerprint(Buffer.alloc(0), 'sha1');
  assert.equal(result, 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
});

test('computeFingerprint: SHA-256 of known input matches expected digest', () => {
  // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  const result = computeFingerprint(Buffer.alloc(0), 'sha256');
  assert.equal(
    result,
    'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
  );
});

test('computeFingerprint: different buffers produce different digests', () => {
  const a = computeFingerprint(Buffer.from('hello'), 'sha256');
  const b = computeFingerprint(Buffer.from('world'), 'sha256');
  assert.notEqual(a, b);
});

test('computeFingerprint: same buffer always produces same digest', () => {
  const buf = Buffer.from('deterministic');
  const r1 = computeFingerprint(buf, 'sha256');
  const r2 = computeFingerprint(buf, 'sha256');
  assert.equal(r1, r2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: colonSeparated(computeFingerprint(...)) produces valid format
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: In production code, fetchCertInfo() reads cert.fingerprint256 directly
// from the TLS handshake — no extra hashing step.  computeFingerprint is still
// available for cases where you have a raw DER buffer and need a specific hash.

test('colonSeparated(computeFingerprint(...)): valid SHA-256 fingerprint format', () => {
  const der = Buffer.from('fake-cert-der');
  const fp = colonSeparated(computeFingerprint(der, 'sha256'));
  assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, 'SHA-256 fingerprint format should match');
});

test('colonSeparated(computeFingerprint(...)): SHA-1 optional – still produces valid format when used', () => {
  const der = Buffer.from('fake-cert-der');
  // SHA-1 is optional in CertInfo; this tests the utility function directly.
  const fp = colonSeparated(computeFingerprint(der, 'sha1'));
  assert.match(fp, /^([0-9A-F]{2}:){19}[0-9A-F]{2}$/, 'SHA-1 fingerprint format should match when computed');
});
