"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CircleAlert, Copy, Download, ExternalLink, Minus, Plus, Search, Trash2, LoaderCircle } from "lucide-react";

// One click copies the cell's full value (the input may show it cut off).
function CopyCell({ value, label }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      const area = document.createElement("textarea");
      area.value = value;
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
    <button
      type="button"
      className={`sheet-copy${copied ? " copied" : ""}`}
      onClick={copy}
      title={copied ? "Copied" : "Copy"}
      aria-label={label}
    >
      <Icon strokeWidth={2} />
    </button>
  );
}

const FILTERS = [
  { key: "all", label: "All rows" },
  { key: "missing", label: "Missing AliExpress link" },
  { key: "mapped", label: "Mapped" },
];

const MAX_ALI_COLUMNS = 10;
const MIN_ROWS = 30;
const ADD_ROWS = 10;
const SAVE_DELAY_MS = 800;

const aliLinksOf = (row) => (Array.isArray(row.aliLinks) ? row.aliLinks : []);
const hasAli = (row) => aliLinksOf(row).some(Boolean);
const hasContent = (row) => Boolean(row.ebayLink || row.title || row.notes || hasAli(row));

function matchesFilter(row, filter) {
  if (filter === "missing") return Boolean(row.ebayLink) && !hasAli(row);
  if (filter === "mapped") return Boolean(row.ebayLink) && hasAli(row);
  return true;
}

// The grid's columns: eBay link, one column per AliExpress link, product, notes.
// Each column knows how to read and write its value on a row.
function buildColumns(aliColumns) {
  const columns = [
    {
      id: "ebay",
      label: "eBay link",
      placeholder: "https://www.ebay.co.uk/itm/…",
      link: true,
      get: (row) => row.ebayLink || "",
      // A changed eBay link means the stored item id no longer applies.
      set: (row, value) => ({ ...row, ebayLink: value, itemId: "" }),
    },
  ];
  for (let i = 0; i < aliColumns; i += 1) {
    columns.push({
      id: `ali${i}`,
      aliIndex: i,
      label: i === 0 ? "AliExpress link" : `AliExpress link ${i + 1}`,
      placeholder: "https://www.aliexpress.com/item/…",
      link: true,
      get: (row) => aliLinksOf(row)[i] || "",
      set: (row, value) => {
        const links = [...aliLinksOf(row)];
        while (links.length <= i) links.push("");
        links[i] = value;
        return { ...row, aliLinks: links, aliLink: links[0] || "" };
      },
    });
  }
  columns.push(
    {
      id: "title",
      label: "Product",
      placeholder: "Filled in when you fetch your listings",
      get: (row) => row.title || "",
      set: (row, value) => ({ ...row, title: value }),
    },
    {
      id: "notes",
      label: "Notes",
      placeholder: "Variant, size, anything to remember",
      get: (row) => row.notes || "",
      set: (row, value) => ({ ...row, notes: value }),
    }
  );
  return columns;
}

function newRow(values = {}) {
  return { id: crypto.randomUUID(), itemId: "", title: "", imageUrl: "", ebayLink: "", aliLinks: [], aliLink: "", notes: "", ...values };
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
  const [aliColumns, setAliColumns] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rowsRef = useRef([]);
  const aliColumnsRef = useRef(1);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const tableRef = useRef(null);
  const autoFillRef = useRef(false);
  const fetchListingsRef = useRef(null);

  const columns = buildColumns(aliColumns);

  const save = useCallback(
    async (rowsToSave, { keepalive = false } = {}) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/ebay/sheet?store=${encodeURIComponent(storeId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Blank padding rows are only for display; don't send them.
          body: JSON.stringify({ rows: rowsToSave.filter(hasContent), aliColumns: aliColumnsRef.current }),
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

  function applySheet(data) {
    const loaded = padRows(data.rows || []);
    rowsRef.current = loaded;
    setRows(loaded);
    const cols = Math.min(MAX_ALI_COLUMNS, Math.max(1, data.aliColumns || 1));
    aliColumnsRef.current = cols;
    setAliColumns(cols);
  }

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
        applySheet(data);
        // Rows saved before the Image column existed have no picture. Fetch the
        // listings once per browser session to fill them in, without being asked.
        const missingImages = (data.rows || []).some((r) => r.ebayLink && !r.imageUrl);
        let alreadyTried = false;
        try {
          alreadyTried = sessionStorage.getItem(`sheet-images-${storeId}`) === "1";
          if (missingImages && !alreadyTried) sessionStorage.setItem(`sheet-images-${storeId}`, "1");
        } catch (e) {}
        if (missingImages && !alreadyTried) autoFillRef.current = true;
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the sheet.");
      }
      if (!cancelled) setLoading(false);
      if (!cancelled && autoFillRef.current) {
        autoFillRef.current = false;
        setSyncMessage("Loading product images…");
        fetchListingsRef.current?.();
      }
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

  function commit(nextRows, nextAliColumns) {
    rowsRef.current = nextRows;
    setRows(nextRows);
    if (nextAliColumns !== undefined) {
      aliColumnsRef.current = nextAliColumns;
      setAliColumns(nextAliColumns);
    }
    dirtyRef.current = true;
    setSaveState("pending");
    setError("");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      save(rowsRef.current);
    }, SAVE_DELAY_MS);
  }

  // Pull every active listing of this store's seller into the sheet. Rows that
  // already exist (and their AliExpress links) are kept; only new listings are added.
  async function fetchListings() {
    setSyncing(true);
    setSyncMessage("");
    setError("");
    try {
      // Save pending edits first so the server merges into the latest sheet.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) await save(rowsRef.current);

      const res = await fetch(`/api/ebay/sheet/sync?store=${encodeURIComponent(storeId)}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch listings.");
      applySheet(data);
      setSaveState("saved");
      const imageNote = data.imagesFilled > 0 ? ` Loaded ${data.imagesFilled} product image${data.imagesFilled === 1 ? "" : "s"}.` : "";
      setSyncMessage(
        data.added > 0
          ? `Added ${data.added} new listing${data.added === 1 ? "" : "s"} (${data.found} active on eBay).${imageNote}`
          : data.imagesFilled > 0
            ? `Loaded ${data.imagesFilled} product image${data.imagesFilled === 1 ? "" : "s"}. No new listings.`
            : `Nothing new. All ${data.found} active listings are already in the sheet.`
      );
    } catch (err) {
      setError(err.message || "Could not fetch listings.");
    }
    setSyncing(false);
  }

  fetchListingsRef.current = fetchListings;

  function updateCell(rowIndex, column, value) {
    const next = rowsRef.current.map((row, i) => (i === rowIndex ? column.set(row, value) : row));
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

  function addAliColumn() {
    if (aliColumnsRef.current >= MAX_ALI_COLUMNS) return;
    commit(rowsRef.current, aliColumnsRef.current + 1);
  }

  // The last AliExpress column can only be removed while it is empty, so no link is lost.
  const lastAliIndex = aliColumns - 1;
  const lastAliEmpty = rows.every((row) => !aliLinksOf(row)[lastAliIndex]);
  const canRemoveAliColumn = aliColumns > 1 && lastAliEmpty;

  function removeAliColumn() {
    if (!canRemoveAliColumn) return;
    const next = rowsRef.current.map((row) => {
      const links = aliLinksOf(row).slice(0, lastAliIndex);
      return { ...row, aliLinks: links, aliLink: links[0] || "" };
    });
    commit(next, aliColumnsRef.current - 1);
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
      let target = next[rowIndex + r];
      cells.forEach((cell, c) => {
        const column = columns[colIndex + c];
        if (column) target = column.set(target, cell.trim());
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

  // Rows keep their real position (`index`) for editing; `visibleRows` is what is shown.
  const needle = query.trim().toLowerCase();
  const isFiltering = Boolean(needle) || filter !== "all";
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!matchesFilter(row, filter)) return false;
      if (!needle) return true;
      return [row.title, row.ebayLink, ...aliLinksOf(row), row.notes, row.itemId].some((v) =>
        String(v || "").toLowerCase().includes(needle)
      );
    });
  const filled = rows.filter(hasContent).length;
  const mapped = rows.filter((r) => r.ebayLink && hasAli(r)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sheet mapping</h1>
          <p className="page-subtitle">
            Pair each eBay listing with its AliExpress source. Paste straight from Excel or Google Sheets.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={fetchListings} disabled={syncing || loading}>
          {syncing ? <LoaderCircle className="spin" strokeWidth={2} /> : <Download strokeWidth={2} />}
          {syncing ? "Fetching listings…" : "Fetch my listings"}
        </button>
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

      {syncMessage && (
        <p className="text-muted" role="status" style={{ marginTop: 0 }}>
          {syncMessage}
        </p>
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
          <div className="stat-hint">Have an eBay link and at least one AliExpress link</div>
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
          <div className="toolbar">
            <div className="search-field">
              <Search strokeWidth={2} />
              <input
                className="input"
                type="search"
                placeholder="Search product, link or notes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search sheet"
              />
            </div>
            <div className="segmented" role="group" aria-label="Filter rows">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? "active" : ""}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="col-controls" role="group" aria-label="AliExpress columns">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addAliColumn}
                disabled={aliColumns >= MAX_ALI_COLUMNS}
                title="Add another AliExpress link column"
              >
                <Plus strokeWidth={2.5} />
                AliExpress column
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={removeAliColumn}
                disabled={!canRemoveAliColumn}
                title={
                  aliColumns <= 1
                    ? "At least one AliExpress column is needed"
                    : canRemoveAliColumn
                      ? "Remove the last AliExpress column"
                      : "The last AliExpress column still has links. Clear them to remove it."
                }
                aria-label="Remove last AliExpress column"
              >
                <Minus strokeWidth={2.5} />
              </button>
            </div>
            <span className="table-meta">
              {isFiltering ? `${visibleRows.length} of ${filled} rows` : `${filled} rows`}
            </span>
          </div>

          <div className="panel sheet-wrap">
            <table className="sheet" ref={tableRef} style={{ minWidth: `${160 + columns.length * 230}px` }}>
              <thead>
                <tr>
                  <th className="sheet-index">#</th>
                  <th className="sheet-image">Image</th>
                  {columns.map((col) => (
                    <th key={col.id}>{col.label}</th>
                  ))}
                  <th className="sheet-actions" />
                </tr>
              </thead>
              <tbody>
                {isFiltering && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                      No rows match.
                    </td>
                  </tr>
                )}
                {visibleRows.map(({ row, index: rowIndex }, visibleIndex) => (
                  <tr key={row.id}>
                    <td className="sheet-index">{rowIndex + 1}</td>
                    <td className="sheet-image">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt={row.title || "Product"} loading="lazy" className="sheet-thumb" />
                      ) : (
                        <div className="sheet-thumb sheet-thumb-empty" />
                      )}
                    </td>
                    {columns.map((col, colIndex) => {
                      const value = col.get(row);
                      return (
                        <td key={col.id}>
                          <div className="sheet-cell">
                            <input
                              data-cell={`${visibleIndex}-${colIndex}`}
                              value={value}
                              placeholder={rowIndex === 0 ? col.placeholder : ""}
                              onChange={(e) => updateCell(rowIndex, col, e.target.value)}
                              onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                              onKeyDown={(e) => handleKeyDown(e, visibleIndex, colIndex)}
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
                            {value && <CopyCell value={value} label={`Copy ${col.label}, row ${rowIndex + 1}`} />}
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
