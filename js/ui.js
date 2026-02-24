/**
 * UI controller — wires DOM elements to the Simulator engine.
 * Supports both JSON data and user-uploaded CSV (price + dividend).
 * Persists uploaded data to localStorage so users don't re-upload each visit.
 * Runs all 3 dividend strategies and renders comparison chart.
 */

let currentETFData = null;       // JSON data (prices + dividends)
let currentCSVData = null;       // Parsed CSV price data (monthly prices) or null
let currentDividendCSV = null;   // Parsed CSV dividend data or null
let portfolioChart = null;
let dividendChart = null;

const DIVIDEND_STRATEGIES = [
  { key: 'reinvest', label: '股利再投入', color: '#1a73e8' },
  { key: 'deposit',  label: '股利定存',   color: '#0d9488' },
  { key: 'consumed', label: '股利花掉',   color: '#f59e0b' },
];

// --- DOM refs ---
const etfSelect              = document.getElementById('etf-select');
const priceTypeSelect        = document.getElementById('price-type-select');
const strategySelect         = document.getElementById('strategy-select');
const dividendStrategySelect = document.getElementById('dividend-strategy');
const runBtn                 = document.getElementById('run-simulation');
const csvUpload              = document.getElementById('csv-upload');
const csvStatus              = document.getElementById('csv-status');
const priceTypeNote          = document.getElementById('price-type-note');
const dividendCsvUpload      = document.getElementById('dividend-csv-upload');
const dividendCsvStatus      = document.getElementById('dividend-csv-status');
const btnSaveData            = document.getElementById('btn-save-data');
const btnClearData           = document.getElementById('btn-clear-data');
const btnDownloadJson        = document.getElementById('btn-download-json');
const persistStatus          = document.getElementById('persist-status');

const lumpGroup        = document.getElementById('lump-sum-group');
const dcaDollarGroup   = document.getElementById('dca-dollar-group');
const dcaShareGroup    = document.getElementById('dca-share-group');
const depositRateGroup = document.getElementById('deposit-rate-group');

// --- Show/hide helpers ---
function updateVisibleInputs() {
  const strat = strategySelect.value;
  lumpGroup.classList.toggle('hidden', strat !== 'lump-sum');
  dcaDollarGroup.classList.toggle('hidden', strat !== 'dca-dollar');
  dcaShareGroup.classList.toggle('hidden', strat !== 'dca-share');
}

function updateDividendInputs() {
  depositRateGroup.classList.toggle('hidden', dividendStrategySelect.value !== 'deposit');
}

function updatePriceTypeNote() {
  if (currentCSVData) {
    priceTypeNote.classList.add('hidden');
  } else {
    priceTypeNote.classList.remove('hidden');
  }
}

function updatePersistStatus() {
  const ticker = etfSelect.value;
  const hasSavedPrice = !!loadSavedData(ticker, 'price');
  const hasSavedDiv   = !!loadSavedData(ticker, 'dividend');
  if (hasSavedPrice || hasSavedDiv) {
    const parts = [];
    if (hasSavedPrice) parts.push('價格');
    if (hasSavedDiv) parts.push('配息');
    persistStatus.textContent = `💾 已儲存：${parts.join(' + ')} 資料`;
    persistStatus.className = 'persist-status persist-ok';
  } else {
    persistStatus.textContent = '';
    persistStatus.className = 'persist-status';
  }
}

strategySelect.addEventListener('change', updateVisibleInputs);
dividendStrategySelect.addEventListener('change', updateDividendInputs);
updateVisibleInputs();
updateDividendInputs();

// --- Price CSV Upload ---
csvUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    currentCSVData = null;
    csvStatus.textContent = '';
    csvStatus.className = 'csv-status';
    updatePriceTypeNote();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = parseETFCSV(reader.result);
    if (result.error) {
      currentCSVData = null;
      csvStatus.textContent = '❌ ' + result.error;
      csvStatus.className = 'csv-status csv-error';
    } else {
      currentCSVData = result;
      const months = result.prices.length;
      const from = result.prices[0].date;
      const to = result.prices[months - 1].date;
      csvStatus.textContent = `✅ 已載入 ${months} 個月的資料（${from} ~ ${to}）`;
      csvStatus.className = 'csv-status csv-ok';

      const startInput = document.getElementById('start-date');
      const endInput = document.getElementById('end-date');
      startInput.min = from;
      startInput.max = to;
      endInput.min = from;
      endInput.max = to;
      if (startInput.value < from || startInput.value > to) startInput.value = from;
      if (endInput.value > to || endInput.value < from) endInput.value = to;
    }
    updatePriceTypeNote();
  };
  reader.readAsText(file);
});

// --- Dividend CSV Upload ---
dividendCsvUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    currentDividendCSV = null;
    dividendCsvStatus.textContent = '';
    dividendCsvStatus.className = 'csv-status';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = parseDividendCSV(reader.result);
    if (result.error) {
      currentDividendCSV = null;
      dividendCsvStatus.textContent = '❌ ' + result.error;
      dividendCsvStatus.className = 'csv-status csv-error';
    } else {
      currentDividendCSV = result;
      const count = result.dividends.length;
      const from = result.dividends[0].date;
      const to = result.dividends[count - 1].date;
      dividendCsvStatus.textContent = `✅ 已載入 ${count} 筆配息紀錄（${from} ~ ${to}）`;
      dividendCsvStatus.className = 'csv-status csv-ok';
    }
  };
  reader.readAsText(file);
});

// Clear CSV when ETF selection changes
etfSelect.addEventListener('change', () => {
  currentCSVData = null;
  currentDividendCSV = null;
  csvUpload.value = '';
  dividendCsvUpload.value = '';
  csvStatus.textContent = '';
  csvStatus.className = 'csv-status';
  dividendCsvStatus.textContent = '';
  dividendCsvStatus.className = 'csv-status';
  updatePriceTypeNote();
  updateDateRange();
  loadPersistedData();
});

// --- Data Persistence Buttons ---
btnSaveData.addEventListener('click', () => {
  const ticker = etfSelect.value;
  let saved = false;
  if (currentCSVData) {
    saveUploadedData(ticker, 'price', currentCSVData);
    saved = true;
  }
  if (currentDividendCSV) {
    saveUploadedData(ticker, 'dividend', currentDividendCSV);
    saved = true;
  }
  if (saved) {
    persistStatus.textContent = '✅ 資料已儲存，下次開啟將自動載入';
    persistStatus.className = 'persist-status persist-ok';
  } else {
    persistStatus.textContent = '⚠️ 沒有上傳的資料可儲存';
    persistStatus.className = 'persist-status persist-warn';
  }
  setTimeout(updatePersistStatus, 3000);
});

btnClearData.addEventListener('click', () => {
  const ticker = etfSelect.value;
  clearSavedData(ticker, 'price');
  clearSavedData(ticker, 'dividend');
  persistStatus.textContent = '🗑️ 已清除儲存的資料';
  persistStatus.className = 'persist-status';
  setTimeout(updatePersistStatus, 3000);
});

btnDownloadJson.addEventListener('click', async () => {
  const ticker = etfSelect.value;
  if (!currentETFData) {
    await updateDateRange();
  }
  if (!currentETFData) {
    alert('無法載入基礎 JSON 資料');
    return;
  }

  const jsonStr = buildMergedJSON(currentETFData, currentCSVData, currentDividendCSV);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticker}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// --- Load persisted data from localStorage ---
function loadPersistedData() {
  const ticker = etfSelect.value;

  const savedPrice = loadSavedData(ticker, 'price');
  if (savedPrice && !currentCSVData) {
    currentCSVData = savedPrice;
    const months = savedPrice.prices.length;
    const from = savedPrice.prices[0].date;
    const to = savedPrice.prices[months - 1].date;
    csvStatus.textContent = `💾 自動載入 ${months} 個月價格資料（${from} ~ ${to}）`;
    csvStatus.className = 'csv-status csv-ok';

    const startInput = document.getElementById('start-date');
    const endInput = document.getElementById('end-date');
    startInput.min = from;
    startInput.max = to;
    endInput.min = from;
    endInput.max = to;
    if (startInput.value < from || startInput.value > to) startInput.value = from;
    if (endInput.value > to || endInput.value < from) endInput.value = to;
  }

  const savedDiv = loadSavedData(ticker, 'dividend');
  if (savedDiv && !currentDividendCSV) {
    currentDividendCSV = savedDiv;
    const count = savedDiv.dividends.length;
    const from = savedDiv.dividends[0].date;
    const to = savedDiv.dividends[count - 1].date;
    dividendCsvStatus.textContent = `💾 自動載入 ${count} 筆配息紀錄（${from} ~ ${to}）`;
    dividendCsvStatus.className = 'csv-status csv-ok';
  }

  updatePriceTypeNote();
  updatePersistStatus();
}

// --- Load ETF JSON data ---
async function loadETFData(ticker) {
  try {
    const resp = await fetch(`data/${ticker}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.warn(`無法載入 ${ticker} JSON 資料：${e.message}`);
    return null;
  }
}

// --- Update date range based on data availability ---
async function updateDateRange() {
  const ticker = etfSelect.value;
  currentETFData = await loadETFData(ticker);

  if (!currentETFData || currentETFData.prices.length === 0) {
    if (currentCSVData) {
      currentETFData = {
        ticker: ticker,
        name: ETF_INFO[ticker]?.name || ticker,
        prices: [],
        dividends: [],
      };
    } else {
      const notice = document.getElementById('data-notice');
      notice.classList.remove('hidden');
      return;
    }
  }

  if (!currentCSVData) {
    const dates = currentETFData.prices.map(p => p.date).sort();
    if (dates.length > 0) {
      const minYM = dates[0].substring(0, 7);
      const maxYM = dates[dates.length - 1].substring(0, 7);

      const startInput = document.getElementById('start-date');
      const endInput = document.getElementById('end-date');
      startInput.min = minYM;
      startInput.max = maxYM;
      endInput.min = minYM;
      endInput.max = maxYM;

      if (startInput.value < minYM) startInput.value = minYM;
      if (endInput.value > maxYM || endInput.value < minYM) endInput.value = maxYM;
      if (startInput.value > endInput.value) startInput.value = minYM;
    }
  }

  const notice = document.getElementById('data-notice');
  if (currentETFData.isSampleData) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

// --- Format helpers ---
function fmt(n) {
  return Math.round(n).toLocaleString('zh-TW');
}

function fmtPct(n) {
  return n.toFixed(2) + '%';
}

// --- Run simulation ---
runBtn.addEventListener('click', async () => {
  if (!currentETFData) {
    await updateDateRange();
  }

  if (!currentETFData && !currentCSVData) {
    alert('無法載入資料。請上傳 CSV 檔案，或確認 data/ 資料夾中有對應的 JSON 檔案。\n\n提示：如果直接開啟 HTML 檔案，瀏覽器可能阻擋資料載入。請嘗試使用本地伺服器（如 python -m http.server）。');
    return;
  }

  if (!currentETFData) {
    currentETFData = {
      ticker: etfSelect.value,
      name: ETF_INFO[etfSelect.value]?.name || etfSelect.value,
      prices: [],
      dividends: [],
    };
  }

  const strat = strategySelect.value;
  let amount;
  if (strat === 'lump-sum') amount = Number(document.getElementById('lump-sum-amount').value);
  else if (strat === 'dca-dollar') amount = Number(document.getElementById('dca-dollar-amount').value);
  else amount = Number(document.getElementById('dca-share-amount').value);

  const selectedDivStrategy = dividendStrategySelect.value;
  const depositRate = Number(document.getElementById('deposit-rate').value);

  const baseParams = {
    strategy: strat,
    amount: amount,
    startDate: document.getElementById('start-date').value,
    endDate: document.getElementById('end-date').value,
    depositRate: depositRate,
    priceType: priceTypeSelect.value,
  };

  // Run all 3 dividend strategies for comparison chart
  const allResults = {};
  for (const ds of DIVIDEND_STRATEGIES) {
    const sim = new Simulator(currentETFData, currentCSVData, currentDividendCSV);
    const result = sim.run({ ...baseParams, dividendStrategy: ds.key });
    if (result.error) {
      alert(result.error);
      return;
    }
    allResults[ds.key] = result;
  }

  const selectedResult = allResults[selectedDivStrategy];

  renderResults(selectedResult, allResults, selectedDivStrategy);
});

// --- Render results ---
function renderResults(r, allResults, selectedStrategy) {
  const panel = document.getElementById('results-panel');
  panel.classList.remove('hidden');

  // Summary cards — show selected strategy
  document.getElementById('total-cost').textContent = `$${fmt(r.totalInvested)}`;
  document.getElementById('market-value').textContent = `$${fmt(r.finalMarketValue)}`;
  document.getElementById('total-dividends').textContent = `$${fmt(r.totalDividendReceived)}`;

  const assetEl = document.getElementById('total-assets');
  assetEl.textContent = `$${fmt(r.totalAssets)}`;

  const returnEl = document.getElementById('total-return');
  returnEl.textContent = fmtPct(r.totalReturn);
  returnEl.className = 'card-value ' + (r.totalReturn >= 0 ? 'positive' : 'negative');

  const annRetEl = document.getElementById('annualized-return');
  annRetEl.textContent = fmtPct(r.annualizedReturn);
  annRetEl.className = 'card-value ' + (r.annualizedReturn >= 0 ? 'positive' : 'negative');

  renderPortfolioChart(allResults, selectedStrategy);
  renderDividendChart(allResults, selectedStrategy);
  renderMonthlyTable(r.monthlyDetails);

  panel.scrollIntoView({ behavior: 'smooth' });
}

// --- Charts ---
function renderPortfolioChart(allResults, selectedStrategy) {
  const ctx = document.getElementById('portfolio-chart').getContext('2d');
  if (portfolioChart) portfolioChart.destroy();

  // Build one dataset per strategy; highlight selected, dim others
  const datasets = [];

  // Add cost baseline (always shown, dashed grey)
  const anyDetails = allResults[DIVIDEND_STRATEGIES[0].key].monthlyDetails;
  datasets.push({
    label: '累計投入成本',
    data: anyDetails.map(d => d.totalInvested),
    borderColor: '#94a3b8',
    borderDash: [5, 5],
    fill: false,
    tension: 0,
    pointRadius: 0,
    pointHitRadius: 8,
    borderWidth: 1.5,
    order: 10,
  });

  for (const ds of DIVIDEND_STRATEGIES) {
    const isSelected = ds.key === selectedStrategy;
    const details = allResults[ds.key].monthlyDetails;
    datasets.push({
      label: ds.label,
      data: details.map(d => d.totalValue),
      borderColor: ds.color,
      backgroundColor: isSelected ? hexToRgba(ds.color, 0.08) : 'transparent',
      fill: isSelected,
      tension: 0.3,
      pointRadius: 0,
      pointHitRadius: 8,
      borderWidth: isSelected ? 3 : 1.5,
      borderDash: isSelected ? [] : [4, 4],
      order: isSelected ? 0 : 5,
    });
  }

  portfolioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: anyDetails.map(d => d.month + '-01'),
      datasets: datasets,
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', tooltipFormat: 'yyyy-MM' },
          ticks: { maxTicksLimit: 12 },
        },
        y: {
          ticks: { callback: v => '$' + v.toLocaleString() },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: $${Math.round(ctx.parsed.y).toLocaleString()}`,
          },
        },
      },
    },
  });
}

function renderDividendChart(allResults, selectedStrategy) {
  const ctx = document.getElementById('dividend-chart').getContext('2d');
  if (dividendChart) dividendChart.destroy();

  // Build datasets for each strategy's cumulative dividends
  const anyDetails = allResults[DIVIDEND_STRATEGIES[0].key].monthlyDetails;

  // Check if any strategy has dividends
  let hasDividends = false;
  for (const ds of DIVIDEND_STRATEGIES) {
    if (allResults[ds.key].totalDividendReceived > 0) { hasDividends = true; break; }
  }

  if (!hasDividends) {
    dividendChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['無股利紀錄'], datasets: [{ data: [0] }] },
      options: { plugins: { legend: { display: false } } },
    });
    return;
  }

  // Show cumulative dividend value (reinvest=market value of div shares, deposit=balance, consumed=cash out)
  const datasets = [];
  for (const ds of DIVIDEND_STRATEGIES) {
    const isSelected = ds.key === selectedStrategy;
    const details = allResults[ds.key].monthlyDetails;

    // Cumulative dividend received
    let cumDiv = 0;
    const cumData = details.map(d => {
      cumDiv += d.dividendReceived;
      return cumDiv;
    });

    datasets.push({
      label: ds.label,
      data: cumData,
      borderColor: ds.color,
      backgroundColor: isSelected ? hexToRgba(ds.color, 0.15) : 'transparent',
      fill: isSelected,
      tension: 0.3,
      pointRadius: 0,
      pointHitRadius: 8,
      borderWidth: isSelected ? 3 : 1.5,
      borderDash: isSelected ? [] : [4, 4],
      order: isSelected ? 0 : 5,
    });
  }

  dividendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: anyDetails.map(d => d.month + '-01'),
      datasets: datasets,
    },
    options: {
      responsive: true,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'quarter', tooltipFormat: 'yyyy-MM' },
        },
        y: {
          ticks: { callback: v => '$' + v.toLocaleString() },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: $${Math.round(ctx.parsed.y).toLocaleString()}`,
          },
        },
      },
    },
  });
}

// --- Utility ---
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// --- Monthly Transaction Details Table (selected strategy only) ---
function renderMonthlyTable(details) {
  const tbody = document.querySelector('#monthly-table tbody');
  tbody.innerHTML = '';

  for (const d of details) {
    const tr = document.createElement('tr');
    const returnPct = d.totalInvested > 0
      ? ((d.totalValue - d.totalInvested) / d.totalInvested * 100)
      : 0;
    const returnClass = returnPct >= 0 ? 'positive' : 'negative';

    tr.innerHTML = `
      <td>${d.month}</td>
      <td>${d.buyPrice.toFixed(2)}</td>
      <td>${d.sharesBought > 0 ? d.sharesBought.toLocaleString() : '-'}${d.dividendShares > 0 ? ' (+' + d.dividendShares + '息)' : ''}</td>
      <td>${d.investment > 0 ? '$' + d.investment.toLocaleString() : '-'}</td>
      <td>${d.buyFee > 0 ? '$' + d.buyFee.toLocaleString() : '-'}</td>
      <td>${d.dividendReceived > 0 ? '$' + d.dividendReceived.toLocaleString() : '-'}</td>
      <td>${d.totalShares.toLocaleString()}</td>
      <td>$${d.totalInvested.toLocaleString()}</td>
      <td>$${d.marketValue.toLocaleString()}</td>
      <td class="${returnClass}">${returnPct.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  }
}

// --- Init ---
updateDateRange().then(() => {
  loadPersistedData();
});
updatePriceTypeNote();
