/**
 * Ensures Elastic Synthetics journey monitor names use 7-bit ASCII only.
 *
 * Non-ASCII punctuation (for example en dash U+2013) has caused Kibana monitor
 * creation to fail. Comments may still use Unicode; this test inspects the
 * TypeScript AST for `journey()` name arguments only.
 *
 * Run with: npm run test:unit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectJourneyNameViolations, formatJourneyNameViolation } from '../helpers/journeyNameAscii';

test('journey monitor names and TLS CSV hosts are ASCII-only', () => {
  const violations = collectJourneyNameViolations();
  assert.equal(
    violations.length,
    0,
    violations.map((v) => formatJourneyNameViolation(v)).join('\n')
  );
});
