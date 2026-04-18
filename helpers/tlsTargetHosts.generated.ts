/**
 * Generated from journeys/tls/tls-target-hosts.csv — do not edit by hand.
 * Run: npm run generate:tls-targets
 *
 * Override source CSV with TLS_TARGET_HOSTS_CSV (path relative to repo root).
 */
import type { TlsTargetHost } from './loadTlsTargetHosts';

export const TLS_TARGET_HOSTS: readonly TlsTargetHost[] = [
  {
    "host": "expired.badssl.com",
    "criticality": "critical"
  },
  {
    "host": "no-sct.badssl.com",
    "criticality": "medium"
  },
  {
    "host": "wrong.host.badssl.com",
    "criticality": "high"
  },
  {
    "host": "untrusted-root.badssl.com",
    "criticality": "high"
  },
  {
    "host": "pinning-test.badssl.com",
    "criticality": "medium"
  },
  {
    "host": "hsts.badssl.com",
    "criticality": "low"
  },
  {
    "host": "upgrade.badssl.com",
    "criticality": "low"
  },
  {
    "host": "https-everywhere.badssl.com",
    "criticality": "low"
  },
  {
    "host": "elastic.co"
  }
];
