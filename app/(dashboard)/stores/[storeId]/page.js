"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

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
      <Link href="/stores" className="back-link">
        <ArrowLeft size={13} strokeWidth={2} />
        All stores
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{storeLabel || "Store"}</h1>
          <p className="page-subtitle">Unshipped orders for this store.</p>
        </div>
        <button onClick={loadOrders} className="btn btn-secondary">
          <RefreshCw size={14} strokeWidth={2} />
          Refresh
        </button>
      </div>

      {error && <p className="text-error">{error}</p>}
      {loading && <p className="text-muted">Loading orders…</p>}

      {!loading && orders.length === 0 && !error && (
        <div className="empty-state">
          <p className="empty-title">No unshipped orders right now</p>
          <p className="empty-subtitle" style={{ marginBottom: 0 }}>
            New orders will appear here automatically.
          </p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>SKU</th>
                <th>Variant</th>
                <th>Qty</th>
                <th>Buyer</th>
                <th>Ship to</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) =>
                order.lineItems.map((li) => (
                  <tr key={li.lineItemId}>
                    <td className="mono">{order.orderId}</td>
                    <td>{li.title}</td>
                    <td className="mono">{li.sku || "—"}</td>
                    <td>
                      {Object.entries(li.variants || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="mono">{li.quantity}</td>
                    <td>{order.shipTo.fullName || order.buyerUsername}</td>
                    <td>
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
