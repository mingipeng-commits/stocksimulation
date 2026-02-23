#!/usr/bin/env python3
"""
Generate realistic sample data for Taiwan ETFs for demo purposes.
This creates JSON files in data/ that approximate real price patterns.
"""

import json
import math
import os
import random
from datetime import datetime, timedelta

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

random.seed(42)

# ETF configurations with approximate real parameters
ETFS = {
    "0050": {
        "name": "元大台灣50",
        "start": "2003-06-30",
        "initial_price": 37.08,
        "annual_return": 0.09,
        "volatility": 0.18,
        "div_yield": 0.032,
        "div_months": [7, 11],  # months dividends are typically paid
        "div_start_year": 2005,
    },
    "0056": {
        "name": "元大高股息",
        "start": "2007-12-26",
        "initial_price": 25.00,
        "annual_return": 0.06,
        "volatility": 0.15,
        "div_yield": 0.065,
        "div_months": [10],
        "div_start_year": 2009,
    },
    "006208": {
        "name": "富邦台50",
        "start": "2012-07-17",
        "initial_price": 15.50,
        "annual_return": 0.10,
        "volatility": 0.17,
        "div_yield": 0.028,
        "div_months": [7, 11],
        "div_start_year": 2013,
    },
    "00878": {
        "name": "國泰永續高股息",
        "start": "2020-07-20",
        "initial_price": 15.00,
        "annual_return": 0.05,
        "volatility": 0.12,
        "div_yield": 0.065,
        "div_months": [2, 5, 8, 11],  # quarterly
        "div_start_year": 2021,
    },
    "00919": {
        "name": "群益台灣精選高息",
        "start": "2022-10-20",
        "initial_price": 15.00,
        "annual_return": 0.04,
        "volatility": 0.13,
        "div_yield": 0.08,
        "div_months": [1, 4, 7, 10],  # quarterly
        "div_start_year": 2023,
    },
    "00713": {
        "name": "元大台灣高息低波",
        "start": "2017-09-19",
        "initial_price": 20.00,
        "annual_return": 0.07,
        "volatility": 0.13,
        "div_yield": 0.055,
        "div_months": [1, 4, 7, 10],  # quarterly
        "div_start_year": 2018,
    },
}


def generate_prices(start_str, initial_price, annual_return, volatility, end_date=None):
    """Generate daily prices using geometric Brownian motion."""
    start = datetime.strptime(start_str, "%Y-%m-%d")
    if end_date is None:
        end_date = datetime(2025, 1, 31)

    daily_return = annual_return / 252
    daily_vol = volatility / math.sqrt(252)

    prices = []
    price = initial_price
    current = start

    while current <= end_date:
        # Skip weekends
        if current.weekday() < 5:
            prices.append({
                "date": current.strftime("%Y-%m-%d"),
                "close": round(price, 2),
            })

            # GBM step with some mean reversion
            shock = random.gauss(0, 1)
            price *= math.exp(daily_return - 0.5 * daily_vol**2 + daily_vol * shock)

            # Prevent prices from going negative or unrealistically low
            price = max(price, initial_price * 0.3)

        current += timedelta(days=1)

    return prices


def generate_dividends(config, prices):
    """Generate dividend records based on ETF config."""
    dividends = []
    if not prices:
        return dividends

    price_map = {p["date"]: p["close"] for p in prices}
    years_in_data = set()
    for p in prices:
        y = int(p["date"][:4])
        if y >= config["div_start_year"]:
            years_in_data.add(y)

    for year in sorted(years_in_data):
        for month in config["div_months"]:
            # Find a trading day around the 15th of the dividend month
            for day in range(15, 28):
                date_str = f"{year}-{month:02d}-{day:02d}"
                if date_str in price_map:
                    # Dividend amount based on yield / number of payments per year
                    annual_div = price_map[date_str] * config["div_yield"]
                    per_payment = annual_div / len(config["div_months"])
                    # Add some randomness
                    per_payment *= random.uniform(0.85, 1.15)
                    dividends.append({
                        "date": date_str,
                        "amount": round(per_payment, 4),
                    })
                    break

    return dividends


def main():
    print("Generating sample ETF data...")
    for ticker, config in ETFS.items():
        prices = generate_prices(
            config["start"],
            config["initial_price"],
            config["annual_return"],
            config["volatility"],
        )
        dividends = generate_dividends(config, prices)

        data = {
            "ticker": ticker,
            "name": config["name"],
            "prices": prices,
            "dividends": dividends,
            "lastUpdated": "2025-01-31",
            "isSampleData": True,
        }

        path = os.path.join(OUTPUT_DIR, f"{ticker}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        print(f"  {ticker}: {len(prices)} prices, {len(dividends)} dividends -> {path}")

    print("Done!")


if __name__ == "__main__":
    main()
