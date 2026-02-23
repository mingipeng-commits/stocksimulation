/**
 * Data loader for ETF JSON files.
 *
 * Each ETF data file (data/<ticker>.json) should have:
 * {
 *   "ticker": "0050",
 *   "name": "元大台灣50",
 *   "prices": [{"date": "2003-06-30", "close": 37.08}, ...],
 *   "dividends": [{"date": "2005-02-02", "amount": 1.85}, ...],
 *   "lastUpdated": "2025-01-15"
 * }
 *
 * To fetch real data: python fetch_data.py
 */

const ETF_INFO = {
  '0050':   { name: '元大台灣50' },
  '0056':   { name: '元大高股息' },
  '006208': { name: '富邦台50' },
  '00878':  { name: '國泰永續高股息' },
  '00919':  { name: '群益台灣精選高息' },
  '00713':  { name: '元大台灣高息低波' },
};
