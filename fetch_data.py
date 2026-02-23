#!/usr/bin/env python3
"""
Fetch historical stock prices and dividend data for Taiwan ETFs using yfinance.

Usage:
    pip install yfinance
    python fetch_data.py

This script downloads data for: 0050, 0056, 006208, 00878, 00919, 00713
and saves JSON files to the data/ directory.
"""

import json
import os
import sys
from datetime import datetime

try:
    import yfinance as yf
except ImportError:
    print("Please install yfinance first: pip install yfinance")
    sys.exit(1)

ETFs = {
    "0050": "元大台灣50",
    "0056": "元大高股息",
    "006208": "富邦台50",
    "00878": "國泰永續高股息",
    "00919": "群益台灣精選高息",
    "00713": "元大台灣高息低波",
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def fetch_etf(ticker_id, name):
    """Fetch price and dividend history for a single ETF."""
    tw_ticker = f"{ticker_id}.TW"
    print(f"\nFetching {tw_ticker} ({name})...")

    tk = yf.Ticker(tw_ticker)

    # Get all historical daily prices
    hist = tk.history(period="max")
    if hist.empty:
        print(f"  WARNING: No price data for {tw_ticker}")
        return None

    prices = []
    for date, row in hist.iterrows():
        prices.append({
            "date": date.strftime("%Y-%m-%d"),
            "close": round(float(row["Close"]), 2),
        })

    # Get dividend history
    dividends = []
    divs = tk.dividends
    if divs is not None and not divs.empty:
        for date, amount in divs.items():
            dividends.append({
                "date": date.strftime("%Y-%m-%d"),
                "amount": round(float(amount), 4),
            })

    data = {
        "ticker": ticker_id,
        "name": name,
        "prices": prices,
        "dividends": dividends,
        "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
    }

    out_path = os.path.join(OUTPUT_DIR, f"{ticker_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  Saved {len(prices)} price records and {len(dividends)} dividends to {out_path}")
    return data


def main():
    print("=" * 60)
    print("Taiwan ETF Historical Data Fetcher")
    print("=" * 60)

    for ticker_id, name in ETFs.items():
        try:
            fetch_etf(ticker_id, name)
        except Exception as e:
            print(f"  ERROR fetching {ticker_id}: {e}")

    print("\n" + "=" * 60)
    print("Done! Check the data/ directory for JSON files.")
    print("=" * 60)


if __name__ == "__main__":
    main()
