/** Provider secrets are optional runtime bindings set with `wrangler secret put`. */
export type RuntimeEnv = Env & {
  TUSHARE_TOKEN?: string;
  TIINGO_KEY?: string;
};
