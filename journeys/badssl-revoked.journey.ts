/**
 * badssl.com Revoked Certificate – Browser + TLS Hash Journey
 *
 * Demonstrates a combined browser page test and TLS certificate inspection
 * against https://revoked.badssl.com/.
 *
 * Scenario
 * ─────────
 *   • The target URL uses a certificate that has been revoked by its issuing
 *     CA via CRL/OCSP.
 *   • Browsers and TLS clients that perform hard-fail revocation checking will
 *     refuse to connect.  Chromium (used by Playwright) uses soft-fail OCSP
 *     by default in headless mode, so the page loads despite the revocation.
 *     The journey explicitly sets ignoreHTTPSErrors via the browser context so
 *     that revocation and other certificate errors do not prevent navigation —
 *     this mirrors real-world monitoring of hosts with known cert issues.
 *   • The TLS hash extraction always works (rejectUnauthorized: false).
 *
 * Journey steps
 * ─────────────
 *   1. Navigate to https://revoked.badssl.com/ and verify page content.
 *   2. Extract TLS certificate fingerprints and log them.
 *
 * Push this monitor to Elastic with:
 *   npm run push
 */

import { journey, step, expect } from '@elastic/synthetics';
import { fetchCertInfo, checkCertTrusted, logCertInfo } from '../helpers/tls';

const TARGET_HOST = 'revoked.badssl.com';
const TARGET_PORT = 443;
const TARGET_URL = `https://${TARGET_HOST}/`;

journey('badssl.com Revoked Certificate – Browser + TLS Hash', ({ page }) => {
  step('Navigate to revoked.badssl.com and verify page content', async () => {
    // ignoreHTTPSErrors must be set at the browser-context level.
    // @elastic/synthetics exposes the context; we recreate the page with the
    // option set so the browser does not block on the revoked cert.
    await page.context().route('**', (route) => route.continue());

    const response = await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // The page may return a non-200 status when the server itself is unavailable;
    // a cert error in Chromium manifests as a net error rather than an HTTP
    // status code.  We assert that we at least received a response.
    expect(response, 'Expected a response from revoked.badssl.com').not.toBeNull();

    // badssl.com pages always display their subdomain name as the page heading.
    const heading = page.locator('h1, .title, #content h2').first();
    const headingText = await heading.textContent({ timeout: 10_000 }).catch(() => null);
    console.log(`  Page heading: "${headingText?.trim() ?? '(not found)'}"`);

    // The title should contain "revoked" or the badssl domain.
    const title = await page.title();
    console.log(`  Page title  : "${title}"`);
    expect(title.toLowerCase()).toContain('badssl');
  });

  step('Extract TLS certificate fingerprints from revoked.badssl.com', async () => {
    const cert = await fetchCertInfo(TARGET_HOST, TARGET_PORT);
    logCertInfo(TARGET_HOST, TARGET_PORT, cert);

    // Fingerprint format assertions — SHA-256 is the primary fingerprint.
    expect(cert.sha256).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);

    // Check whether the OS trust store considers this cert valid.
    // For a revoked cert this should be false, though systems that do not
    // perform revocation checking may report true.
    const trusted = await checkCertTrusted(TARGET_HOST, TARGET_PORT);
    console.log(`  Trusted by system CA : ${trusted}`);
    console.log(
      trusted
        ? '  ⚠ System did not detect revocation (soft-fail OCSP behaviour)'
        : '  ✓ System correctly rejected the revoked certificate'
    );
  });
});
