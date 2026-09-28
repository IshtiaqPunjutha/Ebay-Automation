// lib/store.js
// Multi-store token storage. Each connected eBay store gets its own record
// keyed by a storeId (derived from its eBay username), plus an index set so
// we can list every connected store for the dashboard.

import { kv } from "@vercel/kv";

const INDEX_KEY = "ebay:stores:index";
const storeKey = (storeId) => `ebay:store:${storeId}`;
const APP_TOKEN_KEY = "ebay:app-token";

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

export async function saveEbayStore(storeId, { tokens, label }) {
  const record = {
    storeId,
    label: label || storeId,
    tokens,
    connectedAt: Date.now(),
  };
  await kv.set(storeKey(storeId), record);
  await kv.sadd(INDEX_KEY, storeId);
  return record;
}

export async function getEbayStore(storeId) {
  return await kv.get(storeKey(storeId));
}

export async function listEbayStores() {
  const ids = (await kv.smembers(INDEX_KEY)) || [];
  const records = await Promise.all(ids.map((id) => getEbayStore(id)));
  return records.filter(Boolean).sort((a, b) => b.connectedAt - a.connectedAt);
}

export async function updateStoreAccessToken(storeId, newAccessToken, expiresIn) {
  const existing = await getEbayStore(storeId);
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
  await kv.set(storeKey(storeId), updated);
  return updated;
}

export async function removeEbayStore(storeId) {
  await kv.del(storeKey(storeId));
  await kv.srem(INDEX_KEY, storeId);
}
