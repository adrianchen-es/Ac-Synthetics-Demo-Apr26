/**
 * CLI: fail if any Synthetics journey monitor name contains non-ASCII characters.
 *
 * Run: npm run check:journey-names
 */

import { collectJourneyNameViolations, formatJourneyNameViolation } from '../helpers/journeyNameAscii';

const root = process.cwd();
const violations = collectJourneyNameViolations(root);

if (violations.length > 0) {
  for (const v of violations) {
    console.error(formatJourneyNameViolation(v));
    if (v.fragment) {
      console.error(`  fragment: ${v.fragment}`);
    }
  }
  process.exit(1);
}

console.log('Journey monitor names are ASCII-only (no violations).');
