import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseTlsTargetHostsCsv } from '../helpers/loadTlsTargetHosts';

const root = process.cwd();

/**
 * Default CSV path after journeys were split into subfolders.
 * Override with TLS_TARGET_HOSTS_CSV (path relative to repo root), e.g.:
 *   TLS_TARGET_HOSTS_CSV=journeys/tls/tls-target-hosts.csv npm run generate:tls-targets
 */
const defaultCsvRelative = join('journeys', 'tls', 'tls-target-hosts.csv');
const csvRelative = process.env['TLS_TARGET_HOSTS_CSV'] ?? defaultCsvRelative;
const csvPath = join(root, csvRelative);
const outPath = join(root, 'helpers', 'tlsTargetHosts.generated.ts');

const raw = readFileSync(csvPath, 'utf8');
const rows = parseTlsTargetHostsCsv(raw);
const serialized = JSON.stringify(rows, null, 2);

const header = `/**
 * Generated from ${csvRelative} — do not edit by hand.
 * Run: npm run generate:tls-targets
 *
 * Override source CSV with TLS_TARGET_HOSTS_CSV (path relative to repo root).
 */
import type { TlsTargetHost } from './loadTlsTargetHosts';

`;

const file = `${header}export const TLS_TARGET_HOSTS: readonly TlsTargetHost[] = ${serialized};\n`;
writeFileSync(outPath, file, 'utf8');
