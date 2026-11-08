"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/marketplaces";

const ALI_LABEL = { waiting: "Waiting", received: "Received", none: "Not received" };
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

// The money result of one return: what eBay left for the order (sale, fees and refund together) minus what the
// item cost on AliExpress plus what AliExpress paid back. Negative = lost. null = AliExpress not settled yet;
// undefined = the AliExpress cost or eBay's figure is missing, so it cannot be worked out.
const resultOf = (row) => {
  if (row.ali.status === "waiting") return null;
  if (row.aliCost == null || row.ebayNet == null) return undefined;
  return Math.round((row.ebayNet - row.aliCost + (row.ali.status === "received" ? Number(row.ali.amount) || 0 : 0) - (Number(row.extraRefund) || 0)) * 100) / 100;
};

// What the buyer got back, in the order's currency: eBay's own refund figure for the order, else the return's.
const refundedOf = (row) => Math.max(Number(row.order?.refunded) || 0, Number(row.ebay?.refund) || 0) + (Number(row.extraRefund) || 0);

const VIA_LABEL = { ebay: "eBay return", chat: "Chat (manual)", other: "Other (manual)" };

// Note and "refunded outside eBay" of one return, saved when the field is left.
function ManualCell({ row, onSave }) {
  const [extra, setExtra] = useState(String(row.extraRefund || ""));
  const [note, setNote] = useState(row.note || "");
  useEffect(() => setExtra(String(row.extraRefund || "")), [row.extraRefund]);
  useEffect(() => setNote(row.note || ""), [row.note]);
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 170 }}>
      <select className="input" value={row.via} onChange={(e) => onSave(row.orderId, { via: e.target.value })} aria-label="How the buyer was settled" style={{ width: "auto" }}>
        {Object.entries(VIA_LABEL).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <input
        className="input"
        inputMode="decimal"
        placeholder="Refunded outside eBay"
        value={extra}
        onChange={(e) => setExtra(e.target.value)}
        onBlur={() => Number(extra || 0) !== Number(row.extraRefund || 0) && onSave(row.orderId, { extraRefund: Number(extra) || 0 })}
        title="Money you gave the buyer outside eBay's own refund (for example by agreement in chat). It is counted as a cost."
        aria-label="Refunded outside eBay"
      />
      <input
        className="input"
        type="date"
        value={row.date || ""}
        onChange={(e) => e.target.value && onSave(row.orderId, { date: e.target.value })}
        title="The day this return counts for (its month)"
        aria-label="Date of the return"
      />
      <input
        className="input"
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (row.note || "") && onSave(row.orderId, { note })}
        aria-label="Note"
      />
    </div>
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

function AliCell({ row, onSave }) {
  const [amount, setAmount] = useState(String(row.ali.amount || ""));
  useEffect(() => setAmount(String(row.ali.amount || "")), [row.ali.amount]);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select
        className="input"
        value={row.ali.status}
        onChange={(e) => onSave(row.orderId, { status: e.target.value, amount: e.target.value === "received" ? Number(amount) || 0 : 0, note: row.ali.note })}
        aria-label="AliExpress refund status"
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

export default function ReturnsView() {
  const { storeId } = useParams();
  const [rows, setRows] = useState([]);
  const [ebayError, setEbayError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [newVia, setNewVia] = useState("chat");
  const [newExtra, setNewExtra] = useState("");
  const [newNote, setNewNote] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [newDate, setNewDate] = useState(today);
  // The month shown (returns count in the month of their date); "All time" shows everything.
  const [month, setMonth] = useState(today.slice(0, 7));
  const [allTime, setAllTime] = useState(false);
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

  async function addManual(e) {
    e.preventDefault();
    const orderId = newOrder.trim();
    if (!orderId) return;
    setBusy(true);
    if (await put({ orderId, source: "manual", via: newVia, extraRefund: Number(newExtra) || 0, note: newNote.trim(), date: newDate })) {
      setNewOrder("");
      setNewExtra("");
      setNewNote("");
    }
    setBusy(false);
  }

  const shown = allTime ? rows : rows.filter((r) => (r.date || "").slice(0, 7) === month);
  // Money in the currency most orders use; returns in two currencies are not added together.
  const currency = shown.find((r) => r.order?.currency)?.order.currency || "GBP";
  const settled = shown.filter((r) => r.ali.status !== "waiting");
  const refunded = shown.reduce((sum, r) => sum + refundedOf(r), 0);
  const back = shown.reduce((sum, r) => sum + (r.ali.status === "received" ? Number(r.ali.amount) || 0 : 0), 0);
  const results = shown.map(resultOf).filter((v) => typeof v === "number");
  const net = results.reduce((sum, v) => sum + v, 0);
  const waiting = shown.length - settled.length;

  return (
    <div>
      <div className="page-header compact-header">
        <div>
          <h1 className="page-title">Returns</h1>
          <p className="page-subtitle">
            Orders that came back, and whether AliExpress paid you back for each. The loss is what you refunded the buyer minus what AliExpress returned.
          </p>
        </div>
        <div className="header-tools">
          {shown.length > 0 && (
            <div className="stat-chips">
              <div className="stat-chip"><span className="stat-chip-label">Returns</span><span className="stat-chip-value">{rows.length}</span></div>
              <div className="stat-chip" title="Given back to buyers on eBay"><span className="stat-chip-label">Refunded to buyers</span><span className="stat-chip-value">{formatMoney(refunded, currency)}</span></div>
              <div className="stat-chip" title="Paid back by AliExpress"><span className="stat-chip-label">Back from AliExpress</span><span className="stat-chip-value good">{formatMoney(back, currency)}</span></div>
              <div className="stat-chip" title={`What these returns left you in total: eBay's side after fees and refund, minus the AliExpress cost, plus what AliExpress paid back. Only settled returns count (${waiting} still waiting).`}>
                <span className="stat-chip-label">Result</span>
                <span className="stat-chip-value" style={{ color: net < -0.005 ? "var(--error, #c0392b)" : undefined }}>{formatMoney(net, currency)}</span>
              </div>
            </div>
          )}
          <input className="input" type="month" value={month} disabled={allTime} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <label className="text-muted" style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> All time
          </label>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw strokeWidth={2} /> Refresh
          </button>
        </div>
      </div>

      <form onSubmit={addManual} style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="eBay order number of a returned order"
          value={newOrder}
          onChange={(e) => setNewOrder(e.target.value)}
          style={{ width: 300, maxWidth: "100%" }}
          aria-label="eBay order number"
        />
        <select className="input" value={newVia} onChange={(e) => setNewVia(e.target.value)} aria-label="How the buyer was settled" style={{ width: "auto" }}>
          <option value="chat">Settled in chat (no eBay return)</option>
          <option value="ebay">eBay return</option>
          <option value="other">Other</option>
        </select>
        <input
          className="input"
          inputMode="decimal"
          placeholder="Refunded outside eBay (optional)"
          value={newExtra}
          onChange={(e) => setNewExtra(e.target.value)}
          style={{ width: 210 }}
          aria-label="Refunded outside eBay"
        />
        <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Date of the return" title="The day this return counts for (its month)" />
        <input className="input" placeholder="Note (optional)" value={newNote} onChange={(e) => setNewNote(e.target.value)} style={{ width: 200 }} aria-label="Note" />
        <button type="submit" className="btn btn-secondary" disabled={busy || !newOrder.trim()}>
          Add return
        </button>
      </form>

      {error && <p className="text-error">{error}</p>}
      {ebayError && (
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          eBay's own list of returns could not be read ({ebayError}). Orders you mark by hand still work.
        </p>
      )}
      {loading && <LoaderCircle className="spin" size={16} />}

      {!loading && shown.length === 0 && !error && (
        <p className="text-muted">
          {rows.length > 0 ? "No returns in this month." : "No returns yet."} Returns eBay lists appear here by themselves; any other order can be added above.
        </p>
      )}

      {shown.length > 0 && (
        <div className="review-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>eBay return</th>
                <th>How / note</th>
                <th>Refunded to buyer</th>
                <th>AliExpress refund</th>
                <th title="eBay's side after fees and the refund, minus the AliExpress cost, plus what AliExpress paid back">Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const out = refundedOf(row);
                const cur = row.order?.currency || currency;
                const result = resultOf(row);
                return (
                  <tr key={row.orderId}>
                    <td className="mono">
                      {row.orderId}
                      <div className="item-meta">{row.order?.date ? new Date(row.order.date).toLocaleDateString("en-GB") : "order not found on eBay"}</div>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      <div>{row.order?.title || "—"}</div>
                      <div className="item-meta">{row.order?.buyer}</div>
                      {/* The AliExpress number(s) of this order, right under the item. */}
                      <div style={{ marginTop: 6 }}>
                        {row.aliOrderIds.length ? (
                          row.aliOrderIds.map((id) => (
                            <div key={id}>
                              <CopyNumber text={id} />
                            </div>
                          ))
                        ) : (
                          <span className="item-meta">No AliExpress number saved</span>
                        )}
                        {row.aliCost != null && <div className="item-meta">cost {formatMoney(row.aliCost, row.order?.currency || currency)}</div>}
                      </div>
                    </td>
                    <td>
                      {row.ebay ? (
                        <>
                          <div>{(row.ebay.status || row.ebay.state || "").replace(/_/g, " ").toLowerCase()}</div>
                          <div className="item-meta">{REASON[row.ebay.reason] || row.ebay.reason.replace(/_/g, " ").toLowerCase()}</div>
                        </>
                      ) : (
                        <span className="text-muted">No eBay return</span>
                      )}
                    </td>
                    <td>
                      <ManualCell row={row} onSave={(orderId, patch) => put({ orderId, ...patch })} />
                    </td>
                    <td>{out > 0 ? formatMoney(out, cur) : <span className="text-muted">not refunded yet</span>}</td>
                    <td>
                      <AliCell row={row} onSave={(orderId, ali) => put({ orderId, ali })} />
                    </td>
                    <td>
                      {result === null ? (
                        <span className="text-muted">waiting</span>
                      ) : result === undefined ? (
                        <span className="text-muted" title="The AliExpress cost or eBay's figure for this order is missing">no cost</span>
                      ) : (
                        <strong
                          style={{ color: result < -0.005 ? "var(--error, #c0392b)" : result > 0.005 ? "var(--success, #1a7f37)" : undefined }}
                          title={`eBay ${formatMoney(row.ebayNet, cur)} - AliExpress cost ${formatMoney(row.aliCost, cur)} + AliExpress refund ${formatMoney(row.ali.status === "received" ? row.ali.amount : 0, cur)}`}
                        >
                          {formatMoney(result, cur)}
                        </strong>
                      )}
                      {typeof result === "number" && (
                        <div className="item-meta" style={{ lineHeight: 1.5 }}>
                          <div title="What eBay left for this order after the sale, its fees and the refund: fees eBay did not give back show up here">eBay {formatMoney(row.ebayNet, cur)}</div>
                          <div>AliExpress cost -{formatMoney(row.aliCost, cur).replace("-", "")}</div>
                          <div>AliExpress back +{formatMoney(row.ali.status === "received" ? row.ali.amount : 0, cur).replace("-", "")}</div>
                          {row.extraRefund > 0 && <div>Outside eBay -{formatMoney(row.extraRefund, cur).replace("-", "")}</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => window.confirm("Remove this order from the returns list? (eBay's own refund is not touched.)") && put({ orderId: row.orderId, remove: true })}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
