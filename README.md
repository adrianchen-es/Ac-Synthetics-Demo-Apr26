# Ac-Synthetics-Demo-Apr26

Elastic Synthetics project that extracts and validates TLS server certificate fingerprints (SHA-1 and SHA-256) with minimal performance overhead.

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
