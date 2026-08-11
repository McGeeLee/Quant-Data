import type { UiLocale } from "../lib/i18n";
import { translations } from "../lib/i18n";

export function DocsPage({ locale, onLocale }: { locale: UiLocale; onLocale: (locale: UiLocale) => void }) {
  const t = translations[locale];
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="docs-shell">
      <nav className="topbar docs-topbar" aria-label="Primary">
        <a className="brand" href="/"><span className="brand-mark">Q</span><span>Quant Data</span></a>
        <div className="nav-actions">
          <a href="/">{t.back}</a>
          <button className="lang-switch" onClick={() => onLocale(zh ? "en" : "zh-CN")} aria-label="Switch language">{zh ? "EN" : "中文"}</button>
        </div>
      </nav>
      <article className="docs-content">
        <header><span className="eyebrow">DOCUMENTATION · V3</span><h1>{t.docsTitle}</h1><p>{t.docsLead}</p></header>
        <section><h2>{t.overview}</h2><p>{zh ? "服务运行在单个 Cloudflare Worker 上，所有接口公开、只读且无 OAuth。统一返回按日期升序的未复权日线 OHLCV。" : "The service runs on one Cloudflare Worker. Every interface is public, read-only, and requires no OAuth. Daily raw OHLCV bars are normalized in ascending date order."}</p></section>
        <section><h2>{t.rest}</h2>
          <div className="endpoint"><b>GET</b><code>/api/v1</code><span>{zh ? "API 发现" : "API discovery"}</span></div>
          <div className="endpoint"><b>GET</b><code>/api/v1/sources</code><span>{zh ? "数据源状态" : "Source status"}</span></div>
          <div className="endpoint"><b>GET</b><code>/api/v1/market-data</code><span>{zh ? "日线序列" : "Daily bars"}</span></div>
          <div className="endpoint"><b>GET</b><code>/api/v1/snapshot</code><span>{zh ? "最新快照" : "Latest snapshot"}</span></div>
          <pre><code>{`curl 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=yahoo&symbol=AAPL&lang=${locale}'`}</code></pre>
          <p>{zh ? "v1 使用稳定 operationId、X-API-Version 与 X-Request-Id。代码必须符合数据源格式；日期包含边界并严格校验真实日历日期。" : "v1 publishes stable operation IDs, X-API-Version, and X-Request-Id. Symbols must match the provider format; dates are inclusive and strictly calendar-validated."}</p>
        </section>
        <section id="mcp"><h2>{t.mcpTools}</h2><p>{zh ? "将支持 Streamable HTTP 的 MCP 客户端连接到以下地址。默认兼容普通旧版无状态客户端。" : "Connect any Streamable HTTP MCP client to the URL below. Ordinary legacy stateless clients are supported by default."}</p><pre><code>https://quant-data.mcgeelee.workers.dev/mcp</code></pre><ul><li><code>list_data_sources</code> — {zh ? "应首先调用" : "call first"}</li><li><code>get_market_data</code> — {zh ? "默认 120，最多 500 条" : "120 bars by default, up to 500"}</li><li><code>get_market_snapshot</code></li></ul><p>{zh ? "资源包括中英文指南和 quant-data://api/openapi。工具错误会返回 retryable、重试提示和 requestId。" : "Resources include bilingual guidance and quant-data://api/openapi. Tool errors include retryable, an action hint, and requestId."}</p></section>
        <section><h2>{zh ? "错误契约" : "Error contract"}</h2><p>{zh ? "错误固定为 error.code、message、可选 details 与 requestId。400 应修正请求；429 与可重试上游错误应遵循 Retry-After 并使用带抖动的指数退避。" : "Errors always contain error.code, message, optional details, and requestId. Correct 400 requests; honor Retry-After and use jittered exponential backoff for 429 and retryable upstream failures."}</p><pre><code>{`{"error":{"code":"INVALID_SYMBOL","message":"…","requestId":"…"}}`}</code></pre></section>
        <section><h2>{t.localization}</h2><p>{zh ? "REST 接受 lang=zh-CN 或 Accept-Language；字段名、类型与错误码永不本地化。MCP 工具接受 lang 参数。" : "REST accepts lang=en or Accept-Language. Field names, types, and error codes never change by locale. MCP tools accept a lang argument."}</p></section>
        <section><h2>{t.limits}</h2><ul><li>{zh ? "默认最近一年，最长五年；REST 最多 2,000 条。" : "One year by default, five years maximum, and at most 2,000 REST bars."}</li><li>{zh ? "每个匿名 IP 与数据源每分钟 60 次；缓存一小时。" : "60 calls per anonymous IP and source per minute; one-hour edge cache."}</li><li>{zh ? "上游超时 10 秒；网络与 502–504 错误最多重试一次。" : "Ten-second upstream timeout; one retry for network errors and HTTP 502–504."}</li></ul></section>
        <aside className="notice">{t.disclaimer}</aside>
      </article>
    </main>
  );
}
