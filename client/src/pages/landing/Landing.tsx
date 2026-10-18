import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import ThemeToggle from "../../components/ThemeToggle";
import "./Landing.css";

type SampleRow = {
  ticker: string;
  qty: number;
  cost: number;
  price: number;
};

// Illustrative statement shown to visitors who are not signed in.
const SAMPLE: SampleRow[] = [
  { ticker: "AAPL", qty: 12, cost: 275.8, price: 343.46 },
  { ticker: "MSFT", qty: 8, cost: 542.1, price: 529.05 },
  { ticker: "NVDA", qty: 20, cost: 118.4, price: 189.2 },
  { ticker: "JPM", qty: 10, cost: 232.0, price: 221.3 },
];

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(value: number) {
  return fmt.format(value);
}

// Accounting convention: negatives in parentheses.
function signed(value: number) {
  return value < 0 ? `(${fmt.format(Math.abs(value))})` : fmt.format(value);
}

function statementDate() {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date());
}

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate("/portfolio", { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const rows = SAMPLE.map((r) => {
    const costBasis = r.qty * r.cost;
    const marketValue = r.qty * r.price;
    return { ...r, costBasis, marketValue, pnl: marketValue - costBasis };
  });
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const totalPnl = totalValue - totalCost;
  const totalPct = (totalPnl / totalCost) * 100;

  return (
    <div className="landing">
      <header className="landing-bar">
        <Link to="/" className="landing-brand">
          StockSpace
        </Link>
        <nav className="landing-nav" aria-label="Account">
          <Link to="/login">Sign in</Link>
          <Link to="/signup" className="landing-nav-primary">
            Create account
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Your positions, priced today.</h1>
            <p>
              Keep a ledger of what you bought and what you paid. StockSpace prices it against the
              market, draws the chart, and lets you value the business yourself.
            </p>
            <div className="hero-actions">
              <Link to="/signup" className="btn">
                Start a portfolio
              </Link>
              <Link to="/login" className="hero-signin">
                I already have one
              </Link>
            </div>
          </div>

          <figure className="statement" aria-label="Example portfolio statement">
            <figcaption>
              <span>Statement</span>
              <span>{statementDate()}</span>
            </figcaption>
            <table>
              <thead>
                <tr>
                  <th scope="col">Holding</th>
                  <th scope="col" className="num">
                    Qty
                  </th>
                  <th scope="col" className="num">
                    Paid
                  </th>
                  <th scope="col" className="num">
                    Price
                  </th>
                  <th scope="col" className="num">
                    Gain / loss
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker}>
                    <th scope="row">{r.ticker}</th>
                    <td className="num">{r.qty}</td>
                    <td className="num">{money(r.cost)}</td>
                    <td className="num">{money(r.price)}</td>
                    <td className={`num ${r.pnl < 0 ? "loss" : "gain"}`}>{signed(r.pnl)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td />
                  <td className="num">{money(totalCost)}</td>
                  <td className="num">{money(totalValue)}</td>
                  <td className={`num ${totalPnl < 0 ? "loss" : "gain"}`}>
                    {signed(totalPnl)}
                    <small>{totalPct >= 0 ? "+" : ""}{totalPct.toFixed(1)}%</small>
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="statement-note">Example figures. Your statement uses your own holdings.</p>
          </figure>
        </section>

        <section className="features" aria-label="What StockSpace does">
          <article className="feature-row">
            <h2>Portfolio</h2>
            <p>
              Enter each holding with its quantity and cost. Every position is priced live, with
              gain or loss shown in money and percent, and allocation drawn as a share of the whole.
            </p>
            <svg className="glyph" viewBox="0 0 120 48" aria-hidden="true">
              <line x1="0" y1="10" x2="120" y2="10" />
              <line x1="0" y1="22" x2="120" y2="22" />
              <line x1="0" y1="34" x2="120" y2="34" />
              <line x1="0" y1="45" x2="120" y2="45" />
              <line x1="0" y1="47.5" x2="120" y2="47.5" />
              <rect x="0" y="2" width="28" height="4" />
              <rect x="88" y="2" width="32" height="4" />
              <rect x="0" y="14" width="28" height="4" />
              <rect x="94" y="14" width="26" height="4" />
              <rect x="0" y="26" width="28" height="4" />
              <rect x="84" y="26" width="36" height="4" />
            </svg>
          </article>

          <article className="feature-row">
            <h2>Analysis</h2>
            <p>
              One year of daily candles for any ticker, with a 20-day moving average over the top, so
              you can see where the price sits against its recent trend before you act.
            </p>
            <svg className="glyph" viewBox="0 0 120 48" aria-hidden="true">
              <path className="ma" d="M2 34 C 20 30, 36 26, 50 24 S 86 16, 118 10" />
              <g className="candle gain">
                <line x1="10" y1="22" x2="10" y2="42" />
                <rect x="6" y="26" width="8" height="12" />
              </g>
              <g className="candle loss">
                <line x1="30" y1="16" x2="30" y2="36" />
                <rect x="26" y="18" width="8" height="12" />
              </g>
              <g className="candle gain">
                <line x1="50" y1="14" x2="50" y2="34" />
                <rect x="46" y="18" width="8" height="12" />
              </g>
              <g className="candle gain">
                <line x1="70" y1="8" x2="70" y2="28" />
                <rect x="66" y="12" width="8" height="12" />
              </g>
              <g className="candle loss">
                <line x1="90" y1="6" x2="90" y2="26" />
                <rect x="86" y="10" width="8" height="10" />
              </g>
              <g className="candle gain">
                <line x1="110" y1="2" x2="110" y2="22" />
                <rect x="106" y="6" width="8" height="12" />
              </g>
            </svg>
          </article>

          <article className="feature-row">
            <h2>Valuation</h2>
            <p>
              A discounted cash flow model with bear, base and bull cases. Set growth, discount and
              terminal rates, and compare the intrinsic value per share with today's price.
            </p>
            <div className="glyph formula" aria-hidden="true">
              <span className="frac">
                <span>FCF × (1 + g)</span>
                <span>r − g</span>
              </span>
            </div>
          </article>
        </section>
      </main>

      <footer className="landing-foot">
        <span>StockSpace</span>
        <span>Prices from Yahoo Finance. Not investment advice.</span>
      </footer>
    </div>
  );
}
