/**
 * UI controller — wires DOM elements to the Simulator engine
 */

let currentETFData = null;
let portfolioChart = null;
let dividendChart = null;

// --- DOM refs ---
const etfSelect = document.getElementById('etf-select');
const strategySelect = document.getElementById('strategy-select');
const dividendStrategySelect = document.getElementById('dividend-strategy');
const runBtn = document.getElementById('run-simulation');

const lumpGroup = document.getElementById('lump-sum-group');
const dcaDollarGroup = document.getElementById('dca-dollar-group');
const dcaShareGroup = document.getElementById('dca-share-group');
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

strategySelect.addEventListener('change', updateVisibleInputs);
dividendStrategySelect.addEventListener('change', updateDividendInputs);
updateVisibleInputs();
updateDividendInputs();

// --- Load ETF data ---
async function loadETFData(ticker) {
  try {
    const resp = await fetch(`data/${ticker}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    alert(`無法載入 ${ticker} 的資料：${e.message}`);
    return null;
  }
}

// --- Update date range based on data availability ---
async function updateDateRange() {
  const ticker = etfSelect.value;
  currentETFData = await loadETFData(ticker);
  if (!currentETFData || currentETFData.prices.length === 0) return;

  const dates = currentETFData.prices.map(p => p.date).sort();
  const minYM = dates[0].substring(0, 7);
  const maxYM = dates[dates.length - 1].substring(0, 7);

  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');
  startInput.min = minYM;
  startInput.max = maxYM;
  endInput.min = minYM;
  endInput.max = maxYM;

  // Set sensible defaults
  if (startInput.value < minYM) startInput.value = minYM;
  if (endInput.value > maxYM || endInput.value < minYM) endInput.value = maxYM;
  if (startInput.value > endInput.value) startInput.value = minYM;

  // Show notice if using sample data
  const notice = document.getElementById('data-notice');
  if (currentETFData.isSampleData) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

etfSelect.addEventListener('change', updateDateRange);

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
  if (!currentETFData) return;

  const strat = strategySelect.value;
  let amount;
  if (strat === 'lump-sum') amount = Number(document.getElementById('lump-sum-amount').value);
  else if (strat === 'dca-dollar') amount = Number(document.getElementById('dca-dollar-amount').value);
  else amount = Number(document.getElementById('dca-share-amount').value);

  const sim = new Simulator(currentETFData);
  const result = sim.run({
    strategy: strat,
    amount: amount,
    startDate: document.getElementById('start-date').value,
    endDate: document.getElementById('end-date').value,
    dividendStrategy: dividendStrategySelect.value,
    depositRate: Number(document.getElementById('deposit-rate').value),
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

  renderPortfolioChart(r.portfolioHistory);
  renderDividendChart(r.transactions);
  renderTransactionTable(r.transactions);

  // Scroll to results
  panel.scrollIntoView({ behavior: 'smooth' });
}

// --- Charts ---
function renderPortfolioChart(history) {
  const ctx = document.getElementById('portfolio-chart').getContext('2d');

  if (portfolioChart) portfolioChart.destroy();

  portfolioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.map(h => h.date),
      datasets: [
        {
          label: '總資產價值',
          data: history.map(h => h.totalValue),
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 8,
        },
        {
          label: '累計投入成本',
          data: history.map(h => h.invested),
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
          time: { unit: 'month', tooltipFormat: 'yyyy-MM-dd' },
          ticks: { maxTicksLimit: 12 },
        },
        y: {
          ticks: {
            callback: v => '$' + v.toLocaleString(),
          },
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

function renderDividendChart(transactions) {
  const ctx = document.getElementById('dividend-chart').getContext('2d');
  if (dividendChart) dividendChart.destroy();

  const divTx = transactions.filter(t => t.type === '股利再投入' || t.type === '股利入帳');
  if (divTx.length === 0) {
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
      labels: divTx.map(t => t.date),
      datasets: [{
        label: '股利金額',
        data: divTx.map(t => Math.round(t.amount)),
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
          time: { unit: 'quarter', tooltipFormat: 'yyyy-MM-dd' },
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

// --- Transaction table ---
function renderTransactionTable(transactions) {
  const tbody = document.querySelector('#transaction-table tbody');
  tbody.innerHTML = '';

  for (const t of transactions) {
    const tr = document.createElement('tr');
    const typeClass = t.type === '買入' ? 'type-buy' : 'type-dividend';
    tr.innerHTML = `
      <td>${t.date}</td>
      <td class="${typeClass}">${t.type}</td>
      <td>${typeof t.price === 'number' ? t.price.toFixed(2) : t.price}</td>
      <td>${typeof t.shares === 'number' ? t.shares.toLocaleString() : t.shares}</td>
      <td>$${Math.round(t.amount).toLocaleString()}</td>
      <td>$${Math.round(t.fee).toLocaleString()}</td>
      <td>${t.totalShares.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  }
}

// --- Init ---
updateDateRange();
