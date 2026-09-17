"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStores() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ebay/stores");
      const data = await res.json();
      setStores(data.stores || []);
      if (data.error) setError(data.error);
    } catch (err) {
      setError("Could not load connected stores.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStores();
    function handleVisibility() {
      if (document.visibilityState === "visible") loadStores();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  async function handleDisconnect(storeId, label) {
    if (!confirm(`Disconnect "${label}"? You can reconnect it later.`)) return;
    await fetch("/api/ebay/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    setStores((prev) => prev.filter((s) => s.storeId !== storeId));
  }

  return (
    <div>
      <div style={styles.sectionHeader}>
        <div>
          <h1 style={styles.title}>Stores</h1>
          <p style={styles.subtitle}>All eBay seller accounts connected to this dashboard.</p>
        </div>
        <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
          + Connect New Store
        </a>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {loading && <p style={{ color: "#8a8f98" }}>Loading stores…</p>}

      {!loading && stores.length === 0 && (
        <div style={styles.emptyCard}>
          <p style={{ color: "#c7cad1", marginBottom: "16px" }}>
            No eBay store connected yet.
          </p>
          <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
            Connect Your eBay Store
          </a>
        </div>
      )}

      {stores.length > 0 && (
        <div style={styles.list}>
          {stores.map((s) => (
            <div key={s.storeId} style={styles.row}>
              <div style={styles.rowInfo}>
                <div style={styles.rowLabel}>{s.label}</div>
                <div style={styles.rowMeta}>
                  Connected {new Date(s.connectedAt).toLocaleDateString()}
                </div>
              </div>
              <div style={styles.rowActions}>
                <Link href={`/stores/${s.storeId}`} style={styles.viewBtn}>
                  View Orders
                </Link>
                <button
                  onClick={() => handleDisconnect(s.storeId, s.label)}
                  style={styles.disconnectBtn}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
  },
  title: { color: "#fff", fontSize: "22px", margin: "0 0 4px 0" },
  subtitle: { color: "#8a8f98", fontSize: "13px", margin: 0 },
  primaryBtn: {
    display: "inline-block",
    background: "#3b82f6",
    color: "#fff",
    padding: "9px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  emptyCard: {
    background: "#1a1d24",
    border: "1px solid #22252d",
    padding: "32px",
    borderRadius: "12px",
    textAlign: "center",
  },
  list: { display: "flex", flexDirection: "column", gap: "10px" },
  row: {
    background: "#1a1d24",
    border: "1px solid #22252d",
    borderRadius: "10px",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowInfo: {},
  rowLabel: { color: "#fff", fontSize: "15px", fontWeight: 600 },
  rowMeta: { color: "#8a8f98", fontSize: "12px", marginTop: "4px" },
  rowActions: { display: "flex", gap: "8px" },
  viewBtn: {
    background: "#3b82f6",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 600,
  },
  disconnectBtn: {
    background: "transparent",
    border: "1px solid #3a1f22",
    color: "#f87171",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    cursor: "pointer",
  },
};
