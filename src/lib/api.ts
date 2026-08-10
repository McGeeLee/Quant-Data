import type { Locale, MarketDataResponse, SourceStatus } from "../../worker/domain/types";

type ApiError = { error?: { code?: string; message?: string; requestId?: string } };

async function jsonRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json<T & ApiError>();
  if (!response.ok) {
    const suffix = body.error?.requestId ? ` (${body.error.requestId})` : "";
    throw new Error(`${body.error?.message ?? `HTTP ${response.status}`}${suffix}`);
  }
  return body;
}

export async function fetchSources(lang: Locale): Promise<SourceStatus[]> {
  const body = await jsonRequest<{ sources: SourceStatus[] }>(`/api/v1/sources?lang=${encodeURIComponent(lang)}`);
  return body.sources;
}

export async function fetchMarketData(input: {
  source: string;
  symbol: string;
  start: string;
  end: string;
  lang: Locale;
}): Promise<MarketDataResponse> {
  const params = new URLSearchParams(input);
  return jsonRequest<MarketDataResponse>(`/api/v1/market-data?${params.toString()}`);
}
