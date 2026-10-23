import os
import time
from threading import Lock

from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf

app = Flask(__name__)

# Comma-separated list of allowed frontend origins, e.g.
# ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
CORS(app, origins=[o.strip() for o in _origins.split(",") if o.strip()])

QUOTE_TTL_SECONDS = int(os.environ.get("QUOTE_TTL_SECONDS", "60"))
CHART_TTL_SECONDS = int(os.environ.get("CHART_TTL_SECONDS", "900"))
PROFILE_TTL_SECONDS = int(os.environ.get("PROFILE_TTL_SECONDS", "86400"))
STATS_TTL_SECONDS = int(os.environ.get("STATS_TTL_SECONDS", "900"))

_ALLOWED_TICKER_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-^=")

# Tiny in-memory cache so a portfolio with many holdings does not hammer Yahoo.
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = Lock()


def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.time() > expires_at:
        return None
    return value


def _cache_set(key: str, value, ttl: int):
    with _cache_lock:
        _cache[key] = (time.time() + ttl, value)


def _read_ticker():
    """Return (ticker, error_response). Exactly one of them is set."""
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return None, (jsonify({"error": "ticker is required"}), 400)
    if any(ch not in _ALLOWED_TICKER_CHARS for ch in ticker):
        return None, (jsonify({"error": "invalid ticker format"}), 400)
    return ticker, None


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/quote")
def quote():
    ticker, err = _read_ticker()
    if err:
        return err

    cached = _cache_get(f"quote:{ticker}")
    if cached is not None:
        return jsonify(cached)

    try:
        hist = yf.Ticker(ticker).history(period="1d")
        if hist.empty:
            return jsonify({"error": "ticker not found or no data"}), 404

        payload = {"ticker": ticker, "price": float(hist["Close"].iloc[-1])}
        _cache_set(f"quote:{ticker}", payload, QUOTE_TTL_SECONDS)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": f"failed to fetch price: {e}"}), 500


@app.get("/profile")
def profile():
    ticker, err = _read_ticker()
    if err:
        return err

    cached = _cache_get(f"profile:{ticker}")
    if cached is not None:
        return jsonify(cached)

    try:
        # Yahoo's search endpoint returns sector/quoteType and is far less
        # rate-limited than the quoteSummary endpoint behind Ticker.info.
        quotes = yf.Search(ticker, max_results=10, news_count=0, lists_count=0,
                           include_cb=False, include_research=False).quotes
        match = next((q for q in quotes if str(q.get("symbol", "")).upper() == ticker), None)
        # Equities carry a sector; ETFs, funds and crypto only have a quoteType.
        sector = match and (match.get("sector") or match.get("quoteType"))
        if not sector:
            return jsonify({"error": "ticker not found or no data"}), 404

        payload = {"ticker": ticker, "sector": str(sector)}
        _cache_set(f"profile:{ticker}", payload, PROFILE_TTL_SECONDS)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": f"failed to fetch profile: {e}"}), 500


@app.get("/stats")
def stats():
    ticker, err = _read_ticker()
    if err:
        return err

    cached = _cache_get(f"stats:{ticker}")
    if cached is not None:
        return jsonify(cached)

    try:
        # fast_info derives these from price history and avoids the heavily
        # rate-limited quoteSummary endpoint behind Ticker.info.
        info = yf.Ticker(ticker).fast_info
        values = (info.day_high, info.day_low, info.year_high, info.year_low)
        if any(v is None for v in values):
            return jsonify({"error": "ticker not found or no data"}), 404

        day_high, day_low, year_high, year_low = values
        payload = {
            "ticker": ticker,
            "dayHigh": float(day_high),
            "dayLow": float(day_low),
            "fiftyTwoWeekHigh": float(year_high),
            "fiftyTwoWeekLow": float(year_low),
        }
        _cache_set(f"stats:{ticker}", payload, STATS_TTL_SECONDS)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": f"failed to fetch stats: {e}"}), 500


@app.get("/stock-chart")
def stock_chart():
    ticker, err = _read_ticker()
    if err:
        return err

    cached = _cache_get(f"chart:{ticker}")
    if cached is not None:
        return jsonify(cached)

    try:
        hist = yf.Ticker(ticker).history(period="2y")
        # Yahoo can include a partial bar for the current session with no prices.
        # NaN is not valid JSON, so drop any row missing a price.
        hist = hist.dropna(subset=["Open", "High", "Low", "Close"])
        if hist.empty:
            return jsonify({"error": "ticker not found or no data"}), 404

        chart_data = [
            {
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
            }
            for date, row in hist.iterrows()
        ]

        payload = {"ticker": ticker, "data": chart_data}
        _cache_set(f"chart:{ticker}", payload, CHART_TTL_SECONDS)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": f"failed to fetch chart data: {e}"}), 500


if __name__ == "__main__":
    # Local dev only. In production run with gunicorn: `gunicorn app:app`.
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
