"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, Store, PackageSearch, CircleAlert } from "lucide-react";

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

      {error && (
        <div className="alert" role="alert">
          <CircleAlert strokeWidth={2} />
          {error}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Store strokeWidth={2} />
            Connected stores
          </div>
          {loading ? <div className="skeleton" style={{ height: "30px", width: "48px" }} /> : <div className="stat-value">{stores.length}</div>}
          <div className="stat-hint">{stores.length === 1 ? "1 eBay seller account" : "eBay seller accounts"}</div>
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

      {loading && (
        <div className="panel">
          <div className="list-row">
            <div className="skeleton" style={{ width: "32px", height: "32px" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: "14px", width: "160px", marginBottom: "6px" }} />
              <div className="skeleton" style={{ height: "10px", width: "100px" }} />
            </div>
          </div>
        </div>
      )}

      {!loading && stores.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Store strokeWidth={2} />
          </div>
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

      {!loading && stores.length > 0 && (
        <div className="panel">
          {stores.slice(0, 5).map((s) => (
            <Link key={s.storeId} href={`/stores/${s.storeId}`} className="list-row">
              <div className="avatar">{(s.label || "?").slice(0, 2)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-row-title">{s.label}</div>
                <div className="list-row-meta">
                  Connected {new Date(s.connectedAt).toLocaleDateString()}
                </div>
              </div>
              <span className="badge badge-success">
                <span className="status-dot" style={{ width: 5, height: 5, boxShadow: "none" }} />
                Connected
              </span>
              <ArrowRight size={15} strokeWidth={2} style={{ color: "var(--text-tertiary)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
