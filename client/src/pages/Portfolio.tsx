import React, { useMemo, useState } from "react";

type QuoteResponse = {
  ticker: string;
  price: number;
  currency?: string;
};

export default function TickerQuotePage() {
  const [ticker, setTicker] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);

  const API_BASE = useMemo(() => "http://localhost:8000", []);

  async function fetchQuote() {
    const t = ticker.trim().toUpperCase();
    if (!t) {
      setError("Please enter a ticker.");
      setQuote(null);
      return;
    }

    setLoading(true);
    setError("");
    setQuote(null);

    try {
      const res = await fetch(`${API_BASE}/quote?ticker=${encodeURIComponent(t)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof (data as any)?.error === "string"
            ? (data as any).error
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setQuote(data as QuoteResponse);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchQuote();
  }

  return (
    <div className="page">
      <h1>Simple Ticker Quote</h1>

      <form className="form" onSubmit={onSubmit}>
        <input
          className="ticker-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="e.g. AAPL, TSLA, MSFT"
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Loading..." : "Get Price"}
        </button>
      </form>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {quote && (
        <div className="result">
          <strong>{quote.ticker}</strong>: {quote.price.toFixed(2)}
          {quote.currency ? ` ${quote.currency}` : ""}
        </div>
      )}
    </div>
  );
}
