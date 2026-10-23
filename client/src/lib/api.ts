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

export type ProfileResponse = {
  ticker: string;
  sector: string;
};

export type StatsResponse = {
  ticker: string;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
};

export type ChartPoint = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ChartResponse = {
  ticker: string;
  data: (Omit<ChartPoint, "date"> & { date: string })[];
};

/**
 * Fetch a JSON endpoint, surfacing the server's `error` message on a non-OK response.
 * A body that is not JSON (for example an HTML page from a misconfigured API base or a
 * host placeholder) is reported as an error instead of being passed through to callers.
 */
async function getJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  const text = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const err = (data as { error?: unknown } | undefined)?.error;
    throw new Error(typeof err === "string" ? err : `Request failed (${res.status})`);
  }

  if (data === null || typeof data !== "object") {
    throw new Error(`Could not parse response from ${url} (${res.status}) as JSON.`);
  }

  return data as T;
}

export function fetchQuote(ticker: string): Promise<QuoteResponse> {
  return getJson<QuoteResponse>(`/quote?ticker=${encodeURIComponent(ticker)}`);
}

/** Sector for equities; quote type (ETF, fund, crypto) for everything else. */
export function fetchProfile(ticker: string): Promise<ProfileResponse> {
  return getJson<ProfileResponse>(`/profile?ticker=${encodeURIComponent(ticker)}`);
}

/** Key stats from Yahoo: day and 52-week high and low. */
export function fetchStats(ticker: string): Promise<StatsResponse> {
  return getJson<StatsResponse>(`/stats?ticker=${encodeURIComponent(ticker)}`);
}

/** Two years of daily OHLCV; moving averages are computed client-side. */
export async function fetchStockChart(ticker: string): Promise<ChartPoint[]> {
  const res = await getJson<ChartResponse>(`/stock-chart?ticker=${encodeURIComponent(ticker)}`);
  if (!Array.isArray(res.data)) {
    throw new Error("Chart response is missing price data.");
  }
  return res.data.map((d) => ({ ...d, date: new Date(d.date) }));
}
