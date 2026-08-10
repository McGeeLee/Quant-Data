/**
 * Optional provider credentials configured as Cloudflare Worker secrets.
 * Yahoo remains available when either secret is absent; the sources endpoint
 * reports the corresponding provider as unavailable.
 */
interface Env {
  TUSHARE_TOKEN?: string;
  TIINGO_KEY?: string;
}
