"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ebay/orders");
      const data = await res.json();
      setConnected(data.connected);
      setOrders(data.orders || []);
      if (data.error) setError(data.error);
    } catch (err) {
      setError("Could not load orders.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.header}>
        <h1 style={styles.title}>Order Automation Dashboard</h1>
        <div>
          <button onClick={loadOrders} style={styles.secondaryBtn}>
            Refresh
          </button>
          <button onClick={handleLogout} style={styles.secondaryBtn}>
            Log Out
          </button>
        </div>
      </div>

      {!connected && !loading && (
        <div style={styles.connectCard}>
          <p style={{ color: "#c7cad1", marginBottom: "16px" }}>
            No eBay store connected yet.
          </p>
          <a href="/api/ebay/connect" style={styles.primaryBtn}>
            Connect Your eBay Store
          </a>
        </div>
      )}

      {connected && (
        <>
          <p style={{ color: "#8a8f98", fontSize: "13px" }}>
            ✅ eBay store connected — showing unshipped orders
          </p>

          {error && <p style={{ color: "#f87171" }}>{error}</p>}
          {loading && <p style={{ color: "#8a8f98" }}>Loading orders…</p>}

          {!loading && orders.length === 0 && !error && (
            <p style={{ color: "#8a8f98" }}>
              No new unshipped orders right now.
            </p>
          )}

          {!loading && orders.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Order ID</th>
                    <th style={styles.th}>Item</th>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>Variant</th>
                    <th style={styles.th}>Qty</th>
                    <th style={styles.th}>Buyer</th>
                    <th style={styles.th}>Ship To</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) =>
                    order.lineItems.map((li) => (
                      <tr key={li.lineItemId}>
                        <td style={styles.td}>{order.orderId}</td>
                        <td style={styles.td}>{li.title}</td>
                        <td style={styles.td}>{li.sku || "—"}</td>
                        <td style={styles.td}>
                          {Object.entries(li.variants || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ") || "—"}
                        </td>
                        <td style={styles.td}>{li.quantity}</td>
                        <td style={styles.td}>
                          {order.shipTo.fullName || order.buyerUsername}
                        </td>
                        <td style={styles.td}>
                          {[
                            order.shipTo.addressLine1,
                            order.shipTo.city,
                            order.shipTo.stateOrProvince,
                            order.shipTo.postalCode,
                            order.shipTo.countryCode,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const styles = {
  wrap: {
    fontFamily: "system-ui, sans-serif",
    padding: "32px",
    maxWidth: "1100px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: { color: "#fff", fontSize: "20px" },
  connectCard: {
    background: "#1a1d24",
    padding: "32px",
    borderRadius: "12px",
    textAlign: "center",
  },
  primaryBtn: {
    display: "inline-block",
    background: "#3b82f6",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: 600,
  },
  secondaryBtn: {
    background: "#1a1d24",
    color: "#c7cad1",
    border: "1px solid #2c2f36",
    padding: "8px 14px",
    borderRadius: "8px",
    marginLeft: "8px",
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "16px",
  },
  th: {
    textAlign: "left",
    color: "#8a8f98",
    fontSize: "12px",
    textTransform: "uppercase",
    borderBottom: "1px solid #2c2f36",
    padding: "10px 8px",
  },
  td: {
    color: "#e5e7eb",
    fontSize: "14px",
    borderBottom: "1px solid #1e2128",
    padding: "10px 8px",
  },
};
