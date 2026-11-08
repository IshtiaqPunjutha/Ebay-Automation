// lib/returns.js
// Reading eBay's returns and the little order facts the Returns tab shows.
// eBay's returns live in the older Post-Order API, which may refuse this app's token: callers treat a failure as
// "could not read eBay's returns" and still show what was marked by hand.
import { localDate } from "./finance";
import { marketplaceInfo } from "./marketplaces";

const API = "https://api.ebay.com";

// Returns opened in the last `days` days: [{ returnId, itemId, transactionId, state, status, reason, created, refund, currency, buyer }].
// Throws when eBay refuses.
export async function fetchEbayReturns(accessToken, marketplaceId, days = 90) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ creation_date_range_from: from, limit: "200", role: "SELLER" });
  const res = await fetch(`${API}/post-order/v2/return/search?${params.toString()}`, {
    headers: {
      Authorization: `IAF ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId || "EBAY_GB",
    },
  });
  if (!res.ok) throw new Error(`eBay returns could not be read (${res.status}). ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return (data.members || []).map((m) => {
    const refund = m.sellerTotalRefund?.actualRefundAmount || m.sellerTotalRefund?.estimatedRefundAmount || m.buyerTotalRefund?.actualRefundAmount || m.buyerTotalRefund?.estimatedRefundAmount || {};
    return {
      returnId: String(m.returnId || ""),
      itemId: String(m.creationInfo?.item?.itemId || ""),
      transactionId: String(m.creationInfo?.item?.transactionId || ""),
      state: m.state || "",
      status: m.status || "",
      reason: m.creationInfo?.reason || "",
      created: m.creationInfo?.creationDate?.value || null,
      refund: Number(refund.value) || 0,
      currency: refund.currency || "",
      buyer: m.buyerLoginName || "",
    };
  });
}

// { "<itemId>|<transactionId>": orderId } for the orders of the last `days` days, to tell which order a return belongs to.
export async function fetchOrderIdMap(accessToken, days = 120) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const map = {};
  const PAGE = 200;
  for (let at = 0; at < 1000; at += PAGE) {
    const params = new URLSearchParams({ filter: `creationdate:[${since}..]`, limit: String(PAGE), offset: String(at) });
    const res = await fetch(`${API}/sell/fulfillment/v1/order?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const order of data.orders || []) {
      for (const li of order.lineItems || []) {
        if (li.legacyItemId && li.lineItemId) map[`${li.legacyItemId}|${li.lineItemId}`] = order.orderId;
      }
    }
    if ((data.orders || []).length < PAGE || at + PAGE >= (data.total || 0)) break;
  }
  return map;
}

// One order's facts for the Returns tab, or null if eBay does not know it.
export async function fetchOrderBrief(accessToken, orderId) {
  try {
    const res = await fetch(`${API}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const o = await res.json();
    const total = Number(o.pricingSummary?.total?.value);
    return {
      date: o.creationDate || null,
      buyer: o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || o.buyer?.username || "",
      title: (o.lineItems || []).map((li) => li.title).filter(Boolean).join(" + "),
      total: Number.isFinite(total) ? total : null,
      currency: o.pricingSummary?.total?.currency || null,
      // What eBay has already given back to the buyer for this order.
      refunded: (o.paymentSummary?.refunds || []).reduce((sum, r) => sum + (Number(r.amount?.value) || 0), 0),
    };
  } catch {
    return null;
  }
}

export { marketplaceInfo };

// The day a saved return counts for: the date chosen, else the day eBay opened it, else the day it was added (YYYY-MM-DD).
export function returnDate(entry, ebayCreated, tz) {
  if (entry?.date) return entry.date;
  if (ebayCreated) return localDate(ebayCreated, tz);
  return entry?.createdAt ? localDate(new Date(entry.createdAt).toISOString(), tz) : "";
}
