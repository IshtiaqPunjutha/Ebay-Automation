// lib/financeExcel.js
// Builds the Excel files of the finance page. Amounts are real numbers (so they can be summed in Excel),
// formatted with the currency, never text.
import ExcelJS from "exceljs";

const CURRENCY_SYMBOLS = { GBP: "£", EUR: "€", USD: "$", CAD: "CA$", AUD: "A$" };
const moneyFormat = (currency) => `${CURRENCY_SYMBOLS[currency] || `${currency} `}#,##0.00;[Red]-${CURRENCY_SYMBOLS[currency] || `${currency} `}#,##0.00`;

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F7" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addMoneyColumns(sheet, keys, currency) {
  for (const key of keys) sheet.getColumn(key).numFmt = moneyFormat(currency);
}

const dateTime = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

// ---------- client-ready month workbook ----------
const NAVY = "FF1F3A5F";
const BLUE_LIGHT = "FFE8EEF7";
const GREEN = "FFD9F2E3";
const GREEN_DARK = "FF1B7F4B";
const RED_LIGHT = "FFFBE3E3";
const YELLOW = "FFFFF4CC";
const GREY_TEXT = "FF5B6573";
const FONT = "Calibri";

const monthName = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: "FFD0D7E2" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const pence = (v) => Math.round((Number(v) || 0) * 100);

const VIA_TEXT = { ebay: "eBay return", chat: "Settled in chat", other: "Other" };
const ALI_TEXT = { waiting: "Waiting", received: "Paid back (cash/card)", bonus: "Paid back as AliExpress bonus", none: "Nothing paid back" };

// A header row for a data table (dark blue, white bold) plus frozen top rows, filter and print setup.
function tableSheet(wb, name, columns, { tab = "FF1F3A5F", freezeRow = 1 } = {}) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tab } }, views: [{ state: "frozen", ySplit: freezeRow }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.values = columns.map((c) => c.header);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = fill(NAVY);
    cell.alignment = { vertical: "middle", horizontal: cell.col > 1 && columns[cell.col - 1].money ? "right" : "left", wrapText: true };
    cell.border = box;
  });
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

function styleDataRow(row, columns, cur, extra = {}) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    const col = columns[cell.col - 1];
    if (!col) return;
    cell.font = { name: FONT, size: 11, ...(extra.font || {}) };
    cell.border = box;
    cell.alignment = { vertical: "middle", horizontal: col.money ? "right" : "left", wrapText: Boolean(col.wrap) };
    if (col.money) cell.numFmt = moneyFormat(cur);
    if (extra.fill) cell.fill = fill(extra.fill);
  });
}

function totalRow(ws, columns, cur, values) {
  const row = ws.addRow(values);
  styleDataRow(row, columns, cur, { font: { bold: true }, fill: BLUE_LIGHT });
  return row;
}

// One month of one store, laid out so a client can read it without help.
// data: { storeLabel, month, partnership: { vaPercent, ownerPercent }, report, closedAt? }
export async function buildMonthWorkbook({ storeLabel, month, partnership, report, closedAt }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "eBay dashboard";
  const cur = report.currency;
  const money = moneyFormat(cur);
  const st = report.statement;

  // ================= Summary =================
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: GREEN_DARK } }, views: [{ showGridLines: false }] });
  sum.columns = [{ width: 58 }, { width: 20 }, { width: 62 }];
  sum.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  let r = 1;

  const banner = (text, size, color, height) => {
    sum.mergeCells(r, 1, r, 3);
    const c = sum.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, bold: true, size, color: { argb: "FFFFFFFF" } };
    c.fill = fill(color);
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    sum.getRow(r).height = height;
    r += 1;
  };
  const section = (text) => {
    r += 1;
    sum.mergeCells(r, 1, r, 3);
    const c = sum.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = fill(NAVY);
    c.alignment = { vertical: "middle", indent: 1 };
    sum.getRow(r).height = 22;
    r += 1;
  };
  // label | amount | comment
  const line = (label, value, { comment = "", bold = false, bg = null, size = 11, isMoney = true } = {}) => {
    const row = sum.getRow(r);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(3).value = comment;
    for (let col = 1; col <= 3; col += 1) {
      const c = row.getCell(col);
      c.font = { name: FONT, size, bold: bold && col < 3, color: col === 3 ? { argb: GREY_TEXT } : undefined };
      c.border = box;
      c.alignment = { vertical: "middle", horizontal: col === 2 ? "right" : "left", wrapText: col === 3, indent: col === 1 ? 1 : 0 };
      if (bg) c.fill = fill(bg);
    }
    if (isMoney) row.getCell(2).numFmt = money;
    if (size > 12) row.height = size + 12;
    r += 1;
  };

  banner(`Monthly finance report: ${monthName(month)}`, 18, NAVY, 34);
  banner(`Store: ${storeLabel}      Currency: ${cur}      ${closedAt ? `Closed on ${dateTime(closedAt)}` : "Open month (figures are live and may still change)"}`, 11, "FF3B5B8A", 22);

  section("RESULT FOR THE MONTH");
  line("PROFIT THIS MONTH", report.profit, { bold: true, bg: report.profit >= 0 ? GREEN : RED_LIGHT, size: 16, comment: "After eBay fees, refunds, AliExpress costs and expenses" });
  line(`VA share (${partnership.vaPercent}%)`, report.split.va, { bold: true, bg: GREEN, size: 14, comment: `Paid so far ${moneyText(report.vaPaid, cur)}. Still to pay ${moneyText(report.vaBalance, cur)}.` });
  line(`Owner / investor share (${partnership.ownerPercent}%)`, report.split.owner, { bold: true, bg: GREEN, size: 14 });

  section("HOW THE PROFIT IS WORKED OUT");
  if (st) {
    line("Sales (eBay: Orders, after selling fees)", st.sales, { comment: `${report.orderCount} orders sold this month` });
    line("Refunds and cancellations (eBay: Refunds)", st.refunds, { comment: `${report.fullRefunds || 0} full and ${report.partialRefunds || 0} partial, including cancelled orders` });
    line("Returns refunded to buyers", st.returns, { comment: "eBay books a refunded return as a dispute; its summary lines leave it out, but the money is taken" });
    line("Ad fees (promoted listings)", st.adFees);
    line("Listing fees", st.listingFees);
    if (st.otherFees) line("Other eBay charges", st.otherFees);
    line("eBay total for the month", report.earnings + report.otherCharges, { bold: true, bg: BLUE_LIGHT });
  } else {
    line("eBay earnings (after fees and refunds)", report.earnings);
    line("Other eBay charges", report.otherCharges);
    line("eBay total for the month", report.earnings + report.otherCharges, { bold: true, bg: BLUE_LIGHT });
  }
  line("AliExpress cost of the orders", -report.cost, { comment: "What the items cost on AliExpress (an order bought with bonus shows only the part paid by card)" });
  line("AliExpress refunds received on returns", report.returnsRecovered || 0, { comment: "Cash or card paid back by AliExpress (bonus credit is not counted here, see Returns)" });
  line("Paid to buyers outside eBay", -(report.returnsOutside || 0));
  line("Extra expenses", -report.expensesTotal);
  line("PROFIT", report.profit, { bold: true, bg: report.profit >= 0 ? GREEN : RED_LIGHT, size: 13 });

  section("VA PAYMENT");
  line(`VA share (${partnership.vaPercent}%)`, report.split.va);
  line("Paid to the VA so far", report.vaPaid);
  line("Still to pay the VA (negative = overpaid)", report.vaBalance, { bold: true, bg: BLUE_LIGHT });

  section("NUMBERS");
  const cancelled = new Set((report.refundRows || []).filter((x) => x.cancelled).map((x) => x.orderId)).size;
  line("Orders sold", report.orderCount, { isMoney: false });
  line("Fully refunded orders (including cancelled)", report.fullRefunds || 0, { isMoney: false, comment: cancelled ? `${cancelled} of them were cancelled before they were sent` : "" });
  line("Partly refunded orders", report.partialRefunds || 0, { isMoney: false });
  line("Returns recorded this month", (report.returnList || []).length, { isMoney: false });
  line("Orders still without an AliExpress cost", report.missingCost || 0, { isMoney: false, bg: report.missingCost ? YELLOW : null, comment: report.missingCost ? "Their profit is overstated until the cost is added" : "" });

  section("NOTES");
  const notes = [
    "Months and days follow GMT, the same as eBay's own financial statement.",
    "An order counts in the month it was sold on eBay, whatever day it was bought on AliExpress.",
    "Money booked by eBay in another month (a refund or a fee credit) counts in that other month.",
    "Refunds paid back by AliExpress as bonus credit are not counted as money back: the orders later bought with that bonus show a cost of 0, which is where the saving appears.",
  ];
  for (const note of notes) {
    sum.mergeCells(r, 1, r, 3);
    const c = sum.getCell(r, 1);
    c.value = note;
    c.font = { name: FONT, size: 10, italic: true, color: { argb: GREY_TEXT } };
    c.alignment = { wrapText: true, vertical: "top", indent: 1 };
    sum.getRow(r).height = 28;
    r += 1;
  }

  // ================= Orders =================
  const orderCols = [
    { header: "Date", key: "date", width: 12 },
    { header: "eBay order", key: "orderId", width: 20 },
    { header: "AliExpress order number(s)", key: "ali", width: 32, wrap: true },
    { header: "Earned (after eBay fees and refunds)", key: "net", width: 20, money: true },
    { header: "Refunded to buyer", key: "refund", width: 17, money: true },
    { header: "AliExpress cost", key: "cost", width: 16, money: true },
    { header: "Profit", key: "profit", width: 14, money: true },
    { header: "Note", key: "note", width: 46, wrap: true },
  ];
  const orders = tableSheet(wb, "Orders", orderCols, { tab: "FF3B5B8A" });
  for (const o of report.orders || []) {
    const fullRefund = o.refundStatus === "full";
    const noCost = o.cost === null;
    const notes = [];
    if (fullRefund) notes.push(o.refund && o.net === 0 ? "Cancelled or fully refunded" : "Fully refunded");
    else if (o.refundStatus === "partial") notes.push("Partly refunded");
    if (o.manualCost) notes.push("Cost typed by hand");
    if (o.bonus > 0) notes.push(`AliExpress paid back ${moneyText(o.bonus, cur)} as bonus (counted when the bonus is used)`);
    if (noCost && !fullRefund) notes.push("No AliExpress cost yet");
    const row = orders.addRow({
      date: o.date || "",
      orderId: o.orderId,
      ali: (o.aliOrderIds || []).join("\n"),
      net: o.net,
      refund: o.refund || 0,
      cost: noCost ? (fullRefund ? "not needed" : "no cost yet") : o.cost,
      profit: o.profit,
      note: notes.join(". "),
    });
    styleDataRow(row, orderCols, cur, { fill: fullRefund ? RED_LIGHT : noCost ? YELLOW : o.refundStatus === "partial" ? "FFFFF0E0" : null });
    if (typeof row.getCell("cost").value === "string") row.getCell("cost").alignment = { horizontal: "right", vertical: "middle" };
  }
  const sumOf = (key) => (report.orders || []).reduce((total, o) => total + pence(o[key]), 0) / 100;
  totalRow(orders, orderCols, cur, {
    date: "Total",
    orderId: `${(report.orders || []).length} orders`,
    net: sumOf("net"),
    refund: sumOf("refund"),
    cost: (report.orders || []).reduce((total, o) => total + (o.cost === null ? 0 : pence(o.cost)), 0) / 100,
    profit: sumOf("profit"),
    note: "Order profit only. The month's profit also has listing fees, returns and expenses (see Summary).",
  });
  orders.autoFilter = { from: "A1", to: "H1" };

  // ================= Refunds =================
  const refundCols = [
    { header: "Date", key: "date", width: 12 },
    { header: "eBay order", key: "orderId", width: 20 },
    { header: "What it was", key: "kind", width: 28 },
    { header: "Amount taken back by eBay", key: "amount", width: 24, money: true },
  ];
  const refunds = tableSheet(wb, "Refunds", refundCols, { tab: "FFC0504D" });
  for (const x of report.refundRows || []) {
    const row = refunds.addRow({
      date: x.date,
      orderId: x.orderId,
      kind: x.type === "DISPUTE" ? "Return refunded to buyer" : x.cancelled ? "Cancelled order" : "Refund",
      amount: -x.amount,
    });
    styleDataRow(row, refundCols, cur);
  }
  if ((report.refundRows || []).length === 0) refunds.addRow({ date: "No refunds this month" });
  else totalRow(refunds, refundCols, cur, { date: "Total", amount: -(report.refundRows || []).reduce((total, x) => total + pence(x.amount), 0) / 100 });

  // ================= Returns =================
  const returnCols = [
    { header: "Date", key: "date", width: 12 },
    { header: "eBay order", key: "orderId", width: 20 },
    { header: "How it was settled", key: "via", width: 22 },
    { header: "Did AliExpress pay back?", key: "ali", width: 32 },
    { header: "AliExpress paid back", key: "amount", width: 20, money: true },
    { header: "Paid to buyer outside eBay", key: "outside", width: 24, money: true },
    { header: "Note", key: "note", width: 40, wrap: true },
  ];
  const returns = tableSheet(wb, "Returns", returnCols, { tab: "FFE0A030" });
  for (const x of report.returnList || []) {
    const row = returns.addRow({
      date: x.date,
      orderId: x.orderId,
      via: VIA_TEXT[x.via] || x.via,
      ali: ALI_TEXT[x.aliStatus] || x.aliStatus,
      amount: x.aliAmount || 0,
      outside: x.extraRefund || 0,
      note: x.note || "",
    });
    styleDataRow(row, returnCols, cur, { fill: x.aliStatus === "waiting" ? YELLOW : null });
  }
  if ((report.returnList || []).length === 0) returns.addRow({ date: report.returnList ? "No returns recorded this month" : "Return details were not saved when this month was closed" });

  // ================= Day by day =================
  const dayCols = [
    { header: "Date", key: "date", width: 13 },
    { header: "Orders", key: "orders", width: 10 },
    { header: "Earned", key: "earnings", width: 15, money: true },
    { header: "AliExpress cost", key: "cost", width: 17, money: true },
    { header: "Other charges", key: "otherCharges", width: 16, money: true },
    { header: "Extra expenses", key: "expenses", width: 16, money: true },
    { header: "Returns", key: "returns", width: 14, money: true },
    { header: "Profit", key: "profit", width: 14, money: true },
    { header: "Running profit", key: "running", width: 16, money: true },
  ];
  const days = tableSheet(wb, "Day by day", dayCols, { tab: "FF6F8FB5" });
  let running = 0;
  for (const d of report.days || []) {
    running = Math.round((running + d.profit) * 100) / 100;
    const row = days.addRow({ ...d, expenses: d.expenses || 0, returns: d.returns || 0, running });
    const quiet = d.orders === 0 && !d.otherCharges && !d.expenses && !d.returns;
    styleDataRow(row, dayCols, cur, quiet ? { font: { color: { argb: "FF9AA4B2" } } } : {});
  }
  totalRow(days, dayCols, cur, {
    date: "Total",
    orders: report.orderCount,
    earnings: report.earnings,
    cost: report.cost,
    otherCharges: report.otherCharges,
    expenses: report.expensesTotal,
    returns: (report.returnsRecovered || 0) - (report.returnsOutside || 0),
    profit: report.profit,
  });

  // ================= eBay charges by kind =================
  const kindCols = [
    { header: "Kind of eBay transaction", key: "kind", width: 44 },
    { header: "Count", key: "count", width: 10 },
    { header: "Total", key: "amount", width: 18, money: true },
  ];
  const kinds = tableSheet(wb, "eBay statement lines", kindCols, { tab: "FF6F8FB5" });
  for (const k of report.typeTotals || []) styleDataRow(kinds.addRow(k), kindCols, cur);
  totalRow(kinds, kindCols, cur, {
    kind: "All transactions of the month",
    count: (report.typeTotals || []).reduce((n, k) => n + k.count, 0),
    amount: (report.typeTotals || []).reduce((total, k) => total + pence(k.amount), 0) / 100,
  });

  // ================= Payouts =================
  const payoutCols = [
    { header: "Date", key: "date", width: 13 },
    { header: "Amount", key: "amount", width: 16, money: true },
    { header: "Status", key: "status", width: 18 },
    { header: "Transactions", key: "count", width: 14 },
    { header: "Bank", key: "bank", width: 24 },
  ];
  const payouts = tableSheet(wb, "eBay payouts", payoutCols, { tab: "FF6F8FB5" });
  for (const p of report.payouts || []) styleDataRow(payouts.addRow({ date: String(p.date || "").slice(0, 10), amount: p.amount, status: p.status, count: p.transactionCount, bank: p.bank }), payoutCols, cur);
  if ((report.payouts || []).length === 0) payouts.addRow({ date: "No payouts this month" });

  // ================= Extra expenses =================
  const expenseCols = [
    { header: "Date", key: "date", width: 13 },
    { header: "What for", key: "label", width: 44 },
    { header: "Amount", key: "amount", width: 16, money: true },
  ];
  const expenses = tableSheet(wb, "Extra expenses", expenseCols, { tab: "FF6F8FB5" });
  for (const e of [...(report.expenses || [])].sort((a, b) => a.date.localeCompare(b.date))) styleDataRow(expenses.addRow(e), expenseCols, cur);
  if ((report.expenses || []).length === 0) expenses.addRow({ date: "No extra expenses" });
  else totalRow(expenses, expenseCols, cur, { date: "Total", amount: report.expensesTotal });

  // ================= VA payments =================
  const payCols = [
    { header: "Date", key: "date", width: 13 },
    { header: "Amount", key: "amount", width: 16, money: true },
    { header: "Note", key: "note", width: 44 },
  ];
  const payments = tableSheet(wb, "VA payments", payCols, { tab: "FF6F8FB5" });
  for (const p of [...(report.payments || [])].sort((a, b) => a.date.localeCompare(b.date))) styleDataRow(payments.addRow(p), payCols, cur);
  if ((report.payments || []).length === 0) payments.addRow({ date: "No payments recorded" });
  else totalRow(payments, payCols, cur, { date: "Total paid", amount: report.vaPaid });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const moneyText = (value, currency) => {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}${CURRENCY_SYMBOLS[currency] || `${currency} `}${Math.abs(n).toFixed(2)}`;
};

// Every closed month of a store, one row each. rows: from monthSummaryRow + vaPaid / vaBalance.
export async function buildHistoryWorkbook({ storeLabel, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "eBay dashboard";
  const sheet = wb.addWorksheet("Closed months");
  sheet.columns = [
    { header: "Month", key: "month", width: 10 },
    { header: "Closed on", key: "closedAt", width: 20 },
    { header: "Orders", key: "orders", width: 9 },
    { header: "Earnings", key: "earnings", width: 14 },
    { header: "AliExpress cost", key: "cost", width: 16 },
    { header: "Other charges", key: "otherCharges", width: 15 },
    { header: "Extra expenses", key: "expenses", width: 15 },
    { header: "Profit", key: "profit", width: 14 },
    { header: "VA %", key: "vaPercent", width: 8 },
    { header: "VA share", key: "vaShare", width: 14 },
    { header: "Owner share", key: "ownerShare", width: 14 },
    { header: "Paid to VA", key: "vaPaid", width: 14 },
    { header: "Still owed to VA", key: "vaBalance", width: 17 },
    { header: "Orders without cost", key: "missingCost", width: 19 },
  ];
  styleHeader(sheet);
  const currency = rows[0]?.currency || "GBP";
  for (const r of rows) sheet.addRow({ ...r, closedAt: dateTime(r.closedAt) });
  const sum = (key) => rows.reduce((total, r) => total + Math.round(r[key] * 100), 0) / 100;
  const total = sheet.addRow({
    month: "Total",
    orders: rows.reduce((n, r) => n + r.orders, 0),
    earnings: sum("earnings"),
    cost: sum("cost"),
    otherCharges: sum("otherCharges"),
    expenses: sum("expenses"),
    profit: sum("profit"),
    vaShare: sum("vaShare"),
    ownerShare: sum("ownerShare"),
    vaPaid: sum("vaPaid"),
    vaBalance: sum("vaBalance"),
  });
  total.font = { bold: true };
  addMoneyColumns(sheet, ["earnings", "cost", "otherCharges", "expenses", "profit", "vaShare", "ownerShare", "vaPaid", "vaBalance"], currency);
  sheet.addRow({});
  sheet.addRow({ month: `Store: ${storeLabel}` });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
