import { useState } from "react";
import { ChartCanvas, Chart, CandlestickSeries, LineSeries, XAxis, YAxis, CrossHairCursor } from "react-financial-charts";
import { discontinuousTimeScaleProvider } from "react-financial-charts";

export default function Analysis() {
  const [ticker, setTicker] = useState("");
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`http://localhost:8000/stock-chart?ticker=${ticker}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const formatted = data.data.map((d: any) => ({
        ...d,
        date: new Date(d.date),
      }));
      setRawData(formatted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const xScaleProvider = discontinuousTimeScaleProvider.inputDateAccessor((d: any) => d.date);
  const { data: chartData, xScale, xAccessor, displayXAccessor } = xScaleProvider(rawData);
  const xExtents = chartData.length > 0 ? [xAccessor(chartData[0]), xAccessor(chartData[chartData.length - 1])] : [0, 10];

  return (
    <div style={{ padding: "20px" }}>
      <input
        type="text"
        placeholder="Enter ticker (e.g., AAPL)"
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && handleFetch()}
      />
      <button onClick={handleFetch} disabled={loading}>
        {loading ? "Loading..." : "Get Chart"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {chartData.length > 0 && (
        <ChartCanvas
          height={400}
          width={800}
          ratio={2}
          margin={{ left: 50, right: 50, top: 10, bottom: 30 }}
          data={chartData}
          xScale={xScale}
          xAccessor={xAccessor}
          displayXAccessor={displayXAccessor}
          xExtents={xExtents}
          seriesName="candlestick"
        >
          <Chart id={1} yExtents={(d: any) => [d.high, d.low]}>
            <XAxis />
            <YAxis />
            <CandlestickSeries />
            <LineSeries
              yAccessor={(d: any) => d.ma20}
              strokeWidth={2}
            />
          </Chart>
          <CrossHairCursor />
        </ChartCanvas>
      )}
    </div>
  );
}