import type { MarketBar } from "../../worker/domain/types";

export type SnapshotMetrics = {
  close: number;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  date: string;
};

export function calculateSnapshot(bars: MarketBar[]): SnapshotMetrics | null {
  const latest = bars.at(-1);
  if (!latest) return null;
  const previous = bars.at(-2);
  const change = previous ? latest.close - previous.close : null;
  return {
    close: latest.close,
    change,
    changePercent: previous && previous.close !== 0 && change !== null ? (change / previous.close) * 100 : null,
    volume: latest.volume,
    date: latest.date,
  };
}

export function chartData(bars: MarketBar[]) {
  return {
    candles: bars.map(({ date, open, high, low, close }) => ({ time: date, open, high, low, close })),
    volume: bars.map(({ date, volume, close }, index) => ({
      time: date,
      value: volume ?? 0,
      color: index === 0 || close >= bars[index - 1].close ? "rgba(229, 91, 57, 0.45)" : "rgba(35, 134, 116, 0.42)",
    })),
    closes: bars.map(({ date, close }) => ({ time: date, value: close })),
    returns: bars.slice(1).map((bar, index) => {
      const previous = bars[index];
      const value = previous.close === 0 ? 0 : ((bar.close - previous.close) / previous.close) * 100;
      return { time: bar.date, value, color: value >= 0 ? "rgba(229, 91, 57, 0.7)" : "rgba(35, 134, 116, 0.7)" };
    }),
  };
}

export function formatNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}
