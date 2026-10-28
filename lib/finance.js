// lib/finance.js
// Pure money maths for the finance page. Every amount is handled in whole pence (integers), so adding
// hundreds of transactions can never drift by a penny; pounds only appear in the returned numbers.

// Months and days follow the seller's own clock (UK), not UTC, so that a sale made at 00:30 on the 1st
// belongs to the new month the way it does in eBay's own reports.
export const FINANCE_TZ = process.env.FINANCE_TIMEZONE || "Europe/London";

const toPence = (value) => Math.round(Number(value) * 100);
const toPounds = (pence) => pence / 100 + 0; // + 0 turns -0 into 0
// Rounds half away from zero (so -2.5 and 2.5 behave the same).
const roundAway = (n) => Math.sign(n) * Math.round(Math.abs(n));

function offsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(utcMs / 1000) * 1000;
}

// The UTC instant at which the given calendar day starts on the clock of `tz`.
function dayStartUtc(year, month, day, tz) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

// "2026-10-19T23:30:00Z" -> "2026-10-20" (UK summer time). "" for anything unreadable.
export function localDate(iso, tz = FINANCE_TZ) {
  const time = new Date(iso);
  if (!iso || Number.isNaN(time.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

// "2026-10" -> { from, to } ISO instants covering that whole month on the seller's clock; null if malformed.
export function monthRange(ym, tz = FINANCE_TZ) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(ym || ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const from = dayStartUtc(year, month, 1, tz);
  const next = month === 12 ? dayStartUtc(year + 1, 1, 1, tz) : dayStartUtc(year, month + 1, 1, tz);
  return { from: new Date(from).toISOString(), to: new Date(next - 1).toISOString() };
}

// vaPercent 0-100 (up to 2 decimals). Returns the VA's and the owner's money from one profit figure.
// The pennies are shared so that va + owner always equals the profit exactly. A loss is shared the same way.
export function splitProfit(profit, vaPercent) {
  const total = toPence(profit);
  const va = roundAway((total * vaPercent) / 100);
  return { va: toPounds(va), owner: toPounds(total - va) };
}

export function isValidPercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 && Math.round(value * 100) / 100 === value;
}

// Transaction types that are money moving to the seller's bank, not earnings or costs.
const NOT_EARNINGS = new Set(["PAYOUT", "TRANSFER", "WITHDRAWAL", "ADJUSTMENT_PAYOUT"]);

// The eBay order a transaction belongs to. Sales carry `orderId`; fees such as the ad fee for an order
// usually have no `orderId` and point at the order through `references` instead.
export function orderIdOf(t) {
  if (t?.orderId) return t.orderId;
  const ref = (t?.references || []).find((r) => String(r?.referenceType || "").toUpperCase() === "ORDER_ID" && r.referenceId);
  return ref ? ref.referenceId : "";
}

// Which rows count as money earned or spent: not payouts, not failed ones, and in the account's currency.
function usableTransactions(transactions) {
  const rows = [];
  let failed = 0;
  for (const t of transactions) {
    if (NOT_EARNINGS.has(String(t.transactionType || "").toUpperCase())) continue;
    if (String(t.transactionStatus || "").toUpperCase() === "FAILED") {
      failed += 1;
      continue;
    }
    const value = Number(t.amount?.value);
    if (!Number.isFinite(value)) continue;
    rows.push({ t, pence: (t.bookingEntry === "DEBIT" ? -1 : 1) * Math.abs(toPence(value)), currency: t.amount?.currency || "GBP" });
  }
  // One currency per report: the one most rows use. Rows in another currency are counted, never added.
  const counts = new Map();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) || 0) + 1);
  const currency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "GBP";
  const used = rows.filter((r) => r.currency === currency);
  return { used, currency, otherCurrencyRows: rows.length - used.length, failed };
}

// What each eBay order paid for its AliExpress purchases, in pence. An AliExpress order that was linked to
// several eBay orders is split between them (evenly, extra pennies to the first) so it is never counted twice.
function orderCostsPence(refs, costs, currency, manualCosts = {}, sharerCounts = {}) {
  const sharers = new Map(); // aliOrderId -> sorted eBay order ids that use it
  for (const [orderId, entry] of Object.entries(refs || {})) {
    if (manualCosts[orderId]) continue; // a hand-typed cost replaces the AliExpress one for this order
    for (const id of new Set(entry?.aliOrderIds || [])) {
      if (!sharers.has(id)) sharers.set(id, []);
      sharers.get(id).push(orderId);
    }
  }
  for (const list of sharers.values()) list.sort();

  const result = new Map(); // eBay order id -> { pence, known, unconverted }
  let shared = 0;
  for (const [aliId, list] of sharers) {
    const c = costs?.[aliId];
    for (const orderId of list) {
      if (!result.has(orderId)) result.set(orderId, { pence: 0, known: 0, unconverted: 0 });
    }
    if (!c) continue;
    if (c.currency !== currency) {
      for (const orderId of list) result.get(orderId).unconverted += 1;
      continue;
    }
    const total = toPence(c.amount);
    // The same number may also be on orders of the person's other stores: it is split between all of them.
    const everyone = Math.max(list.length, sharerCounts[aliId] || 0);
    const base = Math.floor(total / everyone);
    // The odd pennies go to the first orders, but only when every sharer is in this store (otherwise two stores could both take them).
    const extra = everyone === list.length ? total - base * list.length : 0;
    if (everyone > 1) shared += 1;
    list.forEach((orderId, i) => {
      const r = result.get(orderId);
      r.pence += base + (i < extra ? 1 : 0);
      r.known += 1;
    });
  }
  for (const [orderId, m] of Object.entries(manualCosts)) {
    result.set(orderId, { pence: toPence(m.amount), known: 1, unconverted: 0, manual: true });
  }
  return { byOrder: result, shared };
}

// transactions: eBay Finances rows { transactionType, bookingEntry: CREDIT|DEBIT, amount:{value,currency}, orderId?, ... }
// refs:  { [ebayOrderId]: { aliOrderIds } }      costs: { [aliOrderId]: { amount, currency } }
// Returns the month's totals, one row per day of the month and one per eBay order sold in the month.
export function summarizeMonth(transactions, refs, costs, vaPercent, ym, extras = {}) {
  const { manualCosts = {}, expenses = [], payments = [], sharerCounts = {} } = extras;
  const { used, currency, otherCurrencyRows, failed } = usableTransactions(transactions);
  const costInfo = orderCostsPence(refs, costs, currency, manualCosts, sharerCounts);

  const orderNet = new Map();
  const orderDay = new Map(); // the day an order's money first shows up in the month
  const hasSale = new Set(); // orders whose sale is inside this month
  const otherByDay = new Map();
  const otherKinds = new Map(); // what the charges not tied to an order are, so the total can be checked
  let otherPence = 0;

  const addOther = (kind, day, pence) => {
    otherPence += pence;
    otherKinds.set(kind, (otherKinds.get(kind) || 0) + pence);
    if (day) otherByDay.set(day, (otherByDay.get(day) || 0) + pence);
  };

  for (const { t, pence } of used) {
    const day = localDate(t.transactionDate);
    const orderId = orderIdOf(t);
    if (!orderId) {
      addOther([t.transactionType, t.feeType].filter(Boolean).join(" / ") || "OTHER", day, pence);
      continue;
    }
    if (String(t.transactionType || "").toUpperCase() === "SALE") hasSale.add(orderId);
    orderNet.set(orderId, (orderNet.get(orderId) || 0) + pence);
    if (day && (!orderDay.has(orderId) || day < orderDay.get(orderId))) orderDay.set(orderId, day);
  }

  // Money that touches an order sold in another month (a refund, a late fee) is not an order of this month:
  // it counts in the totals as an adjustment on the day it happened, but gets no row of its own.
  for (const [orderId, pence] of [...orderNet]) {
    if (hasSale.has(orderId)) continue;
    orderNet.delete(orderId);
    addOther("Refunds / fees for orders sold in other months", orderDay.get(orderId), pence);
  }

  let earningsPence = 0;
  let costPence = 0;
  let missingCost = 0;
  let unconvertedCosts = 0;
  const orders = [];
  for (const [orderId, net] of orderNet) {
    const info = costInfo.byOrder.get(orderId) || { pence: 0, known: 0, unconverted: 0 };
    if (info.known === 0) missingCost += 1;
    unconvertedCosts += info.unconverted;
    earningsPence += net;
    costPence += info.pence;
    orders.push({
      orderId,
      date: orderDay.get(orderId) || null,
      net: toPounds(net),
      cost: info.known > 0 ? toPounds(info.pence) : null,
      manualCost: Boolean(info.manual),
      profit: toPounds(net - info.pence),
      aliOrderIds: refs?.[orderId]?.aliOrderIds || [],
      _net: net,
      _cost: info.pence,
    });
  }

  // One row per calendar day of the month (1st to 30th/31st), zero days included.
  const days = [];
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  const expenseByDay = new Map();
  let expensesPence = 0;
  for (const e of expenses) {
    const pence = toPence(e.amount);
    expensesPence += pence;
    expenseByDay.set(e.date, (expenseByDay.get(e.date) || 0) + pence);
  }
  let daysProfitPence = 0;
  if (m) {
    const count = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    for (let d = 1; d <= count; d += 1) {
      const date = `${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`;
      const todays = orders.filter((o) => o.date === date);
      const dayEarnings = todays.reduce((sum, o) => sum + o._net, 0);
      const dayCost = todays.reduce((sum, o) => sum + o._cost, 0);
      const dayOther = otherByDay.get(date) || 0;
      const dayExpenses = expenseByDay.get(date) || 0;
      daysProfitPence += dayEarnings - dayCost + dayOther - dayExpenses;
      days.push({
        date,
        orders: todays.length,
        earnings: toPounds(dayEarnings),
        cost: toPounds(dayCost),
        otherCharges: toPounds(dayOther),
        expenses: toPounds(dayExpenses),
        profit: toPounds(dayEarnings - dayCost + dayOther - dayExpenses),
      });
    }
  }

  const profitPence = earningsPence - costPence + otherPence - expensesPence;
  const split = splitProfit(toPounds(profitPence), vaPercent);
  // What the VA has been paid for this month's profit, and what is still owed (negative = overpaid).
  const paidPence = payments.reduce((sum, p) => sum + toPence(p.amount), 0);
  const owedPence = toPence(split.va) - paidPence;
  return {
    expenses: expenses.map((e) => ({ ...e })),
    expensesTotal: toPounds(expensesPence),
    payments: payments.map((p) => ({ ...p })),
    vaPaid: toPounds(paidPence),
    vaBalance: toPounds(owedPence),
    days,
    // Do the days add up to the month? If not, some money has a date outside the month and is flagged.
    daysReconcile: days.length === 0 || daysProfitPence === profitPence,
    otherKinds: [...otherKinds].map(([kind, pence]) => ({ kind, amount: toPounds(pence) })).sort((a, b) => a.amount - b.amount),
    currency,
    orderCount: orders.length,
    earnings: toPounds(earningsPence),
    otherCharges: toPounds(otherPence),
    cost: toPounds(costPence),
    profit: toPounds(profitPence),
    missingCost,
    unconvertedCosts,
    sharedCosts: costInfo.shared,
    otherCurrencyRows,
    failedRows: failed,
    split,
    // Newest first (the day eBay booked the sale), biggest first within a day.
    orders: orders
      .map(({ _net, _cost, ...row }) => row)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || b.net - a.net),
  };
}
