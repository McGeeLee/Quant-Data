import { z } from "zod";
import type { MarketProvider } from "../domain/types";
import { AppError } from "../lib/app-error";
import { compactDate } from "../lib/dates";
import { fetchUpstream, readJson } from "../lib/upstream-fetch";
import { createBar, sortedBars } from "./normalize";

const responseSchema = z.object({
  code: z.number(),
  data: z.object({
    fields: z.array(z.string()),
    items: z.array(z.array(z.unknown())),
  }).optional(),
});

export const tushareProvider: MarketProvider = {
  source: "tushare",
  async fetch(query, context) {
    if (!context.tushareToken) throw new AppError("SOURCE_NOT_CONFIGURED", 503);
    const response = await fetchUpstream("https://api.tushare.pro", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        api_name: "daily",
        token: context.tushareToken,
        params: {
          ts_code: query.symbol,
          start_date: compactDate(query.start),
          end_date: compactDate(query.end),
        },
        fields: "ts_code,trade_date,open,high,low,close,vol",
      }),
    }, context.fetcher);
    const parsed = responseSchema.safeParse(await readJson(response));
    if (!parsed.success || parsed.data.code !== 0 || !parsed.data.data) {
      throw new AppError("UPSTREAM_ERROR", 502, { reason: "provider_rejected_request" });
    }
    const { fields, items } = parsed.data.data;
    const index = Object.fromEntries(fields.map((field, position) => [field, position]));
    return sortedBars(items.map((item) => createBar({
      date: typeof item[index.trade_date] === "string"
        ? String(item[index.trade_date]).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
        : null,
      open: item[index.open],
      high: item[index.high],
      low: item[index.low],
      close: item[index.close],
      volume: item[index.vol],
    })));
  },
};
