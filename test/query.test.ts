import { describe, expect, it } from "vitest";
import { normalizeMarketQuery } from "../worker/lib/query";

describe("market query normalization", () => {
  it("normalizes provider-native symbols", () => {
    expect(normalizeMarketQuery({ source: "yahoo", symbol: "btc-usd" }, new Date("2026-08-10T00:00:00Z")))
      .toEqual({ source: "yahoo", symbol: "BTC-USD", start: "2025-08-10", end: "2026-08-10" });
  });

  it("rejects impossible calendar dates", () => {
    expect(() => normalizeMarketQuery({ source: "yahoo", symbol: "AAPL", start: "2026-02-31", end: "2026-03-01" }))
      .toThrow(expect.objectContaining({ code: "INVALID_DATE_RANGE" }));
  });

  it("enforces source-specific symbol formats", () => {
    let thrown: unknown;
    try {
      normalizeMarketQuery({ source: "tushare", symbol: "AAPL" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "INVALID_SYMBOL", details: { source: "tushare" } });
    expect(normalizeMarketQuery({ source: "tushare", symbol: "600519.sh" }).symbol).toBe("600519.SH");
  });
});
