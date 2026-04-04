/**
 * TLS-Only Certificate Hash Journey
 *
 * Extracts the SHA-1 and SHA-256 fingerprints of a remote server's TLS
 * certificate and verifies the certificate has not expired.  Uses the Node.js
 * built-in `tls` module — no browser is launched, keeping execution time and
 * resource usage to an absolute minimum.
 *
 * Environment variables
 * ─────────────────────
 *   TLS_TARGET_HOST   Hostname to inspect (default: example.com)
 *   TLS_TARGET_PORT   Port to connect on  (default: 443)
 *
 * Push this monitor to Elastic with:
 *   npm run push
 */

import { journey, step, expect } from '@elastic/synthetics';
import { fetchCertInfo, logCertInfo } from '../helpers/tls';

const TARGET_HOST = process.env['TLS_TARGET_HOST'] ?? 'example.com';
const TARGET_PORT = parseInt(process.env['TLS_TARGET_PORT'] ?? '443', 10);

journey('TLS Certificate Hash – Generic Host', ({ page: _page, params }) => {
  // Allow the target host/port to be overridden via Elastic monitor params.
  const host: string = (params['host'] as string | undefined) ?? TARGET_HOST;
  const port: number =
    typeof params['port'] === 'number' ? (params['port'] as number) : TARGET_PORT;

  step(`Extract TLS certificate fingerprints from ${host}:${port}`, async () => {
    const cert = await fetchCertInfo(host, port);

    logCertInfo(host, port, cert);

    // Assert well-formed SHA-1 (20 bytes → 20 colon-separated pairs).
    expect(cert.sha1).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
    // Assert well-formed SHA-256 (32 bytes → 32 colon-separated pairs).
    expect(cert.sha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  step('Verify certificate is not expired', async () => {
    const cert = await fetchCertInfo(host, port);
    const now = new Date();

    expect(
      cert.validTo.getTime(),
      `Certificate for ${host} has expired or is expiring`
    ).toBeGreaterThan(now.getTime());
  });
});

