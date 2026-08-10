import { useEffect, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
} from "lightweight-charts";
import type { MarketBar } from "../../worker/domain/types";
import { chartData } from "../lib/market";

type Props = { bars: MarketBar[]; labels: { candles: string; close: string; returns: string } };

function useResponsiveChart(container: HTMLDivElement | null, bars: MarketBar[], kind: "candles" | "close" | "returns") {
  useEffect(() => {
    if (!container || bars.length === 0) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: kind === "candles" ? 390 : 230,
      layout: { background: { type: ColorType.Solid, color: "#fffdf8" }, textColor: "#5c5b52" },
      grid: { vertLines: { color: "#eee8dc" }, horzLines: { color: "#eee8dc" } },
      rightPriceScale: { borderColor: "#d9d0c0" },
      timeScale: { borderColor: "#d9d0c0", timeVisible: false },
      crosshair: { vertLine: { color: "#8e5f4c" }, horzLine: { color: "#8e5f4c" } },
    });
    const data = chartData(bars);
    if (kind === "candles") {
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#e55b39",
        downColor: "#238674",
        wickUpColor: "#e55b39",
        wickDownColor: "#238674",
        borderVisible: false,
      });
      candles.setData(data.candles);
      const volumes = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
      volumes.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      volumes.setData(data.volume);
    } else if (kind === "close") {
      const line = chart.addSeries(LineSeries, { color: "#e55b39", lineWidth: 2 });
      line.setData(data.closes);
    } else {
      const returns = chart.addSeries(HistogramSeries, { priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
      returns.setData(data.returns);
    }
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [container, bars, kind]);
}

function Chart({ bars, label, kind }: { bars: MarketBar[]; label: string; kind: "candles" | "close" | "returns" }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useResponsiveChart(container, bars, kind);
  return (
    <section className={`chart-card ${kind === "candles" ? "chart-card--wide" : ""}`} aria-label={label}>
      <div className="chart-title"><h3>{label}</h3><span>{bars.length}D</span></div>
      <div ref={setContainer} className="chart" role="img" aria-label={`${label}, ${bars.length} daily observations`} />
    </section>
  );
}

export function MarketCharts({ bars, labels }: Props) {
  return (
    <div className="chart-grid">
      <Chart bars={bars} label={labels.candles} kind="candles" />
      <Chart bars={bars} label={labels.close} kind="close" />
      <Chart bars={bars} label={labels.returns} kind="returns" />
    </div>
  );
}
