// lib/financeReport.js
// One store's finance report for one month: live from eBay, or the frozen copy if the month was closed.
import { summarizeMonth, monthRange, splitProfit } from "./finance";
import { fetchTransactionsInRange, isTokenExpired, refreshAccessToken } from "./ebay";
import {
  getAliCosts,
  getClosedMonths,
  getExpenses,
  getManualCosts,
  getOrderRefs,
  getPartnership,
  getPayments,
  updateStoreAccessToken,
} from "./store";

const round2 = (n) => Math.round(n * 100) / 100;

// The VA's money for a closed month still moves (payments are recorded afterwards), so those two
// figures are always worked out from the payments list as it is now.
function withPayments(report, payments) {
  const paid = payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
  return {
    ...report,
    payments: payments.map((p) => ({ ...p })),
    vaPaid: paid / 100,
    vaBalance: (Math.round(report.split.va * 100) - paid) / 100,
  };
}

// -> { partnership, report, closed: { at } | null }; throws if eBay cannot be read (live months only).
export async function loadMonthReport(userId, store, month) {
  const storeId = store.storeId;
  const [closedAll, allPayments] = await Promise.all([getClosedMonths(userId, storeId), getPayments(userId, storeId)]);
  const payments = allPayments.filter((p) => p.month === month);

  const frozen = closedAll[month];
  if (frozen) {
    return { partnership: frozen.partnership, report: withPayments(frozen.report, payments), closed: { at: frozen.closedAt } };
  }

  const range = monthRange(month);
  const partnership = await getPartnership(userId, storeId);
  let record = store;
  if (isTokenExpired(record.tokens)) {
    const refreshed = await refreshAccessToken(record.tokens.refreshToken);
    record = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
  }
  const [transactions, refs, costs, manualCosts, expenses] = await Promise.all([
    fetchTransactionsInRange(record.tokens.accessToken, range.from, range.to),
    getOrderRefs(userId, storeId),
    getAliCosts(userId, storeId),
    getManualCosts(userId, storeId),
    getExpenses(userId, storeId, month),
  ]);
  return {
    partnership,
    report: summarizeMonth(transactions, refs, costs, partnership.vaPercent, month, { manualCosts, expenses, payments }),
    closed: null,
  };
}

// The first instant after the month, to refuse closing a month that is not over yet.
export function monthHasEnded(month, now = Date.now()) {
  const range = monthRange(month);
  return Boolean(range) && now > new Date(range.to).getTime();
}

// One row for the history list and the all-months sheet.
export function monthSummaryRow(month, closed) {
  const r = closed.report;
  return {
    month,
    closedAt: closed.closedAt,
    currency: r.currency,
    orders: r.orderCount,
    earnings: r.earnings,
    cost: r.cost,
    otherCharges: r.otherCharges,
    expenses: r.expensesTotal,
    profit: r.profit,
    vaPercent: closed.partnership.vaPercent,
    vaShare: r.split.va,
    ownerShare: r.split.owner,
    missingCost: r.missingCost,
  };
}

export { splitProfit, round2 };
