import { Client, StreamableHTTPClientTransport, type FetchLike } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMcp } from "../worker/mcp";
import { testEnv, testExecutionContext, yahooPayload } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

function transportFetch(env: Env): FetchLike {
  return async (input, init) => {
    const incoming = input instanceof Request ? input : new Request(String(input), init);
    const headers = new Headers(incoming.headers);
    headers.set("host", "quant-data.mcgeelee.workers.dev");
    const request = new Request(incoming, { headers });
    return handleMcp(request, env, testExecutionContext);
  };
}

async function connect(mode: "auto" | "legacy", env = testEnv()) {
  const client = new Client({ name: `quant-data-test-${mode}`, version: "1.0.0" }, {
    versionNegotiation: { mode },
  });
  const transport = new StreamableHTTPClientTransport(new URL("https://quant-data.mcgeelee.workers.dev/mcp"), {
    fetch: transportFetch(env),
  });
  await client.connect(transport);
  return client;
}

describe("stateless MCP server", () => {
  it("discovers all tools and documentation resources with the modern protocol", async () => {
    const client = await connect("auto");
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(["list_data_sources", "get_market_data", "get_market_snapshot"]);
      expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual(["quant-data://docs/en", "quant-data://docs/zh-CN"]);
    } finally {
      await client.close();
    }
  });

  it("supports an ordinary legacy stateless client", async () => {
    const client = await connect("legacy");
    try {
      const result = await client.callTool({ name: "list_data_sources", arguments: { lang: "zh-CN" } });
      expect(result.isError).not.toBe(true);
      expect((result.structuredContent as { sources: Array<{ id: string }> }).sources[0]?.id).toBe("yahoo");
    } finally {
      await client.close();
    }
  });

  it("returns concise text and validated structured market data", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(yahooPayload())));
    const client = await connect("auto");
    try {
      const result = await client.callTool({
        name: "get_market_data",
        arguments: { source: "yahoo", symbol: "AAPL", start: "2026-08-01", end: "2026-08-10", limit: 1, lang: "en" },
      });
      expect(result.content[0]).toMatchObject({ type: "text" });
      expect(result.structuredContent).toMatchObject({ meta: { count: 1, truncated: true }, bars: [{ close: 104 }] });
    } finally {
      await client.close();
    }
  });

  it("rejects invalid tool parameters at the protocol boundary", async () => {
    const client = await connect("auto");
    try {
      const result = await client.callTool({ name: "get_market_data", arguments: { source: "invalid", symbol: "AAPL" } });
      expect(result.isError).toBe(true);
      const first = result.content[0];
      expect(first?.type).toBe("text");
      expect(first?.type === "text" ? first.text : "").toContain("Input validation error");
    } finally {
      await client.close();
    }
  });
});
