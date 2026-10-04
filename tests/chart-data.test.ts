import { test, expect } from "bun:test";
import { chartPrice, chartDrawdown } from "../src/lib/chart-data";

// Charts need two decimals; 15 made the Report Card ~100 KB bigger for nothing
// (and tripped Next's gzip "MaxListeners" warning, decision 0026).
test("price points keep dates and nulls, rounded to paise", () => {
  expect(chartPrice([{ date: "2026-10-01", close: 1234.5678912345678, sma200: null }, { date: "2026-10-02", close: 1, sma200: 2.004999999 }]))
    .toEqual([{ date: "2026-10-01", close: 1234.57, sma200: null }, { date: "2026-10-02", close: 1, sma200: 2 }]);
});

test("drawdown points rounded to two decimals of a percent", () => {
  expect(chartDrawdown([{ date: "2026-10-01", pct: -12.345678901 }])).toEqual([{ date: "2026-10-01", pct: -12.35 }]);
});
