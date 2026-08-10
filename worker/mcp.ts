import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { docs } from "./docs-content";
import {
  DataSourceSchema,
  LocaleSchema,
  MarketDataResponseSchema,
  MarketSnapshotSchema,
  SourcesResponseSchema,
  type Locale,
} from "./domain/types";
import { toAppError } from "./lib/app-error";
import { defaultDateRange, validateDateRange } from "./lib/dates";
import { errorMessage } from "./lib/i18n";
import { enforceRateLimit, getMarketData, getMarketSnapshot, listSources } from "./services/market-service";

const baseInput = z.object({
  source: DataSourceSchema.describe("Market data source"),
  symbol: z.string().trim().min(1).max(40).describe("Provider-native symbol, for example AAPL or 600519.SH"),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive start date, YYYY-MM-DD"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Inclusive end date, YYYY-MM-DD"),
  lang: LocaleSchema.default("en").describe("Language for messages and warnings"),
});

function queryFromInput(input: z.infer<typeof baseInput>) {
  const defaults = defaultDateRange();
  const query = {
    source: input.source,
    symbol: input.symbol.toUpperCase(),
    start: input.start ?? defaults.start,
    end: input.end ?? defaults.end,
  };
  validateDateRange(query.start, query.end);
  return query;
}

function toolError(error: unknown, locale: Locale) {
  const appError = toAppError(error);
  const output = { error: { code: appError.code, message: errorMessage(locale, appError.code) } };
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
  };
}

function createServer(env: Env, request: Request, executionCtx: ExecutionContext) {
  const server = new McpServer({
    name: "quant-data",
    version: env.APP_VERSION,
  }, {
    instructions: "Read-only daily raw market data. Always retain source warnings and attribution. Never treat results as investment advice.",
  });

  server.registerTool("list_data_sources", {
    title: "List data sources",
    description: "List Yahoo, Tushare, and Tiingo availability, markets, symbol examples, warnings, and attribution.",
    inputSchema: z.object({ lang: LocaleSchema.default("en") }),
    outputSchema: SourcesResponseSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ lang }) => {
    const output = listSources(env, lang);
    return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
  });

  server.registerTool("get_market_data", {
    title: "Get market data",
    description: "Get ascending daily raw OHLCV bars. Defaults to one year and 120 recent bars; limit may be raised to 500.",
    inputSchema: baseInput.extend({ limit: z.number().int().min(1).max(500).default(120) }),
    outputSchema: MarketDataResponseSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input) => {
    try {
      const query = queryFromInput(input);
      await enforceRateLimit(env, request, query.source);
      const output = await getMarketData(env, query, input.lang, { maxBars: input.limit, executionCtx });
      const summary = `${output.meta.source}:${output.meta.symbol} ${output.meta.count} daily bars (${output.bars[0]?.date ?? "n/a"}..${output.bars.at(-1)?.date ?? "n/a"}), truncated=${output.meta.truncated}`;
      return { content: [{ type: "text", text: summary }], structuredContent: output };
    } catch (error) {
      return toolError(error, input.lang);
    }
  });

  server.registerTool("get_market_snapshot", {
    title: "Get market snapshot",
    description: "Get the latest daily close, previous close, absolute and percentage change, and volume.",
    inputSchema: baseInput,
    outputSchema: MarketSnapshotSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input) => {
    try {
      const query = queryFromInput(input);
      await enforceRateLimit(env, request, query.source);
      const output = await getMarketSnapshot(env, query, input.lang, { executionCtx });
      const summary = `${output.meta.source}:${output.meta.symbol} ${output.snapshot.date} close=${output.snapshot.close} changePercent=${output.snapshot.changePercent ?? "n/a"}`;
      return { content: [{ type: "text", text: summary }], structuredContent: output };
    } catch (error) {
      return toolError(error, input.lang);
    }
  });

  server.registerResource("quant-data-docs-en", "quant-data://docs/en", {
    title: "Quant Data documentation (English)",
    description: "REST API and MCP usage, constraints, warnings, and examples.",
    mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: docs.en }] }));

  server.registerResource("quant-data-docs-zh-cn", "quant-data://docs/zh-CN", {
    title: "Quant Data 文档（中文）",
    description: "REST API 与 MCP 用法、限制、风险和示例。",
    mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: docs["zh-CN"] }] }));

  return server;
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  return createMcpHandler(() => createServer(env, request, ctx), {
    route: "/mcp",
    legacy: "stateless",
    responseMode: "auto",
    corsOptions: { origin: "*", methods: "POST, OPTIONS", headers: "content-type, mcp-protocol-version, mcp-session-id" },
    allowedHostnames: ["quant-data.mcgeelee.workers.dev", "localhost", "127.0.0.1", "[::1]"],
    allowedOriginHostnames: [
      "quant-data.mcgeelee.workers.dev",
      "localhost",
      "127.0.0.1",
      "[::1]",
      "inspector.modelcontextprotocol.io",
    ],
    onerror(error) {
      console.error(JSON.stringify({ event: "mcp_error", name: error.name }));
    },
  })(request, env, ctx);
}
