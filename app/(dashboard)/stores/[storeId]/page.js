"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { buildAliExpressProductSuggestions, estimateOrderEarnings } from "@/lib/ebay";

export default function StoreOrdersPage() {
  const { storeId } = useParams();
  const router = useRouter();
  const [storeLabel, setStoreLabel] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRowId, setExpandedRowId] = useState(null);

  const allRows = useMemo(() => {
    const rows = orders.flatMap((order) =>
      (order.lineItems || []).map((li) => ({
        ...li,
        orderId: order.orderId,
        orderTotal: order.orderTotal || 0,
        estimatedEarnings: estimateOrderEarnings(order.orderTotal || 0),
        currency: order.currency || "GBP",
        buyerUsername: order.buyerUsername || order.shipTo?.fullName || "—",
        shipTo: order.shipTo,
      }))
    );

    console.log("MAPPED_ORDER_ROWS", rows);
    console.log(
      "IMAGE_SAMPLE",
      rows.slice(0, 5).map((row) => ({
        title: row.title,
        imageUrl: row.imageUrl,
        orderId: row.orderId,
      }))
    );

    return rows;
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [orders, pageSize]);

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return allRows.slice(startIndex, startIndex + pageSize);
  }, [allRows, currentPage, pageSize]);

  const metrics = (() => {
    const totalOrders = orders.length ? new Set(orders.map((o) => o.orderId)).size : 0;
    const totalUnits = orders.reduce(
      (sum, order) => sum + (order.itemCount || 0),
      0
    );
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (Number(order.orderTotal) || 0),
      0
    );
    const totalEarnings = orders.reduce(
      (sum, order) => sum + (Number(order.estimatedEarnings) || 0),
      0
    );

    return {
      totalOrders,
      totalUnits,
      totalRevenue,
      totalEarnings,
    };
  })();

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
      console.log("RAW_EBAY_ORDERS_RESPONSE", data);
      console.log("RAW_EBAY_ORDERS_ARRAY", data.orders || []);
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

      {!loading && orders.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: "20px" }}>
          <div className="stat-card">
            <div className="stat-value">{metrics.totalOrders}</div>
            <div className="stat-label">Orders</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{metrics.totalUnits}</div>
            <div className="stat-label">Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: orders[0]?.currency || "GBP",
                maximumFractionDigits: 2,
              }).format(metrics.totalEarnings)}
            </div>
            <div className="stat-label">Order earnings</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: orders[0]?.currency || "GBP",
                maximumFractionDigits: 2,
              }).format(metrics.totalRevenue)}
            </div>
            <div className="stat-label">Order total</div>
          </div>
        </div>
      )}

      {!loading && orders.length === 0 && !error && (
        <div className="empty-state">
          <p className="empty-title">No unshipped orders right now</p>
          <p className="empty-subtitle" style={{ marginBottom: 0 }}>
            New orders will appear here automatically.
          </p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <>
          <div className="table-controls">
            <div className="table-meta">
              Showing {Math.min((currentPage - 1) * pageSize + 1, allRows.length)}-
              {Math.min(currentPage * pageSize, allRows.length)} of {allRows.length} rows
            </div>
            <div className="pager-controls">
              <button
                className="pager-btn"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              <label className="page-size-picker">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <button
                className="pager-btn"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>

          <div className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Variant</th>
                  <th>Qty</th>
                  <th>Order earnings</th>
                  <th>Buyer</th>
                  <th>Ship to</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const targetProfit = Math.max(0, row.estimatedEarnings || 0);
                  const suggestions = buildAliExpressProductSuggestions(
                    row.title,
                    targetProfit,
                    row.currency || "GBP"
                  );
                  const rowKey = `${row.orderId}-${row.lineItemId}`;
                  const isExpanded = expandedRowId === rowKey;

                  return (
                    <>
                      <tr key={rowKey}>
                        <td className="mono">
                          <button
                            type="button"
                            aria-label={isExpanded ? "Collapse details" : "Expand details"}
                            onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 16,
                              color: "#1f2937",
                              padding: 0,
                              marginRight: 8,
                              lineHeight: 1,
                            }}
                          >
                            {isExpanded ? "▾" : "▸"}
                          </button>
                          {row.orderId}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {row.imageUrl ? (
                              <img
                                src={row.imageUrl}
                                alt={row.title || "Product image"}
                                style={{
                                  width: 40,
                                  height: 40,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  border: "1px solid #ddd",
                                  background: "#f5f5f5",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 6,
                                  border: "1px solid #ddd",
                                  background: "#f5f5f5",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 10,
                                  color: "#666",
                                }}
                              >
                                IMG
                              </div>
                            )}
                            <span>{row.title}</span>
                          </div>
                        </td>
                        <td className="mono">{row.sku || "—"}</td>
                        <td>
                          {Object.entries(row.variants || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ") || "—"}
                        </td>
                        <td className="mono">{row.quantity}</td>
                        <td className="mono">
                          {new Intl.NumberFormat("en-GB", {
                            style: "currency",
                            currency: row.currency || "GBP",
                            maximumFractionDigits: 2,
                          }).format(row.estimatedEarnings || 0)}
                        </td>
                        <td>{row.shipTo?.fullName || row.buyerUsername}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span>
                              {[
                                row.shipTo?.addressLine1,
                                row.shipTo?.city,
                                row.shipTo?.stateOrProvince,
                                row.shipTo?.postalCode,
                                row.shipTo?.countryCode,
                                row.shipTo?.phone,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${rowKey}-details`}>
                          <td colSpan={8} style={{ background: "#fafafa", padding: "14px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{ fontWeight: 600 }}>Product match ideas</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                {suggestions.map((item) => (
                                  <a
                                    key={`${row.lineItemId}-${item.label}`}
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-secondary btn-sm"
                                    style={{ width: "fit-content" }}
                                    title={`${item.reason} · ${item.score}% match`}
                                  >
                                    {item.label}: {item.score}% · {new Intl.NumberFormat("en-GB", {
                                      style: "currency",
                                      currency: row.currency || "GBP",
                                      maximumFractionDigits: 2,
                                    }).format(targetProfit)} max
                                  </a>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
