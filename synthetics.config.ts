import { SyntheticsConfig } from '@elastic/synthetics';

const config: SyntheticsConfig = {
  /**
   * Elastic Stack / Kibana connection settings.
   * Override via environment variables for CI/CD pipelines:
   *   SYNTHETICS_API_KEY   – Kibana API key (preferred over username/password)
   *   KIBANA_URL           – e.g. https://my-deployment.kb.us-east-1.aws.elastic-cloud.com
   */
  project: {
    id: 'ac-synthetics-tls-demo',
    url: process.env['KIBANA_URL'] ?? 'https://your-kibana-url.elastic-cloud.com',
    space: 'default',
  },

  monitor: {
    /**
     * Schedule: run every 5 minutes across all available global locations.
     * For a certificate-hash check the payload is tiny, so 5-minute cadence
     * gives near-real-time visibility without excess load.
     */
    schedule: 5,
    locations: ['us_east'],
    privateLocations: [],

    /**
     * Alert the default rule when a monitor changes state (up → down / down → up).
     */
    alert: { status: { enabled: true } },
  },

  /**
   * Playwright launch options – used only when running journeys locally via
   * `npm test`.  The TLS journey performs its certificate extraction with the
   * Node.js `tls` module (no browser needed) so these settings have minimal
   * impact on execution time.
   */
  playwrightOptions: {
    headless: true,
    chromiumSandbox: false,
  },
};

export default config;
