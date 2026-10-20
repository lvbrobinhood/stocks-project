import { fetchStockChart, type ChartPoint } from "../../lib/api";
import { useMemo, useState } from "react";
import { ChartCanvas, Chart, CandlestickSeries, LineSeries, XAxis, YAxis, CrossHairCursor, MovingAverageTooltip } from "react-financial-charts";
import { discontinuousTimeScaleProvider, sma } from "react-financial-charts";
import { useActiveTheme } from "../../lib/theme";

type MovingAverage = { window: number; color: string };

type PlotPoint = ChartPoint & { ma: Record<number, number | undefined> };

const DEFAULT_AVERAGES: MovingAverage[] = [
  { window: 20, color: "#9e9e9e" },
  { window: 50, color: "#1e88e5" },
  { window: 100, color: "#e53935" },
  { window: 200, color: "#43a047" },
];

/** Resolve a CSS variable from the active theme so canvas-drawn chart parts match the page. */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

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
  const activeTheme = useActiveTheme();

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

  // The chart draws to a canvas, so CSS variables have to be read and passed in explicitly.
  const palette = useMemo(
    () => ({
      ink: cssVar("--ink", "#111111"),
      muted: cssVar("--muted", "#767674"),
      rule: cssVar("--rule", "#d2d2ce"),
      gain: cssVar("--gain", "#1e7a4c"),
      loss: cssVar("--loss", "#9a2f2f"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTheme]
  );
  const candleColor = (d: PlotPoint) => (d.close >= d.open ? palette.gain : palette.loss);

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
          <button type="button" className="btn secondary ma-add" onClick={addAverage}>
            Add MA
          </button>
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
                <XAxis
                  strokeStyle={palette.rule}
                  tickStrokeStyle={palette.muted}
                  tickLabelFill={palette.muted}
                  gridLinesStrokeStyle={palette.rule}
                />
                <YAxis
                  strokeStyle={palette.rule}
                  tickStrokeStyle={palette.muted}
                  tickLabelFill={palette.muted}
                  gridLinesStrokeStyle={palette.rule}
                />
                <CandlestickSeries fill={candleColor} stroke={candleColor} wickStroke={candleColor} />
                <MovingAverageTooltip
                  origin={[8, 8]}
                  width={88}
                  textFill={palette.ink}
                  labelFill={palette.muted}
                  options={averages.map((a) => ({
                    yAccessor: (d: PlotPoint) => d.ma[a.window] as number,
                    type: "SMA",
                    stroke: a.color,
                    windowSize: a.window,
                  }))}
                />
                {averages.map((a, i) => (
                  <LineSeries
                    key={i}
                    yAccessor={(d: PlotPoint) => d.ma[a.window]}
                    strokeStyle={a.color}
                    strokeWidth={2}
                  />
                ))}
              </Chart>
              <CrossHairCursor strokeStyle={palette.muted} />
            </ChartCanvas>
          </div>
        ) : (
          <div className="empty-state">Enter a ticker to load a chart.</div>
        )}
      </section>
    </main>
  );
}
