# Journey folders

Journeys are grouped by folder so you can **run** or **push** a subset without touching the rest.

| Folder | Monitors | CSV-driven |
|--------|----------|------------|
| `tls/` | TLS hash checks, CSV-expanded multi-host monitors, generic TLS-only host | `tls/tls-target-hosts.csv` → `helpers/tlsTargetHosts.generated.ts` |
| `demos/` | badssl.com demos (revoked cert, self-signed CA) | No |
| `kibana/` | Kibana login flow + TLS | No |

## Commands (see root `README.md`)

- **Run all journeys:** `npm test`
- **Run one group:** `npm run test:tls` · `npm run test:demos` · `npm run test:kibana`
- **Push all monitors:** `npm run push`
- **Push one group:** `npm run push:tls` · `npm run push:demos` · `npm run push:kibana`

Editing **`tls/tls-target-hosts.csv`** still requires `npm run generate:tls-targets` (or any script that runs it) so `helpers/tlsTargetHosts.generated.ts` stays in sync.
