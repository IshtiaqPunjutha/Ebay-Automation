// lib/autoship.js
// Automatic sending of AliExpress tracking to eBay shortly before the "dispatch by" date.

import { fetchNewOrdersLight, isTokenExpired, refreshAccessToken } from "./ebay";
import {
  appendAutoShipLog,
  getAutoShip,
  getEbayStore,
  getOrderRefs,
  getShipSent,
  getTracking,
  updateStoreAccessToken,
} from "./store";
import { checkReadyToShip } from "./shipping";
import { shipOrders } from "./shipOrders";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTO_PER_RUN = 30;

// Is it time? True once we are within `daysBefore` days of the dispatch-by date (or past it).
export function isDue(shipBy, daysBefore, now = Date.now()) {
  const time = shipBy ? new Date(shipBy).getTime() : NaN;
  if (!Number.isFinite(time)) return false;
  return now >= time - daysBefore * DAY_MS;
}

// Splits the store's unshipped orders into what the job would send now and what it leaves, with a reason.
// orders: [{ orderId, shipBy, buyer }] from eBay; refs / tracking / sent as in lib/shipping.js.
export function planAutoShip(orders, refs, tracking, sent, settings, now = Date.now()) {
  const due = [];
  const waiting = [];
  for (const order of orders) {
    const ready = checkReadyToShip(order.orderId, refs, tracking, sent);
    if (!ready.ok) {
      waiting.push({ orderId: order.orderId, buyer: order.buyer, reason: ready.reason });
      continue;
    }
    if (!ready.carrierName) {
      waiting.push({ orderId: order.orderId, buyer: order.buyer, reason: "AliExpress has not shown the delivery carrier yet. Send this one yourself, or wait until it appears." });
      continue;
    }
    if (!order.shipBy) {
      waiting.push({ orderId: order.orderId, buyer: order.buyer, reason: "eBay gave no dispatch-by date for this order." });
      continue;
    }
    if (!isDue(order.shipBy, settings.daysBefore, now)) {
      waiting.push({ orderId: order.orderId, buyer: order.buyer, reason: `Not yet: dispatch by ${order.shipBy.slice(0, 10)}.`, shipBy: order.shipBy });
      continue;
    }
    due.push({
      orderId: order.orderId,
      buyer: order.buyer,
      shipBy: order.shipBy,
      trackingNumber: ready.trackingNumber,
      // The carrier AliExpress shows for this parcel, not a store-wide setting.
      carrier: ready.carrierName,
    });
  }
  return { due, waiting };
}

// Runs (or, with dryRun, only plans) the automatic sending for one store.
// Returns { plan, results } where results is [] for a dry run.
export async function runAutoShip(userId, storeId, { dryRun = false, now = Date.now() } = {}) {
  let store = await getEbayStore(userId, storeId);
  if (!store) throw new Error("Store not found");
  const settings = await getAutoShip(userId, storeId);

  if (isTokenExpired(store.tokens)) {
    const refreshed = await refreshAccessToken(store.tokens.refreshToken);
    store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
  }
  const accessToken = store.tokens.accessToken;

  const [orders, refs, tracking, sent] = await Promise.all([
    fetchNewOrdersLight(accessToken),
    getOrderRefs(userId, storeId),
    getTracking(userId, storeId),
    getShipSent(userId, storeId),
  ]);

  const plan = planAutoShip(orders, refs, tracking, sent, settings, now);
  if (dryRun || plan.due.length === 0) return { plan, results: [], settings };

  const batch = plan.due.slice(0, MAX_AUTO_PER_RUN);
  const results = await shipOrders({ accessToken, userId, storeId, items: batch, refs, tracking, sent, auto: true });
  await appendAutoShipLog(
    userId,
    storeId,
    results.map((r) => ({
      at: now,
      orderId: r.orderId,
      ok: r.ok,
      trackingNumber: batch.find((b) => b.orderId === r.orderId)?.trackingNumber,
      error: r.ok ? undefined : r.error,
    }))
  );
  return { plan, results, settings };
}
