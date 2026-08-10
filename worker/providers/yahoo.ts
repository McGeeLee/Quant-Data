import { z } from "zod";
import type { MarketProvider } from "../domain/types";
import { AppError } from "../lib/app-error";
import { normalizeDate, yahooEpochSeconds } from "../lib/dates";
import { fetchUpstream, readJson } from "../lib/upstream-fetch";
import { createBar, sortedBars } from "./normalize";

const chartSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      timestamp: z.array(z.number()),
      indicators: z.object({
        quote: z.array(z.object({
          open: z.array(z.number().nullable()),
          high: z.array(z.number().nullable()),
          low: z.array(z.number().nullable()),
          close: z.array(z.number().nullable()),
          volume: z.array(z.number().nullable()),
        })).min(1),
      }),
    })).nullable(),
    error: z.unknown().nullable(),
  }),
});

export const yahooProvider: MarketProvider = {
  source: "yahoo",
  async fetch(query, context) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(query.symbol)}`);
    url.search = new URLSearchParams({
      period1: String(yahooEpochSeconds(query.start)),
      period2: String(yahooEpochSeconds(query.end, true)),
      interval: "1d",
      events: "history",
      includeAdjustedClose: "false",
    }).toString();

    const response = await fetchUpstream(url, { headers: { accept: "application/json" } }, context.fetcher);
    const parsed = chartSchema.safeParse(await readJson(response));
    if (!parsed.success) throw new AppError("UPSTREAM_ERROR", 502, { reason: "invalid_payload" });
    const result = parsed.data.chart.result?.[0];
    if (!result) return [];
    const quote = result.indicators.quote[0];
    return sortedBars(result.timestamp.map((timestamp, index) => createBar({
      date: normalizeDate(timestamp),
      open: quote.open[index],
      high: quote.high[index],
      low: quote.low[index],
      close: quote.close[index],
      volume: quote.volume[index],
    })));
  },
};
