import { z } from "zod";

export const DataSourceSchema = z.enum(["yahoo", "tushare", "tiingo"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const LocaleSchema = z.enum(["en", "zh-CN"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const MarketBarSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative().nullable(),
});
export type MarketBar = z.infer<typeof MarketBarSchema>;

export const MarketDataMetaSchema = z.object({
  source: DataSourceSchema,
  symbol: z.string(),
  interval: z.literal("1d"),
  adjustment: z.literal("raw"),
  volumeUnit: z.string(),
  count: z.number().int().nonnegative(),
  fetchedAt: z.string().datetime(),
  truncated: z.boolean(),
  attribution: z.string().optional(),
  warnings: z.array(z.string()),
});

export const MarketDataResponseSchema = z.object({
  meta: MarketDataMetaSchema,
  bars: z.array(MarketBarSchema),
});
export type MarketDataResponse = z.infer<typeof MarketDataResponseSchema>;

export const MarketSnapshotSchema = z.object({
  meta: MarketDataMetaSchema,
  snapshot: z.object({
    date: z.string(),
    close: z.number(),
    previousClose: z.number().nullable(),
    change: z.number().nullable(),
    changePercent: z.number().nullable(),
    volume: z.number().nullable(),
  }),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const SourceStatusSchema = z.object({
  id: DataSourceSchema,
  name: z.string(),
  configured: z.boolean(),
  official: z.boolean(),
  markets: z.array(z.string()),
  symbolExamples: z.array(z.string()),
  attribution: z.string().optional(),
  warnings: z.array(z.string()),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourcesResponseSchema = z.object({
  sources: z.array(SourceStatusSchema),
  disclaimer: z.string(),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type MarketQuery = {
  source: DataSource;
  symbol: string;
  start: string;
  end: string;
};

export type ProviderContext = {
  tushareToken?: string;
  tiingoKey?: string;
  fetcher?: typeof fetch;
};

export interface MarketProvider {
  readonly source: DataSource;
  fetch(query: MarketQuery, context: ProviderContext): Promise<MarketBar[]>;
}
