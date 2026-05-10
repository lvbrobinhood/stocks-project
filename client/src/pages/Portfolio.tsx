import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../supabaseClient";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import "../css/Portfolio.css";

ChartJS.register(ArcElement, Tooltip, Legend);

type QuoteResponse = {
  ticker: string;
  price: number;
  currency?: string;
};

type Holding = {
  ticker: string;
  qty: number;
  costPrice: number;
};

type HoldingWithQuote = Holding & {
  quote?: QuoteResponse;
};

function hashInt(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function circularHueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function generateDistinctColors(labels: string[]) {
  const usedHues: number[] = [];

  return labels.map((label) => {
    const seed = hashInt(label);
    let hue = seed % 360;
    const sat = 75;
    const light = 48 + (seed % 14);
    const minGap = 28;
    const step = 137.508;

    while (usedHues.some((h) => circularHueDistance(hue, h) < minGap)) {
      hue = (hue + step) % 360;
    }

    usedHues.push(hue);

    return {
      bg: `hsl(${hue} ${sat}% ${light}% / 0.78)`,
      border: `hsl(${hue} ${sat}% ${Math.max(light - 18, 25)}% / 1)`,
    };
  });
}

function money(value: number, currency: string) {
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

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

  useEffect(() => {
    async function loadHoldings() {
      setLoading(true);
      setError("");

      try {
        const userId = await requireUserId();

        const { data, error } = await supabase
          .from("portfolio_holdings")
          .select("ticker, qty, cost_price")
          .eq("user_id", userId)
          .order("ticker", { ascending: true });

        if (error) throw new Error(error.message);

        const holdings: Holding[] = (data ?? []).map((r: any) => ({
          ticker: String(r.ticker).toUpperCase(),
          qty: Number(r.qty),
          costPrice: Number(r.cost_price),
        }));

        setPortfolio(holdings);

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

  async function addHolding() {
    const t = ticker.trim().toUpperCase();
    const q = parsePositiveNumber(qty.trim());
    const c = parsePositiveNumber(costPrice.trim());

    if (!t) {
      setError("Please enter a ticker.");
      return;
    }
    if (q === null) {
      setError("Please enter a valid quantity above 0.");
      return;
    }
    if (c === null) {
      setError("Please enter a valid cost price above 0.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const quote = await fetchQuote(t);
      const existing = portfolio.find((h) => h.ticker === t);

      const updatedHolding: Holding = existing
        ? (() => {
            const newQty = existing.qty + q;
            const newAvgCost = (existing.qty * existing.costPrice + q * c) / newQty;
            return { ticker: t, qty: newQty, costPrice: newAvgCost };
          })()
        : { ticker: t, qty: q, costPrice: c };

      await upsertHoldingToSupabase(updatedHolding);

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

  const pieData = useMemo(() => {
    const slices = enriched
      .map((h) => {
        const price = h.quote?.price;
        if (price === undefined) return null;
        return { label: h.ticker, value: h.qty * price };
      })
      .filter(Boolean) as { label: string; value: number }[];

    slices.sort((a, b) => a.label.localeCompare(b.label));
    const colors = generateDistinctColors(slices.map((s) => s.label));

    return {
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.value),
          backgroundColor: colors.map((c) => c.bg),
          borderColor: colors.map((c) => c.border),
          borderWidth: 0,
        },
      ],
    };
  }, [enriched]);

  const pricedHoldings = enriched.filter((h) => h.quote?.price !== undefined);
  const missingQuoteCount = enriched.length - pricedHoldings.length;
  const allQuotesLoaded = enriched.length > 0 && missingQuoteCount === 0;
  const totalMarketValue = pricedHoldings.reduce(
    (sum, h) => sum + h.qty * (h.quote?.price ?? 0),
    0
  );
  const totalCostBasis = enriched.reduce((sum, h) => sum + h.qty * h.costPrice, 0);
  const totalPnL = allQuotesLoaded ? totalMarketValue - totalCostBasis : null;
  const totalPnLPct =
    totalPnL !== null && totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : null;
  const currency = enriched.find((h) => h.quote?.currency)?.quote?.currency ?? "";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    addHolding();
  }

  return (
    <main className="page-shell portfolio-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Holdings</p>
          <h1 className="page-title">Portfolio tracker</h1>
          <p className="page-subtitle">
            Add positions, refresh market prices, and watch allocation and return move together.
          </p>
        </div>
      </section>

      <section className="portfolio-summary">
        <article className="summary-card">
          <p className="summary-label">Market value</p>
          <p className="summary-value">{money(totalMarketValue, currency)}</p>
          <p className="summary-note">
            {missingQuoteCount > 0 ? `${missingQuoteCount} quote missing` : "All quotes loaded"}
          </p>
        </article>
        <article className="summary-card">
          <p className="summary-label">Cost basis</p>
          <p className="summary-value">{money(totalCostBasis, currency)}</p>
          <p className="summary-note">{portfolio.length} holdings saved</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">Total P/L</p>
          <p className={`summary-value ${totalPnL !== null && totalPnL >= 0 ? "profit" : "loss"}`}>
            {totalPnL === null ? "Waiting for quotes" : money(totalPnL, currency)}
          </p>
          <p className="summary-note">
            {totalPnLPct === null ? "Refresh prices to calculate" : `${totalPnLPct.toFixed(2)}%`}
          </p>
        </article>
      </section>

      <section className="panel portfolio-controls">
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Ticker</span>
            <input
              className="ticker-input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
            />
          </label>

          <label className="field">
            <span>Quantity</span>
            <input
              className="qty-input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="10"
              inputMode="decimal"
            />
          </label>

          <label className="field">
            <span>Cost price</span>
            <input
              className="cost-input"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="185.50"
              inputMode="decimal"
            />
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add holding"}
          </button>

          <button
            className="btn secondary"
            type="button"
            onClick={refreshAll}
            disabled={loading || portfolio.length === 0}
          >
            {loading ? "Refreshing..." : "Refresh prices"}
          </button>
        </form>

        {error && (
          <div className="error">
            <strong>Error:</strong> {error}
          </div>
        )}
      </section>

      {portfolio.length === 0 ? (
        <div className="empty-state">No holdings yet. Add your first position above.</div>
      ) : (
        <section className="portfolio-grid">
          <article className="panel allocation-panel">
            <div className="section-heading">
              <h2>Allocation</h2>
              <p>By loaded market value</p>
            </div>

            {pieData.labels.length === 0 ? (
              <div className="empty-state compact">Refresh prices to display the chart.</div>
            ) : (
              <div className="pie-wrap">
                <Pie
                  data={pieData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: "bottom" },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const v = Number(ctx.raw ?? 0);
                            return `${ctx.label}: ${money(v, currency)}`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            )}
          </article>

          <article className="panel holdings-panel">
            <div className="section-heading">
              <h2>Positions</h2>
              <p>{portfolio.length} total</p>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Quantity</th>
                    <th>Buy price</th>
                    <th>Cost basis</th>
                    <th>Current price</th>
                    <th>P/L</th>
                    <th>%</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {enriched.map((h) => {
                    const price = h.quote?.price;
                    const marketValue = price !== undefined ? h.qty * price : undefined;
                    const costBasis = h.qty * h.costPrice;
                    const pnl = marketValue !== undefined ? marketValue - costBasis : undefined;
                    const pnlPct =
                      pnl !== undefined && costBasis > 0 ? (pnl / costBasis) * 100 : undefined;

                    return (
                      <tr key={h.ticker}>
                        <td><strong>{h.ticker}</strong></td>
                        <td>{h.qty}</td>
                        <td>{h.costPrice.toFixed(2)}</td>
                        <td>{money(costBasis, currency)}</td>
                        <td>{price === undefined ? <em>No price yet</em> : money(price, currency)}</td>
                        <td className={pnl !== undefined && pnl >= 0 ? "profit" : "loss"}>
                          {pnl === undefined ? <em>No price yet</em> : money(pnl, currency)}
                        </td>
                        <td className={pnlPct !== undefined && pnlPct >= 0 ? "profit" : "loss"}>
                          {pnlPct === undefined ? <em>No price yet</em> : `${pnlPct.toFixed(2)}%`}
                        </td>
                        <td className="row-action">
                          <button
                            className="btn danger"
                            type="button"
                            onClick={() => removeHolding(h.ticker)}
                            disabled={loading}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
