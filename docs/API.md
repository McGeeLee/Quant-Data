# Quant Data REST API

[中文](./API.zh-CN.md) · [OpenAPI 3.1](https://quant-data.mcgeelee.workers.dev/openapi.json) · [MCP guide](./MCP.md)

Base URL: `https://quant-data.mcgeelee.workers.dev`

The public v1 API is read-only and requires no authentication. It returns ascending daily, raw/unadjusted OHLCV data. Field names, types, operation IDs, and error codes are language-independent.

## Discovery and versioning

- `GET /api/v1` returns API links, operation IDs, and v1 constraints.
- `GET /openapi.json` is the machine-readable contract.
- Responses include `X-API-Version: v1` and `X-Request-Id`.
- Breaking response or parameter changes require a new URL version. Additive fields and endpoints may be introduced within v1.

## Endpoints

| Operation ID | Request | Purpose |
| --- | --- | --- |
| `getHealth` | `GET /healthz` | Health without probing providers or secrets |
| `discoverApi` | `GET /api/v1` | API discovery document |
| `listDataSources` | `GET /api/v1/sources` | Availability, examples, warnings, attribution |
| `getMarketData` | `GET /api/v1/market-data` | Daily OHLCV, up to 2,000 bars |
| `getMarketSnapshot` | `GET /api/v1/snapshot` | Latest close and change metrics |

### Market query parameters

| Parameter | Required | Rules |
| --- | --- | --- |
| `source` | yes | `yahoo`, `tushare`, or `tiingo` |
| `symbol` | yes | Provider-native symbol; normalized to uppercase |
| `start` | no | Inclusive `YYYY-MM-DD`; defaults to one year before `end` |
| `end` | no | Inclusive `YYYY-MM-DD`; defaults to today (UTC) |
| `lang` | no | `en` or `zh-CN`; otherwise `Accept-Language` is used |

The maximum date range is five years. Calendar dates are strict, so values such as `2026-02-31` are rejected.

| Source | Accepted examples | Notes |
| --- | --- | --- |
| Yahoo | `AAPL`, `BTC-USD`, `^GSPC`, `600519.SS` | Unofficial Chart endpoint |
| Tushare | `600519.SH`, `000001.SZ`, `430047.BJ` | Six digits plus `.SH`, `.SZ`, or `.BJ` |
| Tiingo | `AAPL`, `BRK-A` | Tiingo ticker; retain attribution |

## Example

```bash
curl --get 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data' \
  --data-urlencode 'source=yahoo' \
  --data-urlencode 'symbol=AAPL' \
  --data-urlencode 'start=2026-01-01' \
  --data-urlencode 'end=2026-08-10' \
  --data-urlencode 'lang=en'
```

```json
{
  "meta": {
    "source": "yahoo",
    "symbol": "AAPL",
    "interval": "1d",
    "adjustment": "raw",
    "volumeUnit": "provider-native units",
    "count": 1,
    "fetchedAt": "2026-08-10T00:00:00.000Z",
    "truncated": false,
    "warnings": ["..."]
  },
  "bars": [
    { "date": "2026-08-07", "open": 99, "high": 102, "low": 98, "close": 100, "volume": 1000 }
  ]
}
```

`volume` may be `null`. Tushare volume is lots (100 shares per lot); other sources use provider-native units. Snapshot `previousClose`, `change`, and `changePercent` are `null` when only one bar is available.

## Errors and client behavior

```json
{
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "The symbol format is invalid for the selected data source.",
    "details": { "source": "tushare", "expected": "..." },
    "requestId": "..."
  }
}
```

| HTTP | Common codes | Retry? |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_SYMBOL`, `INVALID_DATE_RANGE` | Fix request |
| 404 | `NOT_FOUND` | Change symbol/range/source |
| 404/405 | `ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED` | Correct route/method; inspect `Allow` |
| 429 | `RATE_LIMITED` | Honor `Retry-After` |
| 502 | `UPSTREAM_ERROR` | Back off and retry |
| 503 | `SOURCE_NOT_CONFIGURED`, `UPSTREAM_RATE_LIMITED` | Configure/change source or honor `Retry-After` |
| 504 | `UPSTREAM_TIMEOUT` | Back off and retry |
| 500 | `INTERNAL_ERROR` | Retry once; report `requestId` if persistent |

Use exponential backoff with jitter for retryable failures. Never retry a 400 response unchanged. Error bodies use `Cache-Control: no-store`.

## Caching, limits, and CORS

- Successful normalized results are edge-cached for 3,600 seconds by source, symbol, range, and interval.
- Market calls are limited to 60/minute for each anonymous IP/source pair. Health, discovery, and docs are unlimited.
- Upstreams time out after 10 seconds. Network errors and HTTP 502–504 are retried once. Long upstream `Retry-After` delays are returned to clients.
- REST allows cross-origin `GET`/`OPTIONS` and exposes `X-Request-Id`, `X-API-Version`, and `Retry-After`.

Market data may be delayed, incomplete, or unavailable. This service does not provide investment advice. Provider terms and redistribution rights remain the caller/deployer's responsibility.
