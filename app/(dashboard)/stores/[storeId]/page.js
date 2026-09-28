"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Braces, RefreshCw } from "lucide-react";

export default function StoreOrdersPage() {
  const { storeId } = useParams();
  const router = useRouter();
  const [storeLabel, setStoreLabel] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);

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
      setReconnectRequired(Boolean(data.reconnectRequired));
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

      {error && (
        <div style={{ marginBottom: "16px" }}>
          <p className="text-error">{error}</p>
          {reconnectRequired && (
            <a href="/api/ebay/connect" className="btn btn-primary" style={{ display: "inline-flex", marginTop: "8px", textDecoration: "none" }}>
              Reconnect eBay
            </a>
          )}
        </div>
      )}
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
                <th></th>
                <th>Order</th>
                <th>Item</th>
                <th>SKU</th>
                <th>Variant</th>
                <th>Qty</th>
                <th>Order total</th>
                <th>Earnings</th>
                <th>Buyer</th>
                <th>Ship to</th>
                <th>Product data</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) =>
                order.lineItems.map((li, idx) => {
                  const rowKey = `${order.orderId}-${li.lineItemId}`;
                  const productData = {
                    orderId: order.orderId,
                    lineItemId: li.lineItemId,
                    legacyItemId: li.legacyItemId,
                    title: li.title,
                    sku: li.sku,
                    quantity: li.quantity,
                    variants: li.variants,
                    catalog: li.product,
                  };
                  return (
                  <Fragment key={rowKey}>
                  <tr>
                    <td>
                      {li.imageUrl ? (
                        <img
                          src={li.imageUrl}
                          alt=""
                          style={{
                            width: "34px",
                            height: "34px",
                            objectFit: "cover",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                          }}
                        />
                      )}
                    </td>
                    <td className="mono">{order.orderId}</td>
                    <td>{li.title}</td>
                    <td className="mono">{li.sku || "—"}</td>
                    <td>
                      {Object.entries(li.variants || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="mono">{li.quantity}</td>
                    <td className="mono">
                      {idx === 0 && order.orderTotal != null
                        ? `${order.currency || ""} ${order.orderTotal.toFixed(2)}`
                        : ""}
                    </td>
                    <td className="mono">
                      {idx === 0
                        ? order.earnings
                          ? `${order.earnings.currency} ${order.earnings.earnings.toFixed(2)}`
                          : "—"
                        : ""}
                    </td>
                    <td>{idx === 0 ? order.shipTo.fullName || order.buyerUsername : ""}</td>
                    <td>
                      {idx === 0
                        ? [
                            order.shipTo.addressLine1,
                            order.shipTo.city,
                            order.shipTo.stateOrProvince,
                            order.shipTo.postalCode,
                            order.shipTo.countryCode,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : ""}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        title="Inspect product data"
                        aria-label={`Inspect product data for ${li.title}`}
                        aria-expanded={expandedProduct === rowKey}
                        onClick={() => setExpandedProduct(expandedProduct === rowKey ? null : rowKey)}
                        style={{ padding: "5px 7px" }}
                      >
                        <Braces size={14} strokeWidth={2} />
                        Data
                      </button>
                    </td>
                  </tr>
                  {expandedProduct === rowKey && (
                    <tr>
                      <td colSpan={11}>
                        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", padding: "12px" }}>
                          <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginBottom: "8px" }}>Fetched product data</div>
                          <pre style={{ margin: 0, maxHeight: "320px", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: 1.55 }}>
                            {JSON.stringify(productData, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
