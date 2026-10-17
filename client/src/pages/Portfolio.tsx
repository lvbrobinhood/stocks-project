import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { supabase } from "../supabaseClient";
import "../css/Portfolio.css";

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

type SortKey = "ticker" | "qty" | "costPrice" | "costBasis" | "price" | "marketValue" | "pnl" | "pnlPct";
type SortDirection = "asc" | "desc";

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: number, currency: string) {
  return `${numberFormat.format(value)}${currency ? ` ${currency}` : ""}`;
}

// Accounting convention: negatives in parentheses.
function signed(value: number, currency: string) {
  return value < 0 ? `(${money(Math.abs(value), currency)})` : money(value, currency);
}

function signedPct(value: number) {
  return value < 0 ? `(${Math.abs(value).toFixed(2)}%)` : `${value.toFixed(2)}%`;
}

const PNL_SCALE_MAX = 500;
const PCT_SCALE_MAX = 30;

/**
 * Colour for a gain/loss cell: neutral ink at zero, neon red at -max and
 * neon green at +max. Mixed in CSS so the result follows the active theme.
 */
function scaleColor(value: number | undefined, max: number): CSSProperties | undefined {
  if (value === undefined || value === 0) return undefined;
  const t = Math.min(Math.abs(value) / max, 1);
  const strength = Math.round(25 + t * 75);
  const neon = value < 0 ? "var(--neon-loss)" : "var(--neon-gain)";
  return { color: `color-mix(in oklab, var(--ink), ${neon} ${strength}%)` };
}

function statementDate() {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date()
  );
}

export default function PortfolioPage() {
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [portfolio, setPortfolio] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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
    setNotice("");

    try {
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

      setTicker("");
      setQty("");
      setCostPrice("");

      // The price is a nice-to-have; the holding is saved either way.
      try {
        const quote = await fetchQuote(t);
        setQuotes((prev) => ({ ...prev, [t]: quote }));
      } catch {
        setNotice(`${t} saved. No price yet, so refresh prices once the market data service is up.`);
      }
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
    setNotice("");

    const results = await Promise.allSettled(portfolio.map((h) => fetchQuote(h.ticker)));
    const nextQuotes: Record<string, QuoteResponse> = { ...quotes };
    let failed = 0;
    for (const res of results) {
      if (res.status === "fulfilled") nextQuotes[res.value.ticker] = res.value;
      else failed += 1;
    }
    setQuotes(nextQuotes);
    if (failed === portfolio.length) {
      setError("Could not reach the market data service. Prices were not updated.");
    } else if (failed > 0) {
      setNotice(`${failed} ${failed === 1 ? "price" : "prices"} could not be updated.`);
    }
    setLoading(false);
  }

  async function removeHolding(t: string) {
    setLoading(true);
    setError("");
    setNotice("");

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

  function getSortValue(h: HoldingWithQuote, key: SortKey) {
    const price = h.quote?.price;
    const costBasis = h.qty * h.costPrice;
    const marketValue = price !== undefined ? h.qty * price : undefined;
    const pnl = marketValue !== undefined ? marketValue - costBasis : undefined;
    const pnlPct = pnl !== undefined && costBasis > 0 ? (pnl / costBasis) * 100 : undefined;

    switch (key) {
      case "ticker":
        return h.ticker;
      case "qty":
        return h.qty;
      case "costPrice":
        return h.costPrice;
      case "costBasis":
        return costBasis;
      case "price":
        return price;
      case "marketValue":
        return marketValue;
      case "pnl":
        return pnl;
      case "pnlPct":
        return pnlPct;
    }
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column;

    return (
      <button
        className={`sort-header ${active ? "active" : ""}`}
        type="button"
        onClick={() => sortBy(column)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className={`sort-triangle ${active ? sortDirection : ""}`} />
      </button>
    );
  }

  const sortedHoldings = useMemo(() => {
    return [...enriched].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      const result =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : Number(aValue) - Number(bValue);

      return sortDirection === "asc" ? result : -result;
    });
  }, [enriched, sortDirection, sortKey]);

  const allocation = useMemo(() => {
    const slices = enriched
      .map((h) => {
        const price = h.quote?.price;
        if (price === undefined) return null;
        return { ticker: h.ticker, value: h.qty * price };
      })
      .filter(Boolean) as { ticker: string; value: number }[];

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    slices.sort((a, b) => b.value - a.value);

    return slices.map((s) => ({ ...s, share: total > 0 ? (s.value / total) * 100 : 0 }));
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

  const hasQuotes = pricedHoldings.length > 0;
  const totalTone = totalPnL === null ? "" : totalPnL < 0 ? "loss" : "gain";

  return (
    <main className="page-shell portfolio-page">
      <section className="statement-heading">
        <div>
          <h1 className="page-title">Portfolio</h1>
          <p className="statement-meta">
            {portfolio.length === 0
              ? "No positions yet"
              : `${portfolio.length} ${portfolio.length === 1 ? "position" : "positions"}, priced ${statementDate()}`}
            {missingQuoteCount > 0 && ` (${missingQuoteCount} without a price)`}
          </p>
        </div>
        <button
          className="btn secondary"
          type="button"
          onClick={refreshAll}
          disabled={loading || portfolio.length === 0}
        >
          {loading ? "Refreshing" : "Refresh prices"}
        </button>
      </section>

      <section className="totals" aria-label="Portfolio totals">
        <div className="total">
          <span className="total-label">Market value</span>
          <span className="total-value">{hasQuotes ? money(totalMarketValue, currency) : "—"}</span>
        </div>
        <div className="total">
          <span className="total-label">Paid</span>
          <span className="total-value">{money(totalCostBasis, currency)}</span>
        </div>
        <div className="total">
          <span className="total-label">Gain / loss</span>
          <span className={`total-value ${totalTone}`}>
            {totalPnL === null ? "—" : signed(totalPnL, currency)}
            {totalPnLPct !== null && <small>{signedPct(totalPnLPct)}</small>}
          </span>
        </div>
      </section>

      <form className="add-row" onSubmit={onSubmit}>
        <span className="add-row-title">Add a position</span>
        <label className="field">
          <span>Ticker</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" />
        </label>
        <label className="field">
          <span>Quantity</span>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Price paid</span>
          <input
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="185.50"
            inputMode="decimal"
          />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Saving" : "Add"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {portfolio.length === 0 ? (
        <div className="empty-state">
          Your statement is empty. Add a ticker, how many you hold, and what you paid per share.
        </div>
      ) : (
        <>
          <section className="ledger" aria-label="Holdings">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col"><SortHeader label="Stock" column="ticker" /></th>
                    <th scope="col" className="num"><SortHeader label="Qty" column="qty" /></th>
                    <th scope="col" className="num"><SortHeader label="Buy Price" column="costPrice" /></th>
                    <th scope="col" className="num"><SortHeader label="Total Cost Basis" column="costBasis" /></th>
                    <th scope="col" className="num"><SortHeader label="Current Price" column="price" /></th>
                    <th scope="col" className="num"><SortHeader label="Total Value" column="marketValue" /></th>
                    <th scope="col" className="num"><SortHeader label="P/L" column="pnl" /></th>
                    <th scope="col" className="num"><SortHeader label="%" column="pnlPct" /></th>
                    <th scope="col" className="row-action"><span className="visually-hidden">Remove</span></th>
                  </tr>
                </thead>

                <tbody>
                  {sortedHoldings.map((h) => {
                    const price = h.quote?.price;
                    const marketValue = price !== undefined ? h.qty * price : undefined;
                    const costBasis = h.qty * h.costPrice;
                    const pnl = marketValue !== undefined ? marketValue - costBasis : undefined;
                    const pnlPct =
                      pnl !== undefined && costBasis > 0 ? (pnl / costBasis) * 100 : undefined;

                    return (
                      <tr key={h.ticker}>
                        <th scope="row">{h.ticker}</th>
                        <td className="num">{h.qty}</td>
                        <td className="num">{money(h.costPrice, "")}</td>
                        <td className="num">{money(costBasis, currency)}</td>
                        <td className="num">{price === undefined ? <em>No price</em> : money(price, currency)}</td>
                        <td className="num">{marketValue === undefined ? <em>—</em> : money(marketValue, currency)}</td>
                        <td className="num" style={scaleColor(pnl, PNL_SCALE_MAX)}>
                          {pnl === undefined ? <em>—</em> : signed(pnl, currency)}
                        </td>
                        <td className="num" style={scaleColor(pnlPct, PCT_SCALE_MAX)}>
                          {pnlPct === undefined ? <em>—</em> : signedPct(pnlPct)}
                        </td>
                        <td className="row-action">
                          <button
                            className="remove-button"
                            type="button"
                            onClick={() => removeHolding(h.ticker)}
                            disabled={loading}
                            aria-label={`Remove ${h.ticker}`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td />
                    <td className="num">{money(totalCostBasis, currency)}</td>
                    <td />
                    <td className="num">{hasQuotes ? money(totalMarketValue, currency) : ""}</td>
                    <td className="num" style={scaleColor(totalPnL ?? undefined, PNL_SCALE_MAX)}>
                      {totalPnL === null ? "" : signed(totalPnL, currency)}
                    </td>
                    <td className="num" style={scaleColor(totalPnLPct ?? undefined, PCT_SCALE_MAX)}>
                      {totalPnLPct === null ? "" : signedPct(totalPnLPct)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="allocation" aria-label="Allocation">
            <div className="section-heading">
              <h2>Allocation</h2>
              <p>Share of market value</p>
            </div>

            {allocation.length === 0 ? (
              <div className="empty-state compact">Refresh prices to see how the portfolio is split.</div>
            ) : (
              <>
                <div className="allocation-bar" role="img" aria-label="Allocation by holding">
                  {allocation.map((a, i) => (
                    <span
                      key={a.ticker}
                      className="allocation-segment"
                      style={{ width: `${a.share}%`, opacity: 1 - (i / allocation.length) * 0.75 }}
                      title={`${a.ticker} ${a.share.toFixed(1)}%`}
                    />
                  ))}
                </div>
                <ol className="allocation-list">
                  {allocation.map((a, i) => (
                    <li key={a.ticker}>
                      <span
                        className="allocation-swatch"
                        style={{ opacity: 1 - (i / allocation.length) * 0.75 }}
                        aria-hidden="true"
                      />
                      <span className="allocation-ticker">{a.ticker}</span>
                      <span className="allocation-share">{a.share.toFixed(1)}%</span>
                      <span className="allocation-value">{money(a.value, currency)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
