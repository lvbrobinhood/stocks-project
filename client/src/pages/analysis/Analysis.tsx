import { fetchStockChart, type ChartPoint } from "../../lib/api";
import { useState } from "react";
import { ChartCanvas, Chart, CandlestickSeries, LineSeries, XAxis, YAxis, CrossHairCursor } from "react-financial-charts";
import { discontinuousTimeScaleProvider } from "react-financial-charts";

export default function Analysis() {
  const [ticker, setTicker] = useState("");
  const [rawData, setRawData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const xScaleProvider = discontinuousTimeScaleProvider.inputDateAccessor((d: ChartPoint) => d.date);
  const { data: chartData, xScale, xAccessor, displayXAccessor } = xScaleProvider(rawData);
  const xExtents = chartData.length > 0 ? [xAccessor(chartData[0]), xAccessor(chartData[chartData.length - 1])] : [0, 10];

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Technical view</p>
          <h1 className="page-title">Stock analysis</h1>
          <p className="page-subtitle">
            Pull one year of market data and inspect price action with candlesticks and a 20-day moving average.
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
              <Chart id={1} yExtents={(d: ChartPoint) => [d.high, d.low]}>
                <XAxis />
                <YAxis />
                <CandlestickSeries />
                <LineSeries
                  yAccessor={(d: ChartPoint) => d.ma20 ?? undefined}
                  strokeWidth={2}
                />
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
