# Ac-Synthetics-Demo-Apr26

Elastic Synthetics project that extracts and validates TLS server certificate fingerprints (SHA-256 primary, SHA-1 optional), and combines browser page tests with TLS certificate inspection across several real-world scenarios. A shared CSV (`journeys/tls-target-hosts.csv`) drives multiple monitors for `tls.journey.ts` (TLS-focused step) and `tls-browser.journey.ts` (the same TLS step plus a real browser navigation and optional DOM check).

[![CI](https://github.com/adrianchen-es/Ac-Synthetics-Demo-Apr26/actions/workflows/ci.yml/badge.svg)](https://github.com/adrianchen-es/Ac-Synthetics-Demo-Apr26/actions/workflows/ci.yml)

---

## Journeys

| Journey file | Type | Target | Description |
|---|---|---|---|
| `journeys/tls-certificate.journey.ts` | TLS-only | Configurable (default: `example.com`) | Generic host TLS hash extraction — no browser, minimal overhead |
| `journeys/tls.journey.ts` | Playwright + TLS | Hosts from `tls-target-hosts.csv` | One step per host: route-stubbed `goto` for URL telemetry, then SHA-256, expiry, and OS trust assertions |
| `journeys/tls-browser.journey.ts` | Playwright + TLS | Same CSV as `tls.journey.ts` | Step 1 matches `tls.journey.ts`; step 2 loads the real page (cert errors tolerated via context routing) with an optional `assertionText` / `assertionSelector` check |
| `journeys/badssl-revoked.journey.ts` | Browser + TLS | `revoked.badssl.com` | Single-page browser test + SHA-256 fingerprint for a revoked certificate |
| `journeys/kibana-login.journey.ts` | Browser + TLS | Elastic Cloud Kibana | Multi-step login flow + SHA-256 fingerprint |
| `journeys/self-signed-ca.journey.ts` | TLS-only | `self-signed.badssl.com` | Demonstrates CA trust failure and fingerprint extraction regardless |

All TLS extraction uses the Node.js built-in `tls` module — the SHA-256 fingerprint is read directly from `cert.fingerprint256`, a value pre-computed by OpenSSL during the TLS handshake at zero extra cost. No browser is launched for the certificate inspection steps.

---

## How it works

### TLS-only journey (`tls-certificate.journey.ts`)

* Opens a raw TLS socket to the target host
* Reads the SHA-256 fingerprint from `cert.fingerprint256` (pre-computed by OpenSSL — no extra hashing step)
* SHA-1 is also available as an optional field (`cert.fingerprint`) but is not asserted
* Asserts the certificate has not expired
* No browser launched → typically completes in < 200 ms

### badssl.com Revoked Certificate journey (`badssl-revoked.journey.ts`)

* **Step 1 – Browser:** navigates to `https://revoked.badssl.com/` and checks the page title
* **Step 2 – TLS:** extracts the SHA-256 fingerprint and checks whether the OS trust store detects the revocation

> Chromium uses soft-fail OCSP checking in headless mode, so the browser page loads despite the revocation. The `ignoreHTTPSErrors: true` Playwright option is set in `synthetics.config.ts` to confirm this is intentional for these demo journeys.

### Kibana Login journey (`kibana-login.journey.ts`)

* **Step 1 – Browser:** navigates to the Kibana URL, verifies the login page is shown
* **Step 2 – Browser:** clicks the "Log in with Elasticsearch" button
* **Step 3 – Browser:** verifies the native auth username/password form appears
* **Step 4 – TLS:** extracts the SHA-256 fingerprint and asserts the cert is not expired

The target Kibana URL defaults to `https://ac-siem-hosted-a183da.kb.us-west2.gcp.elastic-cloud.com/` but can be overridden via `KIBANA_TARGET_URL` or the monitor `params.targetUrl` field.

### Self-Signed / Internal CA journey (`self-signed-ca.journey.ts`)

* **Step 1 – TLS:** confirms the connection is **rejected** when no custom CA is loaded (correct security behaviour)
* **Step 2 – TLS:** extracts the SHA-256 fingerprint with `rejectUnauthorized: false` (always succeeds regardless of CA trust)
* **Step 3 – TLS:** asserts the certificate is not expired (independent of CA trust)

To trust an internal CA, pass its PEM to `fetchCertInfo(host, port, { ca })` — see `helpers/tls.ts` for details.

### CSV-driven TLS journeys (`tls.journey.ts` and `tls-browser.journey.ts`)

**Source of truth:** edit **`journeys/tls-target-hosts.csv`**. The script **`npm run generate:tls-targets`** (also run automatically before `npm test`, `npm run test:dry`, and `npm run push`) reads that CSV via **`helpers/loadTlsTargetHosts.ts`** (`parseTlsTargetHostsCsv`) and writes **`helpers/tlsTargetHosts.generated.ts`**. The journeys import `TLS_TARGET_HOSTS` from that generated file, so monitors uploaded to Elastic never call `fs.readFile` for the CSV — the worker bundle only needs the generated TypeScript.

Commit **`tlsTargetHosts.generated.ts`** alongside CSV changes so clones and reviews stay in sync; `push` still regenerates it before upload so the archive is never stale.

| Column | Required | Description |
|--------|----------|-------------|
| `host` | Yes | Hostname to test (HTTPS on port 443). A row may be host-only with no comma, or `host,` with an empty second field. |
| `criticality` | No | One of `critical`, `high`, `medium`, `low`. When set, the journey gets a tag `criticality:<value>` for filtering in Kibana. When empty or omitted, no criticality tag is added. |
| `assertionText` | No | Used only by **`tls-browser.journey.ts`** step 2. |
| `assertionSelector` | No | CSS selector for the element that should contain `assertionText`. |

Optional assertions run **only when both** `assertionText` and `assertionSelector` are non-empty; otherwise step 2 only checks that navigation returns a response.

The recommended header row is:

`host,criticality,assertionText,assertionSelector`

Lines starting with `#` and blank lines are ignored.

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 18 LTS | 20 LTS or 22 LTS also supported |
| npm | 9 | Bundled with Node.js 18+ |

### Installing Node.js

Choose the method that suits your operating system:

**macOS — using [nvm](https://github.com/nvm-sh/nvm) (recommended)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# Restart your terminal, then:
nvm install 20
nvm use 20
```

**macOS — using [Homebrew](https://brew.sh)**
```bash
brew install node@20
```

**Linux (Debian/Ubuntu)**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Linux (RHEL/Amazon Linux)**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

**Windows — using [nvm-windows](https://github.com/coreybutler/nvm-windows) (recommended)**

Download and run the installer from [nvm-windows releases](https://github.com/coreybutler/nvm-windows/releases/latest), then in **PowerShell (Run as Administrator)**:
```powershell
nvm install 20
nvm use 20
```

**Windows — using [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (PowerShell)**
```powershell
winget install OpenJS.NodeJS.LTS
```

**All platforms — [official installer](https://nodejs.org/en/download)**
Download the LTS installer from [nodejs.org](https://nodejs.org/en/download) for a guided setup on any OS.

Verify your installation:
```bash
node --version   # should print v18.x.x, v20.x.x, or v22.x.x
npm --version    # should print 9.x.x or higher
```

---

## Installation

```bash
# Clone the repository
git clone https://github.com/adrianchen-es/Ac-Synthetics-Demo-Apr26.git
cd Ac-Synthetics-Demo-Apr26

# Install all dependencies (uses package-lock.json for reproducible installs)
npm ci
```

> **Note:** `npm ci` is preferred over `npm install` — it installs exact versions from `package-lock.json` and fails fast if the lockfile is out of sync, preventing unexpected version drift.

---

## Running locally

### macOS / Linux

```bash
# Validate journey structure without network access
npm run test:dry

# Run unit tests for helper functions (no network needed)
npm run test:unit

# Run all CI-safe checks (dry-run + unit tests)
npm run test:ci

# Run all journeys (requires network access)
npm test

# After editing journeys/tls-target-hosts.csv — refreshes helpers/tlsTargetHosts.generated.ts (also runs automatically before npm test, test:dry, and push)
npm run generate:tls-targets

# Override the target host for the TLS-only journey
TLS_TARGET_HOST=myserver.example.com TLS_TARGET_PORT=8443 npm test

# Override the Kibana URL for the login journey
KIBANA_TARGET_URL=https://my-kibana.example.com npm test
```

### Windows (PowerShell)

```powershell
# Validate journey structure without network access
npm run test:dry

# Run unit tests for helper functions (no network needed)
npm run test:unit

# Run all CI-safe checks
npm run test:ci

# Run all journeys (requires network access)
npm test

# Override the target host for the TLS-only journey
$env:TLS_TARGET_HOST="myserver.example.com"; $env:TLS_TARGET_PORT="8443"; npm test

# Override the Kibana URL for the login journey
$env:KIBANA_TARGET_URL="https://my-kibana.example.com"; npm test
```

### Windows (Command Prompt)

```cmd
set TLS_TARGET_HOST=myserver.example.com && set TLS_TARGET_PORT=8443 && npm test
set KIBANA_TARGET_URL=https://my-kibana.example.com && npm test
```

---

## Continuous Integration

The repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on every push and pull request:

1. **TypeScript type-check** (`npx tsc --noEmit`)
2. **Journey structure validation** (`npm run test:dry`) — no network required
3. **Unit tests** (`npm run test:unit`) — no network required

---

## Pushing monitors to Elastic

### Step 1 — Set credentials

**macOS / Linux**
```bash
export KIBANA_URL="https://your-deployment.kb.us-east-1.aws.elastic-cloud.com"
export SYNTHETICS_API_KEY="<your-kibana-api-key>"
```

**Windows (PowerShell)**
```powershell
$env:KIBANA_URL = "https://your-deployment.kb.us-east-1.aws.elastic-cloud.com"
$env:SYNTHETICS_API_KEY = "<your-kibana-api-key>"
```

**Windows (Command Prompt)**
```cmd
set KIBANA_URL=https://your-deployment.kb.us-east-1.aws.elastic-cloud.com
set SYNTHETICS_API_KEY=<your-kibana-api-key>
```

> **Creating a Kibana API key:**
> Kibana → Synthetics → Settings → Project API Keys → Generate Project API Key

### Step 2 — Push monitors

```bash
# Push to the default Kibana space
npm run push

# Push to a named space (e.g. staging)
npm run push:staging
```

### CI/CD — inline credentials

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
│   ├── loadTlsTargetHosts.ts               # CSV parser (build-time only)
│   ├── tlsTargetHosts.generated.ts         # Generated from tls-target-hosts.csv — do not edit
│   └── tls.ts                              # Shared TLS utility functions
├── scripts/
│   └── generate-tls-targets.ts             # Writes tlsTargetHosts.generated.ts
├── journeys/
│   ├── tls-target-hosts.csv                # Host list for tls.journey + tls-browser.journey
│   ├── tls-certificate.journey.ts          # TLS-only, configurable host
│   ├── tls.journey.ts                      # Per-row TLS monitor from CSV
│   ├── tls-browser.journey.ts              # Per-row TLS + browser monitor from CSV
│   ├── badssl-revoked.journey.ts           # Browser + TLS, revoked cert demo
│   ├── kibana-login.journey.ts             # Multi-step browser + TLS (Kibana)
│   └── self-signed-ca.journey.ts           # Self-signed / internal CA demo
├── tests/
│   └── tls-helpers.test.ts                 # Unit tests for helper functions
├── synthetics.config.ts                    # Elastic Synthetics project config
├── tsconfig.json                           # TypeScript compiler config
├── package.json                            # Dependencies & npm scripts
├── package-lock.json                       # Lockfile for reproducible installs
└── .gitignore                              # OS, editor, Node & secret exclusions
```

---

## Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| `@elastic/synthetics` | production | Journey runner, `journey`/`step`/`expect` APIs, Playwright bundled |
| `@types/node` | dev | TypeScript types for Node.js built-ins (`tls`, `crypto`, `Buffer`) |
| `tsx` | dev | Runs TypeScript test files directly with `node --import tsx --test` |
| `typescript` | dev | Type-checking (`npx tsc --noEmit`) |

`@elastic/synthetics` bundles its own Playwright installation — no separate `playwright install` step is needed.

---

## Configuration reference

Edit **`synthetics.config.ts`** to change project-wide settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `project.id` | `ac-synthetics-tls-demo` | Unique monitor project ID in Kibana |
| `project.url` | env `KIBANA_URL` | Kibana URL |
| `project.space` | `default` | Kibana space |
| `monitor.schedule` | `5` (minutes) | How often each monitor runs |
| `monitor.locations` | `us_east` | Elastic-managed location(s) |
| `monitor.privateLocations` | | Private Synthetic location(s) |
| `playwrightOptions.ignoreHTTPSErrors` | `true` | Required for revoked/self-signed cert journeys |

Per-journey environment variables:

| Variable | Journey | Default | Description |
|---|---|---|---|
| `TLS_TARGET_HOST` | `tls-certificate` | `example.com` | Hostname to inspect |
| `TLS_TARGET_PORT` | `tls-certificate` | `443` | Port to connect on |
| `KIBANA_TARGET_URL` | `kibana-login` | *(Elastic Cloud demo)* | Kibana URL to test |

**`tls.journey.ts` and `tls-browser.journey.ts`** do not use the variables above; at **runtime** (including on Elastic) they use **`helpers/tlsTargetHosts.generated.ts`**, which is produced from **`journeys/tls-target-hosts.csv`** when you run **`npm run generate:tls-targets`** or any script that invokes it (see **`package.json`**).

---

## Security notes

* `rejectUnauthorized: false` is used only in certificate inspection contexts — the socket is destroyed immediately after `getPeerCertificate()` returns. No application data is exchanged.
* `ignoreHTTPSErrors: true` in `synthetics.config.ts` is intentional for this demo project which targets hosts with deliberately problematic certificates. Do not use this in production monitors that make authenticated requests.
* SHA-256 (`cert.fingerprint256`) is the primary fingerprint. SHA-1 (`cert.fingerprint`) is available as an optional field but should not be used as a sole trust anchor.
* API keys are excluded from version control via `.gitignore`.
* `package-lock.json` **is** committed to enable reproducible `npm ci` installs in CI.
