import { useMemo, useState } from "react";
import "../css/DCF.css";

type QuoteResponse = {
  ticker: string;
  price: number;
  currency?: string;
};

type ProjectionRow = {
  year: number;
  freeCashFlow: number;
  discountFactor: number;
  presentValue: number;
};

type Scenario = "bear" | "base" | "bull";

const API_BASE = "http://localhost:8000";

function parseInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMillions(value: number, currency = "USD") {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1000) {
    return `${sign}${currency} ${(abs / 1000).toFixed(2)}B`;
  }

  return `${sign}${currency} ${abs.toFixed(1)}M`;
}

function formatPerShare(value: number, currency = "USD") {
  return `${currency} ${value.toFixed(2)}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function DCF() {
  const [ticker, setTicker] = useState("AAPL");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [freeCashFlow, setFreeCashFlow] = useState("100000");
  const [growthRate, setGrowthRate] = useState("6");
  const [discountRate, setDiscountRate] = useState("9");
  const [terminalGrowthRate, setTerminalGrowthRate] = useState("2.5");
  const [cash, setCash] = useState("65000");
  const [debt, setDebt] = useState("110000");
  const [sharesOutstanding, setSharesOutstanding] = useState("15500");

  async function fetchQuote() {
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker) {
      setQuoteError("Enter a ticker before loading the market price.");
      return;
    }

    setTicker(cleanTicker);
    setLoadingQuote(true);
    setQuoteError("");

    try {
      const res = await fetch(`${API_BASE}/quote?ticker=${encodeURIComponent(cleanTicker)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown }).error === "string"
            ? String((data as { error: string }).error)
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setQuote(data as QuoteResponse);
    } catch (error: unknown) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : "Failed to load quote.");
    } finally {
      setLoadingQuote(false);
    }
  }

  function applyScenario(scenario: Scenario) {
    if (scenario === "bear") {
      setGrowthRate("3");
      setDiscountRate("11");
      setTerminalGrowthRate("1.5");
      return;
    }

    if (scenario === "bull") {
      setGrowthRate("9");
      setDiscountRate("8");
      setTerminalGrowthRate("3");
      return;
    }

    setGrowthRate("6");
    setDiscountRate("9");
    setTerminalGrowthRate("2.5");
  }

  const valuation = useMemo(() => {
    const startingFcf = parseInput(freeCashFlow);
    const growth = parseInput(growthRate) / 100;
    const discount = parseInput(discountRate) / 100;
    const terminalGrowth = parseInput(terminalGrowthRate) / 100;
    const netCash = parseInput(cash) - parseInput(debt);
    const shares = parseInput(sharesOutstanding);

    if (startingFcf <= 0) {
      return { error: "Free cash flow must be above 0." };
    }

    if (shares <= 0) {
      return { error: "Shares outstanding must be above 0." };
    }

    if (discount <= terminalGrowth) {
      return { error: "Discount rate must be higher than terminal growth." };
    }

    const projection: ProjectionRow[] = Array.from({ length: 5 }, (_, index) => {
      const year = index + 1;
      const freeCashFlowForYear = startingFcf * Math.pow(1 + growth, year);
      const discountFactor = Math.pow(1 + discount, year);

      return {
        year,
        freeCashFlow: freeCashFlowForYear,
        discountFactor,
        presentValue: freeCashFlowForYear / discountFactor,
      };
    });

    const finalYearFcf = projection[projection.length - 1].freeCashFlow;
    const terminalValue = (finalYearFcf * (1 + terminalGrowth)) / (discount - terminalGrowth);
    const terminalPresentValue = terminalValue / Math.pow(1 + discount, 5);
    const explicitPresentValue = projection.reduce((sum, row) => sum + row.presentValue, 0);
    const enterpriseValue = explicitPresentValue + terminalPresentValue;
    const equityValue = enterpriseValue + netCash;
    const fairValuePerShare = equityValue / shares;
    const marketPrice = quote?.price;
    const marginOfSafety =
      marketPrice && marketPrice > 0 ? ((fairValuePerShare - marketPrice) / marketPrice) * 100 : null;

    return {
      enterpriseValue,
      equityValue,
      explicitPresentValue,
      fairValuePerShare,
      marginOfSafety,
      netCash,
      projection,
      terminalPresentValue,
      terminalValue,
    };
  }, [cash, debt, discountRate, freeCashFlow, growthRate, quote?.price, sharesOutstanding, terminalGrowthRate]);

  const currency = quote?.currency ?? "USD";
  const hasError = "error" in valuation;

  return (
    <main className="page-shell dcf-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Intrinsic value</p>
          <h1 className="page-title">DCF model</h1>
          <p className="page-subtitle">
            Estimate fair value from free cash flow, growth, discount rate, terminal value,
            balance sheet adjustments, and diluted shares.
          </p>
        </div>
      </section>

      <section className="panel dcf-quote-panel">
        <div className="dcf-quote-form">
          <label className="field">
            <span>Ticker</span>
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === "Enter" && fetchQuote()}
              placeholder="AAPL"
            />
          </label>
          <button className="btn" type="button" onClick={fetchQuote} disabled={loadingQuote}>
            {loadingQuote ? "Loading..." : "Load price"}
          </button>
        </div>

        {quoteError && <p className="error">{quoteError}</p>}
      </section>

      <section className="dcf-summary-grid">
        <article className="summary-card">
          <p className="summary-label">Fair value</p>
          <p className="summary-value">
            {hasError ? "Check inputs" : formatPerShare(valuation.fairValuePerShare, currency)}
          </p>
          <p className="summary-note">Per diluted share</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">Market price</p>
          <p className="summary-value">
            {quote ? formatPerShare(quote.price, currency) : "Not loaded"}
          </p>
          <p className="summary-note">{quote ? quote.ticker : "Use live quote comparison"}</p>
        </article>
        <article className="summary-card">
          <p className="summary-label">Margin of safety</p>
          <p
            className={`summary-value ${
              !hasError && valuation.marginOfSafety !== null && valuation.marginOfSafety >= 0
                ? "profit"
                : "loss"
            }`}
          >
            {hasError || valuation.marginOfSafety === null ? "No quote" : pct(valuation.marginOfSafety)}
          </p>
          <p className="summary-note">Fair value vs market price</p>
        </article>
      </section>

      <section className="dcf-layout">
        <article className="panel dcf-inputs-panel">
          <div className="section-heading">
            <h2>Assumptions</h2>
            <div className="scenario-tabs" aria-label="Scenario presets">
              <button type="button" onClick={() => applyScenario("bear")}>Bear</button>
              <button type="button" onClick={() => applyScenario("base")}>Base</button>
              <button type="button" onClick={() => applyScenario("bull")}>Bull</button>
            </div>
          </div>

          <div className="dcf-input-grid">
            <label className="field">
              <span>Free cash flow, M</span>
              <input
                type="number"
                value={freeCashFlow}
                onChange={(event) => setFreeCashFlow(event.target.value)}
                min="0"
                step="100"
              />
            </label>
            <label className="field">
              <span>FCF growth</span>
              <input
                type="number"
                value={growthRate}
                onChange={(event) => setGrowthRate(event.target.value)}
                step="0.1"
              />
            </label>
            <label className="field">
              <span>Discount rate</span>
              <input
                type="number"
                value={discountRate}
                onChange={(event) => setDiscountRate(event.target.value)}
                step="0.1"
              />
            </label>
            <label className="field">
              <span>Terminal growth</span>
              <input
                type="number"
                value={terminalGrowthRate}
                onChange={(event) => setTerminalGrowthRate(event.target.value)}
                step="0.1"
              />
            </label>
            <label className="field">
              <span>Cash, M</span>
              <input
                type="number"
                value={cash}
                onChange={(event) => setCash(event.target.value)}
                step="100"
              />
            </label>
            <label className="field">
              <span>Debt, M</span>
              <input
                type="number"
                value={debt}
                onChange={(event) => setDebt(event.target.value)}
                step="100"
              />
            </label>
            <label className="field">
              <span>Shares, M</span>
              <input
                type="number"
                value={sharesOutstanding}
                onChange={(event) => setSharesOutstanding(event.target.value)}
                min="0"
                step="10"
              />
            </label>
          </div>

          {hasError && <p className="error">{valuation.error}</p>}
        </article>

        <article className="panel dcf-output-panel">
          <div className="section-heading">
            <h2>Valuation bridge</h2>
            <p>All values in millions except per-share data</p>
          </div>

          {hasError ? (
            <div className="empty-state compact">Update assumptions to calculate intrinsic value.</div>
          ) : (
            <>
              <div className="dcf-bridge">
                <div>
                  <span>Explicit PV</span>
                  <strong>{formatMillions(valuation.explicitPresentValue, currency)}</strong>
                </div>
                <div>
                  <span>Terminal PV</span>
                  <strong>{formatMillions(valuation.terminalPresentValue, currency)}</strong>
                </div>
                <div>
                  <span>Enterprise value</span>
                  <strong>{formatMillions(valuation.enterpriseValue, currency)}</strong>
                </div>
                <div>
                  <span>Net cash</span>
                  <strong>{formatMillions(valuation.netCash, currency)}</strong>
                </div>
                <div className="bridge-total">
                  <span>Equity value</span>
                  <strong>{formatMillions(valuation.equityValue, currency)}</strong>
                </div>
              </div>

              <div className="table-scroll dcf-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>FCF</th>
                      <th>Discount</th>
                      <th>PV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.projection.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year}</td>
                        <td>{formatMillions(row.freeCashFlow, currency)}</td>
                        <td>{row.discountFactor.toFixed(2)}x</td>
                        <td>{formatMillions(row.presentValue, currency)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>TV</td>
                      <td>{formatMillions(valuation.terminalValue, currency)}</td>
                      <td>{Math.pow(1 + parseInput(discountRate) / 100, 5).toFixed(2)}x</td>
                      <td>{formatMillions(valuation.terminalPresentValue, currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
