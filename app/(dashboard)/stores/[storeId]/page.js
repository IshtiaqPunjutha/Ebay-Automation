"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function StoreOrdersPage() {
  const { storeId } = useParams();
  const router = useRouter();
  const [storeLabel, setStoreLabel] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStoreLabel() {
    const res = await fetch("/api/ebay/stores");
    const data = await res.json();
    const match = (data.stores || []).find((s) => s.storeId === storeId);
    if (match) {
      setStoreLabel(match.label);
    } else {
      // Store no longer exists (e.g. was disconnected) — bounce back to list
      router.push("/stores");
    }
  }

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ebay/orders?store=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.error) setError(data.error);
    } catch (err) {
      setError("Could not load orders.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!storeId) return;
    loadStoreLabel();
    loadOrders();
  }, [storeId]);

  return (
    <div>
      <Link href="/stores" style={styles.backLink}>
        ← All Stores
      </Link>

      <div style={styles.sectionHeader}>
        <div>
          <h1 style={styles.title}>{storeLabel || "Store"}</h1>
          <p style={styles.subtitle}>Unshipped orders for this store.</p>
        </div>
        <button onClick={loadOrders} style={styles.refreshBtn}>
          Refresh
        </button>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {loading && <p style={{ color: "#8a8f98" }}>Loading orders…</p>}

      {!loading && orders.length === 0 && !error && (
        <p style={{ color: "#8a8f98" }}>No new unshipped orders right now.</p>
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
    </div>
  );
}

const styles = {
  backLink: {
    color: "#8a8f98",
    fontSize: "13px",
    textDecoration: "none",
    display: "inline-block",
    marginBottom: "16px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
  },
  title: { color: "#fff", fontSize: "20px", margin: "0 0 4px 0" },
  subtitle: { color: "#8a8f98", fontSize: "13px", margin: 0 },
  refreshBtn: {
    background: "#1a1d24",
    color: "#c7cad1",
    border: "1px solid #2c2f36",
    padding: "8px 14px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },
  table: { width: "100%", borderCollapse: "collapse", marginTop: "8px" },
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
