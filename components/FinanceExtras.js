"use client";

import { useEffect, useState } from "react";

export const money = (value, currency) => {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP" }).format(n);
  } catch {
    return n.toFixed(2);
  }
};

const linkButton = { background: "none", border: 0, cursor: "pointer", padding: 0 };
const isMoney = (n) => Number.isFinite(n) && n >= 0 && Math.round(n * 100) / 100 === n;

// The cost cell of an order row: shows the cost and lets a person type their own (it replaces the AliExpress figure).
export function CostCell({ order, currency, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(value) {
    setBusy(true);
    const err = await onSave(order.orderId, value);
    setBusy(false);
    if (err) setError(err);
    else {
      setEditing(false);
      setError("");
    }
  }

  if (editing) {
    const n = Number(draft);
    const valid = draft.trim() !== "" && isMoney(n);
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ width: 80 }}
          inputMode="decimal"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) save(n);
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label={`Cost of ${order.orderId}`}
        />
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid || busy} onClick={() => save(n)}>
          Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {order.manualCost && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(null)} title="Use the AliExpress figure again">
            Remove mine
          </button>
        )}
        {error && <span className="text-error" style={{ fontSize: 12 }}>{error}</span>}
      </span>
    );
  }
  return (
    <span>
      {order.cost === null ? <span className="text-muted">no cost yet</span> : money(order.cost, currency)}
      {order.manualCost && <span className="text-muted" style={{ fontSize: 11 }}> (typed)</span>}{" "}
      <button
        type="button"
        className="link-accent"
        style={{ ...linkButton, fontSize: 12 }}
        onClick={() => {
          setDraft(order.cost === null ? "" : String(order.cost));
          setEditing(true);
        }}
      >
        {order.cost === null ? "Add cost" : "Edit"}
      </button>
    </span>
  );
}

function lastDay(month) {
  const [y, m] = month.split("-").map(Number);
  return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
}

// Today if it falls in the month, otherwise the last day of the month.
function defaultDate(month) {
  const today = new Date().toISOString().slice(0, 10);
  return today.startsWith(month) ? today : `${month}-${lastDay(month)}`;
}

// Extra expenses of the month (not on eBay): listed, added and deleted here. They reduce the profit.
export function ExpensesPanel({ report, month, storeId, onMutate, locked = false }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate(month));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDate(defaultDate(month)), [month]);

  const n = Number(amount);
  const valid = label.trim() !== "" && amount.trim() !== "" && isMoney(n) && n > 0 && date.startsWith(month);

  async function add() {
    setBusy(true);
    const err = await onMutate("expenses", "POST", storeId, { month, label, amount: n, date });
    setBusy(false);
    setError(err || "");
    if (!err) {
      setLabel("");
      setAmount("");
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 className="section-title" style={{ fontSize: 14 }}>
        Extra expenses this month: {money(report.expensesTotal, report.currency)}
      </h3>
      <p className="text-muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Things eBay does not know about (tools, packaging ...). They are taken off the profit, so both partners share them.
      </p>
      {report.expenses.length > 0 && (
        <table className="review-table" style={{ marginBottom: 8 }}>
          <tbody>
            {[...report.expenses]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((e) => (
                <tr key={e.id}>
                  <td className="mono">
                    {e.date.slice(8, 10)}/{e.date.slice(5, 7)}
                  </td>
                  <td>{e.label}</td>
                  <td>{money(e.amount, report.currency)}</td>
                  <td>
                    {!locked && (
                      <button
                        type="button"
                        className="link-accent"
                        style={linkButton}
                        onClick={() => confirm(`Delete "${e.label}"?`) && onMutate("expenses", "DELETE", storeId, { month, id: e.id })}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {locked ? (
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          This month is closed. Reopen it to change the expenses.
        </p>
      ) : (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="What for" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} aria-label="Expense label" />
        <input className="input" style={{ width: 90 }} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Expense amount" />
        <input
          className="input"
          type="date"
          value={date}
          min={`${month}-01`}
          max={`${month}-${lastDay(month)}`}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Expense date"
        />
        <button type="button" className="btn btn-secondary btn-sm" disabled={!valid || busy} onClick={add}>
          Add expense
        </button>
        {error && <span className="text-error" style={{ fontSize: 12 }}>{error}</span>}
      </div>
      )}
    </div>
  );
}

// What the VA is owed for the month, what has been paid, and the payments themselves.
export function PaymentsPanel({ report, month, storeId, onMutate }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const valid = amount.trim() !== "" && isMoney(n) && n > 0 && Boolean(date);

  async function add() {
    setBusy(true);
    const err = await onMutate("payments", "POST", storeId, { month, amount: n, date, note });
    setBusy(false);
    setError(err || "");
    if (!err) {
      setAmount("");
      setNote("");
    }
  }

  const balance = report.vaBalance;
  return (
    <div style={{ marginTop: 16 }}>
      <h3 className="section-title" style={{ fontSize: 14 }}>
        VA payments: owed {money(report.split.va, report.currency)}, paid {money(report.vaPaid, report.currency)},{" "}
        {balance > 0 ? `still to pay ${money(balance, report.currency)}` : balance < 0 ? `overpaid by ${money(-balance, report.currency)}` : "settled"}
      </h3>
      {report.payments.length > 0 && (
        <table className="review-table" style={{ marginBottom: 8 }}>
          <tbody>
            {[...report.payments]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.date}</td>
                  <td>{money(p.amount, report.currency)}</td>
                  <td>{p.note}</td>
                  <td>
                    <button
                      type="button"
                      className="link-accent"
                      style={linkButton}
                      onClick={() => confirm(`Delete the payment of ${money(p.amount, report.currency)}?`) && onMutate("payments", "DELETE", storeId, { id: p.id })}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" style={{ width: 90 }} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Payment amount" />
        <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Payment date" />
        <input className="input" placeholder="Note (optional)" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} aria-label="Payment note" />
        {balance > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount(String(balance))} title="Fill in what is still owed">
            Owed: {money(balance, report.currency)}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" disabled={!valid || busy} onClick={add}>
          Record payment
        </button>
        {error && <span className="text-error" style={{ fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}
