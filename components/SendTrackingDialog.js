"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, LoaderCircle, Truck, X } from "lucide-react";
import { CARRIER_CHOICES, CARRIER_PATTERN } from "@/lib/shipping";

const CUSTOM = "__custom__";
const BATCH = 20;

function loadSavedCarrier(storeId) {
  try {
    return localStorage.getItem(`shipCarrier:${storeId}`) || "Other";
  } catch (e) {
    return "Other";
  }
}

// The review screen for sending AliExpress tracking to eBay. Nothing is sent until the box at the
// bottom is ticked and Send is pressed; sending marks each order as shipped on eBay (the buyer is
// told) and cannot be undone from here.
//
// items: [{ orderId, buyer, summary, trackingNumber, serviceText }]
export default function SendTrackingDialog({ items: initialItems, storeId, onClose, onFinished }) {
  // The list is fixed when the screen opens: the orders page refreshes behind it after a send
  // (shipped orders drop out of "new"), which must not change what this screen shows.
  const [items] = useState(initialItems);
  const [carriers, setCarriers] = useState(() => {
    const first = loadSavedCarrier(storeId);
    const known = CARRIER_CHOICES.includes(first);
    return Object.fromEntries(items.map((i) => [i.orderId, { choice: known ? first : CUSTOM, custom: known ? "" : first }]));
  });
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !sending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const carrierFor = (orderId) => {
    const c = carriers[orderId];
    return (c.choice === CUSTOM ? c.custom : c.choice).trim();
  };
  const invalid = items.filter((i) => !CARRIER_PATTERN.test(carrierFor(i.orderId)));

  function setOne(orderId, patch) {
    setCarriers((prev) => ({ ...prev, [orderId]: { ...prev[orderId], ...patch } }));
  }

  function setAll(choice) {
    setCarriers(Object.fromEntries(items.map((i) => [i.orderId, { choice, custom: carriers[i.orderId].custom }])));
  }

  async function send() {
    setSending(true);
    setError("");
    const all = {};
    const pending = items.filter((i) => !results[i.orderId]?.ok);
    for (let start = 0; start < pending.length; start += BATCH) {
      const chunk = pending.slice(start, start + BATCH);
      try {
        const res = await fetch(`/api/ebay/ship?store=${encodeURIComponent(storeId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chunk.map((i) => ({ orderId: i.orderId, trackingNumber: i.trackingNumber, carrier: carrierFor(i.orderId) })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "eBay did not accept the request.");
        for (const r of data.results || []) all[r.orderId] = r;
      } catch (err) {
        for (const i of chunk) all[i.orderId] = { orderId: i.orderId, ok: false, error: err.message || "Could not send." };
      }
      setResults((prev) => ({ ...prev, ...all }));
    }
    try {
      localStorage.setItem(`shipCarrier:${storeId}`, carrierFor(items[0].orderId));
    } catch (e) {}
    setSending(false);
    setFinished(true);
    const okIds = Object.values(all).filter((r) => r.ok).map((r) => r.orderId);
    if (okIds.length) onFinished(okIds);
  }

  const sentCount = Object.values(results).filter((r) => r.ok).length;
  const failedCount = Object.values(results).filter((r) => r && !r.ok).length;

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Send tracking to eBay">
        <div className="dialog-header">
          <div className="dialog-title">
            <Truck strokeWidth={2} />
            Send tracking to eBay ({items.length})
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={sending} aria-label="Close">
            <X strokeWidth={2} />
          </button>
        </div>

        <p className="text-muted" style={{ marginTop: 0 }}>
          Check each line. Sending marks the order as <b>shipped on eBay</b> and tells the buyer. This cannot be undone from here.
        </p>

        {!finished && (
          <label className="filter-select" style={{ marginBottom: 8 }}>
            Carrier for all
            <select defaultValue="" onChange={(e) => e.target.value && setAll(e.target.value)} disabled={sending}>
              <option value="">Choose…</option>
              {CARRIER_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="review-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Bought</th>
                <th>Tracking</th>
                <th>Carrier on eBay</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const result = results[item.orderId];
                const c = carriers[item.orderId];
                return (
                  <tr key={item.orderId}>
                    <td>
                      <div className="mono" style={{ color: "var(--text-primary)" }}>{item.orderId}</div>
                      <div className="item-meta">{item.buyer}</div>
                    </td>
                    <td style={{ maxWidth: 220 }}>{item.summary}</td>
                    <td>
                      <div className="mono" style={{ color: "var(--text-primary)" }}>{item.trackingNumber}</div>
                      {item.serviceText && <div className="item-meta">{item.serviceText}</div>}
                    </td>
                    <td>
                      <select
                        className="input"
                        value={c.choice}
                        onChange={(e) => setOne(item.orderId, { choice: e.target.value })}
                        disabled={sending || result?.ok}
                        aria-label={`Carrier for ${item.orderId}`}
                      >
                        {CARRIER_CHOICES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        <option value={CUSTOM}>Type my own…</option>
                      </select>
                      {c.choice === CUSTOM && (
                        <input
                          className="input"
                          style={{ marginTop: 4 }}
                          placeholder="Carrier name"
                          value={c.custom}
                          onChange={(e) => setOne(item.orderId, { custom: e.target.value })}
                          disabled={sending || result?.ok}
                          aria-label={`Custom carrier for ${item.orderId}`}
                        />
                      )}
                    </td>
                    <td style={{ minWidth: 150 }}>
                      {result?.ok && (
                        <span className="badge badge-success">
                          <Check strokeWidth={2.5} />
                          Sent
                        </span>
                      )}
                      {result && !result.ok && <span className="text-error" style={{ fontSize: 12 }}>{result.error}</span>}
                      {!result && sending && <LoaderCircle className="spin" size={14} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-error">{error}</p>}

        {!finished ? (
          <>
            <label className="confirm-line">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={sending} />
              I checked the tracking numbers and carriers. I understand this marks these orders as shipped on eBay.
            </label>
            {invalid.length > 0 && (
              <p className="text-error" style={{ fontSize: 12 }}>
                <CircleAlert size={12} style={{ verticalAlign: "-1px" }} /> Choose a carrier for every order (letters and digits only).
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={send} disabled={!confirmed || sending || invalid.length > 0}>
                {sending ? "Sending…" : `Send ${items.length} to eBay`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={failedCount ? "text-error" : "text-muted"} role="status">
              {sentCount} sent{failedCount ? `, ${failedCount} not sent (see the reason on each line)` : ""}.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Close
              </button>
              {failedCount > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setFinished(false);
                    setConfirmed(false);
                  }}
                >
                  Fix and try the failed ones again
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
