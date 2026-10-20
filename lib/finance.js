// lib/finance.js
// Pure money maths for the finance page: month ranges, profit and the partnership split.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// "2026-10" -> { from, to } as ISO strings covering that whole month in UTC; null if malformed.
export function monthRange(ym) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(ym || ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1) - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// vaPercent 0-100 (up to 2 decimals). Returns the VA's and the owner's money from one profit figure.
// The pennies are shared so that va + owner always equals the profit exactly. A loss is shared the same way.
export function splitProfit(profit, vaPercent) {
  const total = round2(profit);
  const va = round2((total * vaPercent) / 100);
  return { va, owner: round2(total - va) };
}

export function isValidPercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 && round2(value) === value;
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

// transactions: eBay Finances rows { transactionType, bookingEntry: CREDIT|DEBIT, amount:{value,currency}, orderId? }
// refs:  { [ebayOrderId]: { aliOrderIds } }      costs: { [aliOrderId]: { amount, currency } }
// Returns the month's totals and a row per eBay order. Everything is in `currency` (the earnings'); a cost in
// another currency is not converted and is counted in `unconvertedCosts` instead of being guessed.
export function summarizeMonth(transactions, refs, costs, vaPercent, ym) {
  const byOrder = new Map();
  const hasSale = new Set(); // orders whose sale is inside this month
  const orderDay = new Map(); // the day an order's money first shows up: its cost counts on that day
  const otherByDay = new Map();
  const otherKinds = new Map(); // what the unattached charges are, so the total can be checked
  let otherNet = 0; // fees and charges not tied to an order (ad fees, subscriptions ...)
  let currency = "GBP";

  for (const t of transactions) {
    if (NOT_EARNINGS.has(String(t.transactionType || "").toUpperCase())) continue;
    const value = Number(t.amount?.value);
    if (!Number.isFinite(value)) continue;
    const signed = (t.bookingEntry === "DEBIT" ? -1 : 1) * Math.abs(value);
    currency = t.amount?.currency || currency;
    const day = String(t.transactionDate || "").slice(0, 10);
    const orderId = orderIdOf(t);
    if (orderId) {
      if (String(t.transactionType || "").toUpperCase() === "SALE") hasSale.add(orderId);
      byOrder.set(orderId, round2((byOrder.get(orderId) || 0) + signed));
      if (day && (!orderDay.has(orderId) || day < orderDay.get(orderId))) orderDay.set(orderId, day);
    } else {
      otherNet = round2(otherNet + signed);
      const kind = [t.transactionType, t.feeType].filter(Boolean).join(" / ") || "OTHER";
      otherKinds.set(kind, round2((otherKinds.get(kind) || 0) + signed));
      if (day) otherByDay.set(day, round2((otherByDay.get(day) || 0) + signed));
    }
  }

  // Money that touches an order sold in another month (a refund, a late fee) is not an order of this month:
  // it counts in the totals as an adjustment on the day it happened, but gets no row of its own.
  for (const [orderId, net] of [...byOrder]) {
    if (hasSale.has(orderId)) continue;
    byOrder.delete(orderId);
    otherNet = round2(otherNet + net);
    const kind = "Refunds / fees for orders sold in other months";
    otherKinds.set(kind, round2((otherKinds.get(kind) || 0) + net));
    const day = orderDay.get(orderId);
    if (day) otherByDay.set(day, round2((otherByDay.get(day) || 0) + net));
  }

  let earnings = 0;
  let cost = 0;
  let missingCost = 0;
  let unconvertedCosts = 0;
  const orders = [];
  for (const [orderId, net] of byOrder) {
    const aliIds = refs?.[orderId]?.aliOrderIds || [];
    let orderCost = 0;
    let known = 0;
    for (const id of aliIds) {
      const c = costs?.[id];
      if (!c) continue;
      if (c.currency !== currency) {
        unconvertedCosts += 1;
        continue;
      }
      orderCost += c.amount;
      known += 1;
    }
    orderCost = round2(orderCost);
    if (known === 0) missingCost += 1;
    earnings = round2(earnings + net);
    cost = round2(cost + orderCost);
    orders.push({ orderId, date: orderDay.get(orderId) || null, net, cost: known > 0 ? orderCost : null, profit: round2(net - orderCost), aliOrderIds: aliIds });
  }

  // One row per calendar day of the month (1st to 30th/31st), zero days included.
  const days = [];
  const range = monthRange(ym);
  if (range) {
    const first = new Date(range.from);
    const count = new Date(range.to).getUTCDate();
    for (let d = 1; d <= count; d += 1) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d)).toISOString().slice(0, 10);
      const todays = orders.filter((o) => o.date === date);
      const dayEarnings = round2(todays.reduce((sum, o) => sum + o.net, 0));
      const dayCost = round2(todays.reduce((sum, o) => sum + (o.cost || 0), 0));
      const dayOther = otherByDay.get(date) || 0;
      days.push({ date, orders: todays.length, earnings: dayEarnings, cost: dayCost, otherCharges: dayOther, profit: round2(dayEarnings - dayCost + dayOther) });
    }
  }

  const profit = round2(earnings - cost + otherNet);
  return {
    days,
    otherKinds: [...otherKinds].map(([kind, amount]) => ({ kind, amount })).sort((a, b) => a.amount - b.amount),
    currency,
    orderCount: orders.length,
    earnings,
    otherCharges: otherNet,
    cost,
    profit,
    missingCost,
    unconvertedCosts,
    split: splitProfit(profit, vaPercent),
    orders: orders.sort((a, b) => b.net - a.net),
  };
}
