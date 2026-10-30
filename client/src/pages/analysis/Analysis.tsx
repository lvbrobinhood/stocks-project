import { fetchStockChart, fetchStats, type ChartPoint, type StatsResponse } from "../../lib/api";
import { useState } from "react";
import PriceChart from "./PriceChart";
import {
  CROSSOVER_ROWS,
  CROSSOVER_PARAMS,
  RANGE_KEYS,
  SIGNAL_PARAMS,
  SIGNAL_WINDOWS,
  crossoverSignal,
  movingAverageSignal,
  type MovingAverage,
  type RangeKey,
} from "./indicators";

const DEFAULT_AVERAGES: MovingAverage[] = [
  { window: 20, color: "#9e9e9e" },
  { window: 50, color: "#1e88e5" },
  { window: 100, color: "#e53935" },
  { window: 200, color: "#43a047" },
];

export default function Analysis() {
  const [ticker, setTicker] = useState("");
  const [rawData, setRawData] = useState<ChartPoint[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [averages, setAverages] = useState<MovingAverage[]>(DEFAULT_AVERAGES);
  const [range, setRange] = useState<RangeKey>("1Y");

  const handleFetch = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      // Stats are secondary: a failure there should not block the chart.
      const [chart, keyStats] = await Promise.all([fetchStockChart(ticker), fetchStats(ticker).catch(() => null)]);
      setRawData(chart);
      setStats(keyStats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load chart.");
    } finally {
      setLoading(false);
    }
  };

  const updateAverage = (index: number, patch: Partial<MovingAverage>) =>
    setAverages((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  const removeAverage = (index: number) => setAverages((prev) => prev.filter((_, i) => i !== index));
  const addAverage = () => setAverages((prev) => [...prev, { window: 10, color: "#8e24aa" }]);

  const maSignals = SIGNAL_WINDOWS.map((window) => ({ window, result: movingAverageSignal(rawData, window) }));
  const crossoverRows = CROSSOVER_ROWS.map((row) =>
    row.map(([fast, slow]) => ({ fast, slow, result: crossoverSignal(rawData, fast, slow) }))
  );
  // The 50/200 crossover has its own names in common usage.
  const crossName = (fast: number, slow: number, direction: "bullish" | "bearish") =>
    fast === 50 && slow === 200 ? (direction === "bullish" ? "Golden cross" : "Death cross") : `${capitalize(direction)} cross`;
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Technical view</p>
          <h1 className="page-title">Stock analysis</h1>
          <p className="page-subtitle">
            Pull two years of market data and inspect price action with candlesticks, volume and configurable moving averages.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="analysis-search">
          <label className="field">
            <span>Ticker</span>
            <input
              type="text"
              placeholder="AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
            />
          </label>
          <button className="btn" onClick={handleFetch} disabled={loading}>
            {loading ? "Loading..." : "Get chart"}
          </button>
        </div>

        <div className="ma-toolbar">
          <button type="button" className="btn secondary ma-add" onClick={addAverage}>
            Add MA
          </button>
        </div>

        <div className="ma-controls">
          {averages.map((a, i) => (
            <label key={i} className="ma-control">
              <input
                type="color"
                value={a.color}
                onChange={(e) => updateAverage(i, { color: e.target.value })}
                aria-label="Moving average color"
              />
              <input
                type="number"
                min={1}
                max={rawData.length || undefined}
                value={a.window}
                onChange={(e) => updateAverage(i, { window: Math.max(1, Number(e.target.value) || 1) })}
                aria-label="Moving average window in days"
              />
              <span>day MA</span>
              <button type="button" className="ma-remove" onClick={() => removeAverage(i)} aria-label="Remove moving average">
                ×
              </button>
            </label>
          ))}
        </div>

        <div className="range-row">
          <div className="range-picker">
            {RANGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`range-btn${range === key ? " active" : ""}`}
                onClick={() => setRange(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {rawData.length > 0 ? (
          <>
            <PriceChart data={rawData} averages={averages} range={range} />
            {stats && (
              <div className="key-stats">
                <div className="stat">
                  <span className="stat-label">Day high</span>
                  <span className="stat-value">{stats.dayHigh.toFixed(2)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Day low</span>
                  <span className="stat-value">{stats.dayLow.toFixed(2)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">52W high</span>
                  <span className="stat-value">{stats.fiftyTwoWeekHigh.toFixed(2)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">52W low</span>
                  <span className="stat-value">{stats.fiftyTwoWeekLow.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="signals">
              {maSignals.map(({ window, result }) => (
                <div key={window} className="signal">
                  <span className="stat-label">{window}-day MA indicator</span>
                  {result ? (
                    <>
                      <span className={`signal-value ${result.signal}`}>{capitalize(result.signal)}</span>
                      <span className="signal-detail">
                        Price {Math.abs(result.distancePct).toFixed(2)}% {result.distancePct >= 0 ? "above" : "below"} the {window}MA
                      </span>
                      <span className="signal-detail">
                        {window}MA {signed(result.slopePct)} over {result.params.slopeLookback} days
                      </span>
                    </>
                  ) : (
                    <span className="signal-detail">Not enough data.</span>
                  )}
                </div>
              ))}
            </div>

            {crossoverRows.map((row, r) => (
              <div key={r} className="signals crossovers">
                {row.map(({ fast, slow, result }) => (
                  <div key={`${fast}-${slow}`} className="signal">
                    <span className="stat-label">
                      {fast}/{slow} MA crossover{fast === 50 && slow === 200 ? " (golden / death)" : ""}
                    </span>
                    {result ? (
                      <>
                        <span className={`signal-value ${result.alignment}`}>{capitalize(result.alignment)}</span>
                        <span className="signal-detail">
                          {fast}MA {Math.abs(result.spreadPct).toFixed(2)}% {result.spreadPct >= 0 ? "above" : "below"} the {slow}MA, {result.momentum}
                        </span>
                        <span className="signal-detail">
                          {result.lastCross
                            ? `${crossName(fast, slow, result.lastCross.direction)} ${result.lastCross.barsAgo === 0 ? "today" : result.lastCross.barsAgo === 1 ? "1 day ago" : `${result.lastCross.barsAgo} days ago`}`
                            : "No cross in the loaded history"}
                        </span>
                      </>
                    ) : (
                      <span className="signal-detail">Not enough data.</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        ) : (
          <div className="empty-state">Enter a ticker to load a chart.</div>
        )}
      </section>

      <p className="page-note">
        Indicator thresholds. Price within the band of its moving average counts as at the line; a change in the
        average within the slope band over the lookback counts as flat.{" "}
        {SIGNAL_WINDOWS.map((w, i) => {
          const p = SIGNAL_PARAMS[w];
          return (
            <span key={w}>
              {i > 0 && " · "}
              {w}MA: ±{p.priceBandPct}% price, ±{p.slopeBandPct}% slope over {p.slopeLookback} days
            </span>
          );
        })}
        . Crossovers: the two averages count as neutral within ±{CROSSOVER_PARAMS.spreadBandPct}% of each other, and the
        spread is widening or narrowing when it changes by more than that over {CROSSOVER_PARAMS.spreadLookback} days.
      </p>
    </main>
  );
}
