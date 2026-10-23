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
  /** Moving average relative to its value `slopeLookback` bars earlier, in percent. */
  slopePct: number;
  /** The thresholds used for this window. */
  params: SignalParams;
};

export type SignalParams = {
  /** Bars between the two moving average values compared for slope. */
  slopeLookback: number;
  /** Within this band, in percent, price counts as "at the line". */
  priceBandPct: number;
  /** Within this band, in percent, the moving average counts as flat. */
  slopeBandPct: number;
};

export const SIGNAL_WINDOWS = [20, 50, 100, 200] as const;

/**
 * Thresholds per window. Longer averages move more slowly and price naturally
 * sits further from them, so the lookback and both bands widen with the window.
 */
export const SIGNAL_PARAMS: Record<number, SignalParams> = {
  20: { slopeLookback: 5, priceBandPct: 1, slopeBandPct: 0.25 },
  50: { slopeLookback: 12, priceBandPct: 1.5, slopeBandPct: 0.5 },
  100: { slopeLookback: 25, priceBandPct: 2, slopeBandPct: 0.75 },
  200: { slopeLookback: 50, priceBandPct: 3, slopeBandPct: 1 },
};

/** Parameters for a window not in the table: a quarter of the window for the lookback. */
function paramsFor(window: number): SignalParams {
  return (
    SIGNAL_PARAMS[window] ?? {
      slopeLookback: Math.max(1, Math.round(window / 4)),
      priceBandPct: 1,
      slopeBandPct: 0.25,
    }
  );
}

/**
 * Classify a moving average as a positive, neutral or negative indicator.
 * Price position drives the call; slope only vetoes it. Price above a falling
 * average, or below a rising one, is downgraded to neutral. Price at the line
 * is always neutral.
 */
export function movingAverageSignal(data: ChartPoint[], window: number): MovingAverageSignal | null {
  const params = paramsFor(window);
  const ma = simpleMovingAverage(data, window);
  const last = data.length - 1;
  const current = ma[last];
  const earlier = ma[last - params.slopeLookback];
  if (current === undefined || earlier === undefined) return null;

  const distancePct = ((data[last].close - current) / current) * 100;
  const slopePct = ((current - earlier) / earlier) * 100;

  const priceSide = distancePct > params.priceBandPct ? "above" : distancePct < -params.priceBandPct ? "below" : "at";
  const trend = slopePct > params.slopeBandPct ? "rising" : slopePct < -params.slopeBandPct ? "falling" : "flat";

  let signal: Signal = "neutral";
  if (priceSide === "above" && trend !== "falling") signal = "positive";
  else if (priceSide === "below" && trend !== "rising") signal = "negative";

  return { signal, distancePct, slopePct, params };
}
