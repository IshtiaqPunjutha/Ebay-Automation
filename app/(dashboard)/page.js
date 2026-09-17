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
      <h1 style={styles.title}>Dashboard</h1>
      <p style={styles.subtitle}>Overview of your connected eBay stores.</p>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{loading ? "…" : stores.length}</div>
          <div style={styles.statLabel}>Connected Stores</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>0</div>
          <div style={styles.statLabel}>Orders in Queue</div>
          <div style={styles.statHint}>Coming in a later step</div>
        </div>
      </div>

      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Your Stores</h2>
        <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" style={styles.primaryBtn}>
          + Connect New Store
        </a>
      </div>

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
        <div style={styles.storeGrid}>
          {stores.slice(0, 6).map((s) => (
            <Link key={s.storeId} href={`/stores/${s.storeId}`} style={styles.storeCard}>
              <div style={styles.storeCardLabel}>{s.label}</div>
              <div style={styles.storeCardLink}>View Orders →</div>
            </Link>
          ))}
        </div>
      )}

      {stores.length > 0 && (
        <p style={{ marginTop: "16px" }}>
          <Link href="/stores" style={styles.link}>
            See all stores →
          </Link>
        </p>
      )}
    </div>
  );
}

const styles = {
  title: { color: "#fff", fontSize: "22px", margin: "0 0 4px 0" },
  subtitle: { color: "#8a8f98", fontSize: "13px", margin: "0 0 24px 0" },
  statsRow: { display: "flex", gap: "16px", marginBottom: "32px" },
  statCard: {
    background: "#1a1d24",
    border: "1px solid #22252d",
    borderRadius: "12px",
    padding: "20px 24px",
    minWidth: "160px",
  },
  statValue: { color: "#fff", fontSize: "28px", fontWeight: 700 },
  statLabel: { color: "#8a8f98", fontSize: "13px", marginTop: "4px" },
  statHint: { color: "#565a63", fontSize: "11px", marginTop: "6px" },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  sectionTitle: { color: "#fff", fontSize: "16px", margin: 0 },
  primaryBtn: {
    display: "inline-block",
    background: "#3b82f6",
    color: "#fff",
    padding: "9px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
  },
  emptyCard: {
    background: "#1a1d24",
    border: "1px solid #22252d",
    padding: "32px",
    borderRadius: "12px",
    textAlign: "center",
  },
  storeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "12px",
  },
  storeCard: {
    background: "#1a1d24",
    border: "1px solid #22252d",
    borderRadius: "10px",
    padding: "16px",
    textDecoration: "none",
    display: "block",
  },
  storeCardLabel: { color: "#fff", fontSize: "14px", fontWeight: 600, marginBottom: "8px" },
  storeCardLink: { color: "#3b82f6", fontSize: "13px" },
  link: { color: "#3b82f6", fontSize: "13px", textDecoration: "none" },
};
