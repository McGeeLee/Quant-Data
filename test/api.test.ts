import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiApp } from "../worker/api";
import { testEnv, testExecutionContext, yahooPayload } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("Worker API contract", () => {
  it("returns health metadata without secret state", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/healthz"), testEnv(), testExecutionContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", version: "3.0.0", deployment: { id: "test-version" } });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("localizes source metadata while keeping stable field names", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/sources?lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ disclaimer: string; sources: unknown[] }>();
    expect(body.disclaimer).toContain("不构成投资建议");
    expect(body.sources).toHaveLength(3);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns a stable bilingual validation error", async () => {
    const response = await createApiApp().fetch(new Request("https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=nope&symbol=AAPL&lang=zh-CN"), testEnv(), testExecutionContext);
    const body = await response.json<{ error: { code: string; message: string; requestId: string } }>();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toBe("请求参数无效。");
    expect(body.error.requestId).toBeTruthy();
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
    const body = await response.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toHaveProperty("/api/v1/market-data");
    expect(body.paths).toHaveProperty("/api/v1/snapshot");
  });
});
