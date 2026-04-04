# Ac-Synthetics-Demo-Apr26

Elastic Synthetics project that extracts and validates TLS server certificate fingerprints (SHA-1 and SHA-256), and combines browser page tests with TLS certificate inspection across several real-world scenarios.

---

## Journeys

| Journey file | Type | Target | Description |
|---|---|---|---|
| `journeys/tls-certificate.journey.ts` | TLS-only | Configurable (default: `example.com`) | Generic host TLS hash extraction — no browser, minimal overhead |
| `journeys/badssl-revoked.journey.ts` | Browser + TLS | `revoked.badssl.com` | Single-page browser test + TLS fingerprint for a revoked certificate |
| `journeys/kibana-login.journey.ts` | Browser + TLS | Elastic Cloud Kibana | Multi-step login flow + TLS fingerprint |
| `journeys/self-signed-ca.journey.ts` | TLS-only | `self-signed.badssl.com` | Demonstrates CA trust failure and fingerprint extraction regardless |

All TLS extraction uses the Node.js built-in `tls` + `crypto` modules — no browser is launched for the certificate inspection steps.

---

## How it works

### TLS-only journey (`tls-certificate.journey.ts`)

* Opens a raw TLS socket to the target host
* Computes SHA-1 and SHA-256 fingerprints from the DER-encoded leaf certificate
* Asserts the certificate has not expired
* No browser launched → typically completes in < 200 ms

### badssl.com Revoked Certificate journey (`badssl-revoked.journey.ts`)

* **Step 1 – Browser:** navigates to `https://revoked.badssl.com/` and checks the page title
* **Step 2 – TLS:** extracts the certificate fingerprints and checks whether the OS trust store detects the revocation

> Chromium uses soft-fail OCSP checking in headless mode, so the browser page loads despite the revocation.  The `ignoreHTTPSErrors: true` Playwright option is set in `synthetics.config.ts` to confirm this is intentional for these demo journeys.

### Kibana Login journey (`kibana-login.journey.ts`)

* **Step 1 – Browser:** navigates to the Kibana URL, verifies the login page is shown
* **Step 2 – Browser:** clicks the "Log in with Elasticsearch" button
* **Step 3 – Browser:** verifies the native auth username/password form appears
* **Step 4 – TLS:** extracts certificate fingerprints and asserts the cert is not expired

The target Kibana URL defaults to `https://ac-siem-hosted-a183da.kb.us-west2.gcp.elastic-cloud.com/` but can be overridden via `KIBANA_TARGET_URL` or the monitor `params.targetUrl` field.

### Self-Signed / Internal CA journey (`self-signed-ca.journey.ts`)

* **Step 1 – TLS:** confirms the connection is **rejected** when no custom CA is loaded (correct security behaviour)
* **Step 2 – TLS:** extracts the certificate fingerprint with `rejectUnauthorized: false` (always succeeds)
* **Step 3 – TLS:** asserts the certificate is not expired (independent of CA trust)

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS |
| npm | 9 |

```bash
# Install project dependencies (includes @elastic/synthetics, Playwright, tsx)
npm ci
```

---

## Running locally

```bash
# Run all journeys in the journeys/ directory (full output, requires network)
npm test

# Dry-run – validates journey structure without executing steps (no network needed)
npm run test:dry

# Run unit tests for helpers (no network needed)
npm run test:unit

# Run all CI-safe checks (dry-run + unit tests)
npm run test:ci

# Target a specific host/port via environment variables (TLS-only journey)
TLS_TARGET_HOST=myserver.example.com TLS_TARGET_PORT=8443 npm test

# Override the Kibana URL for the login journey
KIBANA_TARGET_URL=https://my-kibana.example.com npm test
```

---

## Continuous Integration

The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on every push and pull request:

1. **TypeScript type-check** (`npx tsc --noEmit`)
2. **Journey structure validation** (`npm run test:dry`) — no network required
3. **Unit tests** (`npm run test:unit`) — no network required

[![CI](https://github.com/adrianchen-es/Ac-Synthetics-Demo-Apr26/actions/workflows/ci.yml/badge.svg)](https://github.com/adrianchen-es/Ac-Synthetics-Demo-Apr26/actions/workflows/ci.yml)

---

## Pushing monitors to Elastic

### Prerequisites

Set these environment variables (or store them in a `.env` file that is **not** committed — it is excluded by `.gitignore`):

```bash
export KIBANA_URL="https://your-deployment.kb.us-east-1.aws.elastic-cloud.com"
export SYNTHETICS_API_KEY="<your-kibana-api-key>"
```

> **Creating a Kibana API key**
> Kibana → Stack Management → API Keys → Create API key
> Assign the `synthetics_writer` built-in role (or equivalent custom role).

### Push to the `default` space

```bash
npm run push
# equivalent to:
npx elastic-synthetics push --config synthetics.config.ts
```

### Push to a named space (e.g. `staging`)

```bash
npm run push:staging
# equivalent to:
npx elastic-synthetics push --config synthetics.config.ts --space staging
```

### Push with inline credentials (CI/CD)

```bash
KIBANA_URL="https://..." SYNTHETICS_API_KEY="..." npm run push
```

---

## Project structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml                          # GitHub Actions CI workflow
├── helpers/
│   └── tls.ts                              # Shared TLS utility functions
├── journeys/
│   ├── tls-certificate.journey.ts          # TLS-only, configurable host
│   ├── badssl-revoked.journey.ts           # Browser + TLS, revoked cert demo
│   ├── kibana-login.journey.ts             # Multi-step browser + TLS (Kibana)
│   └── self-signed-ca.journey.ts           # Self-signed / internal CA demo
├── tests/
│   └── tls-helpers.test.ts                 # Unit tests for helper functions
├── synthetics.config.ts                    # Elastic Synthetics project config
├── tsconfig.json                           # TypeScript compiler config
├── package.json                            # Dependencies & npm scripts
└── .gitignore                              # OS, editor, Node & secret exclusions
```

---

## Configuration

Edit **`synthetics.config.ts`** to change:

| Setting | Default | Description |
|---------|---------|-------------|
| `project.id` | `ac-synthetics-tls-demo` | Unique monitor project ID in Kibana |
| `project.url` | env `KIBANA_URL` | Kibana URL |
| `project.space` | `default` | Kibana space |
| `monitor.schedule` | `5` (minutes) | How often the monitor runs |
| `monitor.locations` | `us_east` | Elastic-managed location(s) |
| `playwrightOptions.ignoreHTTPSErrors` | `true` | Required for revoked/self-signed cert journeys |

Override per-journey environment variables:

| Variable | Journey | Description |
|---|---|---|
| `TLS_TARGET_HOST` | `tls-certificate` | Hostname to inspect (default: `example.com`) |
| `TLS_TARGET_PORT` | `tls-certificate` | Port (default: `443`) |
| `KIBANA_TARGET_URL` | `kibana-login` | Kibana URL to test (or set `params.targetUrl`) |

---

## Security notes

* `rejectUnauthorized: false` is used only in certificate inspection contexts — the socket is destroyed immediately after `getPeerCertificate()` returns. No application data is exchanged.
* `ignoreHTTPSErrors: true` in `synthetics.config.ts` is intentional for this demo project which targets hosts with deliberately bad certificates. Do not use this in monitors that make authenticated requests.
* API keys and `.env` files are excluded from version control via `.gitignore`.
* `package-lock.json` **is** committed to enable reproducible `npm ci` installs in CI.


---

## How it works

The `tls-certificate` journey uses Node.js's built-in **`tls`** module to open a raw TLS socket directly to the target host.  It never launches a browser, which means:

* **Fast** – a single TCP handshake typically completes in < 200 ms
* **Lightweight** – no Chromium process, no page load, no network overhead beyond the TLS handshake
* **Secure** – certificate is inspected server-side; no sensitive page content is loaded

The journey performs two steps:

1. **Extract fingerprints** – connects, reads the raw DER-encoded leaf certificate, and computes `SHA-1` and `SHA-256` fingerprints using Node.js `crypto`.
2. **Verify expiry** – connects a second time to read `valid_to` and asserts the certificate has not expired.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS |
| npm | 9 |

```bash
# Install project dependencies (includes @elastic/synthetics & Playwright)
npm install
```

---

## Running locally

```bash
# Run all journeys in the journeys/ directory (full output)
npm test

# Dry-run – validates journey syntax without executing steps
npm run test:dry

# Target a specific host/port via environment variables
TLS_TARGET_HOST=myserver.example.com TLS_TARGET_PORT=8443 npm test
```

### Sample output

```
Journey: TLS Certificate Hash Extraction
  ✓  Connect to example.com:443 and extract TLS certificate (187 ms)
       Host    : example.com:443
       SHA-1   : AA:BB:CC:...
       SHA-256 : 11:22:33:...
  ✓  Verify certificate is not expired (143 ms)
       Certificate expires: 2026-11-15T12:00:00.000Z

2 passed, 0 failed
```

---

## Pushing monitors to Elastic

### Prerequisites

Set these environment variables (or store them in a `.env` file that is **not** committed – it is excluded by `.gitignore`):

```bash
export KIBANA_URL="https://your-deployment.kb.us-east-1.aws.elastic-cloud.com"
export SYNTHETICS_API_KEY="<your-kibana-api-key>"
```

> **Creating a Kibana API key**
> Kibana → Stack Management → API Keys → Create API key
> Assign the `synthetics_writer` built-in role (or equivalent custom role).

### Push to the `default` space

```bash
npm run push
# equivalent to:
npx elastic-synthetics push --config synthetics.config.ts
```

### Push to a named space (e.g. `staging`)

```bash
npm run push:staging
# equivalent to:
npx elastic-synthetics push --config synthetics.config.ts --space staging
```

### Push with inline credentials (CI/CD)

```bash
KIBANA_URL="https://..." SYNTHETICS_API_KEY="..." npm run push
```

---

## Project structure

```
.
├── journeys/
│   └── tls-certificate.journey.ts   # TLS hash extraction journey
├── synthetics.config.ts             # Elastic Synthetics project config
├── tsconfig.json                    # TypeScript compiler config
├── package.json                     # Dependencies & npm scripts
└── .gitignore                       # OS, editor, Node & secret exclusions
```

---

## Configuration

Edit **`synthetics.config.ts`** to change:

| Setting | Default | Description |
|---------|---------|-------------|
| `project.id` | `ac-synthetics-tls-demo` | Unique monitor project ID in Kibana |
| `project.url` | env `KIBANA_URL` | Kibana URL |
| `project.space` | `default` | Kibana space |
| `monitor.schedule` | `5` (minutes) | How often the monitor runs |
| `monitor.locations` | `us_east` | Elastic-managed location(s) |

Override **`TLS_TARGET_HOST`** / **`TLS_TARGET_PORT`** at runtime, or set
`params.host` / `params.port` per monitor in `synthetics.config.ts` for
multi-host deployments.

---

## Security notes

* `rejectUnauthorized: false` is intentional – the journey's purpose is to
  *inspect* the certificate, not to make an authenticated HTTPS request.
  No sensitive data is transmitted over the socket.
* API keys and `.env` files are excluded from version control via `.gitignore`.
* The journey itself is safe to run against self-signed or expired certificates
  (it reports expiry as a failed check, not a crash).
