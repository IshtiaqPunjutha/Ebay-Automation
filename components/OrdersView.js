"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ZoomThumb from "./ZoomThumb";
import SendTrackingDialog from "./SendTrackingDialog";
import AutoShipDialog from "./AutoShipDialog";
import { checkReadyToShip } from "@/lib/shipping";
import { ArrowLeft, ArrowUpRight, Timer, Check, ChevronLeft, ChevronRight, CircleAlert, Clock, Copy, Loader, PackageSearch, Phone, RefreshCw, Search, Truck } from "lucide-react";

// The numeric item id inside an eBay listing link (…/itm/123456789012).
function itemIdFromLink(link) {
  const match = String(link || "").match(/\/itm\/(?:[^/?]+\/)?(\d{9,})/);
  return match ? match[1] : "";
}

function isUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

// eBay sends carrier codes in whatever form the seller typed (ROYALMAIL, Royal Mail, evri ...).
const CARRIER_NAMES = {
  royalmail: "Royal Mail",
  royalmailgroup: "Royal Mail",
  inpost: "InPost",
  evri: "Evri",
  hermes: "Evri",
  hermesuk: "Evri",
  dpd: "DPD",
  dpduk: "DPD",
  dhl: "DHL",
  ups: "UPS",
  fedex: "FedEx",
  parcelforce: "Parcelforce",
  yodel: "Yodel",
  amazon: "Amazon Logistics",
  other: "Other",
};

function carrierName(code) {
  if (!code) return "Unknown";
  const key = String(code).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (CARRIER_NAMES[key]) return CARRIER_NAMES[key];
  return String(code)
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysSince(dateValue) {
  const time = dateValue ? new Date(dateValue).getTime() : NaN;
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86400000));
}

function agoLabel(days) {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// AliExpress order number(s) bought for an eBay order. Shown as chips (click to
// copy, x to remove) with an inline box to add another; separate several
// numbers with spaces or commas.
function AliOrderCell({ ids, onSave, disabled, tracking = {} }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");

  function submit() {
    const entered = draft.split(/[\s,;]+/).filter(Boolean);
    if (entered.length === 0) {
      setAdding(false);
      setProblem("");
      return;
    }
    if (entered.some((v) => !/^[A-Za-z0-9-]{6,32}$/.test(v))) {
      setProblem("Use the order number only (letters, digits, dashes).");
      return;
    }
    onSave([...new Set([...ids, ...entered])]);
    setDraft("");
    setProblem("");
    setAdding(false);
  }

  return (
    <div className="ali-order-cell">
      {ids.map((id) => {
        const track = tracking[id];
        return (
          <div key={id} className="ali-order-item">
            <div className="ali-order-chip">
              {/* One click on the number opens that order on AliExpress. */}
              <a
                className="mono ali-order-link"
                href={`https://www.aliexpress.com/p/order/detail.html?orderId=${encodeURIComponent(id)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this order on AliExpress"
              >
                {id}
              </a>
              <CopyButton text={id} label="Copy AliExpress order number" />
              <button
                type="button"
                className="chip-remove"
                onClick={() => onSave(ids.filter((v) => v !== id))}
                title="Remove this number"
                aria-label={`Remove ${id}`}
                disabled={disabled}
              >
                ×
              </button>
            </div>
            {/* Tracking the extension read from AliExpress for this order. */}
            {track?.trackingNumber && (
              <div className="ali-track">
                <Truck strokeWidth={2} />
                <span className="mono">{track.trackingNumber}</span>
                <CopyButton text={track.trackingNumber} label="Copy tracking number" />
                <a
                  className="icon-btn copy-icon"
                  href={`https://t.17track.net/en#nums=${encodeURIComponent(track.trackingNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Track this parcel"
                  aria-label="Track this parcel"
                >
                  <ArrowUpRight strokeWidth={2} />
                </a>
                {(track.carrierText || track.statusText) && (
                  <div className="item-meta" style={{ flexBasis: "100%" }}>
                    {[track.carrierText, track.statusText].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {adding ? (
        <div>
          <input
            className="input ali-order-input"
            autoFocus
            value={draft}
            placeholder="AliExpress order no."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
                setProblem("");
              }
            }}
            onBlur={submit}
            aria-label="AliExpress order number"
          />
          {problem && <div className="text-error" style={{ fontSize: 11, marginTop: 2 }}>{problem}</div>}
        </div>
      ) : (
        <button type="button" className="ali-order-add" onClick={() => setAdding(true)} disabled={disabled}>
          + {ids.length ? "Add" : "Add order no."}
        </button>
      )}
    </div>
  );
}

// Tracking number(s), carrier and shipped date of a dispatched order.
// The link opens 17TRACK, which understands any carrier from the number alone.
function TrackingCell({ shipments }) {
  if (!shipments || shipments.length === 0) {
    return <span className="item-meta">No tracking</span>;
  }
  return (
    <div className="tracking-list">
      {shipments.map((s, i) => {
        const days = daysSince(s.shippedDate);
        return (
          <div key={s.fulfillmentId || i} className="tracking-item">
            <div className="tracking-carrier">{carrierName(s.carrier)}</div>
            {s.trackingNumber ? (
              <div className="phone-line">
                <span className="mono" style={{ color: "var(--text-primary)" }}>{s.trackingNumber}</span>
                <CopyButton text={s.trackingNumber} label="Copy tracking number" />
                <a
                  className="icon-btn copy-icon"
                  href={`https://t.17track.net/en#nums=${encodeURIComponent(s.trackingNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Track this parcel"
                  aria-label="Track this parcel"
                >
                  <ArrowUpRight strokeWidth={2} />
                </a>
              </div>
            ) : (
              <div className="item-meta">No tracking number</div>
            )}
            {s.shippedDate && (
              <div className="item-meta">
                Shipped {new Date(s.shippedDate).toLocaleDateString()} · {agoLabel(days)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Opens the product's AliExpress page. The first link (the column next to the
// eBay link in the sheet) is the main one; extra links sit behind a "+N" menu.
function AliExpressOpen({ links, orderId, storeId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // The AliExpress Sync extension reads these two parameters to learn which
  // eBay order this product is being bought for. AliExpress ignores them.
  function tagged(link) {
    try {
      const url = new URL(link);
      if (orderId) url.searchParams.set("ebayOrder", orderId);
      if (storeId) url.searchParams.set("ebayStore", storeId);
      return url.toString();
    } catch (e) {
      return link;
    }
  }

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!links || links.length === 0) {
    return (
      <span className="icon-btn ali-none" title="No AliExpress link for this item in the sheet" aria-label="No AliExpress link">
        <ArrowUpRight strokeWidth={2} />
      </span>
    );
  }

  return (
    <span className="ali-open-wrap" ref={ref}>
      <a
        className="icon-btn ali-open"
        href={tagged(links[0])}
        target="_blank"
        rel="noopener noreferrer"
        title="Open on AliExpress"
        aria-label="Open on AliExpress"
      >
        <ArrowUpRight strokeWidth={2.25} />
      </a>
      {links.length > 1 && (
        <>
          <button
            type="button"
            className="ali-more-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={`${links.length - 1} more AliExpress link${links.length > 2 ? "s" : ""}`}
          >
            +{links.length - 1}
          </button>
          {open && (
            <div className="ali-menu" role="menu">
              {links.map((link, i) => (
                <a key={link + i} href={tagged(link)} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)}>
                  <ArrowUpRight strokeWidth={2} />
                  AliExpress link {i + 1}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </span>
  );
}

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
    <ZoomThumb
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
  if (status === "FULFILLED") {
    return (
      <span className="badge badge-success">
        <Truck strokeWidth={2.5} />
        Dispatched
      </span>
    );
  }
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

const PAGE_SIZES = [10, 25, 50, 100];

const COPY = {
  new: {
    title: "New orders",
    subtitle: "Every order that has not been shipped yet.",
    countLabel: "Orders to ship",
    empty: "No new orders right now",
    emptyHint: "New orders will appear here when you refresh.",
  },
  dispatched: {
    title: "Dispatched orders",
    subtitle: "Orders you have already shipped (eBay keeps the last 90 days).",
    countLabel: "Dispatched orders",
    empty: "No dispatched orders yet",
    emptyHint: "Orders you ship will show up here.",
  },
};

// status: "new" (not shipped yet) or "dispatched" (fulfilled).
export default function OrdersView({ status = "new" }) {
  const copy = COPY[status] || COPY.new;
  const { storeId } = useParams();
  const router = useRouter();
  const [storeLabel, setStoreLabel] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [imageSearchStatus, setImageSearchStatus] = useState("");
  const [imageSearchPending, setImageSearchPending] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");

  // Orders the seller has marked as delivered (eBay does not report delivery to sellers).
  const [deliveries, setDeliveries] = useState({});

  async function loadDeliveries() {
    try {
      const res = await fetch(`/api/ebay/delivery?store=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setDeliveries(data.marks || {});
    } catch (e) {
      // Orders just show as not delivered if the marks cannot be read.
    }
  }

  useEffect(() => {
    if (storeId && status === "dispatched") loadDeliveries();
  }, [storeId, status]);

  async function setDelivered(orderIds, delivered) {
    const before = deliveries;
    // Show the change straight away; put it back if saving fails.
    setDeliveries((prev) => {
      const next = { ...prev };
      for (const id of orderIds) {
        if (delivered) next[id] = { at: Date.now() };
        else delete next[id];
      }
      return next;
    });
    try {
      const res = await fetch(`/api/ebay/delivery?store=${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, delivered }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save.");
    } catch (err) {
      setDeliveries(before);
      setError(err.message || "Could not save the delivery status.");
    }
  }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Remember the chosen page size between visits. Orders are only loaded once
  // it has been restored, so the first load uses the right size.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("ordersPageSize"));
      if (PAGE_SIZES.includes(saved)) setPageSize(saved);
    } catch (e) {}
    setReady(true);
  }, []);

  // eBay item id -> AliExpress links, taken from this store's sheet mapping.
  const [aliLinks, setAliLinks] = useState({});

  async function loadSheetLinks() {
    try {
      const res = await fetch(`/api/ebay/sheet?store=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      for (const row of data.rows || []) {
        const itemId = row.itemId || itemIdFromLink(row.ebayLink);
        const links = (Array.isArray(row.aliLinks) ? row.aliLinks : row.aliLink ? [row.aliLink] : [])
          .map((l) => String(l || "").trim())
          .filter(isUrl);
        if (itemId && links.length) map[itemId] = links;
      }
      setAliLinks(map);
    } catch (e) {
      // The arrow simply shows as "no link" if the sheet cannot be read.
    }
  }

  useEffect(() => {
    if (storeId) loadSheetLinks();
  }, [storeId]);

  // eBay order id -> AliExpress order numbers entered for it.
  const [orderRefs, setOrderRefs] = useState({});
  const [savingRef, setSavingRef] = useState(false);

  async function loadOrderRefs() {
    try {
      const res = await fetch(`/api/ebay/orderrefs?store=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setOrderRefs(data.refs || {});
    } catch (e) {
      // Numbers just show as empty if they cannot be read.
    }
  }

  // AliExpress order number -> tracking the extension read from AliExpress.
  const [tracking, setTracking] = useState({});

  async function loadTracking() {
    try {
      const res = await fetch(`/api/ebay/tracking?store=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTracking(data.tracking || {});
    } catch (e) {
      // Tracking simply does not show if it cannot be read.
    }
  }

  // Tracking this dashboard already sent to eBay (so it is never offered twice), the orders ticked
  // for sending, and the review screen.
  const [sentTracking, setSentTracking] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [showSend, setShowSend] = useState(false);
  // The review screen works from the list as it was when it opened: after a send the page refreshes
  // behind it and the shipped orders leave "new", which must not make the results disappear.
  const [reviewSnapshot, setReviewSnapshot] = useState([]);
  const [showAuto, setShowAuto] = useState(false);

  async function loadSent() {
    try {
      const res = await fetch(`/api/ebay/ship?store=${encodeURIComponent(storeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSentTracking(data.sent || {});
    } catch (e) {
      // Without it every order simply looks unsent; the server still refuses a repeat.
    }
  }

  function toggleSelected(orderId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function handleSent(okIds) {
    setSelected((prev) => {
      const next = new Set(prev);
      okIds.forEach((id) => next.delete(id));
      return next;
    });
    loadSent();
    loadOrders(); // shipped orders leave the "new" list
  }

  useEffect(() => {
    if (!storeId) return;
    loadOrderRefs();
    loadTracking();
    loadSent();
    // The extension adds AliExpress numbers and tracking from another tab; pick them up
    // when this tab is looked at again instead of making a person press Refresh.
    function onVisible() {
      if (document.visibilityState === "visible") {
        loadOrderRefs();
        loadTracking();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [storeId]);

  async function saveOrderRef(orderId, aliOrderIds) {
    const before = orderRefs;
    // Show the change straight away; put it back if saving fails.
    setOrderRefs((prev) => {
      const next = { ...prev };
      if (aliOrderIds.length) next[orderId] = { aliOrderIds, updatedAt: Date.now() };
      else delete next[orderId];
      return next;
    });
    setSavingRef(true);
    try {
      const res = await fetch(`/api/ebay/orderrefs?store=${encodeURIComponent(storeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, aliOrderIds }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save the order number.");
    } catch (err) {
      setOrderRefs(before);
      setError(err.message || "Could not save the order number.");
    }
    setSavingRef(false);
  }

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
      const params = new URLSearchParams({
        store: storeId,
        status,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/ebay/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setReconnectRequired(Boolean(data.reconnectRequired));
      if (data.error) setError(data.error);
    } catch (err) {
      setError("Could not load orders.");
    }
    setLoading(false);
  }

  function changePageSize(size) {
    setPageSize(size);
    setPage(1);
    try {
      localStorage.setItem("ordersPageSize", String(size));
    } catch (e) {}
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

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
  }, [storeId]);

  useEffect(() => {
    if (!storeId || !ready) return;
    loadOrders();
  }, [storeId, ready, status, page, pageSize]);

  // If orders were shipped meanwhile and the page no longer exists, step back.
  useEffect(() => {
    if (!loading && total > 0 && page > pageCount) setPage(pageCount);
  }, [loading, total, page, pageCount]);

  const needle = query.trim().toLowerCase();
  const statusOrders =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => (statusFilter === "in_progress") === (order.fulfillmentStatus === "IN_PROGRESS"));

  // Dispatched tab: carriers present on this page, and the carrier / "shipped how long ago" filters.
  const carriersOnPage = [...new Set(orders.flatMap((o) => (o.shipments || []).map((s) => carrierName(s.carrier))))]
    .filter(Boolean)
    .sort();
  const shipmentFiltered =
    status !== "dispatched"
      ? statusOrders
      : statusOrders.filter((order) => {
          const shipments = order.shipments || [];
          if (carrierFilter !== "all" && !shipments.some((s) => carrierName(s.carrier) === carrierFilter)) return false;
          if (deliveryFilter === "delivered" && !deliveries[order.orderId]) return false;
          if (deliveryFilter === "transit" && deliveries[order.orderId]) return false;
          if (ageFilter !== "all") {
            const days = Math.min(...shipments.map((s) => daysSince(s.shippedDate)).filter((d) => d != null), Infinity);
            if (!Number.isFinite(days)) return false;
            if (ageFilter === "recent" && days > 3) return false;
            if (ageFilter === "week" && (days <= 3 || days > 7)) return false;
            if (ageFilter === "old" && days <= 7) return false;
          }
          return true;
        });

  const visibleOrders = needle
    ? shipmentFiltered.filter((order) =>
        [
          order.orderId,
          order.buyerUsername,
          order.shipTo?.fullName,
          ...(order.shipments || []).map((s) => s.trackingNumber),
          ...(orderRefs[order.orderId]?.aliOrderIds || []),
          ...order.lineItems.flatMap((li) => [li.title, li.sku]),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      )
    : shipmentFiltered;
  // When every amount on the page is in one currency, show it once in the column
  // headers ("Total (GBP)") and keep the cells to plain numbers. Mixed currencies
  // keep the code in each cell.
  const currenciesOnPage = new Set(
    visibleOrders.flatMap((o) => [o.currency, o.earnings?.currency]).filter(Boolean)
  );
  const singleCurrency = currenciesOnPage.size === 1 ? [...currenciesOnPage][0] : "";

  // New orders whose AliExpress tracking is in and that can be sent to eBay (same rule as the server).
  const readyOf = (order) => (status === "new" ? checkReadyToShip(order.orderId, orderRefs, tracking, sentTracking) : { ok: false });
  const readyOrders = visibleOrders.filter((order) => readyOf(order).ok);
  const selectedReady = readyOrders.filter((order) => selected.has(order.orderId));
  const allReadySelected = readyOrders.length > 0 && selectedReady.length === readyOrders.length;

  function toggleAllReady() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allReadySelected) readyOrders.forEach((o) => next.delete(o.orderId));
      else readyOrders.forEach((o) => next.add(o.orderId));
      return next;
    });
  }

  // What the review screen shows for each ticked order.
  const reviewItems = selectedReady.map((order) => {
    const ready = readyOf(order);
    return {
      orderId: order.orderId,
      buyer: order.shipTo?.fullName || order.buyerUsername || "",
      summary: order.lineItems.map((li) => `${li.quantity} × ${li.title}`).join("; ").slice(0, 140),
      trackingNumber: ready.trackingNumber,
      serviceText: ready.carrierText,
    };
  });

  // Tracking numbers of the orders shown that are not yet delivered; 17TRACK takes up to 40 at once.
  const trackableNumbers = [
    ...new Set(
      visibleOrders
        .filter((o) => !deliveries[o.orderId])
        .flatMap((o) => (o.shipments || []).map((s) => s.trackingNumber))
        .filter(Boolean)
    ),
  ].slice(0, 40);

  function trackAllOnPage() {
    if (trackableNumbers.length === 0) return;
    window.open(
      `https://t.17track.net/en#nums=${trackableNumbers.map(encodeURIComponent).join(",")}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

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
          <h1 className="page-title">{copy.title}</h1>
          <p className="page-subtitle">
            {storeLabel ? `${storeLabel} · ` : ""}
            {copy.subtitle}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {status === "new" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAuto(true)}
              title="Send tracking to eBay automatically shortly before the dispatch-by date"
            >
              <Timer strokeWidth={2} />
              Auto-send
            </button>
          )}
          <button
            onClick={() => {
              loadOrders();
              loadSheetLinks();
              loadOrderRefs();
              loadTracking();
            }}
            className="btn btn-secondary"
            disabled={loading}
          >
            <RefreshCw size={14} strokeWidth={2} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {showAuto && <AutoShipDialog storeId={storeId} onClose={() => setShowAuto(false)} />}
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
            <div className="stat-label">{copy.countLabel}</div>
            {loading ? <div className="skeleton" style={{ height: "30px", width: "48px" }} /> : <div className="stat-value">{total}</div>}
            <div className="stat-hint">{loading ? " " : `${totalItems} item${totalItems === 1 ? "" : "s"} on this page`}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Order value</div>
            {loading ? <div className="skeleton" style={{ height: "30px", width: "110px" }} /> : <div className="stat-value" style={{ fontSize: "20px" }}>{totalValue}</div>}
            <div className="stat-hint">This page · before eBay fees</div>
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
          <p className="empty-title">{copy.empty}</p>
          <p className="empty-subtitle" style={{ marginBottom: 0 }}>
            {copy.emptyHint}
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
                placeholder="Search this page: order, item, SKU or buyer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search orders on this page"
              />
            </div>
            {status === "new" && readyOrders.length > 0 && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={toggleAllReady} title="Tick or untick every order on this page whose tracking is ready">
                  <Check strokeWidth={2.5} />
                  {allReadySelected ? "Clear selection" : `Select all with tracking (${readyOrders.length})`}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setReviewSnapshot(reviewItems);
                    setShowSend(true);
                  }}
                  disabled={selectedReady.length === 0}
                  title="Review, then mark the ticked orders as shipped on eBay with their AliExpress tracking"
                >
                  <Truck strokeWidth={2} />
                  Send tracking to eBay ({selectedReady.length})
                </button>
              </>
            )}
            {showSend && reviewSnapshot.length > 0 && (
              <SendTrackingDialog
                items={reviewSnapshot}
                storeId={storeId}
                onClose={() => setShowSend(false)}
                onFinished={handleSent}
              />
            )}
            {status === "dispatched" && (
              <>
                <label className="filter-select">
                  Carrier
                  <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} aria-label="Filter by carrier">
                    <option value="all">All carriers</option>
                    {carriersOnPage.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-select">
                  Shipped
                  <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} aria-label="Filter by time since shipped">
                    <option value="all">Any time</option>
                    <option value="recent">Last 3 days</option>
                    <option value="week">4 to 7 days ago</option>
                    <option value="old">Over 7 days ago</option>
                  </select>
                </label>
                <label className="filter-select">
                  Delivery
                  <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)} aria-label="Filter by delivery">
                    <option value="all">All</option>
                    <option value="transit">Not delivered</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={trackAllOnPage}
                  disabled={trackableNumbers.length === 0}
                  title="Open every undelivered tracking number on this page in 17TRACK (free website)"
                >
                  <Truck strokeWidth={2} />
                  Track all ({trackableNumbers.length})
                </button>
              </>
            )}
            {status === "new" && (
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
            )}
            <span className="table-meta">
              {visibleOrders.length === orders.length
                ? `${firstShown}–${lastShown} of ${total}`
                : `${visibleOrders.length} of ${orders.length} on this page`}
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
                    {status === "new" && (
                      <th className="check-col">
                        <input
                          type="checkbox"
                          checked={allReadySelected}
                          onChange={toggleAllReady}
                          disabled={readyOrders.length === 0}
                          title={readyOrders.length ? "Tick every order whose tracking is ready" : "No order on this page has tracking ready"}
                          aria-label="Select all orders with tracking ready"
                        />
                      </th>
                    )}
                    <th>Item</th>
                    <th>Order</th>
                    <th className="num">Qty</th>
                    <th className="num">Total{singleCurrency ? ` (${singleCurrency})` : ""}</th>
                    <th className="num">Earnings{singleCurrency ? ` (${singleCurrency})` : ""}</th>
                    <th>Ship to</th>
                    <th>AliExpress order</th>
                    {status === "dispatched" && <th>Tracking</th>}
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
                            {status === "new" && (
                              <td className="check-col">
                                {idx === 0 &&
                                  (() => {
                                    const ready = readyOf(order);
                                    return (
                                      <input
                                        type="checkbox"
                                        checked={ready.ok && selected.has(order.orderId)}
                                        onChange={() => toggleSelected(order.orderId)}
                                        disabled={!ready.ok}
                                        title={ready.ok ? `Send tracking ${ready.trackingNumber} to eBay` : ready.reason}
                                        aria-label={`Select order ${order.orderId}`}
                                      />
                                    );
                                  })()}
                              </td>
                            )}
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
                                ? singleCurrency
                                  ? order.orderTotal.toFixed(2)
                                  : `${order.currency || ""} ${order.orderTotal.toFixed(2)}`.trim()
                                : ""}
                            </td>
                            <td className="num mono" style={order.earnings && idx === 0 ? { color: "var(--success)" } : undefined}>
                              {idx === 0
                                ? order.earnings
                                  ? singleCurrency
                                    ? order.earnings.earnings.toFixed(2)
                                    : `${order.earnings.currency} ${order.earnings.earnings.toFixed(2)}`
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
                            <td style={{ minWidth: "190px" }}>
                              {idx === 0 && (
                                <AliOrderCell
                                  ids={orderRefs[order.orderId]?.aliOrderIds || []}
                                  // Once an order is dispatched, eBay's own Tracking column already shows it.
                                  tracking={status === "new" ? tracking : {}}
                                  onSave={(ids) => saveOrderRef(order.orderId, ids)}
                                  disabled={savingRef}
                                />
                              )}
                            </td>
                            {status === "dispatched" && (
                              <td style={{ minWidth: "190px" }}>
                                {idx === 0 && <TrackingCell shipments={order.shipments} />}
                              </td>
                            )}
                            <td>
                              {idx === 0 && (
                                <div className="status-cell">
                                  {status === "dispatched" && deliveries[order.orderId] ? (
                                    <span className="badge badge-success">
                                      <Check strokeWidth={2.5} />
                                      Delivered
                                    </span>
                                  ) : (
                                    <StatusBadge status={order.fulfillmentStatus} />
                                  )}
                                  {status === "new" && sentTracking[order.orderId] && (
                                    <span
                                      className="badge badge-info"
                                      title={`Tracking ${sentTracking[order.orderId].trackingNumber} (${sentTracking[order.orderId].carrier}) was sent to eBay${sentTracking[order.orderId].auto ? " automatically" : ""}`}
                                    >
                                      <Truck strokeWidth={2.5} />
                                      Tracking sent {new Date(sentTracking[order.orderId].at).toLocaleDateString()}
                                    </span>
                                  )}
                                  {status === "dispatched" && (
                                    <button
                                      type="button"
                                      className="link-button"
                                      onClick={() => setDelivered([order.orderId], !deliveries[order.orderId])}
                                    >
                                      {deliveries[order.orderId] ? "Undo" : "Mark delivered"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="row-actions">
                                <AliExpressOpen
                                  links={li.legacyItemId ? aliLinks[li.legacyItemId] : undefined}
                                  orderId={order.orderId}
                                  storeId={storeId}
                                />
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
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="pager">
            <label className="pager-size">
              Per page
              <select
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                aria-label="Orders per page"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="pager-info">
              Showing {firstShown}–{lastShown} of {total}
            </span>
            <div className="pager-nav">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                <ChevronLeft strokeWidth={2} />
                Previous
              </button>
              <span className="pager-page">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={loading || page >= pageCount}
              >
                Next
                <ChevronRight strokeWidth={2} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
