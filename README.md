# 台股ETF投資模擬器

A web-based stock investment simulator for Taiwan ETFs.

## Supported ETFs

| Ticker | Name |
|--------|------|
| 0050 | 元大台灣50 |
| 0056 | 元大高股息 |
| 006208 | 富邦台50 |
| 00878 | 國泰永續高股息 |
| 00919 | 群益台灣精選高息 |
| 00713 | 元大台灣高息低波 |

## Features

- **Three purchasing strategies:**
  - One-time lump sum (單筆投入)
  - Fixed dollar amount monthly / DCA (定期定額)
  - Fixed share count monthly (定期定股)

- **Transaction costs:**
  - Buy commission: 0.1425%
  - Sell commission: 0.1425% + 0.1% securities transaction tax

- **Dividend handling:**
  - Reinvest dividends (股利再投入)
  - Keep as fixed deposit with configurable interest rate (股利定存)

- **Visualization:**
  - Portfolio value chart over time
  - Dividend history bar chart
  - Detailed transaction log table
  - Summary cards (total invested, market value, return rate, etc.)

## Getting Started

### Quick Start (with sample data)

The app ships with generated sample data. Just serve the files with any HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .
```

Then open http://localhost:8000 in your browser.

### Using Real Historical Data

To download real price and dividend data from Yahoo Finance:

```bash
pip install yfinance
python fetch_data.py
```

This will save JSON files to the `data/` directory. Refresh the browser to use real data.

## Project Structure

```
.
├── index.html              # Main HTML page
├── css/style.css           # Styles
├── js/
│   ├── data.js             # ETF info and data loader config
│   ├── simulator.js        # Simulation engine
│   └── ui.js               # UI controller, charts, DOM binding
├── data/                   # ETF price/dividend JSON files
│   ├── 0050.json
│   ├── 0056.json
│   ├── 006208.json
│   ├── 00878.json
│   ├── 00919.json
│   └── 00713.json
├── fetch_data.py           # Script to download real data from Yahoo Finance
└── generate_sample_data.py # Script to regenerate sample data
```
