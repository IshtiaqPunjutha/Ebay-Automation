"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CircleAlert, ExternalLink, Plus, Trash2, LoaderCircle } from "lucide-react";

const COLUMNS = [
  { key: "ebayLink", label: "eBay link", placeholder: "https://www.ebay.co.uk/itm/…", link: true },
  { key: "aliLink", label: "AliExpress link", placeholder: "https://www.aliexpress.com/item/…", link: true },
  { key: "notes", label: "Notes", placeholder: "Variant, size, anything to remember" },
];

const MIN_ROWS = 30;
const ADD_ROWS = 10;
const SAVE_DELAY_MS = 800;

function newRow(values = {}) {
  return { id: crypto.randomUUID(), ebayLink: "", aliLink: "", notes: "", ...values };
}

function padRows(rows, minimum = MIN_ROWS) {
  const padded = [...rows];
  while (padded.length < minimum) padded.push(newRow());
  return padded;
}

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export default function SheetMappingPage() {
  const { storeId } = useParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const rowsRef = useRef([]);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const tableRef = useRef(null);

  const save = useCallback(
    async (rowsToSave, { keepalive = false } = {}) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/ebay/sheet?store=${encodeURIComponent(storeId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Blank padding rows are only for display; don't send them.
          body: JSON.stringify({ rows: rowsToSave.filter((r) => r.ebayLink || r.aliLink || r.notes) }),
          keepalive,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
        dirtyRef.current = false;
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(err.message || "Could not save the sheet.");
      }
    },
    [storeId]
  );

  // Load the saved sheet.
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/ebay/sheet?store=${encodeURIComponent(storeId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the sheet.");
        if (cancelled) return;
        const loaded = padRows(data.rows || []);
        rowsRef.current = loaded;
        setRows(loaded);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the sheet.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Any unsaved edit is flushed when you leave the page.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) save(rowsRef.current, { keepalive: true });
    };
  }, [save]);

  function commit(nextRows) {
    rowsRef.current = nextRows;
    setRows(nextRows);
    dirtyRef.current = true;
    setSaveState("pending");
    setError("");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      save(rowsRef.current);
    }, SAVE_DELAY_MS);
  }

  function updateCell(rowIndex, key, value) {
    const next = rowsRef.current.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row));
    // Typing in the last rows keeps the sheet growing, like a spreadsheet.
    commit(rowIndex >= next.length - 3 ? padRows(next, next.length + ADD_ROWS) : next);
  }

  function deleteRow(rowIndex) {
    const next = rowsRef.current.filter((_, i) => i !== rowIndex);
    commit(padRows(next));
  }

  function addRows() {
    commit([...rowsRef.current, ...Array.from({ length: ADD_ROWS }, () => newRow())]);
  }

  // Pasting from Excel / Google Sheets: tab-separated columns, newline-separated rows.
  function handlePaste(e, rowIndex, colIndex) {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text)) return; // a plain single value pastes normally
    e.preventDefault();
    const grid = text
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const next = [...rowsRef.current];
    while (next.length < rowIndex + grid.length) next.push(newRow());
    grid.forEach((cells, r) => {
      const target = { ...next[rowIndex + r] };
      cells.forEach((cell, c) => {
        const column = COLUMNS[colIndex + c];
        if (column) target[column.key] = cell.trim();
      });
      next[rowIndex + r] = target;
    });
    commit(padRows(next, next.length + ADD_ROWS));
  }

  function focusCell(rowIndex, colIndex) {
    const el = tableRef.current?.querySelector(`[data-cell="${rowIndex}-${colIndex}"]`);
    if (el) el.focus();
  }

  function handleKeyDown(e, rowIndex, colIndex) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(rowIndex + 1, colIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(rowIndex - 1, colIndex);
    }
  }

  const filled = rows.filter((r) => r.ebayLink || r.aliLink || r.notes).length;
  const mapped = rows.filter((r) => r.ebayLink && r.aliLink).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sheet mapping</h1>
          <p className="page-subtitle">
            Pair each eBay listing with its AliExpress source. Paste straight from Excel or Google Sheets.
          </p>
        </div>
        <div className="save-state" role="status" aria-live="polite">
          {saveState === "pending" && <span>Unsaved changes…</span>}
          {saveState === "saving" && (
            <span>
              <LoaderCircle className="spin" strokeWidth={2} /> Saving…
            </span>
          )}
          {saveState === "saved" && (
            <span style={{ color: "var(--success)" }}>
              <Check strokeWidth={2.5} /> Saved
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          <CircleAlert strokeWidth={2} />
          {error}
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Rows</div>
          <div className="stat-value">{loading ? "–" : filled}</div>
          <div className="stat-hint">Rows with something in them</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fully mapped</div>
          <div className="stat-value">{loading ? "–" : mapped}</div>
          <div className="stat-hint">Have both an eBay and an AliExpress link</div>
        </div>
      </div>

      {loading ? (
        <div className="panel">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="list-row">
              <div className="skeleton" style={{ height: 14, width: "70%" }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="panel sheet-wrap">
            <table className="sheet" ref={tableRef}>
              <thead>
                <tr>
                  <th className="sheet-index">#</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th className="sheet-actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <td className="sheet-index">{rowIndex + 1}</td>
                    {COLUMNS.map((col, colIndex) => {
                      const value = row[col.key];
                      return (
                        <td key={col.key}>
                          <div className="sheet-cell">
                            <input
                              data-cell={`${rowIndex}-${colIndex}`}
                              value={value}
                              placeholder={rowIndex === 0 ? col.placeholder : ""}
                              onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                              onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                              spellCheck={false}
                              aria-label={`${col.label}, row ${rowIndex + 1}`}
                            />
                            {col.link && isUrl(value) && (
                              <a
                                href={value.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="sheet-open"
                                title="Open link"
                                aria-label={`Open ${col.label} for row ${rowIndex + 1}`}
                              >
                                <ExternalLink strokeWidth={2} />
                              </a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="sheet-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => deleteRow(rowIndex)}
                        title="Delete row"
                        aria-label={`Delete row ${rowIndex + 1}`}
                      >
                        <Trash2 strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={addRows}>
              <Plus strokeWidth={2.5} />
              Add {ADD_ROWS} rows
            </button>
          </div>
        </>
      )}
    </div>
  );
}
