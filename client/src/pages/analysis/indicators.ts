import type { ChartPoint } from "../../lib/api";

export type MovingAverage = { window: number; color: string };

export const RANGE_KEYS = ["1M", "3M", "6M", "1Y", "2Y"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_MONTHS: Record<RangeKey, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24 };

/** Simple moving average of `close`; undefined until the window is full. */
export function simpleMovingAverage(data: ChartPoint[], window: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= window) sum -= data[i - window].close;
    out[i] = i >= window - 1 ? sum / window : undefined;
  }
  return out;
}

/** Highest high and lowest low over the trailing 52 weeks ending at the last bar. */
export function fiftyTwoWeekRange(data: ChartPoint[]): { high: number; low: number } | null {
  if (data.length === 0) return null;
  const from = new Date(data[data.length - 1].date);
  from.setFullYear(from.getFullYear() - 1);
  let high = -Infinity;
  let low = Infinity;
  for (const d of data) {
    if (d.date < from) continue;
    if (d.high > high) high = d.high;
    if (d.low < low) low = d.low;
  }
  return { high, low };
}
