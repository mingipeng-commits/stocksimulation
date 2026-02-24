/**
 * UI controller — wires DOM elements to the Simulator engine.
 * Supports both JSON data and user-uploaded CSV.
 */

let currentETFData = null;   // JSON data (prices + dividends)
let currentCSVData = null;   // Parsed CSV data (monthly prices) or null
let portfolioChart = null;
let dividendChart = null;

// --- DOM refs ---
const etfSelect             = document.getElementById('etf-select');
const priceTypeSelect       = document.getElementById('price-type-select');
const strategySelect        = document.getElementById('strategy-select');
const dividendStrategySelect = document.getElementById('dividend-strategy');
const runBtn                = document.getElementById('run-simulation');
const csvUpload             = document.getElementById('csv-upload');
const csvStatus             = document.getElementById('csv-status');
const priceTypeNote         = document.getElementById('price-type-note');

const lumpGroup       = document.getElementById('lump-sum-group');
const dcaDollarGroup  = document.getElementById('dca-dollar-group');
const dcaShareGroup   = document.getElementById('dca-share-group');
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

strategySelect.addEventListener('change', updateVisibleInputs);
dividendStrategySelect.addEventListener('change', updateDividendInputs);
updateVisibleInputs();
updateDividendInputs();

// --- CSV Upload ---
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

      // Update date range inputs to match CSV
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

// Clear CSV when ETF selection changes
etfSelect.addEventListener('change', () => {
  currentCSVData = null;
  csvUpload.value = '';
  csvStatus.textContent = '';
  csvStatus.className = 'csv-status';
  updatePriceTypeNote();
  updateDateRange();
});

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
    // If JSON fails but we have CSV, create a minimal etfData stub
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
    // Set date range from JSON data
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

  // Show notice if using sample data
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
  // Ensure data is loaded
  if (!currentETFData) {
    await updateDateRange();
  }

  // If still no JSON data and no CSV, show error
  if (!currentETFData && !currentCSVData) {
    alert('無法載入資料。請上傳 CSV 檔案，或確認 data/ 資料夾中有對應的 JSON 檔案。\n\n提示：如果直接開啟 HTML 檔案，瀏覽器可能阻擋資料載入。請嘗試使用本地伺服器（如 python -m http.server）。');
    return;
  }

  // Create a minimal stub if JSON failed but CSV is available
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

  const sim = new Simulator(currentETFData, currentCSVData);
  const result = sim.run({
    strategy: strat,
    amount: amount,
    startDate: document.getElementById('start-date').value,
    endDate: document.getElementById('end-date').value,
    dividendStrategy: dividendStrategySelect.value,
    depositRate: Number(document.getElementById('deposit-rate').value),
    priceType: priceTypeSelect.value,
  });

  if (result.error) {
    alert(result.error);
    return;
  }

  renderResults(result);
});

// --- Render results ---
function renderResults(r) {
  const panel = document.getElementById('results-panel');
  panel.classList.remove('hidden');

  // Summary cards
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

  renderPortfolioChart(r.monthlyDetails);
  renderDividendChart(r.monthlyDetails);
  renderMonthlyTable(r.monthlyDetails);

  // Scroll to results
  panel.scrollIntoView({ behavior: 'smooth' });
}

// --- Charts ---
function renderPortfolioChart(details) {
  const ctx = document.getElementById('portfolio-chart').getContext('2d');
  if (portfolioChart) portfolioChart.destroy();

  portfolioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: details.map(d => d.month + '-01'), // need date-like string for time axis
      datasets: [
        {
          label: '總資產價值',
          data: details.map(d => d.totalValue),
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
        },
        {
          label: '累計投入成本',
          data: details.map(d => d.totalInvested),
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHitRadius: 8,
        },
      ],
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

function renderDividendChart(details) {
  const ctx = document.getElementById('dividend-chart').getContext('2d');
  if (dividendChart) dividendChart.destroy();

  const divMonths = details.filter(d => d.dividendReceived > 0);

  if (divMonths.length === 0) {
    dividendChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['無股利紀錄'], datasets: [{ data: [0] }] },
      options: { plugins: { legend: { display: false } } },
    });
    return;
  }

  dividendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: divMonths.map(d => d.month + '-01'),
      datasets: [{
        label: '股利金額',
        data: divMonths.map(d => d.dividendReceived),
        backgroundColor: 'rgba(13,148,136,0.65)',
        borderColor: '#0d9488',
        borderWidth: 1,
      }],
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
            label: ctx => `$${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
    },
  });
}

// --- Monthly Transaction Details Table ---
function renderMonthlyTable(details) {
  const tbody = document.querySelector('#monthly-table tbody');
  tbody.innerHTML = '';

  for (const d of details) {
    const tr = document.createElement('tr');
    const returnPct = d.totalInvested > 0
      ? ((d.totalValue - d.totalInvested) / d.totalInvested * 100)
      : 0;
    const returnClass = returnPct >= 0 ? 'positive' : 'negative';

    // Highlight rows with activity (buy or dividend)
    const hasActivity = d.sharesBought > 0 || d.dividendReceived > 0;

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
updateDateRange();
updatePriceTypeNote();
