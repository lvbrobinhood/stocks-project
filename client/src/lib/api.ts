// Base URL of the Flask API. Set VITE_API_BASE in production (e.g. the Render
// web service URL); falls back to the local dev server.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:8000";

export type QuoteResponse = {
  ticker: string;
  price: number;
  currency?: string;
};

export type ChartPoint = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma20: number | null;
};

type ChartResponse = {
  ticker: string;
  data: (Omit<ChartPoint, "date"> & { date: string })[];
};

/** Fetch a JSON endpoint, surfacing the server's `error` message on a non-OK response. */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = (data as { error?: unknown })?.error;
    throw new Error(typeof err === "string" ? err : `Request failed (${res.status})`);
  }

  return data as T;
}

export function fetchQuote(ticker: string): Promise<QuoteResponse> {
  return getJson<QuoteResponse>(`/quote?ticker=${encodeURIComponent(ticker)}`);
}

/** One year of daily OHLCV plus a server-computed 20-day moving average. */
export async function fetchStockChart(ticker: string): Promise<ChartPoint[]> {
  const res = await getJson<ChartResponse>(`/stock-chart?ticker=${encodeURIComponent(ticker)}`);
  return res.data.map((d) => ({ ...d, date: new Date(d.date) }));
}
