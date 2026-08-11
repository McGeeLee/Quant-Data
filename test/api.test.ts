import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../worker/api";
import { testEnv, testExecutionContext, yahooPayload } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("Worker API contract", () => {
  it("returns health metadata without secret state", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/healthz"), testEnv(), testExecutionContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", version: "3.1.0", deployment: { id: "test-version" } });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-api-version")).toBe("v1");
  });

  it("publishes an API discovery document", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1?lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ apiVersion: string; endpoints: Array<{ operationId: string }>; disclaimer: string }>();
    expect(body.apiVersion).toBe("v1");
    expect(body.endpoints.map((endpoint) => endpoint.operationId)).toContain("getMarketData");
    expect(body.disclaimer).toContain("不构成投资建议");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
  });

  it("localizes source metadata while keeping stable field names", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/sources?lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ disclaimer: string; sources: unknown[] }>();
    expect(body.disclaimer).toContain("不构成投资建议");
    expect(body.sources).toHaveLength(3);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
  });

  it("returns a source-specific symbol error without calling upstream", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=tushare&symbol=AAPL&lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ error: { code: string; details: { source: string } } }>();
    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_SYMBOL", details: { source: "tushare" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates actionable upstream Retry-After metadata", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("limited", { status: 429, headers: { "retry-after": "30" } })));
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=yahoo&symbol=AAPL"), testEnv(), testExecutionContext);
    const body = await response.json<{ error: { code: string } }>();
    expect(response.status).toBe(503);
    expect(body.error.code).toBe("UPSTREAM_RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a stable bilingual validation error", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=nope&symbol=AAPL&lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ error: { code: string; message: string; requestId: string } }>();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toBe("请求参数无效。");
    expect(body.error.requestId).toBeTruthy();
  });

  it("distinguishes unknown routes from unsupported methods", async () => {
    const methodResponse = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/sources", { method: "POST" }), testEnv(), testExecutionContext);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("allow")).toBe("GET, OPTIONS");
    expect(await methodResponse.json()).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });

    const routeResponse = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/missing"), testEnv(), testExecutionContext);
    expect(routeResponse.status).toBe(404);
    expect(await routeResponse.json()).toMatchObject({ error: { code: "ROUTE_NOT_FOUND" } });
  });

  it("serves normalized market data with CORS and cache-safe errors", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(yahooPayload())));
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=yahoo&symbol=AAPL&start=2026-08-01&end=2026-08-10"), testEnv(), testExecutionContext);
    const body = await response.json<{ meta: { count: number; adjustment: string }; bars: unknown[] }>();
    expect(response.status).toBe(200);
    expect(body.meta).toMatchObject({ count: 2, adjustment: "raw" });
    expect(body.bars).toHaveLength(2);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("publishes an OpenAPI 3.1 machine contract", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/openapi.json"), testEnv(), testExecutionContext);
    const body = await response.json<{ openapi: string; paths: Record<string, { get?: { operationId?: string } }> }>();
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toHaveProperty("/api/v1/market-data");
    expect(body.paths).toHaveProperty("/api/v1/snapshot");
    expect(body.paths).toHaveProperty("/healthz");
    expect(body.paths["/api/v1/market-data"]?.get?.operationId).toBe("getMarketData");
  });
});
