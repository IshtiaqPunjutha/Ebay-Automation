"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Store, CircleAlert } from "lucide-react";

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Stores</h1>
          <p className="page-subtitle">Every eBay seller account feeding this console.</p>
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
          <p className="empty-subtitle">Connect an eBay seller account to see its orders here.</p>
          <a href="/api/ebay/connect" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Plus strokeWidth={2.5} />
            Connect your eBay store
          </a>
        </div>
      )}

      {!loading && stores.length > 0 && (
        <div className="panel">
          {stores.map((s) => (
            <div key={s.storeId} className="list-row">
              <div className="avatar">{(s.label || "?").slice(0, 2)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-row-title">{s.label}</div>
                <div className="list-row-meta">
                  Connected {new Date(s.connectedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="list-row-actions">
                <Link href={`/stores/${s.storeId}`} className="btn btn-secondary btn-sm">
                  View orders
                </Link>
                <button
                  onClick={() => handleDisconnect(s.storeId, s.label)}
                  className="btn btn-danger-ghost btn-sm"
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
