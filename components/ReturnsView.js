"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/marketplaces";

const ALI_LABEL = { waiting: "Waiting", received: "Paid back", none: "Nothing back" };
const VIA_LABEL = { ebay: "eBay return", chat: "Settled in chat", other: "Other" };
const REASON = {
  NO_REASON: "No reason",
  NOT_AS_DESCRIBED: "Not as described",
  DEFECTIVE_ITEM: "Faulty item",
  WRONG_ITEM: "Wrong item",
  ARRIVED_DAMAGED: "Arrived damaged",
  ORDERED_WRONG_ITEM: "Ordered by mistake",
  NO_LONGER_NEED_ITEM: "No longer needed",
  MISSING_PARTS: "Missing parts",
  DIDNT_ARRIVE: "Did not arrive",
};

// What the buyer got back (eBay's refund plus anything paid outside eBay).
const refundedOf = (row) => Math.max(Number(row.order?.refunded) || 0, Number(row.ebay?.refund) || 0) + (Number(row.extraRefund) || 0);

// The money result of one return: what eBay left for the order (sale, fees and refund together) minus what the item
// cost on AliExpress, plus what AliExpress paid back, minus money paid to the buyer outside eBay. Negative = lost.
// null = AliExpress not settled yet; undefined = the AliExpress cost or eBay's figure is missing.
const resultOf = (row) => {
  if (row.ali.status === "waiting") return null;
  if (row.aliCost == null || row.ebayNet == null) return undefined;
  return Math.round((row.ebayNet - row.aliCost + (row.ali.status === "received" ? Number(row.ali.amount) || 0 : 0) - (Number(row.extraRefund) || 0)) * 100) / 100;
};

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12.5, minWidth: 0 }} title={hint}>
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

// A number with a small button that copies it.
function CopyNumber({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt("Copy:", text);
    }
  }
  return (
    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {text}
      <button type="button" className="link-button" onClick={copy} title="Copy the AliExpress number" style={{ fontSize: 11 }}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

// "Did AliExpress pay you back?" with the amount when it did.
function AliCell({ row, onSave }) {
  const [amount, setAmount] = useState(String(row.ali.amount || ""));
  useEffect(() => setAmount(String(row.ali.amount || "")), [row.ali.amount]);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select
        className="input"
        value={row.ali.status}
        onChange={(e) => onSave(row.orderId, { status: e.target.value, amount: e.target.value === "received" ? Number(amount) || 0 : 0, note: row.ali.note })}
        aria-label="Did AliExpress pay back?"
        style={{ width: "auto" }}
      >
        {Object.entries(ALI_LABEL).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {row.ali.status === "received" && (
        <input
          className="input"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => Number(amount) !== Number(row.ali.amount) && onSave(row.orderId, { status: "received", amount: Number(amount) || 0, note: row.ali.note })}
          style={{ width: 80 }}
          aria-label="Amount AliExpress paid back"
        />
      )}
    </div>
  );
}

// The rarely needed things of one return, shown under its row: how it was settled, date, money paid outside eBay, note.
function DetailsRow({ row, currency, onSave, columns }) {
  const [extra, setExtra] = useState(String(row.extraRefund || ""));
  const [note, setNote] = useState(row.note || "");
  useEffect(() => setExtra(String(row.extraRefund || "")), [row.extraRefund]);
  useEffect(() => setNote(row.note || ""), [row.note]);
  const result = resultOf(row);
  return (
    <tr>
      <td colSpan={columns} style={{ background: "var(--surface-2, rgba(127,127,127,0.06))" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "end" }}>
          <Field label="How it was settled">
            <select className="input" style={{ width: "100%" }} value={row.via} onChange={(e) => onSave(row.orderId, { via: e.target.value })}>
              {Object.entries(VIA_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date (decides the month)">
            <input className="input" style={{ width: "100%" }} type="date" value={row.date || ""} onChange={(e) => e.target.value && onSave(row.orderId, { date: e.target.value })} />
          </Field>
          <Field label="Paid to buyer outside eBay" hint="Money you gave the buyer outside eBay's own refund. It counts as a cost.">
            <input
              className="input"
              style={{ width: "100%" }}
              inputMode="decimal"
              placeholder="0.00"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onBlur={() => Number(extra || 0) !== Number(row.extraRefund || 0) && onSave(row.orderId, { extraRefund: Number(extra) || 0 })}
            />
          </Field>
          <Field label="Note">
            <input className="input" style={{ width: "100%" }} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (row.note || "") && onSave(row.orderId, { note })} />
          </Field>
        </div>
        <div className="item-meta" style={{ marginTop: 10, lineHeight: 1.6 }}>
          {typeof result === "number" ? (
            <>
              How the result is worked out: eBay left {formatMoney(row.ebayNet, currency)} (sale, fees and refund together), AliExpress cost {formatMoney(-row.aliCost, currency)}, AliExpress paid back{" "}
              {formatMoney(row.ali.status === "received" ? row.ali.amount : 0, currency)}
              {row.extraRefund > 0 && `, paid to buyer outside eBay ${formatMoney(-row.extraRefund, currency)}`} = {formatMoney(result, currency)}.
            </>
          ) : result === null ? (
            "The result is worked out once you say whether AliExpress paid back."
          ) : (
            "The result needs the AliExpress cost of this order (sync it with the extension)."
          )}
        </div>
      </td>
    </tr>
  );
}

export default function ReturnsView() {
  const { storeId } = useParams();
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState([]);
  const [ebayError, setEbayError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [allTime, setAllTime] = useState(false);
  const [open, setOpen] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ orderId: "", via: "chat", date: today, extra: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ebay/returns?store=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not load the returns.");
      setRows(data.rows || []);
      setEbayError(data.ebayError || "");
    } catch {
      setError("Could not load the returns.");
    }
    setLoading(false);
  }
  useEffect(() => {
    if (storeId) load();
  }, [storeId]);

  async function put(body) {
    const res = await fetch(`/api/ebay/returns?store=${encodeURIComponent(storeId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || "Could not save.");
      return false;
    }
    await load();
    return true;
  }

  async function addReturn(e) {
    e.preventDefault();
    const orderId = form.orderId.trim();
    if (!orderId) return;
    setBusy(true);
    const ok = await put({ orderId, source: "manual", via: form.via, date: form.date, extraRefund: Number(form.extra) || 0, note: form.note.trim() });
    if (ok) {
      setForm({ orderId: "", via: "chat", date: today, extra: "", note: "" });
      setAdding(false);
    }
    setBusy(false);
  }

  const shown = allTime ? rows : rows.filter((r) => (r.date || "").slice(0, 7) === month);
  // Money in the currency most orders use; returns in two currencies are not added together.
  const currency = shown.find((r) => r.order?.currency)?.order.currency || rows.find((r) => r.order?.currency)?.order.currency || "GBP";
  const refunded = shown.reduce((sum, r) => sum + refundedOf(r), 0);
  const back = shown.reduce((sum, r) => sum + (r.ali.status === "received" ? Number(r.ali.amount) || 0 : 0), 0);
  const results = shown.map(resultOf).filter((v) => typeof v === "number");
  const net = results.reduce((sum, v) => sum + v, 0);
  const waiting = shown.filter((r) => r.ali.status === "waiting").length;
  const COLUMNS = 6;

  return (
    <div>
      <div className="page-header compact-header">
        <div>
          <h1 className="page-title">Returns</h1>
          <p className="page-subtitle">Orders that came back, and whether AliExpress paid you back.</p>
        </div>
        <div className="header-tools" style={{ flexWrap: "nowrap", alignItems: "center", gap: 8 }}>
          <input className="input" type="month" value={month} disabled={allTime} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" style={{ width: "auto" }} />
          <label className="text-muted" style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> All time
          </label>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw strokeWidth={2} /> Refresh
          </button>
        </div>
      </div>

      <div className="stat-chips" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div className="stat-chip"><span className="stat-chip-label">Returns</span><span className="stat-chip-value">{shown.length}</span></div>
        <div className="stat-chip" title="Given back to buyers"><span className="stat-chip-label">Refunded to buyers</span><span className="stat-chip-value">{formatMoney(refunded, currency)}</span></div>
        <div className="stat-chip" title="Paid back by AliExpress"><span className="stat-chip-label">Paid back by AliExpress</span><span className="stat-chip-value good">{formatMoney(back, currency)}</span></div>
        <div
          className="stat-chip"
          title={`What these returns left you in total (eBay's side minus the AliExpress cost, plus what AliExpress paid back). Only settled returns count; ${waiting} still waiting.`}
        >
          <span className="stat-chip-label">Result (loss is red)</span>
          <span className="stat-chip-value" style={{ color: net < -0.005 ? "var(--error, #c0392b)" : undefined }}>{formatMoney(net, currency)}</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {!adding ? (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            + Add a return
          </button>
        ) : (
          <form onSubmit={addReturn} className="panel" style={{ padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "end" }}>
              <Field label="eBay order number">
                <input className="input" style={{ width: "100%" }} value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} placeholder="05-15336-83302" autoFocus />
              </Field>
              <Field label="How it was settled">
                <select className="input" style={{ width: "100%" }} value={form.via} onChange={(e) => setForm({ ...form, via: e.target.value })}>
                  {Object.entries(VIA_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date (decides the month)">
                <input className="input" style={{ width: "100%" }} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Paid to buyer outside eBay (optional)" hint="Only money that did not go through eBay's refund.">
                <input className="input" style={{ width: "100%" }} inputMode="decimal" placeholder="0.00" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
              </Field>
              <Field label="Note (optional)">
                <input className="input" style={{ width: "100%" }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !form.orderId.trim()}>
                Add return
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <p className="text-error">{error}</p>}
      {ebayError && (
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          eBay's own list of returns could not be read ({ebayError}). Returns you add yourself still work.
        </p>
      )}
      {loading && <LoaderCircle className="spin" size={16} />}

      {!loading && shown.length === 0 && !error && (
        <p className="text-muted">
          {rows.length > 0 ? "No returns in this month." : "No returns yet."} Returns eBay lists appear here by themselves; others can be added with the button above.
        </p>
      )}

      {shown.length > 0 && (
        <div className="review-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>Refunded to buyer</th>
                <th>Did AliExpress pay back?</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const cur = row.order?.currency || currency;
                const out = refundedOf(row);
                const result = resultOf(row);
                return (
                  <Fragment key={row.orderId}>
                    <tr>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {row.orderId}
                        <div className="item-meta">{row.date ? new Date(row.date + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC" }) : ""}</div>
                        <div className="item-meta">
                          {row.ebay ? `eBay return: ${(row.ebay.status || row.ebay.state || "").replace(/_/g, " ").toLowerCase()}${row.ebay.reason ? `, ${REASON[row.ebay.reason] || row.ebay.reason.replace(/_/g, " ").toLowerCase()}` : ""}` : VIA_LABEL[row.via] || "Manual"}
                        </div>
                      </td>
                      <td style={{ maxWidth: 300 }}>
                        <div>{row.order?.title || "Order not found on eBay"}</div>
                        <div className="item-meta">{row.order?.buyer}</div>
                        <div style={{ marginTop: 4 }}>
                          {row.aliOrderIds.length ? (
                            row.aliOrderIds.map((id) => (
                              <div key={id}>
                                <CopyNumber text={id} />
                              </div>
                            ))
                          ) : (
                            <span className="item-meta">No AliExpress number saved</span>
                          )}
                          {row.aliCost != null && <div className="item-meta">Cost on AliExpress {formatMoney(row.aliCost, cur)}</div>}
                        </div>
                      </td>
                      <td>{out > 0 ? formatMoney(out, cur) : <span className="text-muted">not refunded</span>}</td>
                      <td>
                        <AliCell row={row} onSave={(orderId, ali) => put({ orderId, ali })} />
                      </td>
                      <td>
                        {result === null ? (
                          <span className="text-muted">waiting</span>
                        ) : result === undefined ? (
                          <span className="text-muted" title="The AliExpress cost or eBay's figure for this order is missing">no cost</span>
                        ) : (
                          <strong style={{ color: result < -0.005 ? "var(--error, #c0392b)" : result > 0.005 ? "var(--success, #1a7f37)" : undefined }}>{formatMoney(result, cur)}</strong>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="link-button" onClick={() => setOpen((prev) => ({ ...prev, [row.orderId]: !prev[row.orderId] }))}>
                          {open[row.orderId] ? "Hide details" : "Details"}
                        </button>
                        {" · "}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => window.confirm("Remove this order from the returns list? (eBay's own refund is not touched.)") && put({ orderId: row.orderId, remove: true })}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    {open[row.orderId] && <DetailsRow row={row} currency={cur} columns={COLUMNS} onSave={(orderId, patch) => put({ orderId, ...patch })} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
