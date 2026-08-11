# Quant Data

[中文说明](./README.zh-CN.md) · [Live dashboard](https://quant-data.mcgeelee.workers.dev) · [API guide](./docs/API.md) · [MCP guide](./docs/MCP.md) · [OpenAPI](https://quant-data.mcgeelee.workers.dev/openapi.json)

Quant Data is a bilingual market-data dashboard, REST API, OpenAPI 3.1 service, and stateless MCP server running in a single Cloudflare Worker. It normalizes Yahoo Finance Chart, Tushare Pro, and Tiingo into ascending, daily, unadjusted OHLCV bars.

> Market data can be delayed, incomplete, or unavailable. Yahoo Chart is an unofficial endpoint and is not guaranteed to remain stable. This project does not provide investment advice.

## Features

- React 19 + Vite 8 dashboard with responsive Lightweight Charts
- Hono + Zod/OpenAPI REST contract and stable localized errors
- MCP SDK v2 through Cloudflare Agents `createMcpHandler`
- Stateless Streamable HTTP with ordinary 2025 stateless-client compatibility
- English and Simplified Chinese UI, docs, messages, warnings, and MCP resources
- One-hour edge cache and Cloudflare Rate Limiting at 60 requests/minute per anonymous IP and source
- Ten-second upstream timeout; one retry for network errors and HTTP 502–504; bounded handling for upstream 429
- Secrets read only from Worker bindings—never returned or logged

## Public endpoints

| Endpoint | Description |
| --- | --- |
| `GET /healthz` | Service version and Cloudflare deployment metadata |
| `GET /api/v1` | API discovery, links, operation IDs, and constraints |
| `GET /api/v1/sources` | Provider configuration, markets, examples, warnings, attribution |
| `GET /api/v1/market-data` | Daily raw OHLCV; one year by default, five years maximum, 2,000 bars maximum |
| `GET /api/v1/snapshot` | Latest close, previous close, change, change percentage, volume |
| `GET /openapi.json` | OpenAPI 3.1 machine contract |
| `POST /mcp` | Stateless Streamable HTTP MCP endpoint |
| `GET /docs/en` | English documentation |
| `GET /docs/zh-CN` | Chinese documentation |
| `GET /llms.txt` | Concise model discovery file |
| `GET /llms-full.txt` | Full bilingual model context |

### REST example

```bash
curl 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31&lang=en'
```

`source` is one of `yahoo`, `tushare`, or `tiingo`. `start` and `end` are inclusive `YYYY-MM-DD` dates. Use `lang=en`, `lang=zh-CN`, or `Accept-Language`; field names, types, and error codes remain language-independent.

Errors always use this shape:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request parameters are invalid.",
    "requestId": "..."
  }
}
```

## MCP

Connect a Streamable HTTP client to:

```text
https://quant-data.mcgeelee.workers.dev/mcp
```

Example client configuration:

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

Tools:

- `list_data_sources` — provider availability and symbol examples
- `get_market_data` — defaults to the 120 most recent bars; accepts `limit` up to 500 and reports truncation
- `get_market_snapshot` — latest close and change metrics

Every tool is read-only and idempotent, has Zod input/output schemas, and returns concise text plus `structuredContent`. Resources are available at `quant-data://docs/en`, `quant-data://docs/zh-CN`, and `quant-data://api/openapi`.

The MCP handler validates Host and browser Origin headers against the production Worker, local development, and MCP Inspector origins to prevent DNS rebinding. The endpoint intentionally has no authentication.

## Data-source behavior

| Source | Markets/examples | Secret | Notes |
| --- | --- | --- | --- |
| Yahoo Finance Chart | `AAPL`, `BTC-USD`, `600519.SS` | None | Unofficial endpoint; provider-native volume units |
| Tushare Pro | `600519.SH`, `000001.SZ` | `TUSHARE_TOKEN` | Volume is reported in lots (100 shares per lot) |
| Tiingo | `AAPL`, `TSLA` | `TIINGO_KEY` | Responses preserve “Data provided by Tiingo” attribution |

All sources expose only daily, raw/unadjusted values in v1. If a secret is absent, `/api/v1/sources` reports that provider as unconfigured and provider calls return `SOURCE_NOT_CONFIGURED` without revealing secret state in `/healthz`.

## Local development

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
cp .env.example .dev.vars
npm run cf-types
npm run dev
```

Yahoo works without credentials. Put local Tushare/Tiingo credentials in the ignored `.dev.vars`; do not commit them.

Useful commands:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run cf-types:check
npm run build
npm run deploy:dry-run
npm run check
```

## Cloudflare deployment

`wrangler.jsonc` fixes the Worker name to `quant-data`, compatibility date to `2026-08-10`, enables `nodejs_compat`, SPA assets, Workers.dev, version metadata, structured logs/traces, and the Rate Limiting binding. It does not use D1, Durable Objects, KV, or persistent business storage.

Configure production secrets in the Cloudflare dashboard or with Wrangler:

```bash
npx wrangler secret put TUSHARE_TOKEN
npx wrangler secret put TIINGO_KEY
```

Cloudflare Workers Builds settings:

| Setting | Value |
| --- | --- |
| Repository | `McGeeLee/Quant-Data` |
| Branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Pushing `main` triggers the linked Worker build and deployment. `package-lock.json` makes the dependency graph reproducible.

## Architecture

```text
Browser / REST client / MCP client
                 │
        Cloudflare Worker
        ├── React SPA assets
        ├── Hono + OpenAPI API
        ├── stateless MCP v2 handler
        ├── rate limit + Cache API
        └── normalized provider layer
            ├── Yahoo Chart
            ├── Tushare HTTP API
            └── Tiingo REST API
```

The cache key contains source, normalized symbol, inclusive date range, and interval. Only successful normalized series are cached for 3,600 seconds. API and MCP share the same provider and error-mapping layer.

## Migration from v2

Version 3 is a full rewrite. The former Python, Streamlit, Pandas, Plotly, `yfinance`, `tushare`, and `tiingo` client implementation was removed. Behavior differences:

- one edge Worker replaces the Streamlit application and server-side DataFrame flow;
- browser, REST, OpenAPI, and MCP interfaces are first-class;
- upstream calls use direct HTTP adapters with explicit timeout/retry/error policy;
- only the previously active Yahoo, Tushare, and Tiingo daily/raw paths are retained;
- AkShare, Binance placeholders, Python dependencies, and Streamlit configuration are not migrated.

## Attribution and terms

Provider data remains subject to each provider's terms. Yahoo Chart is unofficial. Tushare responses are attributed to Tushare. Tiingo responses include the required attribution. Deployers are responsible for ensuring their provider plans permit public redistribution.
