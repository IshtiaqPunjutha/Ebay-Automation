"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [stores, setStores] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState("");

  async function loadStores() {
    setLoadingStores(true);
    try {
      const res = await fetch("/api/ebay/stores");
      const data = await res.json();
      setStores(data.stores || []);
      // Auto-select the first store if none selected yet
      if (data.stores?.length && !activeStoreId) {
        setActiveStoreId(data.stores[0].storeId);
      }
    } catch (err) {
      setError("Could not load connected stores.");
    }
    setLoadingStores(false);
  }

  async function loadOrders(storeId) {
    if (!storeId) return;
    setLoadingOrders(true);
    setError("");
    try {
      const res = await fetch(`/api/ebay/orders?store=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.error) setError(data.error);
    } catch (err) {
      setError("Could not load orders.");
    }
    setLoadingOrders(false);
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    if (activeStoreId) loadOrders(activeStoreId);
  }, [activeStoreId]);

  async function handleDisconnect(storeId) {
    if (!confirm("Disconnect this store? You can reconnect it later.")) return;
    await fetch("/api/ebay/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const remaining = stores.filter((s) => s.storeId !== storeId);
    setStores(remaining);
    if (activeStoreId === storeId) {
      setActiveStoreId(remaining[0]?.storeId || null);
      setOrders([]);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.header}>
        <h1 style={styles.title}>Order Automation Dashboard</h1>
        <div>
          <a href="/api/ebay/connect" style={styles.primaryBtn}>
            + Connect New Store
          </a>
          <button onClick={handleLogout} style={styles.secondaryBtn}>
            Log Out
          </button>
        </div>
      </div>

      {loadingStores && <p style={{ color: "#8a8f98" }}>Loading stores…</p>}

      {!loadingStores && stores.length === 0 && (
        <div style={styles.connectCard}>
          <p style={{ color: "#c7cad1", marginBottom: "16px" }}>
            No eBay store connected yet.
          </p>
          <a href="/api/ebay/connect" style={styles.primaryBtn}>
            Connect Your eBay Store
          </a>
        </div>
      )}

      {stores.length > 0 && (
        <>
          <div style={styles.tabsRow}>
            {stores.map((s) => (
              <div
                key={s.storeId}
                onClick={() => setActiveStoreId(s.storeId)}
                style={{
                  ...styles.tab,
                  ...(activeStoreId === s.storeId ? styles.tabActive : {}),
                }}
              >
                <span>{s.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDisconnect(s.storeId);
                  }}
                  style={styles.tabDisconnect}
                  title="Disconnect this store"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <p style={{ color: "#8a8f98", fontSize: "13px", marginBottom: "12px" }}>
            ✅ Showing unshipped orders for{" "}
            <strong>{stores.find((s) => s.storeId === activeStoreId)?.label}</strong>
          </p>

          {error && <p style={{ color: "#f87171" }}>{error}</p>}
          {loadingOrders && <p style={{ color: "#8a8f98" }}>Loading orders…</p>}

          {!loadingOrders && orders.length === 0 && !error && (
            <p style={{ color: "#8a8f98" }}>No new unshipped orders right now.</p>
          )}

          {!loadingOrders && orders.length > 0 && (
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
  tabsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "20px",
    borderBottom: "1px solid #2c2f36",
    paddingBottom: "12px",
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#1a1d24",
    color: "#c7cad1",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    border: "1px solid #2c2f36",
  },
  tabActive: {
    background: "#3b82f6",
    color: "#fff",
    borderColor: "#3b82f6",
  },
  tabDisconnect: {
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    fontSize: "14px",
    lineHeight: 1,
    padding: "0 2px",
    opacity: 0.7,
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
