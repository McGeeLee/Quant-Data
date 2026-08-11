export const docs = {
  en: `# Quant Data API and MCP

Quant Data exposes public, read-only daily raw OHLCV data from Yahoo Finance Chart, Tushare Pro, and Tiingo.

## REST API

- GET /api/v1 — discovery, stable operation IDs, links, and constraints
- GET /api/v1/sources — source availability and examples
- GET /api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31
- GET /api/v1/snapshot?source=yahoo&symbol=AAPL
- GET /openapi.json — OpenAPI 3.1 contract

Dates use YYYY-MM-DD. The default range is one year and the maximum is five years. REST responses contain at most 2,000 bars. Use lang=en or lang=zh-CN, or the Accept-Language header.

Symbols are provider-native: Yahoo AAPL/BTC-USD/600519.SS, Tushare 600519.SH, and Tiingo AAPL. Invalid calendar dates and source-specific symbol formats return stable 400 errors. Every response includes X-Request-Id and X-API-Version. Honor Retry-After on 429 or upstream-rate-limit responses; do not retry unchanged 400 requests.

Errors use { error: { code, message, details?, requestId } }. Important codes: INVALID_REQUEST, INVALID_SYMBOL, INVALID_DATE_RANGE, NOT_FOUND, ROUTE_NOT_FOUND, METHOD_NOT_ALLOWED, RATE_LIMITED, SOURCE_NOT_CONFIGURED, UPSTREAM_RATE_LIMITED, UPSTREAM_TIMEOUT, UPSTREAM_ERROR, INTERNAL_ERROR.

## MCP

Connect a Streamable HTTP MCP client to POST /mcp. The endpoint is public and stateless. Call list_data_sources first, get_market_snapshot for a single latest observation, and get_market_data for a series. Resources: quant-data://docs/en, quant-data://docs/zh-CN, and quant-data://api/openapi.

Modern tools return concise text plus validated structuredContent. Legacy stateless clients also receive JSON text. Tool errors include a stable code, retryable flag, optional retryAfterSeconds, actionable hint, and requestId. Preserve meta.warnings, meta.attribution, meta.volumeUnit, and meta.truncated in downstream model answers.

Market data can be delayed or incomplete. Yahoo Chart is unofficial and may change. Data provided by Tiingo must retain attribution. This service does not provide investment advice.`,
  "zh-CN": `# Quant Data API 与 MCP

Quant Data 通过公开只读接口提供 Yahoo Finance Chart、Tushare Pro 和 Tiingo 的未复权日线 OHLCV 数据。

## REST API

- GET /api/v1 — 发现信息、稳定操作 ID、链接与限制
- GET /api/v1/sources — 数据源状态和代码示例
- GET /api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31
- GET /api/v1/snapshot?source=yahoo&symbol=AAPL
- GET /openapi.json — OpenAPI 3.1 契约

日期格式为 YYYY-MM-DD。默认范围为最近一年，最长五年；REST 最多返回 2,000 条。可使用 lang=en、lang=zh-CN 或 Accept-Language 请求本地化消息。

代码使用数据源原生格式：Yahoo AAPL/BTC-USD/600519.SS、Tushare 600519.SH、Tiingo AAPL。无效日历日期和不符合数据源规则的代码返回稳定 400 错误。响应包含 X-Request-Id 与 X-API-Version；429 或上游限流时应遵循 Retry-After，不要原样重试 400。

错误格式为 { error: { code, message, details?, requestId } }。主要错误码：INVALID_REQUEST、INVALID_SYMBOL、INVALID_DATE_RANGE、NOT_FOUND、ROUTE_NOT_FOUND、METHOD_NOT_ALLOWED、RATE_LIMITED、SOURCE_NOT_CONFIGURED、UPSTREAM_RATE_LIMITED、UPSTREAM_TIMEOUT、UPSTREAM_ERROR、INTERNAL_ERROR。

## MCP

将 Streamable HTTP MCP 客户端连接到 POST /mcp。端点公开、无状态。先调用 list_data_sources；单个最新值使用 get_market_snapshot；序列使用 get_market_data。资源：quant-data://docs/en、quant-data://docs/zh-CN 与 quant-data://api/openapi。

现代工具返回精简文本与经过验证的 structuredContent；旧版无状态客户端还会获得 JSON 文本。工具错误包含稳定错误码、retryable、可选 retryAfterSeconds、可执行 hint 与 requestId。模型下游回答必须保留 meta.warnings、meta.attribution、meta.volumeUnit 与 meta.truncated。

行情可能延迟或不完整。Yahoo Chart 是非官方接口，可能发生变更。Tiingo 数据必须保留署名。本服务不构成投资建议。`,
} as const;

export const llmsText = `# Quant Data

> Public bilingual market-data REST API and stateless MCP server on Cloudflare Workers.

- [English documentation](https://quant-data.mcgeelee.workers.dev/docs/en)
- [中文文档](https://quant-data.mcgeelee.workers.dev/docs/zh-CN)
- [OpenAPI 3.1](https://quant-data.mcgeelee.workers.dev/openapi.json)
- [API discovery](https://quant-data.mcgeelee.workers.dev/api/v1)
- [Full LLM context](https://quant-data.mcgeelee.workers.dev/llms-full.txt)
- MCP endpoint: https://quant-data.mcgeelee.workers.dev/mcp
`;

export const llmsFullText = `${llmsText}\n---\n\n${docs.en}\n\n---\n\n${docs["zh-CN"]}\n`;
