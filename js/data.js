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
  const dateCol = findCol(header, /日期|年月|date|月份|期間/i, 0);
  const highCol = findCol(header, /最高/);
  const lowCol  = findCol(header, /最低/);
  const avgCol  = findCol(header, /加權|平均/);

  if (highCol === -1 && lowCol === -1 && avgCol === -1) {
    return { error: '找不到價格欄位（最高價、最低價、加權平均價），請確認 CSV 標題列' };
  }

  // Accumulate per month
  const monthly = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = cols[dateCol] ? cols[dateCol].trim() : '';
    const ym = normalizeToYM(rawDate);
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
