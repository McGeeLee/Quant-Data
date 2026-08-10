import { describe, expect, it, vi } from "vitest";
import { tiingoProvider } from "../worker/providers/tiingo";
import { tushareProvider } from "../worker/providers/tushare";
import { yahooProvider } from "../worker/providers/yahoo";
import { fetchUpstream } from "../worker/lib/upstream-fetch";
import type { MarketQuery } from "../worker/domain/types";
import { yahooPayload } from "./fixtures";

const query: MarketQuery = { source: "yahoo", symbol: "AAPL", start: "2026-08-01", end: "2026-08-10" };

describe("market data providers", () => {
  it("normalizes and sorts Yahoo bars", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(yahooPayload()));
    const bars = await yahooProvider.fetch(query, { fetcher });
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.date)).toEqual(["2026-08-07", "2026-08-10"]);
    expect(bars[1]?.close).toBe(104);
  });

  it("maps an empty Yahoo result to an empty series", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ chart: { result: null, error: null } }));
    await expect(yahooProvider.fetch(query, { fetcher })).resolves.toEqual([]);
  });

  it("drops Yahoo rows with missing required price fields", async () => {
    const payload = yahooPayload();
    payload.chart.result[0].indicators.quote[0].close = [null, 100];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    const bars = await yahooProvider.fetch(query, { fetcher });
    expect(bars).toHaveLength(1);
  });

  it("maps Tushare fields and sorts descending provider data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      code: 0,
      data: {
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
        items: [["600519.SH", "20260810", 1400, 1420, 1390, 1410, 200], ["600519.SH", "20260808", 1390, 1405, 1380, 1400, 180]],
      },
    }));
    const bars = await tushareProvider.fetch({ ...query, source: "tushare", symbol: "600519.SH" }, { tushareToken: "test", fetcher });
    expect(bars.map((bar) => bar.date)).toEqual(["2026-08-08", "2026-08-10"]);
    expect(bars[1]?.volume).toBe(200);
  });

  it("rejects Tushare when its secret is missing", async () => {
    await expect(tushareProvider.fetch({ ...query, source: "tushare" }, {})).rejects.toMatchObject({ code: "SOURCE_NOT_CONFIGURED", status: 503 });
  });

  it("normalizes Tiingo raw price fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([
      { date: "2026-08-10T00:00:00.000Z", open: 101, high: 105, low: 100, close: 104, volume: 1200 },
    ]));
    const bars = await tiingoProvider.fetch({ ...query, source: "tiingo" }, { tiingoKey: "test", fetcher });
    expect(bars[0]).toEqual({ date: "2026-08-10", open: 101, high: 105, low: 100, close: 104, volume: 1200 });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Token test" });
  });
});

describe("upstream fetch behavior", () => {
  it("retries one transient response", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(fetchUpstream("https://example.test", {}, fetcher, 100)).resolves.toHaveProperty("status", 200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("maps an upstream timeout after one retry", async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    await expect(fetchUpstream("https://example.test", {}, fetcher, 5)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", status: 504 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
