/**
 * Shared TLS utility helpers.
 *
 * All functions use the Node.js built-in `tls` and `crypto` modules — no
 * browser is launched, keeping overhead to a minimum.
 *
 * Design note on `rejectUnauthorized: false`
 * ─────────────────────────────────────────────
 * Several helpers deliberately pass `rejectUnauthorized: false` so that we
 * can always extract certificate data (fingerprints, expiry, subject) even
 * for self-signed, revoked, or expired certificates.  The socket is
 * destroyed immediately after `getPeerCertificate()` returns — no
 * authentication handshake or application data is exchanged.
 *
 * Use `checkCertTrusted()` to separately determine whether the OS / custom
 * CA trusts the certificate.
 */

import * as tls from 'tls';
import * as crypto from 'crypto';

/** Structured certificate information returned by `fetchCertInfo`. */
export interface CertInfo {
  /** SHA-1 fingerprint, colon-separated (e.g. "AA:BB:…:FF") */
  sha1: string;
  /** SHA-256 fingerprint, colon-separated */
  sha256: string;
  /** Common Name (or Organisation) of the leaf certificate subject */
  subject: string;
  /** Common Name (or Organisation) of the issuing CA */
  issuer: string;
  /** Certificate not-valid-before date */
  validFrom: Date;
  /** Certificate not-valid-after date */
  validTo: Date;
}

/** Options accepted by the low-level TLS helpers. */
export interface TlsFetchOptions {
  /**
   * Custom CA certificate(s) to trust during verification.
   * Pass PEM strings or Buffers.  When omitted the default system trust store
   * is used.
   */
  ca?: string | Buffer | Array<string | Buffer>;
  /** Connection/socket timeout in milliseconds (default: 10 000). */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a raw TLS socket and return the DER-encoded leaf certificate.
 *
 * The socket is destroyed immediately after the certificate is obtained.
 * `rejectUnauthorized` is intentionally `false` so we can always retrieve
 * the certificate regardless of its validity state.
 */
export function fetchLeafCertDer(
  host: string,
  port: number,
  options: TlsFetchOptions = {}
): Promise<Buffer> {
  const { ca, timeoutMs = 10_000 } = options;

  return new Promise((resolve, reject) => {
    const socket = tls.connect( // lgtm[js/disabling-certificate-validation]
      {
        host,
        port,
        servername: host,
        // rejectUnauthorized: false is intentional – this function is solely
        // for certificate inspection, not for making authenticated requests.
        rejectUnauthorized: false, // lgtm[js/disabling-certificate-validation]
        ...(ca !== undefined ? { ca } : {}),
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

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`TLS connection to ${host}:${port} timed out`));
    });
  });
}

/**
 * Fetch full structured certificate information from a remote host.
 *
 * Always succeeds at extracting the data (uses `rejectUnauthorized: false`
 * internally).  Call `checkCertTrusted()` separately if you need to know
 * whether the certificate is trusted by the system / a custom CA.
 */
export async function fetchCertInfo(
  host: string,
  port: number,
  options: TlsFetchOptions = {}
): Promise<CertInfo> {
  const { ca, timeoutMs = 10_000 } = options;

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        // rejectUnauthorized: false is intentional – we always read the cert
        // regardless of trust state.  The socket is destroyed immediately after
        // getPeerCertificate() returns; no application data is exchanged.
        rejectUnauthorized: false, // lgtm[js/disabling-certificate-validation]
        ...(ca !== undefined ? { ca } : {}),
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        socket.destroy();

        if (!cert || !cert.raw) {
          reject(new Error(`No certificate from ${host}:${port}`));
          return;
        }

        const der = cert.raw;

        resolve({
          sha1: colonSeparated(computeFingerprint(der, 'sha1')),
          sha256: colonSeparated(computeFingerprint(der, 'sha256')),
          subject: (cert.subject as Record<string, string> | undefined)?.['CN']
            ?? (cert.subject as Record<string, string> | undefined)?.['O']
            ?? 'Unknown',
          issuer: (cert.issuer as Record<string, string> | undefined)?.['CN']
            ?? (cert.issuer as Record<string, string> | undefined)?.['O']
            ?? 'Unknown',
          validFrom: new Date(cert.valid_from),
          validTo: new Date(cert.valid_to),
        });
      }
    );

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error(`TLS connection to ${host}:${port} timed out`));
    });
  });
}

/**
 * Check whether the remote certificate is trusted by the system trust store
 * or by the supplied custom CA.
 *
 * Returns `true` if the TLS handshake succeeds with `rejectUnauthorized: true`,
 * `false` if the certificate is self-signed, issued by an unknown CA, expired,
 * or revoked.
 */
export function checkCertTrusted(
  host: string,
  port: number,
  options: TlsFetchOptions = {}
): Promise<boolean> {
  const { ca, timeoutMs = 10_000 } = options;

  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: true,
        ...(ca !== undefined ? { ca } : {}),
      },
      () => {
        socket.destroy();
        resolve(true);
      }
    );

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure utility functions (easily unit-testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a hex fingerprint of a DER-encoded certificate buffer.
 * The result is upper-cased hex with no separators.
 */
export function computeFingerprint(
  derBuffer: Buffer,
  algorithm: 'sha1' | 'sha256'
): string {
  return crypto.createHash(algorithm).update(derBuffer).digest('hex').toUpperCase();
}

/**
 * Format a continuous hex string as colon-separated byte pairs.
 * Example: `"AABBCC"` → `"AA:BB:CC"`
 */
export function colonSeparated(hex: string): string {
  if (!hex || hex.length % 2 !== 0) {
    throw new Error(`colonSeparated: cannot split odd-length hex string "${hex}"`);
  }
  return hex.match(/.{2}/g)!.join(':');
}

/**
 * Log certificate information in a consistent format.
 * Used by all journeys so output is easy to read and compare.
 */
export function logCertInfo(host: string, port: number, cert: CertInfo): void {
  console.log(`\n  ── TLS Certificate: ${host}:${port} ──`);
  console.log(`  Subject  : ${cert.subject}`);
  console.log(`  Issuer   : ${cert.issuer}`);
  console.log(`  Valid    : ${cert.validFrom.toISOString()} → ${cert.validTo.toISOString()}`);
  console.log(`  SHA-1    : ${cert.sha1}`);
  console.log(`  SHA-256  : ${cert.sha256}`);
}
