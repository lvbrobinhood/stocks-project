import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient"; // <-- adjust path if needed

type QuoteResponse = {
  ticker: string;
  price: number;
  currency?: string;
};

type Holding = {
  ticker: string;
  qty: number;
  costPrice: number; // average cost per share
};

type HoldingWithQuote = Holding & {
  quote?: QuoteResponse;
};

export default function PortfolioPage() {
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});

  const API_BASE = useMemo(() => "http://localhost:8000", []);

  function parsePositiveNumber(input: string): number | null {
    const n = Number(input);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("You are not logged in.");
    return data.user.id;
  }

  async function fetchQuote(t: string): Promise<QuoteResponse> {
    const res = await fetch(`${API_BASE}/quote?ticker=${encodeURIComponent(t)}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        typeof (data as any)?.error === "string"
          ? (data as any).error
          : `Request failed (${res.status})`;
      throw new Error(msg);
    }

    return data as QuoteResponse;
  }

  async function upsertHoldingToSupabase(h: Holding) {
    const userId = await requireUserId();

    const { error } = await supabase
      .from("portfolio_holdings")
      .upsert(
        {
          user_id: userId,
          ticker: h.ticker,
          qty: h.qty,
          cost_price: h.costPrice,
        },
        { onConflict: "user_id,ticker" }
      );

    if (error) throw new Error(error.message);
  }

  async function deleteHoldingFromSupabase(t: string) {
    const userId = await requireUserId();

    const { error } = await supabase
      .from("portfolio_holdings")
      .delete()
      .eq("user_id", userId)
      .eq("ticker", t);

    if (error) throw new Error(error.message);
  }

  // 1) LOAD holdings from Supabase on mount
  useEffect(() => {
    async function loadHoldings() {
      setLoading(true);
      setError("");

      try {
        await requireUserId(); // ensures logged in

        const { data, error } = await supabase
          .from("portfolio_holdings")
          .select("ticker, qty, cost_price")
          .order("ticker", { ascending: true });

        if (error) throw new Error(error.message);

        const holdings: Holding[] = (data ?? []).map((r: any) => ({
          ticker: String(r.ticker).toUpperCase(),
          qty: Number(r.qty),
          costPrice: Number(r.cost_price),
        }));

        setPortfolio(holdings);

        // Optional: fetch quotes for loaded holdings
        const results = await Promise.allSettled(
          holdings.map((h) => fetchQuote(h.ticker))
        );

        const nextQuotes: Record<string, QuoteResponse> = {};
        for (const res of results) {
          if (res.status === "fulfilled") {
            nextQuotes[res.value.ticker] = res.value;
          }
        }
        setQuotes(nextQuotes);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load holdings.");
      } finally {
        setLoading(false);
      }
    }

    loadHoldings();
  }, []);

  // 2) ADD/UPDATE holding + SAVE to Supabase
  async function addHolding() {
    const t = ticker.trim().toUpperCase();
    const q = parsePositiveNumber(qty.trim());
    const c = parsePositiveNumber(costPrice.trim());

    if (!t) {
      setError("Please enter a ticker.");
      return;
    }
    if (q === null) {
      setError("Please enter a valid quantity (> 0).");
      return;
    }
    if (c === null) {
      setError("Please enter a valid cost price (> 0).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const quote = await fetchQuote(t);

      // compute the new holding (weighted average cost)
      const existing = portfolio.find((h) => h.ticker === t);

      const updatedHolding: Holding = existing
        ? (() => {
            const newQty = existing.qty + q;
            const newAvgCost = (existing.qty * existing.costPrice + q * c) / newQty;
            return { ticker: t, qty: newQty, costPrice: newAvgCost };
          })()
        : { ticker: t, qty: q, costPrice: c };

      // persist first (so UI reflects saved state)
      await upsertHoldingToSupabase(updatedHolding);

      // update UI state
      setPortfolio((prev) => {
        const idx = prev.findIndex((h) => h.ticker === t);
        if (idx === -1) return [...prev, updatedHolding];
        const copy = [...prev];
        copy[idx] = updatedHolding;
        return copy;
      });

      setQuotes((prev) => ({ ...prev, [t]: quote }));

      setTicker("");
      setQty("");
      setCostPrice("");
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    if (portfolio.length === 0) return;

    setLoading(true);
    setError("");

    try {
      const nextQuotes: Record<string, QuoteResponse> = { ...quotes };
      for (const h of portfolio) {
        const q = await fetchQuote(h.ticker);
        nextQuotes[h.ticker] = q;
      }
      setQuotes(nextQuotes);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh prices.");
    } finally {
      setLoading(false);
    }
  }

  // 3) REMOVE holding + DELETE from Supabase
  async function removeHolding(t: string) {
    setLoading(true);
    setError("");

    try {
      await deleteHoldingFromSupabase(t);

      setPortfolio((prev) => prev.filter((h) => h.ticker !== t));
      setQuotes((prev) => {
        const copy = { ...prev };
        delete copy[t];
        return copy;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove holding.");
    } finally {
      setLoading(false);
    }
  }

  const enriched: HoldingWithQuote[] = portfolio.map((h) => ({
    ...h,
    quote: quotes[h.ticker],
  }));

  const totalMarketValue = enriched.reduce((sum, h) => {
    const price = h.quote?.price ?? 0;
    return sum + h.qty * price;
  }, 0);

  const totalCostBasis = enriched.reduce((sum, h) => sum + h.qty * h.costPrice, 0);

  const totalPnL = totalMarketValue - totalCostBasis;
  const totalPnLPct = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

  const currency = enriched.find((h) => h.quote?.currency)?.quote?.currency ?? "";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    addHolding();
  }

  return (
    <div className="page">
      <h1>Simple Portfolio Tracker</h1>

      <form className="form" onSubmit={onSubmit}>
        <input
          className="ticker-input"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker (e.g. AAPL)"
        />

        <input
          className="qty-input"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qty (e.g. 10)"
          inputMode="decimal"
        />

        <input
          className="cost-input"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          placeholder="Cost price (e.g. 185.50)"
          inputMode="decimal"
        />

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Adding..." : "Add"}
        </button>

        <button
          className="btn"
          type="button"
          onClick={refreshAll}
          disabled={loading || portfolio.length === 0}
        >
          {loading ? "Refreshing..." : "Refresh Prices"}
        </button>
      </form>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {portfolio.length === 0 ? (
        <div className="result">No holdings yet. Add one above.</div>
      ) : (
        <div className="result">
          <div style={{ marginBottom: 8 }}>
            <strong>Total Market Value:</strong> {totalMarketValue.toFixed(2)}
            {currency ? ` ${currency}` : ""}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Total Cost Basis:</strong> {totalCostBasis.toFixed(2)}
            {currency ? ` ${currency}` : ""}
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>Total P/L:</strong> {totalPnL.toFixed(2)}
            {currency ? ` ${currency}` : ""} ({totalPnLPct.toFixed(2)}%)
          </div>

          <div className="holdings">
            {enriched.map((h) => {
              const price = h.quote?.price;
              const marketValue = price !== undefined ? h.qty * price : undefined;
              const costBasis = h.qty * h.costPrice;
              const pnl = marketValue !== undefined ? marketValue - costBasis : undefined;
              const pnlPct =
                pnl !== undefined && costBasis > 0 ? (pnl / costBasis) * 100 : undefined;

              return (
                <div key={h.ticker} className="holding-row">
                  <div>
                    <strong>{h.ticker}</strong> — Qty: {h.qty} — Avg Cost:{" "}
                    {h.costPrice.toFixed(2)}
                    {currency ? ` ${currency}` : ""}
                  </div>

                  <div>
                    {price === undefined ? (
                      <em>No price yet</em>
                    ) : (
                      <>
                        Price: {price.toFixed(2)}
                        {h.quote?.currency ? ` ${h.quote.currency}` : ""} | Value:{" "}
                        {marketValue!.toFixed(2)}
                        {h.quote?.currency ? ` ${h.quote.currency}` : ""} | P/L:{" "}
                        {pnl!.toFixed(2)}
                        {h.quote?.currency ? ` ${h.quote.currency}` : ""} (
                        {pnlPct!.toFixed(2)}%)
                      </>
                    )}
                  </div>

                  <button
                    className="btn"
                    type="button"
                    onClick={() => removeHolding(h.ticker)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
