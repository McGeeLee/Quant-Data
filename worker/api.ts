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
import type { RuntimeEnv } from "./env";
import { AppError, retryAfterSeconds, toAppError } from "./lib/app-error";
import { errorMessage, resolveLocale } from "./lib/i18n";
import { normalizeMarketQuery } from "./lib/query";
import { enforceRateLimit, getMarketData, getMarketSnapshot, listSources } from "./services/market-service";

type Variables = { requestId: string; locale: Locale };
type AppBindings = { Bindings: RuntimeEnv; Variables: Variables };

const PROD_ORIGIN = "https://quant-data.mcgeelee.workers.dev";
const API_VERSION = "v1";

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
  405: { description: "Method not allowed", content: { "application/json": { schema: ApiErrorSchema } } },
  429: { description: "Rate limited", content: { "application/json": { schema: ApiErrorSchema } } },
  502: { description: "Upstream failure", content: { "application/json": { schema: ApiErrorSchema } } },
  503: { description: "Source unavailable", content: { "application/json": { schema: ApiErrorSchema } } },
  504: { description: "Upstream timeout", content: { "application/json": { schema: ApiErrorSchema } } },
  500: { description: "Internal error", content: { "application/json": { schema: ApiErrorSchema } } },
} as const;

const HealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("quant-data"),
  version: z.string(),
  deployment: z.object({ id: z.string(), tag: z.string(), timestamp: z.string().datetime() }),
});

const ApiIndexSchema = z.object({
  service: z.literal("quant-data"),
  apiVersion: z.literal("v1"),
  authentication: z.literal("none"),
  links: z.object({
    openapi: z.string().url(),
    documentation: z.object({ en: z.string().url(), "zh-CN": z.string().url() }),
    mcp: z.string().url(),
  }),
  endpoints: z.array(z.object({ method: z.literal("GET"), path: z.string(), operationId: z.string() })),
  constraints: z.object({ interval: z.literal("1d"), adjustment: z.literal("raw"), maximumYears: z.literal(5), maximumBars: z.literal(2000) }),
  disclaimer: z.string(),
});

function errorResponse(c: Context<AppBindings>, error: AppError) {
  const body = {
    error: {
      code: error.code,
      message: errorMessage(c.get("locale"), error.code),
      ...(error.details === undefined ? {} : { details: error.details }),
      requestId: c.get("requestId"),
    },
  };
  const retryAfter = retryAfterSeconds(error);
  const headers = {
    "cache-control": "no-store",
    ...(retryAfter === undefined ? {} : { "retry-after": String(retryAfter) }),
  };
  return c.json(body, error.status, headers);
}

export function createApiApp(executionCtx?: ExecutionContext) {
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
  const publicCors = cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    exposeHeaders: ["X-Request-Id", "X-API-Version", "Retry-After"],
    maxAge: 86400,
  });
  app.use("/api/*", publicCors);
  app.use("/healthz", publicCors);
  app.use("/openapi.json", publicCors);
  app.use("*", async (c, next) => {
    const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.set("locale", resolveLocale(c.req.query("lang"), c.req.header("accept-language")));
    c.header("x-request-id", requestId);
    c.header("x-api-version", API_VERSION);
    c.header("vary", "Accept-Language");
    await next();
  });

  app.openapi(createRoute({
    method: "get",
    path: "/healthz",
    operationId: "getHealth",
    tags: ["Service"],
    summary: "Get service and deployment health",
    description: "Returns process-level health without probing upstream providers or revealing secret configuration.",
    responses: { 200: { description: "Service is accepting requests", content: { "application/json": { schema: HealthSchema } } } },
  }), (c) => {
    c.header("cache-control", "no-store");
    return c.json({
      status: "ok" as const,
      service: "quant-data" as const,
      version: c.env.APP_VERSION,
      deployment: {
        id: c.env.VERSION_METADATA.id,
        tag: c.env.VERSION_METADATA.tag,
        timestamp: c.env.VERSION_METADATA.timestamp,
      },
    }, 200);
  });

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1",
    operationId: "discoverApi",
    tags: ["Service"],
    summary: "Discover the public API",
    description: "Stable entry point for clients to discover contracts, documentation, MCP transport, and v1 constraints.",
    request: { query: z.object({ lang: LocaleSchema.optional() }) },
    responses: { 200: { description: "API discovery document", content: { "application/json": { schema: ApiIndexSchema } } } },
  }), (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.json({
      service: "quant-data" as const,
      apiVersion: "v1" as const,
      authentication: "none" as const,
      links: {
        openapi: `${PROD_ORIGIN}/openapi.json`,
        documentation: { en: `${PROD_ORIGIN}/docs/en`, "zh-CN": `${PROD_ORIGIN}/docs/zh-CN` },
        mcp: `${PROD_ORIGIN}/mcp`,
      },
      endpoints: [
        { method: "GET" as const, path: "/api/v1/sources", operationId: "listDataSources" },
        { method: "GET" as const, path: "/api/v1/market-data", operationId: "getMarketData" },
        { method: "GET" as const, path: "/api/v1/snapshot", operationId: "getMarketSnapshot" },
      ],
      constraints: { interval: "1d" as const, adjustment: "raw" as const, maximumYears: 5 as const, maximumBars: 2000 as const },
      disclaimer: c.get("locale") === "zh-CN"
        ? "行情数据可能延迟或不完整；本服务不构成投资建议。"
        : "Market data may be delayed or incomplete. This service does not provide investment advice.",
    }, 200);
  });

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/sources",
    operationId: "listDataSources",
    tags: ["Market data"],
    summary: "List market data sources and configuration status",
    description: "Reports source availability without exposing credentials. Includes provider-native symbol examples, stability warnings, and attribution.",
    request: { query: z.object({ lang: LocaleSchema.optional() }) },
    responses: { 200: { description: "Source status", content: { "application/json": { schema: SourcesResponseSchema } } } },
  }), (c) => {
    c.header("cache-control", "public, max-age=60");
    return c.json(listSources(c.env, c.get("locale")), 200);
  });

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/market-data",
    operationId: "getMarketData",
    tags: ["Market data"],
    summary: "Get normalized, daily, unadjusted OHLCV bars",
    description: "Returns provider-native, unadjusted daily bars in ascending date order. Start and end dates are inclusive. Defaults to the most recent year; ranges are limited to five years and 2,000 bars.",
    request: { query: querySchema },
    responses: {
      200: { description: "Market data", content: { "application/json": { schema: MarketDataResponseSchema } } },
      ...errorResponses,
    },
  }), async (c) => {
    const query = normalizeMarketQuery(querySchema.parse(c.req.query()));
    await enforceRateLimit(c.env, c.req.raw, query.source);
    const output = await getMarketData(c.env, query, c.get("locale"), { executionCtx });
    c.header("cache-control", "public, max-age=60");
    return c.json(output, 200);
  });

  app.openapi(createRoute({
    method: "get",
    path: "/api/v1/snapshot",
    operationId: "getMarketSnapshot",
    tags: ["Market data"],
    summary: "Get the latest bar and previous-close change metrics",
    description: "Returns the last available daily close and its change from the preceding returned trading day. A null previousClose means only one bar was available.",
    request: { query: querySchema },
    responses: {
      200: { description: "Market snapshot", content: { "application/json": { schema: MarketSnapshotSchema } } },
      ...errorResponses,
    },
  }), async (c) => {
    const query = normalizeMarketQuery(querySchema.parse(c.req.query()));
    await enforceRateLimit(c.env, c.req.raw, query.source);
    const output = await getMarketSnapshot(c.env, query, c.get("locale"), { executionCtx });
    c.header("cache-control", "public, max-age=60");
    return c.json(output, 200);
  });

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Quant Data API",
      version: "3.1.0",
      description: "Public, read-only v1 API for normalized daily raw OHLCV data. Messages can be localized; field names and error codes remain stable. Data may be delayed or incomplete. Not investment advice.",
      contact: { name: "Quant Data", url: "https://github.com/McGeeLee/Quant-Data" },
    },
    servers: [{ url: PROD_ORIGIN, description: "Production" }],
    externalDocs: { description: "English API and MCP documentation", url: `${PROD_ORIGIN}/docs/en` },
    security: [],
    tags: [
      { name: "Service", description: "Health and API discovery" },
      { name: "Market data", description: "Read-only normalized market data" },
    ],
  });

  for (const path of ["/healthz", "/api/v1", "/api/v1/sources", "/api/v1/market-data", "/api/v1/snapshot", "/openapi.json"]) {
    app.all(path, (c) => {
      c.header("allow", "GET, OPTIONS");
      return errorResponse(c, new AppError("METHOD_NOT_ALLOWED", 405));
    });
  }

  app.notFound((c) => errorResponse(c, new AppError("ROUTE_NOT_FOUND", 404)));
  app.onError((error, c) => {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      console.error(JSON.stringify({
        event: "api_error",
        requestId: c.get("requestId"),
        code: appError.code,
        status: appError.status,
        method: c.req.method,
        path: c.req.path,
      }));
    }
    return errorResponse(c, appError);
  });
  return app;
}
