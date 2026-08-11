import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { DataSource, MarketDataResponse, SourceStatus } from "../worker/domain/types";
import { DocsPage } from "./components/DocsPage";
import { MarketCharts } from "./components/MarketCharts";
import { ThemeToggle } from "./components/ThemeToggle";
import { fetchMarketData, fetchSources } from "./lib/api";
import { detectLocale, translations, type UiLocale } from "./lib/i18n";
import { calculateSnapshot, formatNumber } from "./lib/market";

function dateInput(yearOffset = 0): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + yearOffset);
  return date.toISOString().slice(0, 10);
}

function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="copy-button" onClick={() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    });
  }}>{copied ? copiedLabel : label}</button>;
}

export default function App() {
  const docsLocale = window.location.pathname === "/docs/zh-CN"
    ? "zh-CN"
    : window.location.pathname === "/docs/en" ? "en" : undefined;
  const [locale, setLocaleState] = useState<UiLocale>(() => docsLocale ?? detectLocale());
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [source, setSource] = useState<DataSource>("yahoo");
  const [symbol, setSymbol] = useState("AAPL");
  const [start, setStart] = useState(dateInput(-1));
  const [end, setEnd] = useState(dateInput());
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = translations[locale];

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    localStorage.setItem("quant-data-locale", next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    void fetchSources(locale).then(setSources).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [locale]);

  const submit = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMarketData({ source, symbol, start, end, lang: locale }));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [end, locale, source, start, symbol]);

  const selectedSource = sources.find((item) => item.id === source);
  const snapshot = useMemo(() => calculateSnapshot(data?.bars ?? []), [data]);
  const apiExample = `curl 'https://quant-data.mcgeelee.workers.dev/api/v1/market-data?source=${source}&symbol=${encodeURIComponent(symbol)}&start=${start}&end=${end}&lang=${locale}'`;

  if (window.location.pathname.startsWith("/docs/")) {
    return <DocsPage locale={locale} onLocale={(next) => {
      window.history.replaceState({}, "", `/docs/${next}`);
      setLocale(next);
    }} />;
  }

  return (
    <main id="main">
      <nav className="topbar" aria-label="Primary">
        <a className="brand" href="/"><span className="brand-mark">Q</span><span>Quant Data</span></a>
        <div className="nav-links">
          <a className="active" href="#dashboard">{t.dashboard}</a>
          <a href={`/docs/${locale}`}>{t.documentation}</a>
          <a href="/openapi.json">{t.apiContract}</a>
          <a href={`/docs/${locale}#mcp`}>{t.mcp}</a>
        </div>
        <div className="nav-actions">
          <ThemeToggle locale={locale} />
          <button className="lang-switch" onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")} aria-label="Switch language">{locale === "en" ? "中文" : "EN"}</button>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">CLOUDFLARE EDGE · API + MCP</span>
          <h1>{t.tagline}</h1>
          <p>{t.subtitle}</p>
          <div className="hero-pills"><span>{t.publicApi}</span><span>{t.cache}</span><span>{t.raw}</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="signal-line">∿</div><span>1D</span></div>
      </header>

      <section id="dashboard" className="workspace">
        <aside className="control-panel">
          <div className="panel-heading"><span className="step">01</span><div><h2>{t.dashboard}</h2><p>{t.intro}</p></div></div>
          <form onSubmit={submit}>
            <label>{t.source}<select value={source} onChange={(event) => {
              const next = event.target.value as DataSource;
              setSource(next);
              const status = sources.find((item) => item.id === next);
              if (status?.symbolExamples[0]) setSymbol(status.symbolExamples[0]);
            }}><option value="yahoo">Yahoo Finance</option><option value="tushare">Tushare Pro</option><option value="tiingo">Tiingo</option></select></label>
            <label>{t.symbol}<input value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={40} autoCapitalize="characters" required /><small>{t.examples}: {selectedSource?.symbolExamples.join(" · ") ?? "AAPL · BTC-USD"}</small></label>
            <div className="date-row"><label>{t.start}<input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} required /></label><label>{t.end}<input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} required /></label></div>
            <button className="primary-button" type="submit" disabled={loading}>{loading ? t.loading : t.fetch}<span>↗</span></button>
          </form>
          <div className="source-status"><h3>{t.sources}</h3>{sources.map((item) => <div className="source-row" key={item.id}><span className={`status-dot ${item.configured ? "ready" : "missing"}`} /><div><b>{item.name}</b><small>{item.configured ? t.configured : t.unavailable}{!item.official ? ` · ${t.unofficial}` : ""}</small></div></div>)}</div>
        </aside>

        <div className="results" aria-live="polite" aria-busy={loading}>
          {error && <div className="error-state" role="alert"><b>{t.requestFailed}</b><p>{error}</p></div>}
          {!error && !data && <div className="empty-state">{loading ? t.loading : t.noData}</div>}
          {data && snapshot && <>
            <div className="result-header"><div><span className="source-badge">{data.meta.source}</span><h2>{data.meta.symbol}</h2><p>{snapshot.date} · {data.meta.count} {t.bars}</p></div><div className="warning-chip">{data.meta.adjustment.toUpperCase()} · {data.meta.interval}</div></div>
            <div className="metric-grid">
              <article><span>{t.latestClose}</span><strong>{formatNumber(snapshot.close, 4)}</strong><small>{snapshot.date}</small></article>
              <article><span>{t.change}</span><strong className={(snapshot.change ?? 0) >= 0 ? "positive" : "negative"}>{snapshot.change === null ? "—" : `${snapshot.change >= 0 ? "+" : ""}${formatNumber(snapshot.change, 4)}`}</strong><small>vs. previous close</small></article>
              <article><span>{t.changePercent}</span><strong className={(snapshot.changePercent ?? 0) >= 0 ? "positive" : "negative"}>{snapshot.changePercent === null ? "—" : `${snapshot.changePercent >= 0 ? "+" : ""}${formatNumber(snapshot.changePercent)}%`}</strong><small>1D</small></article>
              <article><span>{t.volume}</span><strong>{formatNumber(snapshot.volume, 0)}</strong><small>{data.meta.volumeUnit}</small></article>
            </div>
            <MarketCharts bars={data.bars} labels={{ candles: t.candlestick, close: t.closeHistory, returns: t.dailyReturns }} />
            <div className="data-notes">{data.meta.warnings.map((warning) => <p key={warning}>• {warning}</p>)}{data.meta.attribution && <p>• {data.meta.attribution}</p>}</div>
          </>}
        </div>
      </section>

      <section className="developer-section">
        <div className="section-heading"><span className="step">02</span><div><h2>{t.examples}</h2><p>REST · OpenAPI 3.1 · Streamable HTTP MCP</p></div></div>
        <div className="code-grid"><article><div><span>{t.apiExample}</span><CopyButton value={apiExample} label={t.copy} copiedLabel={t.copied} /></div><pre><code>{apiExample}</code></pre></article><article><div><span>{t.mcpExample}</span><CopyButton value="https://quant-data.mcgeelee.workers.dev/mcp" label={t.copy} copiedLabel={t.copied} /></div><pre><code>https://quant-data.mcgeelee.workers.dev/mcp</code></pre></article></div>
      </section>

      <footer><div className="brand"><span className="brand-mark">Q</span><span>Quant Data</span></div><p>{t.disclaimer}</p><div><a href="/llms.txt">llms.txt</a><a href="/llms-full.txt">llms-full.txt</a><a href="https://github.com/McGeeLee/Quant-Data">GitHub</a></div></footer>
    </main>
  );
}
