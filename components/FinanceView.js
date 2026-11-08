"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Copy, Landmark, LoaderCircle, Lock } from "lucide-react";
import { CostCell, ExpensesPanel, PaymentsPanel, PayoutsPanel } from "./FinanceExtras";
import { Pager, paginate } from "./Pager";

import { formatMoney as money } from "@/lib/marketplaces";

// Checks that the figures of a month add up exactly, in whole pence.
function reconcile(report) {
  const p = (v) => Math.round((Number(v) || 0) * 100);
  const fmt = (pence) => money(pence / 100, report.currency);
  const parts = p(report.earnings) - p(report.cost) + p(report.returnsRecovered) - p(report.returnsOutside) + p(report.otherCharges) - p(report.expensesTotal);
  const ledger = (report.typeTotals || []).reduce((sum, k) => sum + p(k.amount), 0);
  const days = (report.days || []).reduce((sum, d) => sum + p(d.profit), 0);
  return [
    { label: "Earnings - cost + returns + other charges - expenses = profit", ok: parts === p(report.profit), detail: `${fmt(parts)} vs ${fmt(p(report.profit))}` },
    { label: "VA share + owner share = profit", ok: p(report.split.va) + p(report.split.owner) === p(report.profit), detail: `${fmt(p(report.split.va) + p(report.split.owner))} vs ${fmt(p(report.profit))}` },
    { label: "All eBay transactions = earnings + other charges", ok: ledger === p(report.earnings) + p(report.otherCharges), detail: `${fmt(ledger)} vs ${fmt(p(report.earnings) + p(report.otherCharges))}` },
    ...(report.days?.length ? [{ label: "The days add up to the month's profit", ok: days === p(report.profit), detail: `${fmt(days)} vs ${fmt(p(report.profit))}` }] : []),
  ];
}

// Small icon button that copies `text` and flashes a check mark.
function CopyIcon({ text, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const Icon = copied ? Check : Copy;
  return (
    <button type="button" className="icon-btn copy-icon" onClick={copy} title={copied ? "Copied" : label} aria-label={label}>
      <Icon strokeWidth={2} style={copied ? { color: "var(--success)" } : undefined} />
    </button>
  );
}

function thisMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Asks for the PIN (creating it the first time). The finance page is locked again whenever it is left.
function PinGate({ hasPin, onUnlocked }) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(pin)) return setError("The PIN is 4 to 8 digits.");
    if (!hasPin && pin !== again) return setError("The two PINs do not match.");
    setBusy(true);
    try {
      const res = await fetch("/api/finance/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not unlock.");
      onUnlocked();
    } catch (err) {
      setError(err.message || "Could not unlock.");
      setPin("");
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={submit} style={{ maxWidth: 360, margin: "40px auto", padding: 24 }}>
      <div className="dialog-title" style={{ marginBottom: 8 }}>
        <Lock strokeWidth={2} />
        {hasPin ? "Enter your finance PIN" : "Create a finance PIN"}
      </div>
      <p className="text-muted" style={{ marginTop: 0 }}>
        {hasPin ? "The finance pages are PIN protected." : "Choose a 4 to 8 digit PIN. You will be asked for it every time you open Finance."}
      </p>
      <input
        className="input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        maxLength={8}
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        aria-label="PIN"
        style={{ width: "100%", marginBottom: 8 }}
      />
      {!hasPin && (
        <input
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="Repeat the PIN"
          value={again}
          onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))}
          aria-label="Repeat the PIN"
          style={{ width: "100%", marginBottom: 8 }}
        />
      )}
      {error && <p className="text-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Checking…" : hasPin ? "Unlock" : "Create PIN and unlock"}
      </button>
    </form>
  );
}

function StoreCard({ entry, onSavePercent, single, month, onMutate }) {
  const closed = entry.closed;
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const exportUrl = `/api/finance/export?store=${encodeURIComponent(entry.storeId)}&month=${encodeURIComponent(month)}`;

  async function closeMonth() {
    const missing = entry.report?.missingCost || 0;
    const warning = missing ? `${missing} order(s) still have no AliExpress cost; add them first if you can.\n\n` : "";
    if (!confirm(`Close ${month}?\n\nIts figures are saved as they are now and no longer change. ${warning}You can reopen the month later.`)) return;
    setClosing(true);
    setCloseError("");
    const err = await onMutate("close", "POST", entry.storeId, { month });
    setCloseError(err || "");
    setClosing(false);
  }

  async function reopenMonth() {
    if (!confirm(`Reopen ${month}? Its figures become live again and change with eBay.`)) return;
    setClosing(true);
    setCloseError((await onMutate("close", "DELETE", entry.storeId, { month })) || "");
    setClosing(false);
  }

  const { report, partnership } = entry;
  const [draft, setDraft] = useState(String(partnership.vaPercent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showOrders, setShowOrders] = useState(Boolean(single)); // a store's own page opens with its orders listed
  const [orderQuery, setOrderQuery] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(25);
  const [showDays, setShowDays] = useState(false); // day by day stays hidden until asked for
  const [showRefunds, setShowRefunds] = useState(true);
  const [tab, setTab] = useState("summary"); // which section of the month is open
  const [check, setCheck] = useState(null); // result of "Check against eBay"
  const [checking, setChecking] = useState(false);

  async function runCheck() {
    setChecking(true);
    setCheck(null);
    try {
      const res = await fetch(`/api/finance/verify?store=${encodeURIComponent(entry.storeId)}&month=${encodeURIComponent(month)}`);
      const body = await res.json();
      setCheck(res.ok ? body : { error: body.error || "Could not check." });
    } catch {
      setCheck({ error: "Could not check." });
    }
    setChecking(false);
  }

  useEffect(() => setDraft(String(partnership.vaPercent)), [partnership.vaPercent]);
  const percent = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(percent) && percent >= 0 && percent <= 100 && Math.round(percent * 100) / 100 === percent;

  async function save() {
    setSaving(true);
    setMessage("");
    const err = await onSavePercent(entry.storeId, percent);
    setMessage(err || "Saved.");
    setSaving(false);
  }

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
      {!single && (
        <div className="section-header" style={{ marginTop: 0 }}>
          <h2 className="section-title">{entry.label}</h2>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {closed ? (
          <span className="badge badge-success" title="The figures below are frozen">
            Closed on {new Date(closed.at).toLocaleDateString("en-GB")}
          </span>
        ) : (
          <span className="badge">Open: figures are live</span>
        )}
        {entry.report && (
          <a className="btn btn-secondary btn-sm" href={exportUrl} download>
            Download Excel
          </a>
        )}
        {entry.report && !closed && (
          <button type="button" className="btn btn-primary btn-sm" onClick={closeMonth} disabled={closing}>
            {closing ? "Closing…" : "Close month"}
          </button>
        )}
        {closed && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={reopenMonth} disabled={closing}>
            Reopen month
          </button>
        )}
        {closeError && <span className="text-error" style={{ fontSize: 12.5 }}>{closeError}</span>}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label className="filter-select">
          Partnership: VA gets
          <input className="input" style={{ width: 80 }} inputMode="decimal" value={draft} disabled={Boolean(closed)} onChange={(e) => setDraft(e.target.value)} aria-label="VA share in percent" />%
        </label>
        <span className="text-muted">
          Owner gets {valid ? Math.round((100 - percent) * 100) / 100 : "…"}%
        </span>
        <button type="button" className="btn btn-secondary" onClick={save} disabled={Boolean(closed) || !valid || saving || percent === partnership.vaPercent}>
          Save split
        </button>
        {message && <span className="text-muted" role="status">{message}</span>}
      </div>

      {entry.error && (
        <p className="text-error">
          <CircleAlert size={14} style={{ verticalAlign: "-2px" }} /> {entry.error}
        </p>
      )}

      {report && (
        <>
          <div className="segmented" role="tablist" aria-label="Finance sections" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            {[
              ["summary", "Summary"],
              ["days", "Day by day"],
              ["orders", "Orders"],
              ["refunds", "Refunds & charges"],
              ["payouts", "eBay payouts"],
              ["expenses", "Extra expenses"],
              ["payments", "VA payments"],
              ["check", "eBay statement check"],
            ].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "summary" && (
            <>
              <div className="panel" style={{ padding: 16, marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div className="stat-label">Profit this month</div>
                  <div className="stat-value" style={{ fontSize: 28 }}>{money(report.profit, report.currency)}</div>
                </div>
                <div>
                  <div className="stat-label">VA gets ({partnership.vaPercent}%)</div>
                  <div className="stat-value" style={{ fontSize: 22 }}>{money(report.split.va, report.currency)}</div>
                  <div className="stat-hint">Paid {money(report.vaPaid, report.currency)}, still to pay {money(report.vaBalance, report.currency)}</div>
                </div>
                <div>
                  <div className="stat-label">Owner / investor gets ({partnership.ownerPercent}%)</div>
                  <div className="stat-value" style={{ fontSize: 22 }}>{money(report.split.owner, report.currency)}</div>
                </div>
              </div>
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-label">eBay earnings</div>
              <div className="stat-value">{money(report.earnings, report.currency)}</div>
              <div className="stat-hint">
                {report.orderCount} orders, after eBay fees{report.refunds > 0 && ` and ${money(report.refunds, report.currency)} refunds`}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Refunds</div>
              <div className="stat-value">{money(-((report.statement?.refunds || 0) + (report.statement?.returns || 0)), report.currency)}</div>
              <div className="stat-hint" title="Refunds, cancellations and returns paid back to buyers this month (after the fees eBay gave back)">
                {report.fullRefunds || 0} full, {report.partialRefunds || 0} partial
                {report.refundsOtherMonthsCount > 0 && `, ${report.refundsOtherMonthsCount} of older months`}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">AliExpress cost</div>
              <div className="stat-value">{money(report.cost, report.currency)}</div>
            </div>
            {report.returnsCount > 0 && (
              <div className="stat-card">
                <div className="stat-label">Returns settled</div>
                <div className="stat-value">{money((report.returnsRecovered || 0) - (report.returnsOutside || 0), report.currency)}</div>
                <div className="stat-hint">
                  AliExpress paid back {money(report.returnsRecovered, report.currency)}
                  {report.returnsOutside > 0 && `, paid buyers ${money(report.returnsOutside, report.currency)} outside eBay`}
                </div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-label">Other charges</div>
              <div className="stat-value">{money(report.otherCharges, report.currency)}</div>
              <div className="stat-hint">Ad fees etc.</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Extra expenses</div>
              <div className="stat-value">{money(report.expensesTotal, report.currency)}</div>
              <div className="stat-hint">Added by you</div>
            </div>
          </div>

          <div className="review-scroll" style={{ marginBottom: 10 }}>
            <table className="review-table" aria-label="Month statement">
              <tbody>
                {[
                  ["Sales (eBay: Orders, after selling fees)", report.statement?.sales ?? report.salesBeforeRefunds, false],
                  ["Refunds and cancellations (eBay: Refunds)", report.statement?.refunds ?? -report.refunds, false],
                  ["Returns refunded (eBay books them as disputes)", report.statement?.returns ?? 0, false],
                  ["Ad fees (promoted listings)", report.statement?.adFees ?? 0, false],
                  ["Listing fees", report.statement?.listingFees ?? 0, false],
                  ["Other eBay charges", report.statement?.otherFees ?? 0, false],
                  ["eBay total for the month", report.earnings + report.otherCharges, true],
                  ["AliExpress cost", -report.cost, false],
                  ["AliExpress refunds received on returns", report.returnsRecovered || 0, false],
                  ["Refunded to buyers outside eBay", -(report.returnsOutside || 0), false],
                  ["Extra expenses", -report.expensesTotal, false],
                  ["Profit", report.profit, true],
                  [`VA share (${partnership.vaPercent}%)`, report.split.va, false],
                  [`Owner / investor share (${partnership.ownerPercent}%)`, report.split.owner, false],
                  ["Paid to VA so far", report.vaPaid, false],
                  ["Still to pay the VA", report.vaBalance, true],
                ].map(([label, value, strong]) => (
                  <tr key={label} style={strong ? { fontWeight: 700 } : undefined}>
                    <td>{label}</td>
                    <td style={{ textAlign: "right" }}>{money(value, report.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(report.sharedCosts > 0 || report.otherCurrencyRows > 0 || report.failedRows > 0 || report.daysReconcile === false) && (
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              {report.sharedCosts > 0 && `${report.sharedCosts} AliExpress order(s) are linked to more than one eBay order, so their cost is split between them. `}
              {report.otherCurrencyRows > 0 && `${report.otherCurrencyRows} eBay transaction(s) in another currency were left out. `}
              {report.failedRows > 0 && `${report.failedRows} failed eBay transaction(s) were ignored. `}
              {report.daysReconcile === false && "The days do not add up to the month total: some money has no date. "}
            </p>
          )}

          {(report.missingCost > 0 || report.unconvertedCosts > 0) && (
            <p className="text-error" style={{ fontSize: 12.5 }}>
              <CircleAlert size={13} style={{ verticalAlign: "-2px" }} />{" "}
              {report.missingCost > 0 && `${report.missingCost} order(s) have no AliExpress cost yet (sync them with the extension), so their profit is overstated. `}
              {report.unconvertedCosts > 0 && `${report.unconvertedCosts} AliExpress cost(s) are in another currency and were left out.`}
            </p>
          )}
          {report.missingCostOrders?.length > 0 && (
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>
              <span className="text-muted">Orders without a cost: </span>
              {report.missingCostOrders.slice(0, 30).map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link href={`/stores/${entry.storeId}/dispatched?order=${encodeURIComponent(id)}`} className="link-accent mono" title="Open this order">
                    {id}
                  </Link>
                </span>
              ))}
            </div>
          )}
          {(() => {
            const checks = reconcile(report);
            const bad = checks.filter((c) => !c.ok);
            return bad.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 12.5 }}>
                <Check size={13} style={{ verticalAlign: "-2px" }} /> Every figure above adds up to the penny. Open "eBay statement check" to compare with eBay's statement.
              </p>
            ) : (
              <p className="text-error" style={{ fontSize: 12.5 }}>
                <CircleAlert size={13} style={{ verticalAlign: "-2px" }} /> {bad.map((c) => c.label).join("; ")}. Open "eBay statement check".
              </p>
            );
          })()}

            </>
          )}
          {tab === "refunds" && (
            <>
          {report.refundRows?.length > 0 && (
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>
              <span className="text-muted">
                eBay's statement shows Refunds as {money(-(report.statement?.refunds || 0), report.currency)}. A return paid back to a buyer is booked by eBay as a "dispute" ({money(-(report.statement?.returns || 0), report.currency)}); the statement's summary lines leave it out, but eBay does take that money, so it counts here.{" "}
              </span>
              <button type="button" className="link-accent" onClick={() => setShowRefunds((v) => !v)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}>
                {showRefunds ? "Hide refund details" : "Show refund details"}
              </button>
              {showRefunds && (
                <div className="review-scroll" style={{ marginTop: 6 }}>
                  <table className="review-table">
                    <thead>
                      <tr><th>Date</th><th>eBay order</th><th>Kind</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {report.refundRows.map((r, i) => (
                        <tr key={`${r.orderId}-${i}`}>
                          <td className="mono">{r.date}</td>
                          <td className="mono">{r.orderId}</td>
                          <td>{r.type === "DISPUTE" ? "Return refunded" : r.cancelled ? "Cancelled order" : "Refund"}</td>
                          <td>{money(r.amount, report.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {report.otherKinds?.length > 0 && (
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              Other charges are: {report.otherKinds.map((k) => `${k.kind} ${money(k.amount, report.currency)}`).join(", ")}
            </p>
          )}

          {!(report.refundRows?.length > 0) && !(report.otherKinds?.length > 0) && <p className="text-muted">No refunds or other charges this month.</p>}
            </>
          )}
          {tab === "days" && (
            <>
          {report.days?.length > 0 && (
            <div className="review-scroll" style={{ marginTop: 8 }}>
              <table className="review-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Orders</th>
                    <th>Earned</th>
                    <th>AliExpress cost</th>
                    <th>Other charges</th>
                    <th>Expenses</th>
                    <th>Returns</th>
                    <th>Profit</th>
                    <th>Running profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let running = 0;
                    return report.days.map((d) => {
                      running = Math.round((running + d.profit) * 100) / 100;
                      const empty = d.orders === 0 && d.otherCharges === 0 && !d.expenses && !d.returns;
                      return (
                        <tr key={d.date} style={empty ? { opacity: 0.5 } : undefined}>
                          <td className="mono">{d.date.slice(8, 10)} {new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</td>
                          <td>{d.orders || "–"}</td>
                          <td>{empty ? "–" : money(d.earnings, report.currency)}</td>
                          <td>{empty ? "–" : money(d.cost, report.currency)}</td>
                          <td>{d.otherCharges ? money(d.otherCharges, report.currency) : "–"}</td>
                          <td>{d.expenses ? money(d.expenses, report.currency) : "–"}</td>
                          <td>{d.returns ? money(d.returns, report.currency) : "–"}</td>
                          <td>{empty ? "–" : money(d.profit, report.currency)}</td>
                          <td>{money(running, report.currency)}</td>
                        </tr>
                      );
                    });
                  })()}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    <td>{report.orderCount}</td>
                    <td>{money(report.earnings, report.currency)}</td>
                    <td>{money(report.cost, report.currency)}</td>
                    <td>{money(report.otherCharges, report.currency)}</td>
                    <td>{money(report.expensesTotal, report.currency)}</td>
                    <td>{money((report.returnsRecovered || 0) - (report.returnsOutside || 0), report.currency)}</td>
                    <td>{money(report.profit, report.currency)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
            </>
          )}
          {tab === "orders" && (
            <>
          {(
            <div style={{ marginTop: 8 }}>
              <input
                className="input"
                type="search"
                placeholder="Search by eBay or AliExpress order number"
                value={orderQuery}
                onChange={(e) => {
                  setOrderQuery(e.target.value);
                  setOrderPage(1);
                }}
                aria-label="Search orders"
                style={{ width: "100%", maxWidth: 360, marginBottom: 8 }}
              />
            </div>
          )}
          {(() => {
            const needle = orderQuery.trim().toLowerCase();
            const rows = needle ? report.orders.filter((o) => `${o.orderId} ${(o.aliOrderIds || []).join(" ")}`.toLowerCase().includes(needle)) : report.orders;
            const paged = paginate(rows, orderPage, orderPageSize);
            return (
            <div className="review-scroll" style={{ marginTop: 8 }}>
              <table className="review-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>eBay order</th>
                    <th>Earned</th>
                    <th>Refunded</th>
                    <th>AliExpress cost</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((o) => (
                    <tr key={o.orderId}>
                      <td className="mono">{o.date ? new Date(o.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "–"}</td>
                      <td>
                        <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Link href={`/stores/${entry.storeId}/dispatched?order=${encodeURIComponent(o.orderId)}`} className="link-accent" title="Open this order in the store's orders">
                            {o.orderId}
                          </Link>
                          <CopyIcon text={o.orderId} label="Copy eBay order number" />
                        </span>
                      </td>
                      <td>{money(o.net, report.currency)}</td>
                      <td>
                        {o.refundStatus ? (
                          <span className={o.refundStatus === "full" ? "text-error" : undefined} title={o.refundStatus === "full" ? "The buyer got everything back" : "Part of the payment went back to the buyer"}>
                            {money(o.refund, report.currency)} <span className="text-muted">({o.refundStatus})</span>
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td>
                        {o.refundStatus === "full" && o.cost === null ? (
                          <span className="text-muted" title="Cancelled or fully refunded: nothing had to be bought for it">not needed</span>
                        ) : closed ? (
                          o.cost === null ? <span className="text-muted">no cost</span> : money(o.cost, report.currency)
                        ) : (
                          <CostCell order={o} currency={report.currency} onSave={(orderId, amount) => onMutate("manual-cost", "PUT", entry.storeId, { orderId, amount })} />
                        )}
                        {o.bonus > 0 && <div className="item-meta">AliExpress paid back {money(o.bonus, report.currency)} as bonus (counted when you use the bonus)</div>}
                      </td>
                      <td>{money(o.profit, report.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="text-muted">No order matches.</p>}
              <Pager
                info={paged}
                pageSize={orderPageSize}
                onPageSize={(size) => {
                  setOrderPageSize(size);
                  setOrderPage(1);
                }}
                onPage={setOrderPage}
                label="Orders per page"
              />
            </div>
            );
          })()}
            </>
          )}
          {tab === "check" && (
            <>
              <p style={{ marginBottom: 10 }}>
                <a className="btn btn-secondary btn-sm" href={`/api/finance/transactions?store=${encodeURIComponent(entry.storeId)}&month=${encodeURIComponent(month)}`} download>
                  Download this month's eBay transactions (CSV)
                </a>
              </p>
              <p className="text-muted" style={{ fontSize: 12.5 }}>
                Compare these lines with the "Transactions summary" of eBay's financial statement for the same month. Each line is every eBay transaction of one kind, added up.
              </p>
              <div className="review-scroll" style={{ marginBottom: 12 }}>
                <table className="review-table" aria-label="eBay transactions by kind">
                  <thead>
                    <tr><th>Kind of eBay transaction</th><th>Count</th><th style={{ textAlign: "right" }}>Total</th></tr>
                  </thead>
                  <tbody>
                    {(report.typeTotals || []).map((k) => (
                      <tr key={k.kind}>
                        <td>{k.kind}</td>
                        <td>{k.count}</td>
                        <td style={{ textAlign: "right" }}>{money(k.amount, report.currency)}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}>
                      <td>All transactions</td>
                      <td>{(report.typeTotals || []).reduce((n, k) => n + k.count, 0)}</td>
                      <td style={{ textAlign: "right" }}>{money((report.typeTotals || []).reduce((sum, k) => sum + Math.round(k.amount * 100), 0) / 100, report.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-muted" style={{ fontSize: 12.5 }}>
                Refunds on eBay's statement are net of the fees eBay gave back: this month {money(report.refundsNet ?? report.refunds, report.currency)} ({money(report.refunds, report.currency)} to buyers, {money(report.refundCredits || 0, report.currency)} in fees returned).
              </p>
              <div className="review-scroll" style={{ marginBottom: 12 }}>
                <table className="review-table" aria-label="Checks">
                  <tbody>
                    {reconcile(report).map((c) => (
                      <tr key={c.label}>
                        <td style={{ width: 28 }}>{c.ok ? <Check size={14} /> : <CircleAlert size={14} />}</td>
                        <td>{c.label}</td>
                        <td style={{ textAlign: "right" }} className={c.ok ? "text-muted" : "text-error"}>{c.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          <div style={{ marginBottom: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={runCheck} disabled={checking}>
              {checking ? "Checking every order…" : "Check against eBay"}
            </button>{" "}
            {check?.error && <span className="text-error">{check.error}</span>}
            {check && !check.error && check.mismatches.length === 0 && (
              <span className="text-muted" role="status">
                All {check.checked} orders match the orders page to the penny.
                {check.unavailable > 0 && ` (${check.unavailable} could not be read from eBay.)`}
                {check.skipped > 0 && ` (${check.skipped} more were not checked.)`}
              </span>
            )}
            {check && !check.error && check.later?.length > 0 && (
              <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                {check.later.length} order(s) also have money booked in another month, so their orders page total differs from this month's figure. That is normal: it is counted in that other month, the same way as on eBay's statements.
                <ul style={{ margin: "4px 0 0 16px" }}>
                  {check.later.map((m) => (
                    <li key={m.orderId} className="mono">
                      {m.orderId}: {money(m.amount, report.currency)} booked in another month
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {check && !check.error && check.mismatches.length > 0 && (
              <div className="text-error" style={{ fontSize: 12.5, marginTop: 6 }} role="status">
                {check.mismatches.length} order(s) differ (this month's figure vs eBay's own total of this month's money for the order):
                <ul style={{ margin: "4px 0 0 16px" }}>
                  {check.mismatches.map((m) => (
                    <li key={m.orderId} className="mono">
                      {m.orderId}: {money(m.finance, report.currency)} vs {money(m.ordersPage, report.currency)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

            </>
          )}
          {tab === "payouts" && <PayoutsPanel report={report} />}
          {tab === "expenses" && <ExpensesPanel report={report} month={month} storeId={entry.storeId} onMutate={onMutate} locked={Boolean(closed)} />}
          {tab === "payments" && <PaymentsPanel report={report} month={month} storeId={entry.storeId} onMutate={onMutate} />}
        </>
      )}
    </div>
  );
}

// storeId given: that store's own finance page; otherwise every store (overview).
export default function FinanceView({ storeId }) {
  const [gate, setGate] = useState("loading"); // loading | locked | open
  const [hasPin, setHasPin] = useState(true);
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lock = useCallback(() => {
    // keepalive lets this finish even while the page is being left
    fetch("/api/finance/pin", { method: "DELETE", keepalive: true }).catch(() => {});
  }, []);

  useEffect(() => {
    // The page is locked again every time it is left, so the PIN is asked for on every visit.
    lock();
    fetch("/api/finance/pin")
      .then((r) => r.json())
      .then((d) => {
        setHasPin(Boolean(d.hasPin));
        setGate("locked");
      })
      .catch(() => {
        setError("Could not check the PIN.");
        setGate("locked");
      });
    const onHide = () => lock();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      lock();
    };
  }, [lock]);

  // Closed months of this store (store pages only): the record, with Excel downloads.
  const [history, setHistory] = useState([]);
  const loadHistory = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/finance/closed?store=${encodeURIComponent(storeId)}`);
      if (res.ok) setHistory((await res.json()).months || []);
    } catch {}
  }, [storeId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/finance/report?month=${encodeURIComponent(month)}${storeId ? `&store=${encodeURIComponent(storeId)}` : ""}`);
      const body = await res.json();
      if (res.status === 403 && body.locked) {
        setGate("locked");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(body.error || "Could not load the figures.");
      setData(body);
      loadHistory();
    } catch (err) {
      setError(err.message || "Could not load the figures.");
    } finally {
      setLoading(false);
    }
  }, [month, storeId, loadHistory]);

  useEffect(() => {
    if (gate === "open") load();
  }, [gate, load]);

  async function savePercent(storeId, vaPercent) {
    const res = await fetch(`/api/finance/partnership?store=${encodeURIComponent(storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vaPercent }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (body.locked) setGate("locked");
      return body.error || "Could not save.";
    }
    await load();
    return "";
  }

  // Saves one of the hand-entered figures (manual cost, expense, payment), then reloads the month.
  async function mutate(kind, method, storeId, payload) {
    const res = await fetch(`/api/finance/${kind}?store=${encodeURIComponent(storeId)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.locked) setGate("locked");
      return body.error || "Could not save.";
    }
    await load();
    return "";
  }

  if (gate === "loading") return <div className="skeleton" style={{ height: 120, maxWidth: 360, margin: "40px auto" }} />;
  if (gate === "locked") return <PinGate hasPin={hasPin} onUnlocked={() => { setHasPin(true); setGate("open"); }} />;

  // Stores on different eBay sites earn in different currencies; they are never added into one number.
  const totalsByCurrency = {};
  for (const s of data?.stores || []) {
    if (!s.report) continue;
    const t = (totalsByCurrency[s.report.currency] ||= { va: 0, owner: 0, profit: 0, currency: s.report.currency });
    t.va += s.report.split.va;
    t.owner += s.report.split.owner;
    t.profit += s.report.profit;
  }
  const totalsList = Object.values(totalsByCurrency);
  const sumText = (key) => totalsList.map((t) => money(t[key], t.currency)).join(" + ") || money(0, "GBP");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{storeId && data?.stores?.[0] ? `Finance: ${data.stores[0].label}` : "Finance"}</h1>
          <p className="page-subtitle">{storeId ? "Day by day for the month, and each partner's share." : "All stores together. Open a store's Finance page for the day by day view."}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="input" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <button type="button" className="btn btn-secondary" onClick={() => { lock(); setGate("locked"); setData(null); }}>
            <Lock size={14} /> Lock
          </button>
        </div>
      </div>

      {error && <p className="text-error">{error}</p>}
      {loading && <LoaderCircle className="spin" size={16} />}

      {data && data.stores.length > 1 && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label"><Landmark strokeWidth={2} /> All stores: profit</div>
            <div className="stat-value">{sumText("profit")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">VAs get in total</div>
            <div className="stat-value">{sumText("va")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Owners get in total</div>
            <div className="stat-value">{sumText("owner")}</div>
          </div>
        </div>
      )}

      {data?.stores.map((entry) => (
        <StoreCard key={entry.storeId} entry={entry} onSavePercent={savePercent} single={Boolean(storeId)} month={month} onMutate={mutate} />
      ))}
      {data && data.stores.length === 0 && <p className="text-muted">No store connected yet.</p>}

      {storeId && history.length > 0 && (
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2 className="section-title">Closed months</h2>
            <a className="btn btn-secondary btn-sm" href={`/api/finance/export?store=${encodeURIComponent(storeId)}&all=1`} download>
              Download all as Excel
            </a>
          </div>
          <div className="review-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Orders</th>
                  <th>Earnings</th>
                  <th>Profit</th>
                  <th>VA share</th>
                  <th>Paid / still owed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.month}>
                    <td>
                      <button type="button" className="link-accent" style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setMonth(h.month)} title="Open this month">
                        {h.month}
                      </button>
                    </td>
                    <td>{h.orders}</td>
                    <td>{money(h.earnings, h.currency)}</td>
                    <td>{money(h.profit, h.currency)}</td>
                    <td>
                      {money(h.vaShare, h.currency)} ({h.vaPercent}%)
                    </td>
                    <td>
                      {money(h.vaPaid, h.currency)} / {h.vaBalance > 0 ? money(h.vaBalance, h.currency) : h.vaBalance < 0 ? `overpaid ${money(-h.vaBalance, h.currency)}` : "settled"}
                    </td>
                    <td>
                      <a className="link-accent" href={`/api/finance/export?store=${encodeURIComponent(storeId)}&month=${encodeURIComponent(h.month)}`} download>
                        Excel
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
