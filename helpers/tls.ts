/**
 * Shared TLS utility helpers.
 *
 * All functions use the Node.js built-in `tls` and `crypto` modules — no
 * browser is launched, keeping overhead to a minimum.
 *
 * ## Fingerprint extraction – efficiency note
 *
 * The primary fingerprint method is `cert.fingerprint256`, which is exposed
 * directly on the `PeerCertificate` object returned by
 * `socket.getPeerCertificate()`.  OpenSSL computes the SHA-256 (and SHA-1)
 * digest of the DER-encoded certificate as part of the TLS handshake itself,
 * so reading these properties costs nothing beyond the handshake that was
 * already required.  The previous approach of extracting `cert.raw` and
 * calling `crypto.createHash('sha256').update(raw).digest()` produced an
 * identical result but wasted CPU cycles on a hash that OpenSSL had already
 * computed.
 *
 * SHA-1 (`cert.fingerprint`) is exposed as the optional `sha1` field on
 * `CertInfo`.  It is populated when available but should not be used as a
 * sole trust anchor — prefer SHA-256 for all security-sensitive comparisons.
 *
 * ## Design note on `rejectUnauthorized: false`
 *
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
  /**
   * SHA-256 fingerprint in colon-separated form (e.g. "AA:BB:…:FF").
   *
   * Sourced directly from `cert.fingerprint256` — no extra hashing step.
   */
  sha256: string;
  /**
   * SHA-1 fingerprint in colon-separated form.
   *
   * Optional: SHA-1 is weak for trust decisions; prefer `sha256`.
   * Sourced from `cert.fingerprint` when available.
   */
  sha1?: string;
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
 *
 * Use this function only when you specifically need the raw DER bytes (e.g.
 * to pass to `computeFingerprint` with a non-standard algorithm).  For
 * standard fingerprint extraction prefer `fetchCertInfo`, which reads the
 * pre-computed `fingerprint256` property without an extra hashing step.
 */
export function fetchLeafCertDer(
  host: string,
  port: number,
  options: TlsFetchOptions = {}
): Promise<Buffer> {
  const { ca, timeoutMs = 5_000 } = options;

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
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
 *
 * **Efficiency**: SHA-256 is read from `cert.fingerprint256`, a property that
 * Node.js/OpenSSL populates during the TLS handshake at no extra cost.  The
 * DER buffer (`cert.raw`) is not extracted, so no additional `crypto.createHash`
 * call is made.
 */
export async function fetchCertInfo(
  host: string,
  port: number,
  options: TlsFetchOptions = {}
): Promise<CertInfo> {
  const { ca, timeoutMs = 5_000 } = options;

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

        if (!cert || !cert.fingerprint256) {
          reject(new Error(`No certificate from ${host}:${port}`));
          return;
        }

        resolve({
          // fingerprint256 is pre-computed by OpenSSL during the handshake —
          // no extra hashing step needed.  It is already in "AA:BB:…" form.
          sha256: cert.fingerprint256.toUpperCase(),
          // SHA-1 is optional: present but not recommended for trust decisions.
          sha1: cert.fingerprint ? cert.fingerprint.toUpperCase() : undefined,
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
 *
 * Prefer `fetchCertInfo()` for standard SHA-256 extraction — it reads the
 * pre-computed `fingerprint256` from the TLS handshake rather than running
 * an additional hash.  Use this function only when you need to hash a raw
 * DER buffer that you already have (e.g. from `fetchLeafCertDer`).
 */
export function computeFingerprint(
  derBuffer: Buffer,
  algorithm: 'sha1' | 'sha256'
): string {
  return crypto.createHash(algorithm).update(derBuffer).digest('hex').toUpperCase();
}

/**
 * Log certificate information as two JSON blocks matching the Elastic
 * `tls.server.x509` / `tls.server.hash` field layout.
 * Used by all journeys so output is easy to read and compare.
 */
export function logCertInfo(host: string, port: number, cert: CertInfo): void {
  console.log(`\n  ── TLS Certificate: ${host}:${port} ──`);
  console.log(JSON.stringify({
    x509: {
      not_after: cert.validTo.toISOString(),
      not_before: cert.validFrom.toISOString(),
      subject: { common_name: cert.subject },
      issuer: { common_name: cert.issuer },
    },
  }, null, 2));
  const hashBlock: Record<string, string> = { sha256: cert.sha256 };
  if (cert.sha1) hashBlock['sha1'] = cert.sha1;
  console.log(JSON.stringify({ hash: hashBlock }, null, 2));
}
