# Quant Data MCP Server

[中文](./MCP.zh-CN.md) · [REST API guide](./API.md)

Endpoint: `https://quant-data.mcgeelee.workers.dev/mcp`

The server is public, read-only, stateless, and uses Streamable HTTP. It supports current MCP SDK v2 clients and the stateless compatibility path for 2025-era clients. Requests are independent; clients must not rely on server-side session state.

## Client configuration

```json
{
  "mcpServers": {
    "quant-data": {
      "type": "http",
      "url": "https://quant-data.mcgeelee.workers.dev/mcp"
    }
  }
}
```

Browser/Inspector clients must send an allowed `Origin`. Production, localhost/loopback, and `inspector.modelcontextprotocol.io` are allowed. Host/Origin validation protects against DNS rebinding; arbitrary browser origins are rejected even without OAuth.

## Tool-selection guide

1. Call `list_data_sources` before choosing a provider.
2. Use `get_market_snapshot` for one latest observation and change metrics.
3. Use `get_market_data` for a series, analysis, or chart input.
4. Preserve warnings and attribution from `structuredContent.meta` in downstream answers.

| Tool | Important input | Output |
| --- | --- | --- |
| `list_data_sources` | `lang` (`en`/`zh-CN`) | Availability, markets, native symbols, warnings, attribution |
| `get_market_data` | `source`, `symbol`; optional inclusive `start`, `end`, `lang`, `limit` | Ascending raw daily OHLCV; `limit` defaults to 120, max 500 |
| `get_market_snapshot` | `source`, `symbol`; optional inclusive `start`, `end`, `lang` | Latest close, previous close, absolute/percentage change, volume |

All tools are annotated read-only, non-destructive, and idempotent with Zod input/output schemas. Modern clients receive concise text plus validated `structuredContent`. Legacy stateless clients also receive serialized JSON text. `meta.truncated` means only the most recent requested bars were returned.

## Resources

| URI | MIME type | Purpose |
| --- | --- | --- |
| `quant-data://docs/en` | `text/markdown` | English API/MCP guidance |
| `quant-data://docs/zh-CN` | `text/markdown` | Chinese API/MCP guidance |
| `quant-data://api/openapi` | `application/json` | Current OpenAPI 3.1 REST contract |

Resource discovery has public cache hints. Contents contain no credentials.

## Tool errors

Tool failures set `isError: true` and return stable JSON text:

```json
{
  "error": {
    "code": "UPSTREAM_RATE_LIMITED",
    "message": "The upstream data provider is rate limiting requests.",
    "retryable": true,
    "retryAfterSeconds": 30,
    "hint": "Retry after the indicated delay, or select another configured source.",
    "requestId": "..."
  }
}
```

Protocol/schema validation failures come from the MCP SDK. Application errors share REST error codes. Models should correct non-retryable input/configuration errors, honor `retryAfterSeconds`, and cite `requestId` for persistent failures.

## Data and operational semantics

- Dates are inclusive, strictly validated, and limited to five years.
- Values are daily and raw/unadjusted.
- Tushare volume is lots; other volume units are provider-native.
- REST and MCP share the 60/minute anonymous IP/source limiter and one-hour normalized-data edge cache.
- Yahoo Chart is unofficial and may rate-limit or change without notice.
- Tushare/Tiingo return `SOURCE_NOT_CONFIGURED` until their Worker secrets are set.

Market data may be delayed or incomplete. This service does not provide investment advice.
