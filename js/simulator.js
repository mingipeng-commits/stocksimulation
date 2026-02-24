/**
 * Stock Investment Simulator Engine
 *
 * Transaction costs:
 *   Buy:  0.1425% commission
 *   Sell: 0.1425% commission + 0.1% securities transaction tax
 *
 * Supports two data sources:
 *   1. JSON daily prices (data/*.json) — uses close price
 *   2. CSV monthly prices (user-uploaded) — uses 最高價/最低價/加權平均價
 */

const COST = {
  BUY_COMMISSION: 0.001425,
  SELL_COMMISSION: 0.001425,
  SELL_TAX: 0.001,
};

class Simulator {
  /**
   * @param {Object} etfData - JSON data {prices: [{date, close}], dividends: [{date, amount}]}
   * @param {Object|null} csvData - parsed CSV {prices: [{date:'YYYY-MM', high, low, avg}]}
   * @param {Object|null} dividendCSV - parsed dividend CSV {dividends: [{date, amount}]}
   */
  constructor(etfData, csvData = null, dividendCSV = null) {
    this.jsonPrices = etfData.prices || [];
    this.dividends  = this._mergeDividends(etfData.dividends || [], dividendCSV);
    this.ticker     = etfData.ticker;
    this.csvData    = csvData;
  }

  /**
   * Merge JSON dividends with uploaded CSV dividends.
   * CSV dividends take priority for the same month; new dates are added.
   */
  _mergeDividends(jsonDividends, dividendCSV) {
    if (!dividendCSV || !dividendCSV.dividends || dividendCSV.dividends.length === 0) {
      return jsonDividends;
    }

    // Build a map of existing dividends by YYYY-MM (month level)
    const merged = new Map();
    for (const d of jsonDividends) {
      const ym = d.date.substring(0, 7);
      merged.set(ym, d);
    }

    // CSV dividends override or add new entries
    for (const d of dividendCSV.dividends) {
      const ym = d.date.substring(0, 7);
      merged.set(ym, d);
    }

    return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Build a Map<'YYYY-MM', number> of monthly buy prices.
   * If CSV data is available, use the selected priceType column.
   * Otherwise, use the first trading day's close from JSON.
   */
  _buildMonthlyPrices(priceType) {
    const mp = new Map();

    if (this.csvData && this.csvData.prices) {
      for (const p of this.csvData.prices) {
        const val = p[priceType];
        if (val != null && !isNaN(val)) {
          mp.set(p.date, val);
        }
      }
    } else {
      // From JSON daily data: first trading day's close per month
      const sorted = [...this.jsonPrices].sort((a, b) => a.date.localeCompare(b.date));
      for (const p of sorted) {
        const ym = p.date.substring(0, 7);
        if (!mp.has(ym)) {
          mp.set(ym, p.close);
        }
      }
    }

    return mp;
  }

  /**
   * Build a Map<'YYYY-MM', number> for end-of-month valuation.
   * CSV: use avg price (most representative). JSON: last trading day's close.
   */
  _buildValuationPrices() {
    const vp = new Map();

    if (this.csvData && this.csvData.prices) {
      for (const p of this.csvData.prices) {
        // For valuation, prefer avg, fallback to high/low midpoint
        const val = p.avg != null ? p.avg
                  : (p.high != null && p.low != null) ? (p.high + p.low) / 2
                  : p.high || p.low;
        if (val != null) vp.set(p.date, val);
      }
    } else {
      const sorted = [...this.jsonPrices].sort((a, b) => a.date.localeCompare(b.date));
      for (const p of sorted) {
        const ym = p.date.substring(0, 7);
        vp.set(ym, p.close); // keeps overwriting → last day of month
      }
    }

    return vp;
  }

  /**
   * Run a simulation.
   * @param {Object} params
   * @param {string} params.strategy       - 'lump-sum' | 'dca-dollar' | 'dca-share'
   * @param {number} params.amount         - dollar amount or share count
   * @param {string} params.startDate      - 'YYYY-MM'
   * @param {string} params.endDate        - 'YYYY-MM'
   * @param {string} params.dividendStrategy - 'reinvest' | 'deposit'
   * @param {number} params.depositRate    - annual rate (e.g. 1.5 for 1.5%)
   * @param {string} params.priceType      - 'high' | 'low' | 'avg' (CSV) or ignored (JSON)
   * @returns {Object} simulation results
   */
  run(params) {
    const { strategy, amount, startDate, endDate, dividendStrategy, depositRate, priceType } = params;

    const buyPrices = this._buildMonthlyPrices(priceType || 'avg');
    const valPrices = this._buildValuationPrices();

    // Get months in range that have price data
    const allMonths = [...buyPrices.keys()]
      .filter(ym => ym >= startDate && ym <= endDate)
      .sort();

    if (allMonths.length === 0) {
      return { error: '所選日期範圍內沒有可用的價格資料' };
    }

    // Build dividend lookup: month → [{date, amount}]
    const divByMonth = new Map();
    for (const d of this.dividends) {
      const ym = d.date.substring(0, 7);
      if (ym >= startDate && ym <= endDate) {
        if (!divByMonth.has(ym)) divByMonth.set(ym, []);
        divByMonth.get(ym).push(d);
      }
    }

    // State
    let totalShares = 0;
    let totalInvested = 0;
    let totalFees = 0;
    let totalDividendReceived = 0;
    let depositBalance = 0;
    const monthlyDetails = [];

    for (const ym of allMonths) {
      const buyPrice = buyPrices.get(ym);
      const valPrice = valPrices.get(ym) || buyPrice;

      let monthSharesBought = 0;
      let monthInvestment = 0;
      let monthBuyFee = 0;
      let monthDividend = 0;
      let monthDivShares = 0;

      // --- Handle dividends in this month ---
      const monthDivs = divByMonth.get(ym) || [];
      for (const div of monthDivs) {
        if (totalShares > 0) {
          const divAmount = totalShares * div.amount;
          totalDividendReceived += divAmount;
          monthDividend += divAmount;

          if (dividendStrategy === 'reinvest') {
            const divShares = Math.floor(divAmount / buyPrice);
            if (divShares > 0) {
              const cost = divShares * buyPrice;
              const fee = Math.floor(cost * COST.BUY_COMMISSION);
              totalShares += divShares;
              totalFees += fee;
              monthDivShares += divShares;
            }
          } else {
            depositBalance += divAmount;
          }
        }
      }

      // --- Buy shares ---
      if (strategy === 'lump-sum') {
        if (ym === allMonths[0]) {
          const sharesToBuy = Math.floor(amount / buyPrice);
          if (sharesToBuy > 0) {
            const cost = sharesToBuy * buyPrice;
            const fee = Math.floor(cost * COST.BUY_COMMISSION);
            totalShares += sharesToBuy;
            totalInvested += cost + fee;
            totalFees += fee;
            monthSharesBought = sharesToBuy;
            monthInvestment = cost + fee;
            monthBuyFee = fee;
          }
        }
      } else if (strategy === 'dca-dollar') {
        const sharesToBuy = Math.floor(amount / buyPrice);
        if (sharesToBuy > 0) {
          const cost = sharesToBuy * buyPrice;
          const fee = Math.floor(cost * COST.BUY_COMMISSION);
          totalShares += sharesToBuy;
          totalInvested += cost + fee;
          totalFees += fee;
          monthSharesBought = sharesToBuy;
          monthInvestment = cost + fee;
          monthBuyFee = fee;
        }
      } else if (strategy === 'dca-share') {
        const sharesToBuy = amount;
        const cost = sharesToBuy * buyPrice;
        const fee = Math.floor(cost * COST.BUY_COMMISSION);
        totalShares += sharesToBuy;
        totalInvested += cost + fee;
        totalFees += fee;
        monthSharesBought = sharesToBuy;
        monthInvestment = cost + fee;
        monthBuyFee = fee;
      }

      // --- Apply monthly interest on deposit ---
      if (dividendStrategy === 'deposit' && depositBalance > 0) {
        const monthlyRate = (depositRate / 100) / 12;
        depositBalance *= (1 + monthlyRate);
      }

      // --- Record monthly details ---
      const marketValue = totalShares * valPrice;

      monthlyDetails.push({
        month: ym,
        buyPrice: buyPrice,
        sharesBought: monthSharesBought,
        investment: Math.round(monthInvestment),
        buyFee: Math.round(monthBuyFee),
        dividendReceived: Math.round(monthDividend),
        dividendShares: monthDivShares,
        totalShares: totalShares,
        totalInvested: Math.round(totalInvested),
        depositBalance: Math.round(depositBalance),
        marketValue: Math.round(marketValue),
        totalValue: Math.round(marketValue + depositBalance),
      });
    }

    // Final calculations
    const last = monthlyDetails[monthlyDetails.length - 1];
    const finalMarketValue = last.marketValue;
    const sellFee = Math.floor(finalMarketValue * (COST.SELL_COMMISSION + COST.SELL_TAX));
    const netProceeds = finalMarketValue - sellFee;
    const totalAssets = netProceeds + Math.round(depositBalance);
    const totalReturn = totalInvested > 0
      ? ((totalAssets - totalInvested) / totalInvested) * 100 : 0;

    // Annualized return
    const firstMonth = allMonths[0];
    const lastMonth = allMonths[allMonths.length - 1];
    const y1 = parseInt(firstMonth.substring(0, 4));
    const m1 = parseInt(firstMonth.substring(5, 7));
    const y2 = parseInt(lastMonth.substring(0, 4));
    const m2 = parseInt(lastMonth.substring(5, 7));
    const years = ((y2 - y1) * 12 + (m2 - m1)) / 12;
    const annualizedReturn = (years > 0 && totalInvested > 0)
      ? (Math.pow(totalAssets / totalInvested, 1 / years) - 1) * 100
      : 0;

    return {
      totalInvested: Math.round(totalInvested),
      finalMarketValue: Math.round(finalMarketValue),
      totalDividendReceived: Math.round(totalDividendReceived),
      depositBalance: Math.round(depositBalance),
      sellFee: Math.round(sellFee),
      totalFees: Math.round(totalFees),
      totalAssets: Math.round(totalAssets),
      totalReturn: totalReturn,
      annualizedReturn: annualizedReturn,
      totalShares: totalShares,
      monthlyDetails: monthlyDetails,
      years: years,
      usingCSV: !!(this.csvData && this.csvData.prices),
    };
  }
}
