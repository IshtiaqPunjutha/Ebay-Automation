"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, LoaderCircle, Timer, X } from "lucide-react";
import { CARRIER_CHOICES, CARRIER_PATTERN } from "@/lib/shipping";

const CUSTOM = "__custom__";

// Settings for sending tracking to eBay automatically before the dispatch-by date, plus a preview of
// what would go out right now and a log of what the daily job already did.
export default function AutoShipDialog({ storeId, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(2);
  const [choice, setChoice] = useState("Other");
  const [custom, setCustom] = useState("");
  const [log, setLog] = useState([]);
  const [cronReady, setCronReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const base = `/api/ebay/autoship?store=${encodeURIComponent(storeId)}`;
  const carrier = (choice === CUSTOM ? custom : choice).trim();

  useEffect(() => {
    fetch(base)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEnabled(Boolean(data.settings.enabled));
        setDaysBefore(data.settings.daysBefore);
        const known = CARRIER_CHOICES.includes(data.settings.carrier);
        setChoice(known ? data.settings.carrier : CUSTOM);
        setCustom(known ? "" : data.settings.carrier);
        setLog(data.log || []);
        setCronReady(data.cronReady !== false);
        setLoaded(true);
      })
      .catch((err) => setError(err.message || "Could not load the settings."));
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [base, onClose]);

  async function save(nextEnabled) {
    if (nextEnabled && !CARRIER_PATTERN.test(carrier)) {
      setError("Choose a carrier first (letters and digits only).");
      return;
    }
    if (
      nextEnabled &&
      !confirm(
        `Turn on automatic sending?\n\nOnce a day, orders with AliExpress tracking will be marked as SHIPPED on eBay (the buyer is told) starting ${daysBefore} day(s) before their dispatch-by date. This cannot be undone from the dashboard.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, daysBefore: Number(daysBefore), carrier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setEnabled(Boolean(data.settings.enabled));
      setMessage(data.settings.enabled ? "Automatic sending is ON for this store." : "Automatic sending is OFF.");
    } catch (err) {
      setError(err.message || "Could not save.");
    }
    setSaving(false);
  }

  async function runPreview() {
    setPreviewing(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch(`${base}&preview=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check.");
      if (data.previewError) throw new Error(data.previewError);
      setPreview(data.preview);
    } catch (err) {
      setError(err.message || "Could not check.");
    }
    setPreviewing(false);
  }

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Automatic sending of tracking">
        <div className="dialog-header">
          <div className="dialog-title">
            <Timer strokeWidth={2} />
            Automatic tracking for this store
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X strokeWidth={2} />
          </button>
        </div>

        <p className="text-muted" style={{ marginTop: 0 }}>
          If you have not added tracking yourself, the dashboard sends it to eBay for you shortly before eBay&apos;s
          <b> dispatch-by date</b>. Once a day it looks at the unshipped orders; an order is sent only when its AliExpress
          tracking was read by the extension, it has exactly one AliExpress order, and the dispatch-by date is
          {" "}{daysBefore} day(s) away or already past. Sending marks the order <b>shipped on eBay</b> and cannot be undone here.
        </p>

        {!cronReady && (
          <div className="alert" role="alert">
            <CircleAlert strokeWidth={2} />
            <div>
              The daily job is not set up yet: add a <b>CRON_SECRET</b> (any random text of 16+ characters) to the project&apos;s
              environment variables in Vercel and redeploy. Until then nothing is sent automatically.
            </div>
          </div>
        )}
        {error && <p className="text-error">{error}</p>}
        {message && <p className="text-muted" role="status">{message}</p>}

        {!loaded && !error ? (
          <p className="text-muted">Loading…</p>
        ) : (
          loaded && (
            <>
              <div className="auto-grid">
                <label className="filter-select">
                  Send
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="14"
                    style={{ width: 70 }}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(e.target.value)}
                    disabled={saving}
                    aria-label="Days before the dispatch-by date"
                  />
                  day(s) before the dispatch-by date
                </label>
                <label className="filter-select">
                  Carrier on eBay
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={saving}>
                    {CARRIER_CHOICES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value={CUSTOM}>Type my own…</option>
                  </select>
                  {choice === CUSTOM && (
                    <input className="input" style={{ width: 150 }} placeholder="Carrier name" value={custom} onChange={(e) => setCustom(e.target.value)} />
                  )}
                </label>
              </div>

              <div className="dialog-actions">
                {enabled ? (
                  <>
                    <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
                      Save changes
                    </button>
                    <button type="button" className="btn btn-danger-ghost" onClick={() => save(false)} disabled={saving}>
                      Turn off
                    </button>
                    <span className="badge badge-success"><Check strokeWidth={2.5} />ON</span>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving}>
                    Turn on automatic sending
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={runPreview} disabled={previewing}>
                  {previewing ? <LoaderCircle className="spin" size={14} /> : null}
                  What would be sent now?
                </button>
              </div>

              {preview && (
                <div className="auto-preview">
                  <div className="section-title" style={{ fontSize: 13 }}>
                    Would send now: {preview.due.length}
                  </div>
                  {preview.due.length === 0 && <div className="item-meta">Nothing is due right now.</div>}
                  {preview.due.map((d) => (
                    <div key={d.orderId} className="auto-row">
                      <span className="mono">{d.orderId}</span> {d.buyer} · {d.trackingNumber} · {d.carrier} · dispatch by {String(d.shipBy).slice(0, 10)}
                    </div>
                  ))}
                  <div className="section-title" style={{ fontSize: 13, marginTop: 10 }}>
                    Left alone: {preview.waiting.length}
                  </div>
                  {preview.waiting.map((w) => (
                    <div key={w.orderId} className="auto-row">
                      <span className="mono">{w.orderId}</span> {w.buyer} · <span className="item-meta">{w.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-title" style={{ fontSize: 13, marginTop: 14 }}>
                Sent automatically (latest)
              </div>
              {log.length === 0 ? (
                <div className="item-meta">Nothing yet.</div>
              ) : (
                log.slice(0, 12).map((l, i) => (
                  <div key={`${l.orderId}-${i}`} className="auto-row">
                    {new Date(l.at).toLocaleString()} · <span className="mono">{l.orderId}</span> ·{" "}
                    {l.ok ? <span style={{ color: "var(--success)" }}>sent {l.trackingNumber}</span> : <span className="text-error">failed: {l.error}</span>}
                  </div>
                ))
              )}
            </>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
