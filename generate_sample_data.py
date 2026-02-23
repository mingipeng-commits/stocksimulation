#!/usr/bin/env python3
"""
Generate realistic sample data for Taiwan ETFs.

Since external APIs (yfinance, TWSE) are blocked in this environment,
this script generates data based on known historical characteristics
of each ETF. It uses geometric Brownian motion calibrated to match
known price milestones and dividend patterns.

The data is realistic but synthetic -- suitable for simulation/backtesting
demos but NOT for actual investment decisions.
"""

import json
import math
import os
import random
from datetime import datetime, timedelta

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

random.seed(42)

# Taiwan Stock Exchange holidays (approximate -- major holidays)
# We'll skip weekends and approximate major TW holidays
TW_HOLIDAYS = set()
for year in range(2003, 2027):
    # Lunar New Year (approximate, varies each year; typically late Jan - mid Feb)
    # Chinese New Year approximate dates
    TW_HOLIDAYS.add(f"{year}-01-01")  # New Year's Day
    TW_HOLIDAYS.add(f"{year}-02-28")  # Peace Memorial Day
    TW_HOLIDAYS.add(f"{year}-04-04")  # Children's Day
    TW_HOLIDAYS.add(f"{year}-04-05")  # Tomb Sweeping Day
    TW_HOLIDAYS.add(f"{year}-05-01")  # Labor Day
    TW_HOLIDAYS.add(f"{year}-10-10")  # National Day


def is_trading_day(dt):
    """Check if a date is a trading day (weekday and not a holiday)."""
    if dt.weekday() >= 5:  # Saturday or Sunday
        return False
    if dt.strftime("%Y-%m-%d") in TW_HOLIDAYS:
        return False
    return True


def generate_prices_with_milestones(start_str, initial_price, milestones, volatility, end_date_str="2026-02-20"):
    """
    Generate daily prices using GBM, calibrated to hit known price milestones.

    milestones: list of (date_str, approximate_price) tuples representing known
                price levels at specific dates.
    """
    start = datetime.strptime(start_str, "%Y-%m-%d")
    end = datetime.strptime(end_date_str, "%Y-%m-%d")
    daily_vol = volatility / math.sqrt(252)

    # Build the full list of milestones including start
    all_milestones = [("start", start, initial_price)]
    for date_str, price in milestones:
        all_milestones.append((date_str, datetime.strptime(date_str, "%Y-%m-%d"), price))
    # Add a final target if the last milestone is before end
    if all_milestones[-1][1] < end:
        last_price = all_milestones[-1][2]
        all_milestones.append(("end", end, last_price))

    prices = []
    current = start
    price = initial_price

    # Track which milestone segment we're in
    milestone_idx = 0

    while current <= end:
        if is_trading_day(current):
            prices.append({
                "date": current.strftime("%Y-%m-%d"),
                "close": round(price, 2),
            })

            # Find current target milestone
            while milestone_idx < len(all_milestones) - 1 and current >= all_milestones[milestone_idx + 1][1]:
                milestone_idx += 1

            if milestone_idx < len(all_milestones) - 1:
                target_date = all_milestones[milestone_idx + 1][1]
                target_price = all_milestones[milestone_idx + 1][2]
                days_remaining = max(1, (target_date - current).days)

                # Calculate drift needed to reach target
                if price > 0 and target_price > 0:
                    needed_return = math.log(target_price / price) / days_remaining
                else:
                    needed_return = 0

                shock = random.gauss(0, 1)
                price *= math.exp(needed_return - 0.5 * daily_vol**2 + daily_vol * shock)
            else:
                # After last milestone, just random walk
                shock = random.gauss(0, 1)
                price *= math.exp(-0.5 * daily_vol**2 + daily_vol * shock)

            # Prevent unrealistic prices
            price = max(price, initial_price * 0.15)

        current += timedelta(days=1)

    return prices


# ============================================================
# ETF Configurations with known historical characteristics
# ============================================================

ETF_CONFIGS = {
    "0050": {
        "name": "元大台灣50",
        "start": "2003-06-30",
        "initial_price": 37.08,
        "volatility": 0.20,
        # Key price milestones (approximate historical values)
        "milestones": [
            ("2004-03-01", 46.0),
            ("2005-01-03", 50.0),
            ("2006-01-02", 56.0),
            ("2007-10-01", 72.0),   # Pre-GFC peak
            ("2008-11-01", 28.5),   # GFC bottom
            ("2009-06-01", 46.0),
            ("2010-01-04", 55.0),
            ("2011-02-01", 62.0),
            ("2011-12-01", 47.0),   # Euro crisis dip
            ("2013-01-02", 55.0),
            ("2014-07-01", 65.0),
            ("2015-04-01", 72.0),
            ("2015-08-24", 56.5),   # China crash
            ("2016-06-01", 62.0),
            ("2017-01-03", 70.0),
            ("2018-01-26", 84.0),   # Peak before correction
            ("2018-10-29", 72.5),   # Correction
            ("2019-12-01", 90.0),
            ("2020-03-19", 67.0),   # COVID crash
            ("2020-07-01", 87.0),
            ("2020-12-31", 120.0),
            ("2021-07-01", 139.0),
            ("2022-01-03", 145.0),
            ("2022-06-30", 110.0),  # 2022 bear
            ("2022-10-28", 102.0),  # 2022 bottom
            ("2023-06-01", 130.0),
            ("2023-12-29", 140.0),
            ("2024-07-12", 177.0),  # All-time high area
            ("2024-10-01", 165.0),
            ("2025-01-02", 175.0),
            ("2025-06-30", 180.0),
            ("2025-12-31", 185.0),
            ("2026-02-20", 188.0),
        ],
        # Dividend history (approximate real dividends for 0050)
        "dividends": [
            ("2005-02-02", 1.85),
            ("2005-07-21", 0.00),  # skip
            ("2006-01-13", 4.00),
            ("2007-01-12", 2.00),
            ("2007-10-25", 2.50),
            ("2008-10-28", 2.00),
            ("2009-10-23", 1.00),
            ("2010-10-22", 2.20),
            ("2011-10-31", 1.85),
            ("2012-10-24", 1.35),
            ("2013-10-23", 1.35),
            ("2014-10-23", 1.55),
            ("2015-01-28", 0.70),
            ("2015-10-23", 0.85),
            ("2016-01-28", 0.85),
            ("2016-10-24", 0.70),
            ("2017-01-18", 0.70),
            ("2017-10-23", 2.40),
            ("2018-01-22", 0.70),
            ("2018-10-22", 2.90),
            ("2019-01-22", 0.70),
            ("2019-10-23", 2.90),
            ("2020-01-31", 0.70),
            ("2020-07-22", 2.90),
            ("2021-01-22", 0.70),
            ("2021-07-22", 3.40),
            ("2022-01-24", 0.70),
            ("2022-07-21", 3.20),
            ("2023-01-30", 0.70),
            ("2023-07-20", 2.60),
            ("2024-01-29", 0.70),
            ("2024-07-22", 3.00),
            ("2025-01-22", 0.73),
            ("2025-07-22", 3.20),
        ],
    },
    "0056": {
        "name": "元大高股息",
        "start": "2007-12-26",
        "initial_price": 25.00,
        "volatility": 0.16,
        "milestones": [
            ("2008-05-01", 27.0),
            ("2008-11-21", 14.5),   # GFC crash
            ("2009-06-01", 19.5),
            ("2010-01-04", 23.5),
            ("2011-07-01", 25.5),
            ("2011-12-01", 20.5),
            ("2013-01-02", 23.0),
            ("2014-07-01", 24.5),
            ("2015-04-01", 27.0),
            ("2015-08-24", 21.5),
            ("2016-06-01", 23.0),
            ("2017-01-03", 24.0),
            ("2018-01-26", 27.5),
            ("2018-10-29", 23.5),
            ("2019-06-01", 26.0),
            ("2019-12-31", 29.0),
            ("2020-03-19", 22.0),   # COVID
            ("2020-07-01", 27.5),
            ("2020-12-31", 30.5),
            ("2021-07-01", 33.5),
            ("2021-12-31", 33.0),
            ("2022-06-30", 27.0),
            ("2022-10-28", 24.5),
            ("2023-06-01", 30.0),
            ("2023-07-17", 36.0),   # Retail frenzy
            ("2023-12-29", 34.5),
            ("2024-07-12", 39.0),
            ("2024-10-01", 35.0),
            ("2025-01-02", 36.5),
            ("2025-06-30", 37.5),
            ("2025-12-31", 38.0),
            ("2026-02-20", 38.5),
        ],
        "dividends": [
            ("2009-10-29", 0.00),
            ("2010-10-27", 2.00),
            ("2011-10-31", 2.20),
            ("2012-10-24", 1.30),
            ("2013-10-23", 0.85),
            ("2014-10-23", 1.00),
            ("2015-10-22", 1.00),
            ("2016-10-24", 1.30),
            ("2017-10-23", 0.95),
            ("2018-10-23", 1.45),
            ("2019-10-23", 1.80),
            ("2020-10-28", 1.60),
            ("2021-01-22", 1.60),
            ("2021-10-22", 1.80),
            ("2022-01-24", 2.10),
            ("2022-10-21", 2.10),
            ("2023-01-17", 1.50),
            ("2023-06-15", 1.00),
            ("2023-10-19", 1.20),
            ("2024-01-17", 1.20),
            ("2024-06-14", 0.79),
            ("2024-10-17", 0.76),
            ("2025-01-17", 0.88),
            ("2025-06-13", 0.80),
            ("2025-10-17", 0.85),
        ],
    },
    "006208": {
        "name": "富邦台50",
        "start": "2012-07-17",
        "initial_price": 15.50,
        "volatility": 0.19,
        "milestones": [
            ("2013-01-02", 17.5),
            ("2014-01-02", 19.0),
            ("2015-04-27", 23.0),
            ("2015-08-24", 17.5),
            ("2016-06-01", 19.0),
            ("2017-01-03", 21.5),
            ("2018-01-26", 26.5),
            ("2018-10-29", 22.0),
            ("2019-12-31", 28.5),
            ("2020-03-19", 20.5),   # COVID
            ("2020-07-01", 27.0),
            ("2020-12-31", 37.0),
            ("2021-07-01", 43.0),
            ("2022-01-03", 46.0),
            ("2022-06-30", 35.0),
            ("2022-10-28", 33.0),
            ("2023-06-01", 42.0),
            ("2023-12-29", 46.0),
            ("2024-07-12", 57.0),
            ("2024-10-01", 53.0),
            ("2025-01-02", 56.0),
            ("2025-06-30", 58.0),
            ("2025-12-31", 60.0),
            ("2026-02-20", 61.0),
        ],
        "dividends": [
            ("2013-11-21", 0.29),
            ("2014-11-21", 0.43),
            ("2015-07-23", 0.30),
            ("2015-11-20", 0.40),
            ("2016-07-21", 0.22),
            ("2016-11-21", 0.52),
            ("2017-07-20", 0.63),
            ("2017-11-20", 0.23),
            ("2018-07-19", 0.74),
            ("2018-11-19", 0.32),
            ("2019-07-22", 0.92),
            ("2019-11-18", 0.40),
            ("2020-07-20", 0.44),
            ("2020-11-19", 0.73),
            ("2021-07-20", 1.19),
            ("2021-11-18", 0.53),
            ("2022-07-21", 1.09),
            ("2022-11-17", 0.30),
            ("2023-07-20", 0.91),
            ("2023-11-16", 0.60),
            ("2024-07-22", 1.10),
            ("2024-11-18", 0.55),
            ("2025-07-21", 1.15),
        ],
    },
    "00878": {
        "name": "國泰永續高股息",
        "start": "2020-07-20",
        "initial_price": 15.00,
        "volatility": 0.14,
        "milestones": [
            ("2020-09-01", 14.5),
            ("2020-12-31", 16.0),
            ("2021-03-01", 17.0),
            ("2021-07-01", 18.5),
            ("2021-12-31", 18.0),
            ("2022-03-01", 17.5),
            ("2022-06-30", 15.0),
            ("2022-10-28", 14.5),
            ("2023-03-01", 16.5),
            ("2023-06-01", 18.5),
            ("2023-07-17", 21.0),  # Retail frenzy peak
            ("2023-10-01", 19.5),
            ("2023-12-29", 20.0),
            ("2024-03-01", 21.5),
            ("2024-07-12", 22.5),
            ("2024-10-01", 21.0),
            ("2025-01-02", 22.0),
            ("2025-06-30", 22.5),
            ("2025-12-31", 23.0),
            ("2026-02-20", 23.0),
        ],
        # Quarterly dividends
        "dividends": [
            ("2021-02-03", 0.05),
            ("2021-05-18", 0.15),
            ("2021-08-17", 0.25),
            ("2021-11-16", 0.30),
            ("2022-02-16", 0.32),
            ("2022-05-17", 0.32),
            ("2022-08-16", 0.30),
            ("2022-11-16", 0.27),
            ("2023-02-16", 0.27),
            ("2023-05-17", 0.27),
            ("2023-08-16", 0.35),
            ("2023-11-16", 0.40),
            ("2024-02-27", 0.40),
            ("2024-05-17", 0.51),
            ("2024-08-16", 0.55),
            ("2024-11-18", 0.34),
            ("2025-02-18", 0.38),
            ("2025-05-16", 0.42),
            ("2025-08-15", 0.40),
            ("2025-11-17", 0.38),
        ],
    },
    "00919": {
        "name": "群益台灣精選高息",
        "start": "2022-10-20",
        "initial_price": 15.00,
        "volatility": 0.15,
        "milestones": [
            ("2022-12-30", 14.5),
            ("2023-03-01", 16.0),
            ("2023-06-01", 19.0),
            ("2023-07-17", 22.5),   # Peak
            ("2023-10-01", 20.5),
            ("2023-12-29", 22.0),
            ("2024-03-01", 23.5),
            ("2024-07-12", 26.5),
            ("2024-10-01", 24.0),
            ("2025-01-02", 25.0),
            ("2025-06-30", 26.0),
            ("2025-12-31", 27.0),
            ("2026-02-20", 27.0),
        ],
        # Quarterly dividends (known for high yield)
        "dividends": [
            ("2023-01-17", 0.05),
            ("2023-04-18", 0.12),
            ("2023-07-18", 0.54),
            ("2023-10-18", 0.54),
            ("2024-01-17", 0.55),
            ("2024-04-17", 0.55),
            ("2024-07-17", 0.68),
            ("2024-10-17", 0.55),
            ("2025-01-17", 0.57),
            ("2025-04-17", 0.58),
            ("2025-07-17", 0.60),
            ("2025-10-17", 0.55),
        ],
    },
    "00713": {
        "name": "元大台灣高息低波",
        "start": "2017-09-19",
        "initial_price": 20.00,
        "volatility": 0.14,
        "milestones": [
            ("2018-01-26", 25.0),
            ("2018-10-29", 22.0),
            ("2019-06-01", 27.0),
            ("2019-12-31", 30.5),
            ("2020-03-19", 22.0),   # COVID
            ("2020-07-01", 28.0),
            ("2020-12-31", 33.0),
            ("2021-07-01", 38.0),
            ("2021-12-31", 40.0),
            ("2022-06-30", 34.0),
            ("2022-10-28", 33.0),
            ("2023-06-01", 40.0),
            ("2023-07-17", 46.0),
            ("2023-12-29", 48.0),
            ("2024-03-01", 50.0),
            ("2024-07-12", 55.0),
            ("2024-10-01", 50.0),
            ("2025-01-02", 53.0),
            ("2025-06-30", 55.0),
            ("2025-12-31", 57.0),
            ("2026-02-20", 57.5),
        ],
        # Changed to quarterly dividends in recent years
        "dividends": [
            ("2018-11-20", 0.60),
            ("2019-11-20", 1.50),
            ("2020-11-19", 1.40),
            ("2021-11-18", 1.30),
            ("2022-04-19", 0.59),
            ("2022-07-19", 0.87),
            ("2022-10-20", 0.44),
            ("2023-01-17", 0.56),
            ("2023-04-18", 0.49),
            ("2023-07-18", 1.08),
            ("2023-10-18", 0.86),
            ("2024-01-17", 0.88),
            ("2024-04-17", 0.75),
            ("2024-07-17", 1.20),
            ("2024-10-17", 0.80),
            ("2025-01-17", 0.90),
            ("2025-04-17", 0.78),
            ("2025-07-17", 1.10),
            ("2025-10-17", 0.82),
        ],
    },
}


def main():
    print("=" * 60)
    print("Generating realistic sample ETF data")
    print("=" * 60)
    print()
    print("NOTE: External APIs (yfinance, TWSE) are blocked in this")
    print("environment due to proxy restrictions. Generating synthetic")
    print("data calibrated to known historical price milestones.")
    print()

    for ticker, config in ETF_CONFIGS.items():
        print(f"Generating {ticker} ({config['name']})...")

        # Generate prices
        prices = generate_prices_with_milestones(
            config["start"],
            config["initial_price"],
            config["milestones"],
            config["volatility"],
        )

        # Filter dividends: only include those with amount > 0
        dividends = [
            {"date": d[0], "amount": round(d[1], 4)}
            for d in config["dividends"]
            if d[1] > 0
        ]

        data = {
            "ticker": ticker,
            "name": config["name"],
            "prices": prices,
            "dividends": dividends,
        }

        path = os.path.join(OUTPUT_DIR, f"{ticker}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        file_size = os.path.getsize(path)

        if prices:
            print(f"  Prices: {len(prices)} records ({prices[0]['date']} to {prices[-1]['date']})")
        else:
            print(f"  Prices: 0 records")
        print(f"  Dividends: {len(dividends)} records")
        print(f"  File: {path} ({file_size:,} bytes)")
        print()

    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Ticker':<10} {'Name':<20} {'Prices':>8} {'Dividends':>10} {'File Size':>12}")
    print("-" * 70)
    for ticker in ETF_CONFIGS:
        path = os.path.join(OUTPUT_DIR, f"{ticker}.json")
        with open(path, "r") as f:
            d = json.load(f)
        size = os.path.getsize(path)
        print(f"{d['ticker']:<10} {d['name']:<20} {len(d['prices']):>8} {len(d['dividends']):>10} {size:>10,} bytes")

    print()
    print("Data generation complete!")
    print(f"Files saved to: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
