import { describe, expect, it, vi } from "vitest";
import { buildCacheKey, enforceRateLimit, getMarketData, getMarketSnapshot, listSources } from "../worker/services/market-service";
import { yahooPayload, testEnv } from "./fixtures";

const query = { source: "yahoo" as const, symbol: "aapl", start: "2026-08-01", end: "2026-08-10" };

describe("market service", () => {
  it("builds a stable normalized cache key", () => {
    expect(buildCacheKey(query).url).toBe("https://quant-data-cache.internal/v1/market-data?source=yahoo&symbol=AAPL&start=2026-08-01&end=2026-08-10&interval=1d");
  });

  it("reports optional source secrets without revealing them", () => {
    const output = listSources(testEnv({ TUSHARE_TOKEN: "super-secret", TIINGO_KEY: "" }), "zh-CN");
    expect(output.sources.find((source) => source.id === "tushare")?.configured).toBe(true);
    expect(JSON.stringify(output)).not.toContain("super-secret");
    expect(output.disclaimer).toContain("不构成投资建议");
  });

  it("enforces the source-partitioned anonymous rate limit", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const request = new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.2" } });
    await expect(enforceRateLimit(testEnv({ MARKET_RATE_LIMIT: { limit } }), request, "yahoo")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.2:yahoo" });
  });

  it("returns localized metadata and supports truncation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(yahooPayload()));
    const output = await getMarketData(testEnv(), query, "zh-CN", { fetcher, cache: null, maxBars: 1 });
    expect(output.meta).toMatchObject({ count: 1, truncated: true, adjustment: "raw" });
    expect(output.meta.warnings.join(" ")).toContain("非官方接口");
    expect(output.bars[0]?.close).toBe(104);
  });

  it("calculates the latest snapshot", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(yahooPayload()));
    const output = await getMarketSnapshot(testEnv(), query, "en", { fetcher, cache: null });
    expect(output.snapshot).toMatchObject({ close: 104, previousClose: 100, change: 4, changePercent: 4 });
  });
});
