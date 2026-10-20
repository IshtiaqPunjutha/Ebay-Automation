"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, Copy, Landmark, LoaderCircle, Lock } from "lucide-react";
import { CostCell, ExpensesPanel, PaymentsPanel } from "./FinanceExtras";
import { Pager, paginate } from "./Pager";

const money = (value, currency) => {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(n);
  } catch {
    return n.toFixed(2);
  }
};

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
  const { report, partnership } = entry;
  const [draft, setDraft] = useState(String(partnership.vaPercent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showOrders, setShowOrders] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(25);
  const [showDays, setShowDays] = useState(Boolean(single));
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
        <label className="filter-select">
          Partnership: VA gets
          <input className="input" style={{ width: 80 }} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="VA share in percent" />%
        </label>
        <span className="text-muted">
          Owner gets {valid ? Math.round((100 - percent) * 100) / 100 : "…"}%
        </span>
        <button type="button" className="btn btn-secondary" onClick={save} disabled={!valid || saving || percent === partnership.vaPercent}>
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
          <div className="stat-grid compact">
            <div className="stat-card">
              <div className="stat-label">eBay earnings</div>
              <div className="stat-value">{money(report.earnings, report.currency)}</div>
              <div className="stat-hint">{report.orderCount} orders, after eBay fees</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">AliExpress cost</div>
              <div className="stat-value">{money(report.cost, report.currency)}</div>
            </div>
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
            <div className="stat-card">
              <div className="stat-label">Profit</div>
              <div className="stat-value">{money(report.profit, report.currency)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">VA share ({partnership.vaPercent}%)</div>
              <div className="stat-value">{money(report.split.va, report.currency)}</div>
              <div className="stat-hint">Paid {money(report.vaPaid, report.currency)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Owner share ({partnership.ownerPercent}%)</div>
              <div className="stat-value">{money(report.split.owner, report.currency)}</div>
            </div>
          </div>

          {report.otherKinds?.length > 0 && (
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              Other charges are: {report.otherKinds.map((k) => `${k.kind} ${money(k.amount, report.currency)}`).join(", ")}
            </p>
          )}

          {(report.sharedCosts > 0 || report.otherCurrencyRows > 0 || report.failedRows > 0 || report.daysReconcile === false) && (
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              {report.sharedCosts > 0 && `${report.sharedCosts} AliExpress order(s) are linked to more than one eBay order, so their cost is split between them. `}
              {report.otherCurrencyRows > 0 && `${report.otherCurrencyRows} eBay transaction(s) in another currency were left out. `}
              {report.failedRows > 0 && `${report.failedRows} failed eBay transaction(s) were ignored. `}
              {report.daysReconcile === false && "The days do not add up to the month total: some money has no date. "}
            </p>
          )}

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
            {check && !check.error && check.mismatches.length > 0 && (
              <div className="text-error" style={{ fontSize: 12.5, marginTop: 6 }} role="status">
                {check.mismatches.length} order(s) differ (this month's figure vs the orders page, which also counts refunds or fees from other months):
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

          {(report.missingCost > 0 || report.unconvertedCosts > 0) && (
            <p className="text-error" style={{ fontSize: 12.5 }}>
              <CircleAlert size={13} style={{ verticalAlign: "-2px" }} />{" "}
              {report.missingCost > 0 && `${report.missingCost} order(s) have no AliExpress cost yet (sync them with the extension), so their profit is overstated. `}
              {report.unconvertedCosts > 0 && `${report.unconvertedCosts} AliExpress cost(s) are in another currency and were left out.`}
            </p>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button type="button" className="link-accent" onClick={() => setShowDays((v) => !v)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}>
            {showDays ? "Hide day by day" : "Show day by day"}
          </button>
          <button type="button" className="link-accent" onClick={() => setShowOrders((v) => !v)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}>
            {showOrders ? "Hide orders" : "Show orders"}
          </button>
          </div>
          {showDays && report.days?.length > 0 && (
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
                    <th>Profit</th>
                    <th>Running profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let running = 0;
                    return report.days.map((d) => {
                      running = Math.round((running + d.profit) * 100) / 100;
                      const empty = d.orders === 0 && d.otherCharges === 0 && !d.expenses;
                      return (
                        <tr key={d.date} style={empty ? { opacity: 0.5 } : undefined}>
                          <td className="mono">{d.date.slice(8, 10)} {new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</td>
                          <td>{d.orders || "–"}</td>
                          <td>{empty ? "–" : money(d.earnings, report.currency)}</td>
                          <td>{empty ? "–" : money(d.cost, report.currency)}</td>
                          <td>{d.otherCharges ? money(d.otherCharges, report.currency) : "–"}</td>
                          <td>{d.expenses ? money(d.expenses, report.currency) : "–"}</td>
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
                    <td>{money(report.profit, report.currency)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {showOrders && (
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
          {showOrders && (() => {
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
                      <td><CostCell order={o} currency={report.currency} onSave={(orderId, amount) => onMutate("manual-cost", "PUT", entry.storeId, { orderId, amount })} /></td>
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
          <ExpensesPanel report={report} month={month} storeId={entry.storeId} onMutate={onMutate} />
          <PaymentsPanel report={report} month={month} storeId={entry.storeId} onMutate={onMutate} />
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
    } catch (err) {
      setError(err.message || "Could not load the figures.");
    } finally {
      setLoading(false);
    }
  }, [month, storeId]);

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

  const totals = (data?.stores || []).reduce(
    (t, s) => (s.report ? { va: t.va + s.report.split.va, owner: t.owner + s.report.split.owner, profit: t.profit + s.report.profit, currency: s.report.currency } : t),
    { va: 0, owner: 0, profit: 0, currency: "GBP" }
  );

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
            <div className="stat-value">{money(totals.profit, totals.currency)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">VAs get in total</div>
            <div className="stat-value">{money(totals.va, totals.currency)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Owners get in total</div>
            <div className="stat-value">{money(totals.owner, totals.currency)}</div>
          </div>
        </div>
      )}

      {data?.stores.map((entry) => (
        <StoreCard key={entry.storeId} entry={entry} onSavePercent={savePercent} single={Boolean(storeId)} month={month} onMutate={mutate} />
      ))}
      {data && data.stores.length === 0 && <p className="text-muted">No store connected yet.</p>}
    </div>
  );
}
