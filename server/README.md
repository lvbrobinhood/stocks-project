# StockSpace API

Small Flask service that proxies Yahoo Finance via `yfinance`.

## Endpoints

- `GET /health` – liveness check
- `GET /quote?ticker=AAPL` – latest close price
- `GET /stock-chart?ticker=AAPL` – two years of daily OHLCV (moving averages are computed client-side)
- `GET /profile?ticker=AAPL` – sector (or quote type for ETFs and funds), via Yahoo search rather than `.info`
- `GET /stats?ticker=AAPL` – key stats (52-week high and low), via `fast_info` rather than `.info`

Responses are cached in memory per ticker (see `QUOTE_TTL_SECONDS` / `CHART_TTL_SECONDS` / `PROFILE_TTL_SECONDS` / `STATS_TTL_SECONDS`).

## Run locally

```bash
cd server
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
copy .env.example .env        # then edit if needed
python app.py
```

The server reads config from environment variables; see `.env.example`.
`python app.py` does not load `.env` automatically, so either export the
variables in your shell or rely on the defaults (localhost origins, port 8000).

## Production

```bash
gunicorn app:app --bind 0.0.0.0:$PORT
```

Set `ALLOWED_ORIGINS` to your deployed frontend URL.
