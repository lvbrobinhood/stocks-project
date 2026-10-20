import { fetchStockChart, type ChartPoint } from "../../lib/api";
import { useMemo, useState } from "react";
import { ChartCanvas, Chart, CandlestickSeries, LineSeries, XAxis, YAxis, CrossHairCursor } from "react-financial-charts";
import { discontinuousTimeScaleProvider, sma } from "react-financial-charts";

type MovingAverage = { window: number; color: string };

type PlotPoint = ChartPoint & { ma: Record<number, number | undefined> };

const DEFAULT_AVERAGES: MovingAverage[] = [
  { window: 20, color: "#9e9e9e" },
  { window: 50, color: "#1e88e5" },
  { window: 100, color: "#e53935" },
  { window: 200, color: "#43a047" },
];

/** Attach a simple moving average of `close` for each requested window to every point. */
function withMovingAverages(data: ChartPoint[], averages: MovingAverage[]): PlotPoint[] {
  const series = averages.map(({ window }) =>
    sma().options({ windowSize: window, sourcePath: "close" })(data, { merge: false }) as (number | undefined)[]
  );
  return data.map((d, i) => ({
    ...d,
    ma: Object.fromEntries(averages.map(({ window }, k) => [window, series[k][i]])),
  }));
}

export default function Analysis() {
  const [ticker, setTicker] = useState("");
  const [rawData, setRawData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [averages, setAverages] = useState<MovingAverage[]>(DEFAULT_AVERAGES);

  const handleFetch = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      setRawData(await fetchStockChart(ticker));
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

  const plotData = useMemo(() => withMovingAverages(rawData, averages), [rawData, averages]);

  const xScaleProvider = discontinuousTimeScaleProvider.inputDateAccessor((d: PlotPoint) => d.date);
  const { data: chartData, xScale, xAccessor, displayXAccessor } = xScaleProvider(plotData);
  const xExtents = chartData.length > 0 ? [xAccessor(chartData[0]), xAccessor(chartData[chartData.length - 1])] : [0, 10];

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Technical view</p>
          <h1 className="page-title">Stock analysis</h1>
          <p className="page-subtitle">
            Pull two years of market data and inspect price action with candlesticks and configurable moving averages.
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
          <button type="button" className="btn btn-secondary" onClick={addAverage}>
            Add MA
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {chartData.length > 0 ? (
          <div className="chart-panel">
            <ChartCanvas
              height={420}
              width={920}
              ratio={2}
              margin={{ left: 56, right: 56, top: 16, bottom: 32 }}
              data={chartData}
              xScale={xScale}
              xAccessor={xAccessor}
              displayXAccessor={displayXAccessor}
              xExtents={xExtents}
              seriesName="candlestick"
            >
              <Chart id={1} yExtents={(d: PlotPoint) => [d.high, d.low]}>
                <XAxis />
                <YAxis />
                <CandlestickSeries />
                {averages.map((a, i) => (
                  <LineSeries
                    key={i}
                    yAccessor={(d: PlotPoint) => d.ma[a.window]}
                    strokeStyle={a.color}
                    strokeWidth={2}
                  />
                ))}
              </Chart>
              <CrossHairCursor />
            </ChartCanvas>
          </div>
        ) : (
          <div className="empty-state">Enter a ticker to load a chart.</div>
        )}
      </section>
    </main>
  );
}
