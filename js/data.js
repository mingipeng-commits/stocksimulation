/**
 * Data loader and CSV parser for ETF data.
 *
 * JSON format (data/<ticker>.json):
 * {
 *   "ticker": "0050",
 *   "name": "元大台灣50",
 *   "prices": [{"date": "2003-06-30", "close": 37.08}, ...],
 *   "dividends": [{"date": "2005-02-02", "amount": 1.85}, ...]
 * }
 *
 * CSV format (user-uploaded):
 *   Columns: 日期/年月, 最高價, 最低價, 加權(A/B)平均價
 *   Supports ROC dates (民國) and Western dates.
 */

const ETF_INFO = {
  '0050':   { name: '元大台灣50' },
  '0056':   { name: '元大高股息' },
  '006208': { name: '富邦台50' },
  '00878':  { name: '國泰永續高股息' },
  '00919':  { name: '群益台灣精選高息' },
  '00713':  { name: '元大台灣高息低波' },
};

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV text string containing ETF monthly/daily price data.
 * Looks for columns: 最高價, 最低價, 加權(A/B)平均價
 * Aggregates daily rows to monthly if needed.
 * @param {string} csvText - raw CSV content
 * @returns {{ prices: Array<{date:string, high:number|null, low:number|null, avg:number|null}> } | { error: string }}
 */
function parseETFCSV(csvText) {
  // Remove BOM
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: '檔案內容不足，至少需要標題列和一行資料' };

  const header = splitCSVLine(lines[0]);

  // Find columns by name
  const highCol = findCol(header, /最高/);
  const lowCol  = findCol(header, /最低/);
  const avgCol  = findCol(header, /加權|平均/);

  if (highCol === -1 && lowCol === -1 && avgCol === -1) {
    return { error: '找不到價格欄位（最高價、最低價、加權平均價），請確認 CSV 標題列' };
  }

  // Detect date column layout:
  // Case A: split columns — 年度(西元) + 月份
  // Case B: single date column — 日期, 年月, etc.
  const yearCol  = findCol(header, /年度|西元/i);
  const monthCol = findCol(header, /^月份$/i);
  const dateCol  = findCol(header, /日期|年月|date|期間/i, 0);
  const splitDate = (yearCol >= 0 && monthCol >= 0);

  // Accumulate per month
  const monthly = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 2) continue;

    let ym;
    if (splitDate) {
      // Combine year + month columns → 'YYYY-MM'
      const year  = cols[yearCol]  ? cols[yearCol].trim()  : '';
      const month = cols[monthCol] ? cols[monthCol].trim() : '';
      if (!year || !month) continue;
      const y = parseInt(year);
      const m = parseInt(month);
      if (isNaN(y) || isNaN(m)) continue;
      // Handle ROC year (< 1911) vs Western year
      const westernYear = y < 1911 ? y + 1911 : y;
      ym = `${westernYear}-${String(m).padStart(2, '0')}`;
    } else {
      const rawDate = cols[dateCol] ? cols[dateCol].trim() : '';
      ym = normalizeToYM(rawDate);
    }
    if (!ym) continue;

    const high = highCol >= 0 ? parseNum(cols[highCol]) : NaN;
    const low  = lowCol  >= 0 ? parseNum(cols[lowCol])  : NaN;
    const avg  = avgCol  >= 0 ? parseNum(cols[avgCol])  : NaN;
    if (isNaN(high) && isNaN(low) && isNaN(avg)) continue;

    if (monthly.has(ym)) {
      const e = monthly.get(ym);
      if (!isNaN(high)) e.high = Math.max(e.high, high);
      if (!isNaN(low))  e.low  = Math.min(e.low, low);
      if (!isNaN(avg))  { e.avgSum += avg; e.avgN++; }
    } else {
      monthly.set(ym, {
        high:   isNaN(high) ? null : high,
        low:    isNaN(low)  ? null : low,
        avgSum: isNaN(avg) ? 0 : avg,
        avgN:   isNaN(avg) ? 0 : 1,
      });
    }
  }

  const prices = [];
  for (const [ym, d] of [...monthly.entries()].sort()) {
    prices.push({
      date: ym, // 'YYYY-MM'
      high: d.high,
      low:  d.low,
      avg:  d.avgN > 0 ? Math.round(d.avgSum / d.avgN * 100) / 100 : null,
    });
  }

  if (prices.length === 0) {
    return { error: '無法解析任何價格資料，請確認 CSV 格式和日期欄位' };
  }

  return { prices };
}

// Split a CSV line respecting quoted fields
function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// Find a column index by regex; fallback to defaultIdx if not found
function findCol(header, regex, defaultIdx) {
  const idx = header.findIndex(h => regex.test(h.trim()));
  return idx >= 0 ? idx : (defaultIdx !== undefined ? defaultIdx : -1);
}

// Normalize various date formats to 'YYYY-MM'
function normalizeToYM(raw) {
  let m;
  // ROC: 112/01, 112-01, 112年01月, 112年1月
  m = raw.match(/^(\d{2,3})\s*[\/\-年]\s*(\d{1,2})/);
  if (m && parseInt(m[1]) < 200) {
    return `${parseInt(m[1]) + 1911}-${String(parseInt(m[2])).padStart(2, '0')}`;
  }
  // Western: 2023-01, 2023/01, 2023/01/15
  m = raw.match(/^(\d{4})\s*[\/\-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}`;
  // Compact: 20230115 or 202301
  m = raw.match(/^(\d{4})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function parseNum(s) {
  if (!s) return NaN;
  return parseFloat(s.replace(/,/g, '').trim());
}

// ---------------------------------------------------------------------------
// Dividend CSV Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSV text string containing dividend/distribution data.
 * Looks for columns: 日期/除息日/配息基準日 and 金額/配息金額/每股配息/每單位配息
 * Supports ROC (民國) and Western date formats.
 * @param {string} csvText - raw CSV content
 * @returns {{ dividends: Array<{date:string, amount:number}> } | { error: string }}
 */
function parseDividendCSV(csvText) {
  // Remove BOM
  if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: '檔案內容不足，至少需要標題列和一行資料' };

  const header = splitCSVLine(lines[0]);

  // Find date column
  const dateCol = findCol(header, /日期|除息|基準|發放|record.*date|ex.*date|date/i, 0);

  // Find amount column
  const amtCol = findCol(header, /金額|配息|配發|股利|殖利|dividend|amount|每[股單]/i);
  if (amtCol === -1) {
    return { error: '找不到配息金額欄位（配息金額、每股配息、股利金額等），請確認 CSV 標題列' };
  }

  const dividends = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = cols[dateCol] ? cols[dateCol].trim() : '';
    const amount = parseNum(cols[amtCol]);
    if (isNaN(amount) || amount <= 0) continue;

    // Normalize date to 'YYYY-MM-DD' or 'YYYY-MM'
    const date = normalizeDividendDate(rawDate);
    if (!date) continue;

    dividends.push({ date, amount });
  }

  if (dividends.length === 0) {
    return { error: '無法解析任何配息資料，請確認 CSV 格式和日期/金額欄位' };
  }

  // Sort by date
  dividends.sort((a, b) => a.date.localeCompare(b.date));

  return { dividends };
}

/**
 * Normalize dividend date to 'YYYY-MM-DD' format.
 * Falls back to 'YYYY-MM' if only year/month available.
 */
function normalizeDividendDate(raw) {
  let m;
  // ROC full date: 112/01/15, 112-01-15, 112年01月15日
  m = raw.match(/^(\d{2,3})\s*[\/\-年]\s*(\d{1,2})\s*[\/\-月]\s*(\d{1,2})/);
  if (m && parseInt(m[1]) < 200) {
    const y = parseInt(m[1]) + 1911;
    return `${y}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[3])).padStart(2, '0')}`;
  }
  // ROC year/month only: 112/01, 112-01
  m = raw.match(/^(\d{2,3})\s*[\/\-年]\s*(\d{1,2})/);
  if (m && parseInt(m[1]) < 200) {
    const y = parseInt(m[1]) + 1911;
    return `${y}-${String(parseInt(m[2])).padStart(2, '0')}`;
  }
  // Western full date: 2024-01-15, 2024/01/15
  m = raw.match(/^(\d{4})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}-${String(parseInt(m[3])).padStart(2, '0')}`;
  // Western year/month: 2024-01, 2024/01
  m = raw.match(/^(\d{4})\s*[\/\-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(parseInt(m[2])).padStart(2, '0')}`;
  // Compact: 20240115 or 202401
  m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.match(/^(\d{4})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

// ---------------------------------------------------------------------------
// Data Persistence (localStorage)
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'etf_sim_';

/**
 * Save uploaded CSV data for an ETF to localStorage.
 * @param {string} ticker - ETF ticker
 * @param {string} dataType - 'price' or 'dividend'
 * @param {Object} data - parsed CSV data
 */
function saveUploadedData(ticker, dataType, data) {
  const key = `${STORAGE_PREFIX}${ticker}_${dataType}`;
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load previously saved CSV data from localStorage.
 * @param {string} ticker
 * @param {string} dataType - 'price' or 'dividend'
 * @returns {Object|null}
 */
function loadSavedData(ticker, dataType) {
  const key = `${STORAGE_PREFIX}${ticker}_${dataType}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear saved data for an ETF.
 * @param {string} ticker
 * @param {string} dataType - 'price' or 'dividend'
 */
function clearSavedData(ticker, dataType) {
  const key = `${STORAGE_PREFIX}${ticker}_${dataType}`;
  localStorage.removeItem(key);
}

/**
 * Merge uploaded dividend data into an ETF JSON object and return downloadable JSON string.
 * @param {Object} etfData - original JSON data
 * @param {Object|null} csvPriceData - parsed price CSV data
 * @param {Object|null} csvDividendData - parsed dividend CSV data
 * @returns {string} JSON string for download
 */
function buildMergedJSON(etfData, csvPriceData, csvDividendData) {
  const merged = {
    ticker: etfData.ticker,
    name: etfData.name,
    prices: etfData.prices || [],
    dividends: etfData.dividends || [],
    lastUpdated: new Date().toISOString().substring(0, 10),
  };

  // Merge dividend CSV data (replace duplicates by date, add new)
  if (csvDividendData && csvDividendData.dividends) {
    const existingDates = new Set(merged.dividends.map(d => d.date));
    for (const div of csvDividendData.dividends) {
      if (!existingDates.has(div.date)) {
        merged.dividends.push(div);
      }
    }
    merged.dividends.sort((a, b) => a.date.localeCompare(b.date));
  }

  return JSON.stringify(merged, null, 2);
}
