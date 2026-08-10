export const docs = {
  en: `# Quant Data API and MCP

Quant Data exposes public, read-only daily raw OHLCV data from Yahoo Finance Chart, Tushare Pro, and Tiingo.

## REST API

- GET /api/v1/sources — source availability and examples
- GET /api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31
- GET /api/v1/snapshot?source=yahoo&symbol=AAPL
- GET /openapi.json — OpenAPI 3.1 contract

Dates use YYYY-MM-DD. The default range is one year and the maximum is five years. REST responses contain at most 2,000 bars. Use lang=en or lang=zh-CN, or the Accept-Language header.

## MCP

Connect a Streamable HTTP MCP client to POST /mcp. The endpoint is public and stateless. Tools: list_data_sources, get_market_data, get_market_snapshot. Resources: quant-data://docs/en and quant-data://docs/zh-CN.

Market data can be delayed or incomplete. Yahoo Chart is unofficial and may change. Data provided by Tiingo must retain attribution. This service does not provide investment advice.`,
  "zh-CN": `# Quant Data API 与 MCP

Quant Data 通过公开只读接口提供 Yahoo Finance Chart、Tushare Pro 和 Tiingo 的未复权日线 OHLCV 数据。

## REST API

- GET /api/v1/sources — 数据源状态和代码示例
- GET /api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31
- GET /api/v1/snapshot?source=yahoo&symbol=AAPL
- GET /openapi.json — OpenAPI 3.1 契约

日期格式为 YYYY-MM-DD。默认范围为最近一年，最长五年；REST 最多返回 2,000 条。可使用 lang=en、lang=zh-CN 或 Accept-Language 请求本地化消息。

## MCP

将 Streamable HTTP MCP 客户端连接到 POST /mcp。端点公开、无状态。工具：list_data_sources、get_market_data、get_market_snapshot。资源：quant-data://docs/en 与 quant-data://docs/zh-CN。

行情可能延迟或不完整。Yahoo Chart 是非官方接口，可能发生变更。Tiingo 数据必须保留署名。本服务不构成投资建议。`,
} as const;

export const llmsText = `# Quant Data

> Public bilingual market-data REST API and stateless MCP server on Cloudflare Workers.

- [English documentation](https://quant-data.mcgeelee.workers.dev/docs/en)
- [中文文档](https://quant-data.mcgeelee.workers.dev/docs/zh-CN)
- [OpenAPI 3.1](https://quant-data.mcgeelee.workers.dev/openapi.json)
- [Full LLM context](https://quant-data.mcgeelee.workers.dev/llms-full.txt)
- MCP endpoint: https://quant-data.mcgeelee.workers.dev/mcp
`;

export const llmsFullText = `${llmsText}\n---\n\n${docs.en}\n\n---\n\n${docs["zh-CN"]}\n`;
