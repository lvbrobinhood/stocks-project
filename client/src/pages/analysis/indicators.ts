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


export type Signal = "positive" | "neutral" | "negative";

export type MovingAverageSignal = {
  signal: Signal;
  /** Last close relative to the moving average, in percent. Positive means above. */
  distancePct: number;
  /** Moving average relative to its value SLOPE_LOOKBACK bars earlier, in percent. */
  slopePct: number;
};

export const SIGNAL_WINDOW = 20;
const SLOPE_LOOKBACK = 5;
/** Within this band price counts as "at the line". */
const PRICE_BAND_PCT = 1.0;
/** Within this band the moving average counts as flat. */
const SLOPE_BAND_PCT = 0.25;

/**
 * Classify the 20-day moving average as a positive, neutral or negative indicator.
 * Price position drives the call; slope only vetoes it. Price above a falling
 * average, or below a rising one, is downgraded to neutral. Price at the line
 * is always neutral.
 */
export function movingAverageSignal(data: ChartPoint[], window = SIGNAL_WINDOW): MovingAverageSignal | null {
  const ma = simpleMovingAverage(data, window);
  const last = data.length - 1;
  const current = ma[last];
  const earlier = ma[last - SLOPE_LOOKBACK];
  if (current === undefined || earlier === undefined) return null;

  const distancePct = ((data[last].close - current) / current) * 100;
  const slopePct = ((current - earlier) / earlier) * 100;

  const priceSide = distancePct > PRICE_BAND_PCT ? "above" : distancePct < -PRICE_BAND_PCT ? "below" : "at";
  const trend = slopePct > SLOPE_BAND_PCT ? "rising" : slopePct < -SLOPE_BAND_PCT ? "falling" : "flat";

  let signal: Signal = "neutral";
  if (priceSide === "above" && trend !== "falling") signal = "positive";
  else if (priceSide === "below" && trend !== "rising") signal = "negative";

  return { signal, distancePct, slopePct };
}
