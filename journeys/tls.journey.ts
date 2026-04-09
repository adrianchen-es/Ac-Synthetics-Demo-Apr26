/**
 * badssl.com Additional Links TLS Journey
 *
 * Extracts the SHA-256 fingerprint of various badssl target URLs
 * verifying that the TLS checks collect the hostname reported in
 * place of `about:blank`.
 *
 * Push this monitor to Elastic with:
 *   npm run push
 */

import { journey, step, expect } from '@elastic/synthetics';
import { fetchCertInfo, checkCertTrusted, logCertInfo } from '../helpers/tls';

const TARGET_HOSTS = [
  'expired.badssl.com',
  'no-sct.badssl.com',
  'wrong.host.badssl.com',
  'untrusted-root.badssl.com',
  'pinning-test.badssl.com',
  'hsts.badssl.com',
  'upgrade.badssl.com',
  'https-everywhere.badssl.com',
];

for (const host of TARGET_HOSTS) {
  journey(`TLS Certificate Check – ${host}`, ({ page }) => {
    step(`TLS Validation for ${host}:443`, async () => {
      // Configure telemetry to report hostnames in place of about:blank
      // This is crucial for Synthetics UI to display the actual URL tested
      // instead of "about:blank". We don't want to actually load the page
      // content because certificate errors would break the Playwright request.
      await page.route('**/*', route => route.fulfill({ status: 200, body: 'TLS check context' }));
      await page.goto(`https://${host}`, { waitUntil: 'commit' });

      const cachedCert = await fetchCertInfo(host, 443);
      const trusted = await checkCertTrusted(host, 443);
      const now = new Date();

      logCertInfo(host, 443, cachedCert);

      // Assert well-formed SHA-256 (32 bytes → 32 colon-separated pairs).
      expect(cachedCert.sha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);

      expect(
        cachedCert.validTo.getTime(),
        `TLS certificate for ${host} has expired`
      ).toBeGreaterThan(now.getTime());

      try {
        expect(trusted).toBe(true);
      } catch (error) {
        throw new Error(`Custom failure: Trust status is 'false'. Details: ${JSON.stringify({
          trust: {
            status: trusted,
          },
        })}`);
      }
    });
  });
}
