import { describe, expect, it } from "vitest";
import { calculateSnapshot, chartData } from "../src/lib/market";
import { marketFixture } from "./fixtures";

describe("frontend market transformations", () => {
  it("calculates snapshot indicators", () => {
    expect(calculateSnapshot(marketFixture.bars)).toEqual({ date: "2026-08-10", close: 104, change: 4, changePercent: 4, volume: 1_200 });
  });

  it("transforms candlestick, volume, close, and return chart series", () => {
    const data = chartData(marketFixture.bars);
    expect(data.candles).toHaveLength(2);
    expect(data.closes.at(-1)).toMatchObject({ value: 104 });
    expect(data.returns).toEqual([{ time: "2026-08-10", value: 4, color: "rgba(229, 91, 57, 0.7)" }]);
  });
});
