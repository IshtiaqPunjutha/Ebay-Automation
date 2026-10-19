"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Braces, Check, CircleAlert, Clock, Copy, Loader, PackageSearch, Phone, RefreshCw, Search } from "lucide-react";

// Copies `text` on click and flashes a check mark. `children` is the visible
// content (the whole thing is the click target); without children it renders
// as a small icon-only button.
function CopyButton({ text, label, children }) {
  const [copied, setCopied] = useState(false);

  async function copy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      className={children ? "copy-block" : "icon-btn copy-icon"}
      onClick={copy}
      title={copied ? "Copied" : label}
      aria-label={label}
    >
      {children}
      <Icon strokeWidth={2} style={copied ? { color: "var(--success)" } : undefined} />
    </button>
  );
}

function ProductImage({ imageUrl, title }) {
  const proxyUrl = `/api/ebay/image-search?url=${encodeURIComponent(imageUrl)}`;
  const [src, setSrc] = useState(imageUrl);
  const [failed, setFailed] = useState(false);

  if (failed) return <div className="thumb" title="eBay image could not be loaded" />;

  return (
    <img
      className="thumb"
      src={src}
      alt={title}
      onError={() => {
        if (src !== proxyUrl) setSrc(proxyUrl);
        else setFailed(true);
      }}
    />
  );
}

// Sum order amounts per currency, e.g. "GBP 120.50 · USD 30.00".
function sumByCurrency(pairs) {
  const totals = {};
  for (const [currency, amount] of pairs) {
    if (amount == null || !Number.isFinite(amount)) continue;
    const key = currency || "";
    totals[key] = (totals[key] || 0) + amount;
  }
  const parts = Object.entries(totals).map(([c, v]) => `${c} ${v.toFixed(2)}`.trim());
  return parts.length ? parts.join(" · ") : "—";
}

function StatusBadge({ status }) {
  if (status === "IN_PROGRESS") {
    return (
      <span className="badge badge-info">
        <Loader strokeWidth={2.5} />
        In progress
      </span>
    );
  }
  return (
    <span className="badge badge-warning">
      <Clock strokeWidth={2.5} />
      To ship
    </span>
  );
}

export default function StoreOrdersPage() {
  const { storeId } = useParams();
  const router = useRouter();
  const [storeLabel, setStoreLabel] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [imageSearchStatus, setImageSearchStatus] = useState("");
  const [imageSearchPending, setImageSearchPending] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  async function searchAliExpressByImage(imageUrl) {
    const searchUrl = `https://www.aliexpress.com/?ebayImageSearch=${encodeURIComponent(imageUrl)}`;
    let copyPromise = null;

    if (navigator.clipboard?.write && window.ClipboardItem) {
      const imageBlob = fetch(`/api/ebay/image-search?url=${encodeURIComponent(imageUrl)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load this eBay product image.");
          return await response.blob();
        })
        .then(async (blob) => {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
          return await new Promise((resolve, reject) => {
            canvas.toBlob((png) => {
              if (png) resolve(png);
              else reject(new Error("Could not prepare the product image."));
            }, "image/png");
          });
        });
      try {
        copyPromise = navigator.clipboard.write([
          new ClipboardItem({ "image/png": imageBlob }),
        ]);
      } catch (error) {
        copyPromise = null;
      }
    }

    window.open(searchUrl, "_blank", "noopener,noreferrer");
    if (!copyPromise) {
      setImageSearchStatus("AliExpress opened. Install the image-search extension for automatic search.");
      return;
    }

    setImageSearchPending(true);
    setImageSearchStatus("Preparing image for AliExpress...");
    try {
      await copyPromise;
      setImageSearchStatus("Image copied. With the extension it will search automatically; otherwise click AliExpress's camera icon and press Ctrl+V.");
    } catch (error) {
      setImageSearchStatus("AliExpress opened, but clipboard copy failed. Install the image-search extension for automatic search.");
    } finally {
      setImageSearchPending(false);
    }
  }

  function searchAliExpressByTitle(title, variants) {
    const variantText = Object.values(variants || {}).join(" ");
    const searchText = [title, variantText].filter(Boolean).join(" ");
    const searchUrl = new URL("https://www.aliexpress.com/w/wholesale.html");
    searchUrl.searchParams.set("SearchText", searchText);
    window.open(searchUrl, "_blank", "noopener,noreferrer");
    setImageSearchStatus("No eBay image is available. AliExpress opened with the product title and variant.");
  }

  useEffect(() => {
    if (!storeId) return;
    loadStoreLabel();
    loadOrders();
  }, [storeId]);

  const needle = query.trim().toLowerCase();
  const statusOrders =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => (statusFilter === "in_progress") === (order.fulfillmentStatus === "IN_PROGRESS"));
  const visibleOrders = needle
    ? statusOrders.filter((order) =>
        [order.orderId, order.buyerUsername, order.shipTo?.fullName, ...order.lineItems.flatMap((li) => [li.title, li.sku])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      )
    : statusOrders;
  const totalItems = visibleOrders.reduce((sum, order) => sum + (order.itemCount || 0), 0);
  const totalValue = sumByCurrency(visibleOrders.map((o) => [o.currency, o.orderTotal]));
  const earnedOrders = visibleOrders.filter((o) => o.earnings);
  const totalEarnings = sumByCurrency(earnedOrders.map((o) => [o.earnings.currency, o.earnings.earnings]));

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
        <button onClick={loadOrders} className="btn btn-secondary" disabled={loading}>
          <RefreshCw size={14} strokeWidth={2} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="alert" role="alert">
          <CircleAlert strokeWidth={2} />
          <div>
            <div>{error}</div>
            {reconnectRequired && (
              <a href="/api/ebay/connect" className="btn btn-primary" style={{ marginTop: "8px" }}>
                Reconnect eBay
              </a>
            )}
          </div>
        </div>
      )}

      {imageSearchStatus && (
        <p className={imageSearchStatus.startsWith("Could not") || imageSearchStatus.startsWith("Image clipboard") ? "text-error" : "text-muted"} role="status">
          {imageSearchStatus}
        </p>
      )}

      {(loading || orders.length > 0) && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Orders to ship</div>
            {loading ? <div className="skeleton" style={{ height: "30px", width: "48px" }} /> : <div className="stat-value">{visibleOrders.length}</div>}
            <div className="stat-hint">{loading ? " " : `${totalItems} item${totalItems === 1 ? "" : "s"} in total`}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Order value</div>
            {loading ? <div className="skeleton" style={{ height: "30px", width: "110px" }} /> : <div className="stat-value" style={{ fontSize: "20px" }}>{totalValue}</div>}
            <div className="stat-hint">Before eBay fees</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Earnings</div>
            {loading ? <div className="skeleton" style={{ height: "30px", width: "110px" }} /> : <div className="stat-value" style={{ fontSize: "20px" }}>{totalEarnings}</div>}
            <div className="stat-hint good">{loading ? " " : `After fees · ${earnedOrders.length} of ${visibleOrders.length} orders posted`}</div>
          </div>
        </div>
      )}

      {loading && orders.length === 0 && (
        <div className="panel">
          {[0, 1, 2].map((i) => (
            <div key={i} className="list-row">
              <div className="skeleton" style={{ width: "44px", height: "44px" }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: "14px", width: "55%", marginBottom: "6px" }} />
                <div className="skeleton" style={{ height: "10px", width: "30%" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">
            <PackageSearch strokeWidth={2} />
          </div>
          <p className="empty-title">No unshipped orders right now</p>
          <p className="empty-subtitle" style={{ marginBottom: 0 }}>
            New orders will appear here when you refresh.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <>
          <div className="toolbar">
            <div className="search-field">
              <Search strokeWidth={2} />
              <input
                className="input"
                type="search"
                placeholder="Search order, item, SKU or buyer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search orders"
              />
            </div>
            <div className="segmented" role="group" aria-label="Filter by status">
              {[
                ["all", "All"],
                ["to_ship", "To ship"],
                ["in_progress", "In progress"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={statusFilter === key ? "active" : ""}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="table-meta">
              {visibleOrders.length === orders.length
                ? `${orders.length} order${orders.length === 1 ? "" : "s"}`
                : `${visibleOrders.length} of ${orders.length} orders`}
            </span>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No orders match "{query}"</p>
              <p className="empty-subtitle" style={{ marginBottom: 0 }}>Try a different order id, item, SKU or buyer.</p>
            </div>
          ) : (
            <div className="panel table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Order</th>
                    <th className="num">Qty</th>
                    <th className="num">Total</th>
                    <th className="num">Earnings</th>
                    <th>Ship to</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) =>
                    order.lineItems.map((li, idx) => {
                      const rowKey = `${order.orderId}-${li.lineItemId}`;
                      const variantText = Object.entries(li.variants || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ");
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
                      const addressParts = [
                        order.shipTo.addressLine1,
                        order.shipTo.addressLine2,
                        order.shipTo.city,
                        order.shipTo.stateOrProvince,
                        order.shipTo.postalCode,
                        order.shipTo.countryCode,
                      ].filter(Boolean);
                      const address = addressParts.join(", ");
                      const recipient = order.shipTo.fullName || order.buyerUsername;
                      const phone = order.shipTo.phone;
                      // Everything a courier label needs, one item per line.
                      const fullBlock = [recipient, ...addressParts, phone].filter(Boolean).join("\n");
                      return (
                        <Fragment key={rowKey}>
                          <tr className={idx > 0 ? "order-cont" : undefined}>
                            <td>
                              <div className="item-cell">
                                {li.imageUrl ? (
                                  <ProductImage imageUrl={li.imageUrl} title={li.title} />
                                ) : (
                                  <div className="thumb" />
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div className="item-title" title={li.title}>{li.title}</div>
                                  <div className="item-meta">
                                    {li.sku && <span className="mono">SKU {li.sku}</span>}
                                    {variantText && <span>{variantText}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              {idx === 0 && (
                                <>
                                  <div className="mono" style={{ color: "var(--text-primary)" }}>{order.orderId}</div>
                                  <div className="item-meta">{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : ""}</div>
                                </>
                              )}
                            </td>
                            <td className="num mono">{li.quantity}</td>
                            <td className="num mono">
                              {idx === 0 && order.orderTotal != null
                                ? `${order.currency || ""} ${order.orderTotal.toFixed(2)}`
                                : ""}
                            </td>
                            <td className="num mono" style={order.earnings && idx === 0 ? { color: "var(--success)" } : undefined}>
                              {idx === 0
                                ? order.earnings
                                  ? `${order.earnings.currency} ${order.earnings.earnings.toFixed(2)}`
                                  : "—"
                                : ""}
                            </td>
                            <td style={{ minWidth: "200px" }}>
                              {idx === 0 && (
                                <>
                                  <div style={{ fontWeight: 500 }}>{recipient}</div>
                                  {phone ? (
                                    <div className="phone-line">
                                      <Phone strokeWidth={2} />
                                      <span className="mono">{phone}</span>
                                      <CopyButton text={phone} label="Copy phone number" />
                                    </div>
                                  ) : (
                                    <div className="item-meta">No phone number</div>
                                  )}
                                  <CopyButton text={fullBlock} label="Copy full address (name, address, phone)">
                                    <span className="item-meta" style={{ margin: 0 }}>{address}</span>
                                  </CopyButton>
                                </>
                              )}
                            </td>
                            <td>{idx === 0 && <StatusBadge status={order.fulfillmentStatus} />}</td>
                            <td>
                              <div className="row-actions">
                                {li.imageUrl ? (
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title="Copy product image and open AliExpress"
                                    aria-label={`Search AliExpress by image for ${li.title}`}
                                    disabled={imageSearchPending}
                                    onClick={() => searchAliExpressByImage(li.imageUrl)}
                                  >
                                    <Search strokeWidth={2} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    title="Search AliExpress by product title"
                                    aria-label={`Search AliExpress by title for ${li.title}`}
                                    onClick={() => searchAliExpressByTitle(li.title, li.variants)}
                                  >
                                    <Search strokeWidth={2} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Inspect product data"
                                  aria-label={`Inspect product data for ${li.title}`}
                                  aria-expanded={expandedProduct === rowKey}
                                  onClick={() => setExpandedProduct(expandedProduct === rowKey ? null : rowKey)}
                                >
                                  <Braces strokeWidth={2} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedProduct === rowKey && (
                            <tr>
                              <td colSpan={8}>
                                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)", padding: "12px" }}>
                                  <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginBottom: "8px" }}>Fetched product data</div>
                                  <pre style={{ margin: 0, maxHeight: "320px", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--text-primary)", fontFamily: "var(--font-geist-mono)", fontSize: "11px", lineHeight: 1.55 }}>
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
        </>
      )}
    </div>
  );
}
