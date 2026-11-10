"use client";

import { useEffect, useState } from "react";

const when = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

// /admin/users: every account of this dashboard (owner only).
export default function AccountsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        const body = await res.json();
        if (!res.ok) setError(body.error || "Could not load the accounts.");
        else setData(body);
      } catch {
        setError("Could not load the accounts.");
      }
    })();
  }, []);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (
    <div>
      <div className="page-header compact-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Everyone who has an account on this dashboard.</p>
        </div>
        {data && (
          <div className="stat-chips">
            <div className="stat-chip"><span className="stat-chip-label">Total accounts</span><span className="stat-chip-value">{data.total}</span></div>
            <div className="stat-chip"><span className="stat-chip-label">New in 7 days</span><span className="stat-chip-value">{data.users.filter((u) => u.createdAt && u.createdAt > weekAgo).length}</span></div>
          </div>
        )}
      </div>
      {error && <p className="text-error">{error}</p>}
      {data && (
        <div className="review-scroll">
          <table className="review-table">
            <thead>
              <tr><th>Email</th><th>Created</th><th>Last login</th><th>eBay stores</th></tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.email} style={u.createdAt && u.createdAt > weekAgo ? { background: "rgba(255, 200, 0, 0.12)" } : undefined}>
                  <td>{u.email}</td>
                  <td>{when(u.createdAt)}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td>{u.stores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
