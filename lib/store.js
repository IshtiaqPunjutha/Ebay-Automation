// lib/store.js
// Each user's eBay stores and index use a separate KV namespace.

import { kv } from "@vercel/kv";

const indexKey = (userId) => `user:${userId}:ebay:stores:index`;
const storeKey = (userId, storeId) => `user:${userId}:ebay:store:${storeId}`;
const APP_TOKEN_KEY = "ebay:app-token";
const LEGACY_INDEX_KEY = "ebay:stores:index";
const LEGACY_CLAIM_KEY = "ebay:stores:legacy-claim-owner";

// The Browse API (used for product images) needs an application-level
// token, not a seller's. It's the same token for every store, so it's
// cached once here rather than per store.
export async function getCachedAppToken() {
  return await kv.get(APP_TOKEN_KEY);
}

export async function saveAppToken(token) {
  await kv.set(APP_TOKEN_KEY, token);
  return token;
}

// Turn "John's_Store 99" into "johns-store-99" so it's a safe key.
export function slugifyStoreId(rawName) {
  return (rawName || "store")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export async function saveEbayStore(userId, storeId, { tokens, label, marketplaceId }) {
  const record = {
    userId,
    storeId,
    label: label || storeId,
    marketplaceId: marketplaceId || null,
    tokens,
    connectedAt: Date.now(),
  };
  await kv.set(storeKey(userId, storeId), record);
  await kv.sadd(indexKey(userId), storeId);
  return record;
}

export async function getEbayStore(userId, storeId) {
  return await kv.get(storeKey(userId, storeId));
}

export async function listEbayStores(userId) {
  const ids = (await kv.smembers(indexKey(userId))) || [];
  const records = await Promise.all(ids.map((id) => getEbayStore(userId, id)));
  return records.filter(Boolean).sort((a, b) => b.connectedAt - a.connectedAt);
}

export async function updateStoreAccessToken(userId, storeId, newAccessToken, expiresIn) {
  const existing = await getEbayStore(userId, storeId);
  if (!existing) return null;
  const updated = {
    ...existing,
    tokens: {
      ...existing.tokens,
      accessToken: newAccessToken,
      expiresIn,
      obtainedAt: Date.now(),
    },
  };
  await kv.set(storeKey(userId, storeId), updated);
  return updated;
}

// Remember which eBay site the store sells on (read from eBay, see lib/storeMarketplace.js).
export async function setStoreMarketplace(userId, storeId, marketplaceId) {
  const existing = await getEbayStore(userId, storeId);
  if (!existing) return null;
  const updated = { ...existing, marketplaceId };
  await kv.set(storeKey(userId, storeId), updated);
  return updated;
}

export async function removeEbayStore(userId, storeId) {
  await kv.del(storeKey(userId, storeId));
  await kv.srem(indexKey(userId), storeId);
}

// AliExpress order numbers per eBay order: { [ebayOrderId]: { aliOrderIds: [..], updatedAt } }.
// One record per store; the browser extension will write to the same place.
const orderRefsKey = (userId, storeId) => `user:${userId}:ebay:orderrefs:${storeId}`;
export const MAX_REFS_PER_ORDER = 20;

export async function getOrderRefs(userId, storeId) {
  return (await kv.get(orderRefsKey(userId, storeId))) || {};
}

// An empty list removes the order's entry.
// An order with several items can have one AliExpress order per item: `lines` maps an AliExpress number to the
// eBay line item it was bought for ({ [aliOrderId]: lineItemId }). Numbers without an entry belong to the order as a
// whole (how it worked before). `lines` given = the new mapping; left out = the old mapping, minus numbers that are gone.
export async function setOrderRefs(userId, storeId, orderId, aliOrderIds, lines) {
  const refs = await getOrderRefs(userId, storeId);
  if (aliOrderIds.length === 0) {
    delete refs[orderId];
  } else {
    const base = lines || refs[orderId]?.lines || {};
    const kept = Object.fromEntries(Object.entries(base).filter(([id]) => aliOrderIds.includes(id)));
    // noteText = what was last written to the order's note on eBay (kept, so the page can tell it is in step or not).
    const noteText = refs[orderId]?.noteText;
    refs[orderId] = { aliOrderIds, ...(Object.keys(kept).length ? { lines: kept } : {}), ...(noteText ? { noteText } : {}), updatedAt: Date.now() };
  }
  await kv.set(orderRefsKey(userId, storeId), refs);
  return refs[orderId] || null;
}

// Records what the order's eBay note now says (null = the note was removed).
export async function setOrderNoteText(userId, storeId, orderId, text) {
  const refs = await getOrderRefs(userId, storeId);
  if (!refs[orderId]) return;
  if (text) refs[orderId] = { ...refs[orderId], noteText: text };
  else {
    const { noteText, ...rest } = refs[orderId];
    refs[orderId] = rest;
  }
  await kv.set(orderRefsKey(userId, storeId), refs);
}

// AliExpress tracking read from the AliExpress tracking page by the extension:
// { [aliOrderId]: { trackingNumber, carrierText, statusText, estimateText, updatedAt } }.
const trackingKey = (userId, storeId) => `user:${userId}:ebay:tracking:${storeId}`;

export async function getTracking(userId, storeId) {
  return (await kv.get(trackingKey(userId, storeId))) || {};
}

export async function setTracking(userId, storeId, aliOrderId, data) {
  const all = await getTracking(userId, storeId);
  // A report that lacks the carrier or status (they are best-effort) must not wipe what is already known.
  const filled = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "" && value != null));
  all[aliOrderId] = { ...(all[aliOrderId] || {}), ...filled, updatedAt: Date.now() };
  await kv.set(trackingKey(userId, storeId), all);
  return all[aliOrderId];
}

// Every step of an AliExpress parcel as the tracking page lists it, newest first:
// [{ title, desc, note, time }]. One small key per parcel, so the main tracking map stays small.
const trackEventsKey = (userId, storeId, aliOrderId) => `user:${userId}:ebay:trackevents:${storeId}:${aliOrderId}`;

export async function getTrackEvents(userId, storeId, aliOrderId) {
  return (await kv.get(trackEventsKey(userId, storeId, aliOrderId))) || [];
}

export async function setTrackEvents(userId, storeId, aliOrderId, events) {
  await kv.set(trackEventsKey(userId, storeId, aliOrderId), events);
}

// Tracking this dashboard has sent to eBay (which marked the order as shipped):
// { [ebayOrderId]: { trackingNumber, carrier, fulfillmentId, at } }. Used so the same order is never sent twice.
const shipSentKey = (userId, storeId) => `user:${userId}:ebay:shipsent:${storeId}`;

export async function getShipSent(userId, storeId) {
  return (await kv.get(shipSentKey(userId, storeId))) || {};
}

// Forgets sent-records that eBay no longer agrees with (the shipment was removed on eBay).
export async function unmarkShipSent(userId, storeId, orderIds) {
  const all = await getShipSent(userId, storeId);
  let changed = false;
  for (const id of orderIds) {
    if (all[id]) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) await kv.set(shipSentKey(userId, storeId), all);
  return all;
}

export async function markShipSent(userId, storeId, orderId, record) {
  const all = await getShipSent(userId, storeId);
  all[orderId] = { ...record, at: Date.now() };
  await kv.set(shipSentKey(userId, storeId), all);
  return all[orderId];
}

// Automatic sending of tracking to eBay, per store: { enabled, daysBefore, carrier }.
// A store is only looked at by the daily job when it is in the index.
const autoShipKey = (userId, storeId) => `user:${userId}:ebay:autoship:${storeId}`;
const autoShipLogKey = (userId, storeId) => `user:${userId}:ebay:autolog:${storeId}`;
const AUTO_SHIP_INDEX = "autoship:index";
export const AUTO_SHIP_DEFAULTS = { enabled: false, daysBefore: 2, carrier: "Other" };

export async function getAutoShip(userId, storeId) {
  return { ...AUTO_SHIP_DEFAULTS, ...((await kv.get(autoShipKey(userId, storeId))) || {}) };
}

export async function setAutoShip(userId, storeId, settings) {
  const value = { ...AUTO_SHIP_DEFAULTS, ...settings };
  await kv.set(autoShipKey(userId, storeId), value);
  const member = `${userId}|${storeId}`;
  if (value.enabled) await kv.sadd(AUTO_SHIP_INDEX, member);
  else await kv.srem(AUTO_SHIP_INDEX, member);
  return value;
}

// [{ userId, storeId }] for every store that has automatic sending switched on.
export async function listAutoShipStores() {
  const members = (await kv.smembers(AUTO_SHIP_INDEX)) || [];
  return members.map((m) => {
    const [userId, ...rest] = String(m).split("|");
    return { userId, storeId: rest.join("|") };
  });
}

// What the automatic job did, newest first: [{ at, orderId, ok, trackingNumber?, error? }].
export async function getAutoShipLog(userId, storeId) {
  return (await kv.get(autoShipLogKey(userId, storeId))) || [];
}

export async function appendAutoShipLog(userId, storeId, entries) {
  if (entries.length === 0) return;
  const log = await getAutoShipLog(userId, storeId);
  await kv.set(autoShipLogKey(userId, storeId), [...entries, ...log].slice(0, 60));
}

// Orders the seller has marked as delivered: { [ebayOrderId]: { at } }.
const deliveryKey = (userId, storeId) => `user:${userId}:ebay:delivery:${storeId}`;

export async function getDeliveries(userId, storeId) {
  return (await kv.get(deliveryKey(userId, storeId))) || {};
}

export async function setDeliveries(userId, storeId, orderIds, delivered, meta = {}) {
  const marks = await getDeliveries(userId, storeId);
  const now = Date.now();
  for (const id of orderIds) {
    if (delivered) marks[id] = { at: now, ...meta };
    else delete marks[id];
  }
  await kv.set(deliveryKey(userId, storeId), marks);
  return marks;
}

// Top-level eBay category ids rarely change; cache them for a week.
// The category tree differs per eBay site, so each marketplace has its own cached list.
// (The UK one keeps the old key, so nothing has to be fetched again for existing UK stores.)
const rootCategoriesKey = (marketplaceId) => (!marketplaceId || marketplaceId === "EBAY_GB" ? "ebay:root-categories" : `ebay:root-categories:${marketplaceId}`);

export async function getCachedRootCategories(marketplaceId) {
  return await kv.get(rootCategoriesKey(marketplaceId));
}

export async function saveRootCategories(ids, marketplaceId) {
  await kv.set(rootCategoriesKey(marketplaceId), ids, { ex: 7 * 24 * 60 * 60 });
  return ids;
}

// Per-store "sheet mapping": rows linking an eBay listing to its AliExpress
// source. Kept when a store is disconnected, so reconnecting the same
// seller account brings the sheet back.
const sheetKey = (userId, storeId) => `user:${userId}:ebay:sheet:${storeId}`;

// A row is { id, itemId, title, ebayLink, aliLinks: [..], notes }. `aliLinks`
// holds one entry per AliExpress column; `aliLink` mirrors the first one.
// `aliColumns` is how many AliExpress columns the sheet shows.
export const MAX_ALI_COLUMNS = 10;

export function normalizeSheetRow(row) {
  const links = Array.isArray(row?.aliLinks) ? row.aliLinks : row?.aliLink ? [row.aliLink] : [];
  const aliLinks = links.map((l) => (typeof l === "string" ? l.trim() : "")).slice(0, MAX_ALI_COLUMNS);
  while (aliLinks.length && !aliLinks[aliLinks.length - 1]) aliLinks.pop();
  return { ...row, aliLinks, aliLink: aliLinks[0] || "" };
}

export async function getStoreSheet(userId, storeId) {
  const sheet = (await kv.get(sheetKey(userId, storeId))) || { rows: [], updatedAt: null };
  const rows = (sheet.rows || []).map(normalizeSheetRow);
  const widest = rows.reduce((max, r) => Math.max(max, r.aliLinks.length), 1);
  return { ...sheet, rows, aliColumns: Math.min(MAX_ALI_COLUMNS, Math.max(sheet.aliColumns || 1, widest)) };
}

export async function saveStoreSheet(userId, storeId, rows, aliColumns = 1) {
  const record = { rows, aliColumns, updatedAt: Date.now() };
  await kv.set(sheetKey(userId, storeId), record);
  return record;
}

export async function getLegacyEbayStoreCount() {
  return (await kv.smembers(LEGACY_INDEX_KEY) || []).length;
}

async function copyLegacyEbayStores(userId) {
  const ids = (await kv.smembers(LEGACY_INDEX_KEY)) || [];
  for (const legacyId of ids) {
    const record = await kv.get(`ebay:store:${legacyId}`);
    if (!record) continue;
    const storeId = record.storeId || legacyId;
    if (!/^[a-z0-9-]{1,64}$/i.test(storeId)) {
      throw new Error("Legacy eBay store has an invalid ID");
    }
    await kv.set(storeKey(userId, storeId), { ...record, userId, storeId });
    await kv.sadd(indexKey(userId), storeId);
  }

  for (const legacyId of ids) {
    await kv.del(`ebay:store:${legacyId}`);
  }
  await kv.del(LEGACY_INDEX_KEY);
  return ids.length;
}

export async function migrateLegacyEbayStores(userId) {
  const count = await getLegacyEbayStoreCount();
  if (!count) return 0;

  const claimed = await kv.set(LEGACY_CLAIM_KEY, userId, { nx: true });
  const owner = claimed ? userId : await kv.get(LEGACY_CLAIM_KEY);
  if (owner !== userId) {
    throw new Error("Legacy eBay stores have already been claimed by another account");
  }
  return await copyLegacyEbayStores(userId);
}

export async function resumeLegacyEbayStoreMigration(userId) {
  const owner = await kv.get(LEGACY_CLAIM_KEY);
  if (owner !== userId) return 0;
  return await copyLegacyEbayStores(userId);
}

// What each AliExpress order cost, read from the order list by the extension:
// { [aliOrderId]: { amount, currency, updatedAt } }.
const aliCostKey = (userId, storeId) => `user:${userId}:ebay:alicost:${storeId}`;

export async function getAliCosts(userId, storeId) {
  return (await kv.get(aliCostKey(userId, storeId))) || {};
}

export async function setAliCost(userId, storeId, aliOrderId, { amount, currency }) {
  const all = await getAliCosts(userId, storeId);
  all[aliOrderId] = { amount, currency, updatedAt: Date.now() };
  await kv.set(aliCostKey(userId, storeId), all);
  return all[aliOrderId];
}

// Partnership split per store: { vaPercent } (the owner gets the rest). Default 0 = no partner.
const partnerKey = (userId, storeId) => `user:${userId}:ebay:partner:${storeId}`;

export async function getPartnership(userId, storeId) {
  const value = await kv.get(partnerKey(userId, storeId));
  const vaPercent = Number.isFinite(value?.vaPercent) ? value.vaPercent : 0;
  return { vaPercent, ownerPercent: +(100 - vaPercent).toFixed(2) };
}

export async function setPartnership(userId, storeId, vaPercent) {
  await kv.set(partnerKey(userId, storeId), { vaPercent });
  return getPartnership(userId, storeId);
}

// Finance PIN (one per account): scrypt hash, never the PIN itself.
const pinKey = (userId) => `user:${userId}:finance:pin`;

export async function getPinHash(userId) {
  return (await kv.get(pinKey(userId))) || null;
}

export async function setPinHash(userId, hash) {
  await kv.set(pinKey(userId), hash);
}

// Failed PIN attempts, to slow down guessing: { count, until }.
const pinTriesKey = (userId) => `user:${userId}:finance:pintries`;

export async function getPinTries(userId) {
  return (await kv.get(pinTriesKey(userId))) || { count: 0, until: 0 };
}

export async function setPinTries(userId, value) {
  await kv.set(pinTriesKey(userId), value);
}

// ---- Finance extras: hand-entered figures, all per store ----

// A cost typed in for one eBay order; it replaces whatever the extension read from AliExpress for that order:
// { [ebayOrderId]: { amount, updatedAt } }.
const manualCostKey = (userId, storeId) => `user:${userId}:finance:manualcost:${storeId}`;

export async function getManualCosts(userId, storeId) {
  return (await kv.get(manualCostKey(userId, storeId))) || {};
}

// amount null removes the manual cost (the AliExpress figure is used again).
export async function setManualCost(userId, storeId, orderId, amount) {
  const all = await getManualCosts(userId, storeId);
  if (amount === null) delete all[orderId];
  else all[orderId] = { amount, updatedAt: Date.now() };
  await kv.set(manualCostKey(userId, storeId), all);
  return all;
}

// Extra expenses of a month that eBay does not know about (tools, VA subscriptions, packaging ...):
// [{ id, label, amount, date }] with amount in pounds as a positive number and date as YYYY-MM-DD.
const expensesKey = (userId, storeId, ym) => `user:${userId}:finance:expenses:${storeId}:${ym}`;

export async function getExpenses(userId, storeId, ym) {
  return (await kv.get(expensesKey(userId, storeId, ym))) || [];
}

export async function saveExpenses(userId, storeId, ym, list) {
  await kv.set(expensesKey(userId, storeId, ym), list);
  return list;
}

// What was paid to the VA: [{ id, month, amount, date, note }] (month = the profit month it settles).
const paymentsKey = (userId, storeId) => `user:${userId}:finance:payments:${storeId}`;

export async function getPayments(userId, storeId) {
  return (await kv.get(paymentsKey(userId, storeId))) || [];
}

export async function savePayments(userId, storeId, list) {
  await kv.set(paymentsKey(userId, storeId), list);
  return list;
}

// Closed months: { [ym]: { closedAt, partnership: { vaPercent, ownerPercent }, report } }. A closed month keeps
// the figures exactly as they were when it was closed, whatever eBay or the sync says later.
const closedKey = (userId, storeId) => `user:${userId}:finance:closed:${storeId}`;

export async function getClosedMonths(userId, storeId) {
  return (await kv.get(closedKey(userId, storeId))) || {};
}

export async function saveClosedMonths(userId, storeId, all) {
  await kv.set(closedKey(userId, storeId), all);
  return all;
}

// A name of the person's own for each store ("UK gadgets" instead of the eBay username), so a store is easy to
// recognise and search. Kept apart from the store record so reconnecting the store never loses it.
const nicknamesKey = (userId) => `user:${userId}:ebay:nicknames`;

export async function getNicknames(userId) {
  return (await kv.get(nicknamesKey(userId))) || {};
}

// An empty nickname removes it.
export async function setNickname(userId, storeId, nickname) {
  const all = await getNicknames(userId);
  if (nickname) all[storeId] = nickname;
  else delete all[storeId];
  await kv.set(nicknamesKey(userId), all);
  return all;
}

// Returns: what is known about each returned order. { [ebayOrderId]: { source: "manual"|"ebay", ali: { status, amount, note }, createdAt, updatedAt } }
// ali.status: "waiting" (return not settled with AliExpress yet) | "received" (AliExpress paid back `amount`) | "none" (AliExpress paid nothing).
const returnsKey = (userId, storeId) => `user:${userId}:ebay:returns:${storeId}`;
export const RETURN_ALI_STATUSES = ["waiting", "received", "none"];

export async function getReturns(userId, storeId) {
  return (await kv.get(returnsKey(userId, storeId))) || {};
}

// Adds a returned order or changes its AliExpress side. `ali` fields given replace the old ones.
export async function setReturnEntry(userId, storeId, orderId, { source, ali, via, extraRefund, note, date } = {}) {
  const all = await getReturns(userId, storeId);
  const old = all[orderId] || {};
  all[orderId] = {
    source: old.source || source || "manual",
    ali: { status: "waiting", amount: 0, note: "", ...(old.ali || {}), ...(ali || {}) },
    // How the buyer was settled: "ebay" (an eBay return), "chat" (agreed in eBay messages, no eBay return) or "other".
    via: via || old.via || "chat",
    // Money given back to the buyer outside eBay's own refund (so it is not in eBay's figures), and a free note.
    extraRefund: extraRefund ?? old.extraRefund ?? 0,
    note: note ?? old.note ?? "",
    // The day the return counts for (decides its month); empty = the day it was added.
    date: date ?? old.date ?? "",
    createdAt: old.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await kv.set(returnsKey(userId, storeId), all);
  return all[orderId];
}

export async function removeReturnEntry(userId, storeId, orderId) {
  const all = await getReturns(userId, storeId);
  delete all[orderId];
  await kv.set(returnsKey(userId, storeId), all);
}
