import { fetchStockChart, fetchStats, type ChartPoint, type StatsResponse } from "../../lib/api";
import { useState } from "react";
import PriceChart from "./PriceChart";
import { RANGE_KEYS, type MovingAverage, type RangeKey } from "./indicators";

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
          </>
        ) : (
          <div className="empty-state">Enter a ticker to load a chart.</div>
        )}
      </section>
    </main>
  );
}
