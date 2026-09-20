"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardOverview() {
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

  return (
    <div>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>An overview of every store feeding this console.</p>
        </div>
        <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
          Connect a store
        </a>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{loading ? "–" : stores.length}</div>
          <div style={styles.statLabel}>Connected stores</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>0</div>
          <div style={styles.statLabel}>Orders in queue</div>
          <div style={styles.statHint}>Arrives with the AliExpress matching step</div>
        </div>
      </div>

      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Stores</h2>
        {stores.length > 0 && (
          <Link href="/stores" style={styles.textLink}>
            View all
          </Link>
        )}
      </div>

      {!loading && stores.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No store connected yet.</p>
          <p style={styles.emptySubtext}>
            Connect your eBay seller account to start pulling unshipped orders in here.
          </p>
          <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
            Connect your eBay store
          </a>
        </div>
      )}

      {stores.length > 0 && (
        <div style={styles.storeList}>
          {stores.slice(0, 5).map((s) => (
            <Link key={s.storeId} href={`/stores/${s.storeId}`} style={styles.storeRow}>
              <span style={styles.storeDot} />
              <span style={styles.storeRowLabel}>{s.label}</span>
              <span style={styles.storeRowMeta}>
                connected {new Date(s.connectedAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "32px",
  },
  title: { color: "var(--text-primary)", fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" },
  subtitle: { color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 },
  errorText: { color: "var(--danger)", fontSize: "13px" },
  primaryBtn: {
    display: "inline-block",
    background: "var(--accent)",
    color: "#1a0f06",
    padding: "9px 16px",
    borderRadius: "7px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  statsRow: { display: "flex", gap: "12px", marginBottom: "36px" },
  statCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "18px 22px",
    minWidth: "180px",
  },
  statValue: {
    color: "var(--text-primary)",
    fontSize: "26px",
    fontWeight: 700,
    fontFamily: "var(--font-mono)",
  },
  statLabel: { color: "var(--text-secondary)", fontSize: "12.5px", marginTop: "6px" },
  statHint: { color: "var(--text-tertiary)", fontSize: "11px", marginTop: "6px" },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  sectionTitle: { color: "var(--text-primary)", fontSize: "14.5px", fontWeight: 600, margin: 0 },
  textLink: { color: "var(--accent)", fontSize: "12.5px", textDecoration: "none", fontWeight: 500 },
  emptyState: {
    background: "var(--surface)",
    border: "1px dashed var(--border-strong)",
    borderRadius: "10px",
    padding: "36px",
    textAlign: "center",
  },
  emptyText: { color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, margin: "0 0 6px 0" },
  emptySubtext: { color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 18px 0" },
  storeList: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    overflow: "hidden",
  },
  storeRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "13px 18px",
    borderBottom: "1px solid var(--border)",
    textDecoration: "none",
    fontSize: "13.5px",
  },
  storeDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--success)",
    flexShrink: 0,
  },
  storeRowLabel: { color: "var(--text-primary)", fontWeight: 600, flex: 1 },
  storeRowMeta: { color: "var(--text-tertiary)", fontSize: "12px" },
};
