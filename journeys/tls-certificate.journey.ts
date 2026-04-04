/**
 * TLS Certificate Hash Journey
 *
 * Extracts the SHA-1 and SHA-256 fingerprints of a remote server's TLS
 * certificate using the Node.js built-in `tls` module.  No browser is
 * launched for the certificate extraction step, which keeps execution time
 * and resource usage to an absolute minimum.
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
import * as tls from 'tls';
import * as crypto from 'crypto';

const TARGET_HOST = process.env['TLS_TARGET_HOST'] ?? 'example.com';
const TARGET_PORT = parseInt(process.env['TLS_TARGET_PORT'] ?? '443', 10);

/** Connect to the host, retrieve the raw DER-encoded leaf certificate. */
function fetchLeafCertDer(host: string, port: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        // rejectUnauthorized is intentionally false: the purpose of this journey
        // is to *inspect* the certificate (fingerprints, expiry) regardless of
        // its current validity state.  No authentication handshake or sensitive
        // data is transmitted – the socket is destroyed immediately after
        // getPeerCertificate() returns.
        rejectUnauthorized: false, // lgtm[js/disabling-certificate-validation]
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        socket.destroy();

        if (!cert || !cert.raw) {
          reject(new Error(`No certificate returned from ${host}:${port}`));
          return;
        }

        resolve(cert.raw);
      }
    );

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    // Safety timeout – bail out after 10 s to avoid hanging the monitor.
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error(`TLS connection to ${host}:${port} timed out`));
    });
  });
}

/** Compute hex fingerprint of a DER buffer using the given hash algorithm. */
function fingerprint(derBuffer: Buffer, algorithm: 'sha1' | 'sha256'): string {
  return crypto.createHash(algorithm).update(derBuffer).digest('hex').toUpperCase();
}

/** Format a hex string as colon-separated pairs (e.g. "AB:CD:EF:…"). */
function colonSeparated(hex: string): string {
  return hex.match(/.{2}/g)!.join(':');
}

journey('TLS Certificate Hash Extraction', ({ page: _page, params }) => {
  // Allow the target host/port to be overridden via Elastic monitor params.
  const host: string = (params['host'] as string | undefined) ?? TARGET_HOST;
  const port: number =
    typeof params['port'] === 'number'
      ? (params['port'] as number)
      : TARGET_PORT;

  let sha1Fingerprint = '';
  let sha256Fingerprint = '';

  step(`Connect to ${host}:${port} and extract TLS certificate`, async () => {
    const derBuffer = await fetchLeafCertDer(host, port);

    sha1Fingerprint = colonSeparated(fingerprint(derBuffer, 'sha1'));
    sha256Fingerprint = colonSeparated(fingerprint(derBuffer, 'sha256'));

    console.log(`Host         : ${host}:${port}`);
    console.log(`SHA-1        : ${sha1Fingerprint}`);
    console.log(`SHA-256      : ${sha256Fingerprint}`);

    // Validate that we got well-formed fingerprints.
    expect(sha1Fingerprint).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
    expect(sha256Fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  step('Verify certificate is not expired', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = tls.connect(
        // rejectUnauthorized is intentionally false: we need to read the cert
        // even when it is self-signed or expired.  The socket is destroyed
        // immediately after getPeerCertificate() returns.
        { host, port, servername: host, rejectUnauthorized: false }, // lgtm[js/disabling-certificate-validation]
        () => {
          const cert = socket.getPeerCertificate(false);
          socket.destroy();

          if (!cert || !cert.valid_to) {
            reject(new Error('Certificate validity info unavailable'));
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const now = new Date();
          console.log(`Certificate expires: ${expiresAt.toISOString()}`);

          expect(
            expiresAt.getTime(),
            `Certificate for ${host} has expired or is expiring`
          ).toBeGreaterThan(now.getTime());

          resolve();
        }
      );

      socket.on('error', reject);
      socket.setTimeout(10_000, () => {
        socket.destroy();
        reject(new Error(`Timeout checking certificate expiry for ${host}:${port}`));
      });
    });
  });
});
