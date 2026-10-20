// lib/financeExcel.js
// Builds the Excel files of the finance page. Amounts are real numbers (so they can be summed in Excel),
// formatted with the currency, never text.
import ExcelJS from "exceljs";

const CURRENCY_SYMBOLS = { GBP: "£", EUR: "€", USD: "$" };
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

// One month of one store.
// data: { storeLabel, month, partnership: { vaPercent, ownerPercent }, report, closedAt? }
export async function buildMonthWorkbook({ storeLabel, month, partnership, report, closedAt }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "eBay dashboard";
  const cur = report.currency;

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Item", key: "item", width: 34 },
    { header: "Value", key: "value", width: 22 },
  ];
  styleHeader(summary);
  const rows = [
    ["Store", storeLabel],
    ["Month", month],
    ["Status", closedAt ? `Closed on ${dateTime(closedAt)}` : "Open (figures are live, not closed)"],
    ["Currency", cur],
    ["Orders sold", report.orderCount],
    ["eBay earnings (after eBay fees)", report.earnings, true],
    ["AliExpress cost", report.cost, true],
    ["Other eBay charges", report.otherCharges, true],
    ["Extra expenses", report.expensesTotal, true],
    ["Profit", report.profit, true],
    ["VA share %", partnership.vaPercent],
    ["Owner share %", partnership.ownerPercent],
    ["VA share", report.split.va, true],
    ["Owner share", report.split.owner, true],
    ["Paid to VA so far", report.vaPaid, true],
    ["Still owed to VA (negative = overpaid)", report.vaBalance, true],
    ["Orders without a cost", report.missingCost],
  ];
  for (const [item, value, isMoney] of rows) {
    const row = summary.addRow({ item, value });
    if (isMoney) row.getCell("value").numFmt = moneyFormat(cur);
    if (item === "Profit") row.font = { bold: true };
  }
  summary.getColumn("value").alignment = { horizontal: "right" };

  const days = wb.addWorksheet("Days");
  days.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Orders", key: "orders", width: 9 },
    { header: "Earnings", key: "earnings", width: 14 },
    { header: "AliExpress cost", key: "cost", width: 16 },
    { header: "Other charges", key: "otherCharges", width: 15 },
    { header: "Extra expenses", key: "expenses", width: 15 },
    { header: "Profit", key: "profit", width: 14 },
  ];
  styleHeader(days);
  for (const d of report.days || []) days.addRow({ ...d, expenses: d.expenses || 0 });
  const totals = days.addRow({
    date: "Total",
    orders: report.orderCount,
    earnings: report.earnings,
    cost: report.cost,
    otherCharges: report.otherCharges,
    expenses: report.expensesTotal,
    profit: report.profit,
  });
  totals.font = { bold: true };
  addMoneyColumns(days, ["earnings", "cost", "otherCharges", "expenses", "profit"], cur);

  const orders = wb.addWorksheet("Orders");
  orders.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "eBay order", key: "orderId", width: 20 },
    { header: "Earned (after fees)", key: "net", width: 18 },
    { header: "AliExpress cost", key: "cost", width: 16 },
    { header: "Cost typed by hand", key: "manual", width: 18 },
    { header: "Profit", key: "profit", width: 14 },
    { header: "AliExpress order numbers", key: "ali", width: 40 },
  ];
  styleHeader(orders);
  for (const o of report.orders || []) {
    orders.addRow({
      date: o.date || "",
      orderId: o.orderId,
      net: o.net,
      cost: o.cost === null ? "no cost" : o.cost,
      manual: o.manualCost ? "yes" : "",
      profit: o.profit,
      ali: (o.aliOrderIds || []).join(", "),
    });
  }
  addMoneyColumns(orders, ["net", "cost", "profit"], cur);
  orders.autoFilter = { from: "A1", to: "G1" };

  const other = wb.addWorksheet("Other charges");
  other.columns = [
    { header: "Kind", key: "kind", width: 52 },
    { header: "Amount", key: "amount", width: 14 },
  ];
  styleHeader(other);
  for (const k of report.otherKinds || []) other.addRow(k);
  addMoneyColumns(other, ["amount"], cur);

  const expenses = wb.addWorksheet("Extra expenses");
  expenses.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "What for", key: "label", width: 40 },
    { header: "Amount", key: "amount", width: 14 },
  ];
  styleHeader(expenses);
  for (const e of [...(report.expenses || [])].sort((a, b) => a.date.localeCompare(b.date))) expenses.addRow(e);
  addMoneyColumns(expenses, ["amount"], cur);

  const payments = wb.addWorksheet("VA payments");
  payments.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Note", key: "note", width: 40 },
  ];
  styleHeader(payments);
  for (const p of [...(report.payments || [])].sort((a, b) => a.date.localeCompare(b.date))) payments.addRow(p);
  addMoneyColumns(payments, ["amount"], cur);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

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
