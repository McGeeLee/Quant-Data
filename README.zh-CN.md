# Quant Data

[English](./README.md) · [线上仪表盘](https://quant-data.mcgeelee.workers.dev) · [API 指南](./docs/API.zh-CN.md) · [MCP 指南](./docs/MCP.zh-CN.md) · [OpenAPI](https://quant-data.mcgeelee.workers.dev/openapi.json)

Quant Data 是运行在单个 Cloudflare Worker 上的双语行情仪表盘、REST API、OpenAPI 3.1 服务与无状态 MCP Server。它将 Yahoo Finance Chart、Tushare Pro 和 Tiingo 统一为按日期升序的未复权日线 OHLCV。

> 行情数据可能延迟、不完整或暂时不可用。Yahoo Chart 是非官方接口，不保证长期稳定。本项目不提供投资建议。

## 主要能力

- React 19 + Vite 8 响应式仪表盘与 Lightweight Charts
- Hono + Zod/OpenAPI REST 契约和稳定的双语错误格式
- 通过 Cloudflare Agents `createMcpHandler` 使用 MCP SDK v2
- 无状态 Streamable HTTP，兼容普通 2025 旧版无状态客户端
- 中英文 UI、文档、API 消息、风险提示和 MCP 文档资源
- 一小时边缘缓存；按匿名 IP 与数据源每分钟 60 次 Cloudflare Rate Limiting
- 上游 10 秒超时；网络错误与 HTTP 502–504 最多重试一次；有界处理上游 429
- Secret 只从 Worker 绑定读取，不写入响应或日志

## 公开端点

| 端点 | 说明 |
| --- | --- |
| `GET /healthz` | 服务版本和 Cloudflare 部署元数据 |
| `GET /api/v1` | API 发现、链接、操作 ID 和限制 |
| `GET /api/v1/sources` | 数据源配置、市场、示例、风险和署名 |
| `GET /api/v1/market-data` | 未复权日线；默认一年、最长五年、最多 2,000 条 |
| `GET /api/v1/snapshot` | 最新收盘、前收、涨跌额、涨跌幅和成交量 |
| `GET /openapi.json` | OpenAPI 3.1 机器契约 |
| `POST /mcp` | 无状态 Streamable HTTP MCP |
| `GET /docs/en` | 英文文档 |
| `GET /docs/zh-CN` | 中文文档 |
| `GET /llms.txt` | 大模型精简发现文件 |
| `GET /llms-full.txt` | 中英文完整模型上下文 |

### REST 示例

```bash
curl 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=yahoo&symbol=AAPL&start=2025-01-01&end=2025-12-31&lang=zh-CN'
```

`source` 可为 `yahoo`、`tushare` 或 `tiingo`。`start` 和 `end` 是包含边界的 `YYYY-MM-DD` 日期。可使用 `lang=en`、`lang=zh-CN` 或 `Accept-Language`；字段名、类型和错误码不会随语言改变。

错误始终使用以下格式：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数无效。",
    "requestId": "..."
  }
}
```

## MCP 调用

将 Streamable HTTP 客户端连接到：

```text
https://quant-data.mcgeelee.workers.dev/mcp
```

客户端配置示例：

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

提供三个工具：

- `list_data_sources`：数据源状态与代码示例
- `get_market_data`：默认最近 120 条，可把 `limit` 提高到 500，并返回截断状态
- `get_market_snapshot`：最新收盘和涨跌指标

所有工具均为只读、幂等，具有 Zod 输入/输出 schema，同时返回精简文本与 `structuredContent`。资源为 `quant-data://docs/en`、`quant-data://docs/zh-CN` 和 `quant-data://api/openapi`。

MCP handler 对生产 Worker、本地开发和 MCP Inspector 来源执行 Host/Origin 校验，防止 DNS rebinding。端点按设计不使用鉴权。

## 数据源行为

| 数据源 | 市场/示例 | Secret | 说明 |
| --- | --- | --- | --- |
| Yahoo Finance Chart | `AAPL`、`BTC-USD`、`600519.SS` | 无 | 非官方接口；成交量为提供方原生单位 |
| Tushare Pro | `600519.SH`、`000001.SZ` | `TUSHARE_TOKEN` | 成交量单位为手（每手 100 股） |
| Tiingo | `AAPL`、`TSLA` | `TIINGO_KEY` | 响应保留“Data provided by Tiingo”署名 |

v1 只提供未复权日线。Secret 缺失时，`/api/v1/sources` 会报告未配置，调用对应数据源返回 `SOURCE_NOT_CONFIGURED`；`/healthz` 不会探测或泄露 Secret 状态。

## 本地开发

需要 Node.js 22 或更高版本与 npm。

```bash
npm ci
cp .env.example .dev.vars
npm run cf-types
npm run dev
```

Yahoo 不需要密钥。本地 Tushare/Tiingo 密钥应放在已被忽略的 `.dev.vars`，不得提交。

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

## Cloudflare 部署

`wrangler.jsonc` 固定 Worker 名为 `quant-data`、兼容日期为 `2026-08-10`，启用 `nodejs_compat`、SPA 静态资源、Workers.dev、版本元数据、结构化日志/追踪和 Rate Limiting。不使用 D1、Durable Objects、KV 或持久业务存储。

通过 Cloudflare Dashboard 或 Wrangler 配置生产 Secret：

```bash
npx wrangler secret put TUSHARE_TOKEN
npx wrangler secret put TIINGO_KEY
```

Cloudflare Workers Builds 配置：

| 配置 | 值 |
| --- | --- |
| 仓库 | `McGeeLee/Quant-Data` |
| 分支 | `main` |
| 根目录 | `/` |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |

推送 `main` 会触发关联 Worker 的构建与部署。`package-lock.json` 用于复现完整依赖图。

## 架构

```text
浏览器 / REST 客户端 / MCP 客户端
                 │
        Cloudflare Worker
        ├── React SPA 静态资源
        ├── Hono + OpenAPI API
        ├── 无状态 MCP v2 handler
        ├── 限流 + Cache API
        └── 统一数据适配层
            ├── Yahoo Chart
            ├── Tushare HTTP API
            └── Tiingo REST API
```

缓存键包含数据源、规范化代码、包含边界的日期范围和周期；只有成功规范化的数据会缓存 3,600 秒。API 与 MCP 共享同一个适配和错误映射层。

## 从 v2 迁移

v3 是完整重写。旧 Python、Streamlit、Pandas、Plotly、`yfinance`、`tushare` 和 `tiingo` 客户端实现已删除。主要行为差异：

- 单个边缘 Worker 取代 Streamlit 与服务端 DataFrame 流程；
- 浏览器、REST、OpenAPI 和 MCP 都是一等接口；
- 直接 HTTP 适配器具有明确的超时、重试与错误策略；
- 只保留原项目实际启用的 Yahoo、Tushare 与 Tiingo 未复权日线；
- 不迁移 AkShare、Binance 占位、Python 依赖和 Streamlit 配置。

## 署名与条款

数据仍受各提供方条款约束。Yahoo Chart 是非官方接口；Tushare 响应保留 Tushare 署名；Tiingo 响应包含所需署名。部署者需自行确保其数据套餐允许公开再分发。
