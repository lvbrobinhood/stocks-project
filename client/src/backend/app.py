from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import pandas as pd

app = Flask(__name__)

# Allow your frontend to call this API during development
CORS(app, origins=["http://localhost:3000", "http://localhost:5173"])

@app.get("/health")
def health():
    return jsonify({"ok": True})

@app.get("/quote")
def quote():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    # Simple input guard (avoid weird characters)
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-^=")
    if any(ch not in allowed for ch in ticker):
        return jsonify({"error": "invalid ticker format"}), 400

    try:
        t = yf.Ticker(ticker)

        # Get latest close (simple + works for many tickers)
        hist = t.history(period="1d")
        if hist.empty:
            return jsonify({"error": "ticker not found or no data"}), 404

        price = float(hist["Close"].iloc[-1])

        return jsonify({
            "ticker": ticker,
            "price": price
        })

    except Exception as e:
        return jsonify({"error": f"failed to fetch price: {str(e)}"}), 500

@app.get("/stock-chart")
def stock_chart():
    ticker = request.args.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    # Simple input guard (avoid weird characters)
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-^=")
    if any(ch not in allowed for ch in ticker):
        return jsonify({"error": "invalid ticker format"}), 400

    try:
        t = yf.Ticker(ticker)

        # Fetch 1 year of historical data for 200-day MA calculation
        hist = t.history(period="1y")
        if hist.empty:
            return jsonify({"error": "ticker not found or no data"}), 404

        # Calculate 20-day moving average
        hist["MA20"] = hist["Close"].rolling(window=20).mean()

        # Convert data to JSON-serializable format
        chart_data = []
        for date, row in hist.iterrows():
            chart_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
                "ma20": float(row["MA20"]) if pd.notna(row["MA20"]) else None
            })

        return jsonify({
            "ticker": ticker,
            "data": chart_data
        })

    except Exception as e:
        return jsonify({"error": f"failed to fetch chart data: {str(e)}"}), 500

if __name__ == "__main__":
    # Local dev
    app.run(host="0.0.0.0", port=8000, debug=True)
