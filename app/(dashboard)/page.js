"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">An overview of every store feeding this console.</p>
        </div>
        <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          <Plus strokeWidth={2.5} />
          Connect a store
        </a>
      </div>

      {error && <p className="text-error">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : stores.length}</div>
          <div className="stat-label">Connected stores</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">0</div>
          <div className="stat-label">Orders in queue</div>
          <div className="stat-hint">Arrives with the AliExpress matching step</div>
        </div>
      </div>

      <div className="section-header">
        <h2 className="section-title">Stores</h2>
        {stores.length > 0 && (
          <Link href="/stores" className="link-accent">
            View all
          </Link>
        )}
      </div>

      {!loading && stores.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">No store connected yet</p>
          <p className="empty-subtitle">
            Connect your eBay seller account to start pulling unshipped orders in here.
          </p>
          <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Plus strokeWidth={2.5} />
            Connect your eBay store
          </a>
        </div>
      )}

      {stores.length > 0 && (
        <div className="panel">
          {stores.slice(0, 5).map((s) => (
            <Link key={s.storeId} href={`/stores/${s.storeId}`} className="list-row">
              <span className="status-dot" />
              <div style={{ flex: 1 }}>
                <div className="list-row-title">{s.label}</div>
                <div className="list-row-meta">
                  Connected {new Date(s.connectedAt).toLocaleDateString()}
                </div>
              </div>
              <ArrowRight size={15} strokeWidth={2} style={{ color: "var(--text-tertiary)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
