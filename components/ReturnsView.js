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

// What the buyer got back, in the order's currency: eBay's own refund figure for the order, else the return's.
const refundedOf = (row) => Math.max(Number(row.order?.refunded) || 0, Number(row.ebay?.refund) || 0);

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
    if (await put({ orderId, source: "manual" })) setNewOrder("");
    setBusy(false);
  }

  // Money in the currency most orders use; returns in two currencies are not added together.
  const currency = rows.find((r) => r.order?.currency)?.order.currency || "GBP";
  const settled = rows.filter((r) => r.ali.status !== "waiting");
  const refunded = rows.reduce((sum, r) => sum + refundedOf(r), 0);
  const back = rows.reduce((sum, r) => sum + (r.ali.status === "received" ? Number(r.ali.amount) || 0 : 0), 0);
  const lost = settled.reduce((sum, r) => sum + refundedOf(r) - (r.ali.status === "received" ? Number(r.ali.amount) || 0 : 0), 0);
  const waiting = rows.length - settled.length;

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
          {rows.length > 0 && (
            <div className="stat-chips">
              <div className="stat-chip"><span className="stat-chip-label">Returns</span><span className="stat-chip-value">{rows.length}</span></div>
              <div className="stat-chip" title="Given back to buyers on eBay"><span className="stat-chip-label">Refunded to buyers</span><span className="stat-chip-value">{formatMoney(refunded, currency)}</span></div>
              <div className="stat-chip" title="Paid back by AliExpress"><span className="stat-chip-label">Back from AliExpress</span><span className="stat-chip-value good">{formatMoney(back, currency)}</span></div>
              <div className="stat-chip" title={`Only returns that are settled with AliExpress count here (${waiting} still waiting)`}>
                <span className="stat-chip-label">Lost</span>
                <span className="stat-chip-value" style={{ color: lost > 0 ? "var(--error, #c0392b)" : undefined }}>{formatMoney(lost, currency)}</span>
              </div>
            </div>
          )}
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
        <button type="submit" className="btn btn-secondary" disabled={busy || !newOrder.trim()}>
          Mark as return
        </button>
      </form>

      {error && <p className="text-error">{error}</p>}
      {ebayError && (
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          eBay's own list of returns could not be read ({ebayError}). Orders you mark by hand still work.
        </p>
      )}
      {loading && <LoaderCircle className="spin" size={16} />}

      {!loading && rows.length === 0 && !error && (
        <p className="text-muted">No returns yet. Returns eBay lists appear here by themselves; any other order can be marked above.</p>
      )}

      {rows.length > 0 && (
        <div className="review-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>eBay return</th>
                <th>Refunded to buyer</th>
                <th>AliExpress refund</th>
                <th>Loss</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const out = refundedOf(row);
                const cur = row.order?.currency || currency;
                const rowLoss = row.ali.status === "waiting" ? null : out - (row.ali.status === "received" ? Number(row.ali.amount) || 0 : 0);
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
                        <span className="text-muted">Marked by hand</span>
                      )}
                    </td>
                    <td>{out > 0 ? formatMoney(out, cur) : <span className="text-muted">not refunded yet</span>}</td>
                    <td>
                      <AliCell row={row} onSave={(orderId, ali) => put({ orderId, ali })} />
                    </td>
                    <td>
                      {rowLoss == null ? (
                        <span className="text-muted">waiting</span>
                      ) : (
                        <strong style={{ color: rowLoss > 0.005 ? "var(--error, #c0392b)" : undefined }}>{formatMoney(rowLoss, cur)}</strong>
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
