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

export type Alignment = "bullish" | "bearish" | "neutral";

export type CrossoverSignal = {
  alignment: Alignment;
  /** Fast average relative to the slow one, in percent. Positive means fast above slow. */
  spreadPct: number;
  /** Most recent cross, or null when none occurred in the available history. */
  lastCross: { direction: "bullish" | "bearish"; barsAgo: number } | null;
  /** Whether the absolute spread has grown or shrunk over CROSSOVER_PARAMS.spreadLookback bars. */
  momentum: "widening" | "narrowing" | "stable";
};

/** Crossover pairs, one row per fast window. */
export const CROSSOVER_ROWS = [
  [
    [20, 50],
    [20, 100],
    [20, 200],
  ],
  [
    [50, 100],
    [50, 200],
    [100, 200],
  ],
] as const;

export const CROSSOVER_PARAMS = {
  /** Within this band, in percent, the two averages count as aligned neither way. */
  spreadBandPct: 0.25,
  /** Bars between the two spreads compared for momentum. */
  spreadLookback: 5,
};

/**
 * Crossover of a fast moving average over a slow one. The alignment is the
 * sign of the spread outside a neutral band. A cross is registered on the bar
 * the alignment becomes decisive on the opposite side from the last decisive
 * alignment, so days spent inside the band while crossing count once, and a
 * wobble into the band and back out on the same side does not count at all.
 */
export function crossoverSignal(data: ChartPoint[], fastWindow: number, slowWindow: number): CrossoverSignal | null {
  const { spreadBandPct, spreadLookback } = CROSSOVER_PARAMS;
  const fast = simpleMovingAverage(data, fastWindow);
  const slow = simpleMovingAverage(data, slowWindow);

  const spread: (number | undefined)[] = data.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === undefined || s === undefined ? undefined : ((f - s) / s) * 100;
  });
  const alignmentAt = (i: number): Alignment | undefined => {
    const v = spread[i];
    if (v === undefined) return undefined;
    return v > spreadBandPct ? "bullish" : v < -spreadBandPct ? "bearish" : "neutral";
  };

  const last = data.length - 1;
  const current = spread[last];
  const earlier = spread[last - spreadLookback];
  if (current === undefined || earlier === undefined) return null;

  let lastCross: CrossoverSignal["lastCross"] = null;
  let prior: Alignment | undefined;
  for (let i = 0; i <= last; i++) {
    const a = alignmentAt(i);
    if (a === undefined || a === "neutral") continue;
    if (prior !== undefined && a !== prior) lastCross = { direction: a, barsAgo: last - i };
    prior = a;
  }

  const change = Math.abs(current) - Math.abs(earlier);
  const momentum = change > spreadBandPct ? "widening" : change < -spreadBandPct ? "narrowing" : "stable";

  return { alignment: alignmentAt(last) as Alignment, spreadPct: current, lastCross, momentum };
}

/** Score an indicator verdict: 1 for positive or bullish, -1 for negative or bearish, else 0. */
export function signalScore(verdict: Signal | Alignment | undefined): -1 | 0 | 1 {
  if (verdict === "positive" || verdict === "bullish") return 1;
  if (verdict === "negative" || verdict === "bearish") return -1;
  return 0;
}

/**
 * Weights for the combined score. Each group has a budget of 5 points so the
 * crossovers cannot outvote the price tiles by sheer number. Longer averages
 * and the more widely watched crossovers carry more weight.
 */
export const SCORE_WEIGHTS = {
  price: { 20: 1, 50: 1, 100: 1.5, 200: 1.5 } as Record<number, number>,
  crossover: { "20/50": 1, "20/100": 0.5, "20/200": 0.75, "50/100": 0.75, "50/200": 1.5, "100/200": 0.5 } as Record<string, number>,
  /** A crossover's weight decays linearly from full at the cross to `crossFloor` after `crossDecayBars`. */
  crossDecayBars: 60,
  crossFloor: 1 / 3,
};

/** Fraction of a crossover's weight that still applies, given the age of its last cross. */
export function crossoverAgeFactor(barsAgo: number | null): number {
  const { crossDecayBars, crossFloor } = SCORE_WEIGHTS;
  if (barsAgo === null) return crossFloor;
  return Math.max(crossFloor, 1 - (1 - crossFloor) * (barsAgo / crossDecayBars));
}

export type ScoredIndicators = {
  priceSignals: { window: number; result: MovingAverageSignal | null }[];
  crossovers: { fast: number; slow: number; result: CrossoverSignal | null }[];
};

/** Weighted sum of all indicators, in the range -10 to +10, rounded to one decimal. */
export function combinedScore({ priceSignals, crossovers }: ScoredIndicators): number {
  let total = 0;
  for (const { window, result } of priceSignals) {
    total += (SCORE_WEIGHTS.price[window] ?? 0) * signalScore(result?.signal);
  }
  for (const { fast, slow, result } of crossovers) {
    if (!result) continue;
    const weight = SCORE_WEIGHTS.crossover[`${fast}/${slow}`] ?? 0;
    total += weight * crossoverAgeFactor(result.lastCross?.barsAgo ?? null) * signalScore(result.alignment);
  }
  return Math.round(total * 10) / 10;
}
