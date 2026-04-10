import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseTlsTargetHostsCsv } from '../helpers/loadTlsTargetHosts';

const root = process.cwd();
const csvPath = join(root, 'journeys', 'tls-target-hosts.csv');
const outPath = join(root, 'helpers', 'tlsTargetHosts.generated.ts');

const raw = readFileSync(csvPath, 'utf8');
const rows = parseTlsTargetHostsCsv(raw);
const serialized = JSON.stringify(rows, null, 2);

const header = `/**
 * Generated from journeys/tls-target-hosts.csv — do not edit by hand.
 * Run: npm run generate:tls-targets
 */
import type { TlsTargetHost } from './loadTlsTargetHosts';

`;

const file = `${header}export const TLS_TARGET_HOSTS: readonly TlsTargetHost[] = ${serialized};\n`;
writeFileSync(outPath, file, 'utf8');
