import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Context } from "hono";
import { z } from "zod";
import {
  ApiErrorSchema,
  DataSourceSchema,
  LocaleSchema,
  MarketDataResponseSchema,
  MarketSnapshotSchema,
  SourcesResponseSchema,
  type Locale,
} from "./domain/types";
import { AppError, toAppError } from "./lib/app-error";
import { defaultDateRange, validateDateRange } from "./lib/dates";
import { errorMessage, resolveLocale } from "./lib/i18n";
import { enforceRateLimit, getMarketData, getMarketSnapshot, listSources } from "./services/market-service";

type Variables = { requestId: string; locale: Locale };
type AppBindings = { Bindings: Env; Variables: Variables };

const querySchema = z.object({
  source: DataSourceSchema.openapi({ example: "yahoo" }),
  symbol: z.string().trim().min(1).max(40).openapi({ example: "AAPL" }),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ example: "2025-01-01" }),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({ example: "2025-12-31" }),
  lang: LocaleSchema.optional().openapi({ example: "en" }),
});

const errorResponses = {
  400: { description: "Invalid request", content: { "application/json": { schema: ApiErrorSchema } } },
  404: { description: "No data found", content: { "application/json": { schema: ApiErrorSchema } } },
  429: { description: "Rate limited", content: { "application/json": { schema: ApiErrorSchema } } },
  502: { description: "Upstream failure", content: { "application/json": { schema: ApiErrorSchema } } },
  503: { description: "Source unavailable", content: { "application/json": { schema: ApiErrorSchema } } },
  504: { description: "Upstream timeout", content: { "application/json": { schema: ApiErrorSchema } } },
  500: { description: "Internal error", content: { "application/json": { schema: ApiErrorSchema } } },
} as const;

function errorResponse(c: Context<AppBindings>, error: AppError) {
  const body = {
    error: {
      code: error.code,
      message: errorMessage(c.get("locale"), error.code),
      ...(error.details === undefined ? {} : { details: error.details }),
      requestId: c.get("requestId"),
    },
  };
  const headers = error.status === 429 ? { "retry-after": "60" } : undefined;
  return c.json(body, error.status, headers);
}

function normalizedQuery(value: z.infer<typeof querySchema>) {
  const defaults = defaultDateRange();
  const query = {
    source: value.source,
    symbol: value.symbol.toUpperCase(),
    start: value.start ?? defaults.start,
    end: value.end ?? defaults.end,
  };
  validateDateRange(query.start, query.end);
  return query;
}

export function createApiApp() {
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: (result, c) => result.success
      ? undefined
      : errorResponse(c, new AppError("INVALID_REQUEST", 400, result.error.flatten())),
  });

  app.use("*", secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
    referrerPolicy: "no-referrer",
  }));
  app.use("/api/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));
  app.use("/openapi.json", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"], maxAge: 86400 }));
  app.use("*", async (c, next) => {
    const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("locale", resolveLocale(c.req.query("lang"), c.req.header("accept-language")));
    c.header("x-request-id", requestId);
    await next();
  });

  app.get("/healthz", (c) => c.json({
    status: "ok",
    service: "quant-data",
    version: c.env.APP_VERSION,
    deployment: {
      id: c.env.VERSION_METADATA.id,
      tag: c.env.VERSION_METADATA.tag,
      timestamp: c.env.VERSION_METADATA.timestamp,
    },
  }));

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/sources",
    tags: ["Market data"],
    summary: "List market data sources and configuration status",
    request: { query: z.object({ lang: LocaleSchema.optional() }) },
    responses: { 200: { description: "Source status", content: { "application/json": { schema: SourcesResponseSchema } } } },
  }), (c) => c.json(listSources(c.env, c.get("locale")), 200));

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/market-data",
    tags: ["Market data"],
    summary: "Get normalized, daily, unadjusted OHLCV bars",
    request: { query: querySchema },
    responses: {
      200: { description: "Market data", content: { "application/json": { schema: MarketDataResponseSchema } } },
      ...errorResponses,
    },
  }), async (c) => {
    const query = normalizedQuery(querySchema.parse(c.req.query()));
    await enforceRateLimit(c.env, c.req.raw, query.source);
    return c.json(await getMarketData(c.env, query, c.get("locale")), 200);
  });

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/snapshot",
    tags: ["Market data"],
    summary: "Get the latest bar and previous-close change metrics",
    request: { query: querySchema },
    responses: {
      200: { description: "Market snapshot", content: { "application/json": { schema: MarketSnapshotSchema } } },
      ...errorResponses,
    },
  }), async (c) => {
    const query = normalizedQuery(querySchema.parse(c.req.query()));
    await enforceRateLimit(c.env, c.req.raw, query.source);
    return c.json(await getMarketSnapshot(c.env, query, c.get("locale")), 200);
  });

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Quant Data API",
      version: "3.0.0",
      description: "Public daily raw market data API. Data may be delayed or incomplete. Not investment advice.",
    },
    servers: [{ url: "https://quant-data.mcgeelee.workers.dev" }],
    tags: [{ name: "Market data", description: "Read-only normalized market data" }],
  });

  app.notFound((c) => errorResponse(c, new AppError("NOT_FOUND", 404)));
  app.onError((error, c) => errorResponse(c, toAppError(error)));
  return app;
}
