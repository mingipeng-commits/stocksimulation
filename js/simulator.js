/**
 * Stock Investment Simulator Engine
 *
 * Transaction costs:
 *   Buy:  0.1425% commission
 *   Sell: 0.1425% commission + 0.1% securities transaction tax
 */

const COST = {
  BUY_COMMISSION: 0.001425,
  SELL_COMMISSION: 0.001425,
  SELL_TAX: 0.001,
};

class Simulator {
  constructor(etfData) {
    this.prices = etfData.prices; // [{date, close}, ...]
    this.dividends = etfData.dividends; // [{date, amount}, ...]
    this.ticker = etfData.ticker;
  }

  /**
   * Run a simulation with the given parameters.
   * @param {Object} params
   * @param {string} params.strategy - 'lump-sum' | 'dca-dollar' | 'dca-share'
   * @param {number} params.amount - dollar amount or share count depending on strategy
   * @param {string} params.startDate - 'YYYY-MM'
   * @param {string} params.endDate - 'YYYY-MM'
   * @param {string} params.dividendStrategy - 'reinvest' | 'deposit'
   * @param {number} params.depositRate - annual rate for fixed deposit (e.g. 1.5 for 1.5%)
   * @returns {Object} simulation results
   */
  run(params) {
    const { strategy, amount, startDate, endDate, dividendStrategy, depositRate } = params;

    const startYM = startDate;     // 'YYYY-MM'
    const endYM = endDate;         // 'YYYY-MM'

    // Build lookup structures
    const priceByDate = new Map();
    for (const p of this.prices) {
      priceByDate.set(p.date, p.close);
    }

    // Get sorted unique months in range
    const allDates = this.prices
      .map(p => p.date)
      .filter(d => {
        const ym = d.substring(0, 7);
        return ym >= startYM && ym <= endYM;
      })
      .sort();

    if (allDates.length === 0) {
      return { error: '所選日期範圍內沒有可用的價格資料' };
    }

    // Group dates by month, pick the first trading day of each month
    const monthFirstDay = new Map();
    for (const d of allDates) {
      const ym = d.substring(0, 7);
      if (!monthFirstDay.has(ym)) {
        monthFirstDay.set(ym, d);
      }
    }

    // Get dividends in range
    const dividendsInRange = this.dividends.filter(d => {
      const ym = d.date.substring(0, 7);
      return ym >= startYM && ym <= endYM;
    });

    // State
    let totalShares = 0;
    let totalInvested = 0;        // total cash put in (before fees)
    let totalFees = 0;
    let totalDividendReceived = 0;
    let depositBalance = 0;       // cash from dividends if not reinvesting
    const transactions = [];
    const portfolioHistory = [];  // [{date, totalValue, invested, shares}]

    // Process each month
    const months = [...monthFirstDay.keys()].sort();

    for (const ym of months) {
      const buyDate = monthFirstDay.get(ym);
      const buyPrice = priceByDate.get(buyDate);

      // --- Handle dividends that fall in this month ---
      const monthDividends = dividendsInRange.filter(d => d.date.substring(0, 7) === ym);
      for (const div of monthDividends) {
        if (totalShares > 0) {
          const divAmount = totalShares * div.amount;
          totalDividendReceived += divAmount;

          if (dividendStrategy === 'reinvest') {
            // Reinvest: buy shares with dividend
            const divShares = Math.floor(divAmount / buyPrice);
            if (divShares > 0) {
              const cost = divShares * buyPrice;
              const fee = Math.floor(cost * COST.BUY_COMMISSION);
              totalShares += divShares;
              totalFees += fee;

              transactions.push({
                date: div.date,
                type: '股利再投入',
                price: buyPrice,
                shares: divShares,
                amount: cost,
                fee: fee,
                totalShares: totalShares,
              });
            }
            // Remainder stays as cash (small amount, ignored for simplicity)
          } else {
            // Fixed deposit: accumulate with interest
            depositBalance += divAmount;

            transactions.push({
              date: div.date,
              type: '股利入帳',
              price: '-',
              shares: '-',
              amount: divAmount,
              fee: 0,
              totalShares: totalShares,
            });
          }
        }
      }

      // --- Buy shares based on strategy ---
      if (strategy === 'lump-sum') {
        // Only buy on the first month
        if (ym === months[0]) {
          const sharesToBuy = Math.floor(amount / buyPrice);
          if (sharesToBuy > 0) {
            const cost = sharesToBuy * buyPrice;
            const fee = Math.floor(cost * COST.BUY_COMMISSION);
            totalShares += sharesToBuy;
            totalInvested += cost + fee;
            totalFees += fee;

            transactions.push({
              date: buyDate,
              type: '買入',
              price: buyPrice,
              shares: sharesToBuy,
              amount: cost,
              fee: fee,
              totalShares: totalShares,
            });
          }
        }
      } else if (strategy === 'dca-dollar') {
        // Fixed dollar amount each month
        const sharesToBuy = Math.floor(amount / buyPrice);
        if (sharesToBuy > 0) {
          const cost = sharesToBuy * buyPrice;
          const fee = Math.floor(cost * COST.BUY_COMMISSION);
          totalShares += sharesToBuy;
          totalInvested += cost + fee;
          totalFees += fee;

          transactions.push({
            date: buyDate,
            type: '買入',
            price: buyPrice,
            shares: sharesToBuy,
            amount: cost,
            fee: fee,
            totalShares: totalShares,
          });
        }
      } else if (strategy === 'dca-share') {
        // Fixed share count each month
        const sharesToBuy = amount;
        const cost = sharesToBuy * buyPrice;
        const fee = Math.floor(cost * COST.BUY_COMMISSION);
        totalShares += sharesToBuy;
        totalInvested += cost + fee;
        totalFees += fee;

        transactions.push({
          date: buyDate,
          type: '買入',
          price: buyPrice,
          shares: sharesToBuy,
          amount: cost,
          fee: fee,
          totalShares: totalShares,
        });
      }

      // --- Apply monthly interest to deposit balance ---
      if (dividendStrategy === 'deposit' && depositBalance > 0) {
        const monthlyRate = (depositRate / 100) / 12;
        depositBalance *= (1 + monthlyRate);
      }

      // --- Record portfolio value (use last price of the month) ---
      const monthDates = allDates.filter(d => d.substring(0, 7) === ym);
      const lastDateOfMonth = monthDates[monthDates.length - 1];
      const lastPrice = priceByDate.get(lastDateOfMonth);
      const marketValue = totalShares * lastPrice;

      portfolioHistory.push({
        date: lastDateOfMonth,
        marketValue: marketValue,
        invested: totalInvested,
        shares: totalShares,
        depositBalance: Math.round(depositBalance),
        totalValue: marketValue + Math.round(depositBalance),
      });
    }

    // Final calculations
    const lastEntry = portfolioHistory[portfolioHistory.length - 1];
    const finalMarketValue = lastEntry.marketValue;
    const sellFee = Math.floor(finalMarketValue * (COST.SELL_COMMISSION + COST.SELL_TAX));
    const netProceeds = finalMarketValue - sellFee;
    const totalAssets = netProceeds + Math.round(depositBalance);
    const totalReturn = totalInvested > 0 ? ((totalAssets - totalInvested) / totalInvested) * 100 : 0;

    // Annualized return
    const firstDate = new Date(allDates[0]);
    const lastDate = new Date(allDates[allDates.length - 1]);
    const years = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
    const annualizedReturn = years > 0
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
      transactions: transactions,
      portfolioHistory: portfolioHistory,
      years: years,
    };
  }
}
