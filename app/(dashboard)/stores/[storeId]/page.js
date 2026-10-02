"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Braces, RefreshCw, Search } from "lucide-react";

function ProductImage({ imageUrl, title }) {
  const proxyUrl = `/api/ebay/image-search?url=${encodeURIComponent(imageUrl)}`;
  const [src, setSrc] = useState(imageUrl);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        title="eBay image could not be loaded"
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={title}
      onError={() => {
        if (src !== proxyUrl) setSrc(proxyUrl);
        else setFailed(true);
      }}
      style={{
        width: "34px",
        height: "34px",
        objectFit: "cover",
        borderRadius: "6px",
        border: "1px solid var(--border)",
        display: "block",
      }}
    />
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
      {imageSearchStatus && (
        <p className={imageSearchStatus.startsWith("Could not") || imageSearchStatus.startsWith("Image clipboard") ? "text-error" : "text-muted"} role="status">
          {imageSearchStatus}
        </p>
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
                        <>
                          <ProductImage imageUrl={li.imageUrl} title={li.title} />
                          <button
                            type="button"
                            className="btn btn-ghost"
                            title="Copy product image and open AliExpress"
                            aria-label={`Search AliExpress by image for ${li.title}`}
                            disabled={imageSearchPending}
                            onClick={() => searchAliExpressByImage(li.imageUrl)}
                            style={{ padding: "5px 7px", marginTop: "4px" }}
                          >
                            <Search size={14} strokeWidth={2} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              background: "var(--surface-2)",
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost"
                            title="Search AliExpress by product title"
                            aria-label={`Search AliExpress by title for ${li.title}`}
                            onClick={() => searchAliExpressByTitle(li.title, li.variants)}
                            style={{ padding: "5px 7px", marginTop: "4px" }}
                          >
                            <Search size={14} strokeWidth={2} />
                          </button>
                        </>
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
