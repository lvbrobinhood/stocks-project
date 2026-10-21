import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
} from "lightweight-charts";
import type { ChartPoint } from "../../lib/api";
import { useActiveTheme } from "../../lib/theme";
import { RANGE_MONTHS, simpleMovingAverage, type MovingAverage, type RangeKey } from "./indicators";

type Props = {
  data: ChartPoint[];
  averages: MovingAverage[];
  range: RangeKey;
};

type Legend = {
  point: ChartPoint;
  change: number;
  ma: (number | undefined)[];
};

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const toTime = (d: Date) => d.toISOString().slice(0, 10);
const fmtPrice = (n: number) => n.toFixed(2);
const fmtVolume = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

export default function PriceChart({ data, averages, range }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maRefs = useRef<ISeriesApi<"Line">[]>([]);
  const [legend, setLegend] = useState<Legend | null>(null);
  const activeTheme = useActiveTheme();

  // The chart draws to a canvas, so theme colors are read from CSS variables and passed in.
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

  const maValues = useMemo(() => averages.map((a) => simpleMovingAverage(data, a.window)), [data, averages]);
  const indexByTime = useMemo(() => new Map(data.map((d, i) => [toTime(d.date), i])), [data]);

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, attributionLogo: false },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderVisible: false, rightOffset: 4 },
      grid: { vertLines: { visible: false } },
    });

    const candles = chart.addSeries(CandlestickSeries, { priceLineWidth: 1 });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      maRefs.current = [];
    };
  }, []);

  // Apply theme colors.
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: palette.muted },
      grid: { horzLines: { color: palette.rule } },
      crosshair: {
        vertLine: { color: palette.muted, labelBackgroundColor: palette.ink },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.ink },
      },
    });
    candleRef.current?.applyOptions({
      upColor: palette.gain,
      downColor: palette.loss,
      borderUpColor: palette.gain,
      borderDownColor: palette.loss,
      wickUpColor: palette.gain,
      wickDownColor: palette.loss,
    });
  }, [palette]);

  // Load price and volume data.
  useEffect(() => {
    candleRef.current?.setData(data.map((d) => ({ time: toTime(d.date), open: d.open, high: d.high, low: d.low, close: d.close })));
    volumeRef.current?.setData(
      data.map((d) => ({ time: toTime(d.date), value: d.volume, color: d.close >= d.open ? `${palette.gain}66` : `${palette.loss}66` }))
    );
  }, [data, palette]);

  // Rebuild the moving average lines whenever the set changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    maRefs.current.forEach((s) => chart.removeSeries(s));
    maRefs.current = averages.map((a, k) => {
      const series = chart.addSeries(LineSeries, { color: a.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      series.setData(
        data.flatMap((d, i) => (maValues[k][i] === undefined ? [] : [{ time: toTime(d.date), value: maValues[k][i] as number }]))
      );
      return series;
    });
  }, [data, averages, maValues]);

  // Set the visible window from the range picker.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    const last = data[data.length - 1].date;
    const from = new Date(last);
    from.setMonth(from.getMonth() - RANGE_MONTHS[range]);
    const fromIndex = Math.max(0, data.findIndex((d) => d.date >= from));
    chart.timeScale().setVisibleLogicalRange({ from: fromIndex, to: data.length + 4 });
  }, [data, range]);

  // Legend follows the crosshair and falls back to the latest bar.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const build = (i: number): Legend | null => {
      if (i < 0 || i >= data.length) return null;
      const point = data[i];
      const prev = data[i - 1] ?? point;
      return { point, change: ((point.close - prev.close) / prev.close) * 100, ma: maValues.map((v) => v[i]) };
    };
    const onMove = (param: MouseEventParams) => {
      const i = param.time === undefined ? data.length - 1 : indexByTime.get(param.time as string) ?? data.length - 1;
      setLegend(build(i));
    };
    setLegend(build(data.length - 1));
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [data, maValues, indexByTime]);

  return (
    <div className="chart-panel">
      <div ref={containerRef} className="chart-surface" />
      {legend && (
        <div className="chart-legend">
          <div className="chart-legend-row">
            <span className="chart-legend-date">{toTime(legend.point.date)}</span>
            <span>O <b>{fmtPrice(legend.point.open)}</b></span>
            <span>H <b>{fmtPrice(legend.point.high)}</b></span>
            <span>L <b>{fmtPrice(legend.point.low)}</b></span>
            <span>C <b>{fmtPrice(legend.point.close)}</b></span>
            <span className={legend.change >= 0 ? "gain" : "loss"}>
              {legend.change >= 0 ? "+" : ""}
              {legend.change.toFixed(2)}%
            </span>
            <span>Vol <b>{fmtVolume(legend.point.volume)}</b></span>
          </div>
          <div className="chart-legend-row">
            {averages.map((a, k) => (
              <span key={k} style={{ color: a.color }}>
                MA {a.window} <b>{legend.ma[k] === undefined ? "n/a" : fmtPrice(legend.ma[k] as number)}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
