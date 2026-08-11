# Quant Data REST API

[English](./API.md) · [OpenAPI 3.1](https://quant-data.mcgeelee.workers.dev/openapi.json) · [MCP 指南](./MCP.zh-CN.md)

基础地址：`https://quant-data.mcgeelee.workers.dev`

v1 API 完全公开、只读且无需鉴权，统一返回按日期升序的未复权日线 OHLCV。字段名、类型、`operationId` 和错误码不随语言改变。

## 发现与版本策略

- `GET /api/v1` 返回 API 链接、操作 ID 和 v1 限制。
- `GET /openapi.json` 提供机器可读契约。
- 响应包含 `X-API-Version: v1` 和 `X-Request-Id`。
- 破坏性变更必须使用新 URL 版本；v1 内允许新增可选字段与端点。

## 端点

| 操作 ID | 请求 | 用途 |
| --- | --- | --- |
| `getHealth` | `GET /healthz` | 健康检查，不探测上游或 Secret |
| `discoverApi` | `GET /api/v1` | API 发现文档 |
| `listDataSources` | `GET /api/v1/sources` | 可用性、示例、风险与署名 |
| `getMarketData` | `GET /api/v1/market-data` | 最多 2,000 条日线 OHLCV |
| `getMarketSnapshot` | `GET /api/v1/snapshot` | 最新收盘与涨跌指标 |

### 行情查询参数

| 参数 | 必填 | 规则 |
| --- | --- | --- |
| `source` | 是 | `yahoo`、`tushare` 或 `tiingo` |
| `symbol` | 是 | 数据源原生代码；服务会转为大写 |
| `start` | 否 | 包含边界的 `YYYY-MM-DD`；默认从 `end` 向前一年 |
| `end` | 否 | 包含边界的 `YYYY-MM-DD`；默认 UTC 当天 |
| `lang` | 否 | `en` 或 `zh-CN`；否则读取 `Accept-Language` |

日期范围最长五年，并严格校验真实日历日期，因此 `2026-02-31` 会被拒绝。

| 数据源 | 合法示例 | 说明 |
| --- | --- | --- |
| Yahoo | `AAPL`、`BTC-USD`、`^GSPC`、`600519.SS` | 非官方 Chart 接口 |
| Tushare | `600519.SH`、`000001.SZ`、`430047.BJ` | 六位数字加 `.SH`、`.SZ` 或 `.BJ` |
| Tiingo | `AAPL`、`BRK-A` | Tiingo ticker；必须保留署名 |

## 示例

```bash
curl --get 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data' \
  --data-urlencode 'source=yahoo' \
  --data-urlencode 'symbol=AAPL' \
  --data-urlencode 'start=2026-01-01' \
  --data-urlencode 'end=2026-08-10' \
  --data-urlencode 'lang=zh-CN'
```

`volume` 可能为 `null`。Tushare 成交量单位为手（每手 100 股），其他源使用提供方原生单位。当区间只有一条日线时，快照的 `previousClose`、`change` 和 `changePercent` 为 `null`。

## 错误与客户端策略

```json
{
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "代码格式不符合所选数据源的要求。",
    "details": { "source": "tushare", "expected": "..." },
    "requestId": "..."
  }
}
```

| HTTP | 常见错误码 | 策略 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`、`INVALID_SYMBOL`、`INVALID_DATE_RANGE` | 修正请求 |
| 404 | `NOT_FOUND` | 更换代码、区间或源 |
| 404/405 | `ROUTE_NOT_FOUND`、`METHOD_NOT_ALLOWED` | 修正路由/方法并查看 `Allow` |
| 429 | `RATE_LIMITED` | 遵循 `Retry-After` |
| 502 | `UPSTREAM_ERROR` | 退避后重试 |
| 503 | `SOURCE_NOT_CONFIGURED`、`UPSTREAM_RATE_LIMITED` | 配置/更换源或遵循 `Retry-After` |
| 504 | `UPSTREAM_TIMEOUT` | 退避后重试 |
| 500 | `INTERNAL_ERROR` | 重试一次；持续失败时报告 `requestId` |

可重试错误应使用带抖动的指数退避；不要原样重试 400。错误响应使用 `Cache-Control: no-store`。

## 缓存、限流与 CORS

- 成功结果按数据源、代码、区间和周期在边缘缓存 3,600 秒。
- 行情调用按匿名 IP/数据源每分钟 60 次；健康、发现和文档不限流。
- 上游超时 10 秒；网络错误和 HTTP 502–504 最多重试一次。较长的上游 `Retry-After` 会返回客户端。
- REST 允许跨域 `GET`/`OPTIONS`，并暴露 `X-Request-Id`、`X-API-Version` 和 `Retry-After`。

行情可能延迟、不完整或暂时不可用。本服务不构成投资建议。数据条款与再分发权限仍由调用者/部署者负责。
