import type {
  DataSource,
  Locale,
  MarketBar,
  MarketDataResponse,
  MarketQuery,
  MarketSnapshot,
  SourceStatus,
} from "../domain/types";
import { MarketBarSchema } from "../domain/types";
import { z } from "zod";
import type { RuntimeEnv } from "../env";
import { AppError } from "../lib/app-error";
import { disclaimer, warningText } from "../lib/i18n";
import { getProvider } from "../providers";

const CACHE_TTL = 3_600;

type ServiceEnv = Pick<RuntimeEnv, "MARKET_RATE_LIMIT" | "TUSHARE_TOKEN" | "TIINGO_KEY">;

type CachedPayload = {
  bars: MarketBar[];
  fetchedAt: string;
};

const CachedPayloadSchema = z.object({
  bars: z.array(MarketBarSchema),
  fetchedAt: z.string().datetime(),
});

type ServiceOptions = {
  maxBars?: number;
  cache?: Cache | null;
  fetcher?: typeof fetch;
  executionCtx?: ExecutionContext;
};

function providerContext(env: ServiceEnv, fetcher?: typeof fetch) {
  return {
    tushareToken: env.TUSHARE_TOKEN,
    tiingoKey: env.TIINGO_KEY,
    fetcher,
  };
}

export function buildCacheKey(query: MarketQuery): Request {
  const url = new URL("https://quant-data-cache.internal/v1/market-data");
  url.search = new URLSearchParams({
    source: query.source,
    symbol: query.symbol.toUpperCase(),
    start: query.start,
    end: query.end,
    interval: "1d",
  }).toString();
  return new Request(url, { method: "GET" });
}

function sourceWarnings(source: DataSource, locale: Locale): string[] {
  const warnings = [warningText(locale, "raw")];
  if (source === "yahoo") warnings.unshift(warningText(locale, "yahoo"));
  if (source === "tiingo") warnings.unshift(warningText(locale, "tiingo"));
  return warnings;
}

function attribution(source: DataSource): string | undefined {
  if (source === "tiingo") return "Data provided by Tiingo (https://www.tiingo.com/)";
  return source === "tushare" ? "Data provided by Tushare (https://tushare.pro/)" : undefined;
}

function volumeUnit(source: DataSource): string {
  return source === "tushare" ? "lots (100 shares per lot)" : "provider-native units";
}

async function defaultCache(): Promise<Cache | null> {
  return typeof caches === "undefined" ? null : caches.open("quant-data-v1");
}

async function readCached(cache: Cache | null, key: Request): Promise<CachedPayload | null> {
  if (!cache) return null;
  const hit = await cache.match(key);
  if (!hit) return null;
  try {
    const parsed = CachedPayloadSchema.safeParse(await hit.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function enforceRateLimit(env: ServiceEnv, request: Request, source: DataSource): Promise<void> {
  const client = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "anonymous";
  const result = await env.MARKET_RATE_LIMIT.limit({ key: `${client}:${source}` });
  if (!result.success) throw new AppError("RATE_LIMITED", 429, { retryAfterSeconds: 60 });
}

export function listSources(env: ServiceEnv, locale: Locale): { sources: SourceStatus[]; disclaimer: string } {
  return {
    sources: [
      {
        id: "yahoo",
        name: "Yahoo Finance Chart",
        configured: true,
        official: false,
        markets: ["US equities", "crypto", "selected global markets"],
        symbolExamples: ["AAPL", "BTC-USD", "600519.SS"],
        warnings: [warningText(locale, "yahoo")],
      },
      {
        id: "tushare",
        name: "Tushare Pro",
        configured: Boolean(env.TUSHARE_TOKEN),
        official: true,
        markets: ["China A-shares"],
        symbolExamples: ["600519.SH", "000001.SZ"],
        attribution: "Data provided by Tushare (https://tushare.pro/)",
        warnings: [],
      },
      {
        id: "tiingo",
        name: "Tiingo",
        configured: Boolean(env.TIINGO_KEY),
        official: true,
        markets: ["US equities"],
        symbolExamples: ["AAPL", "TSLA"],
        attribution: "Data provided by Tiingo (https://www.tiingo.com/)",
        warnings: [warningText(locale, "tiingo")],
      },
    ],
    disclaimer: disclaimer[locale],
  };
}

export async function getMarketData(
  env: ServiceEnv,
  query: MarketQuery,
  locale: Locale,
  options: ServiceOptions = {},
): Promise<MarketDataResponse> {
  const maxBars = options.maxBars ?? 2_000;
  const cache = options.cache === undefined ? await defaultCache() : options.cache;
  const key = buildCacheKey(query);
  let cached = await readCached(cache, key);

  if (!cached) {
    const bars = await getProvider(query.source).fetch(query, providerContext(env, options.fetcher));
    if (bars.length === 0) throw new AppError("NOT_FOUND", 404);
    cached = { bars, fetchedAt: new Date().toISOString() };
    if (cache) {
      const response = new Response(JSON.stringify(cached), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${CACHE_TTL}`,
        },
      });
      const write = cache.put(key, response).catch((error: unknown) => {
        console.error(JSON.stringify({ event: "cache_write_error", name: error instanceof Error ? error.name : "UnknownError" }));
      });
      if (options.executionCtx) options.executionCtx.waitUntil(write);
      else await write;
    }
  }

  const truncated = cached.bars.length > maxBars;
  const bars = truncated ? cached.bars.slice(-maxBars) : cached.bars;
  return {
    meta: {
      source: query.source,
      symbol: query.symbol,
      interval: "1d",
      adjustment: "raw",
      volumeUnit: volumeUnit(query.source),
      count: bars.length,
      fetchedAt: cached.fetchedAt,
      truncated,
      attribution: attribution(query.source),
      warnings: [...sourceWarnings(query.source, locale), disclaimer[locale]],
    },
    bars,
  };
}

export async function getMarketSnapshot(
  env: ServiceEnv,
  query: MarketQuery,
  locale: Locale,
  options: ServiceOptions = {},
): Promise<MarketSnapshot> {
  const data = await getMarketData(env, query, locale, { ...options, maxBars: 2 });
  const latest = data.bars.at(-1);
  if (!latest) throw new AppError("NOT_FOUND", 404);
  const previous = data.bars.at(-2);
  const change = previous ? latest.close - previous.close : null;
  const changePercent = previous && change !== null && previous.close !== 0 ? (change / previous.close) * 100 : null;
  return {
    meta: data.meta,
    snapshot: {
      date: latest.date,
      close: latest.close,
      previousClose: previous?.close ?? null,
      change,
      changePercent,
      volume: latest.volume,
    },
  };
}
