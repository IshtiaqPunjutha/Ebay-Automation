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

export async function saveEbayStore(userId, storeId, { tokens, label }) {
  const record = {
    userId,
    storeId,
    label: label || storeId,
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

export async function removeEbayStore(userId, storeId) {
  await kv.del(storeKey(userId, storeId));
  await kv.srem(indexKey(userId), storeId);
}

// Top-level eBay category ids rarely change; cache them for a week.
const ROOT_CATEGORIES_KEY = "ebay:root-categories";

export async function getCachedRootCategories() {
  return await kv.get(ROOT_CATEGORIES_KEY);
}

export async function saveRootCategories(ids) {
  await kv.set(ROOT_CATEGORIES_KEY, ids, { ex: 7 * 24 * 60 * 60 });
  return ids;
}

// Per-store "sheet mapping": rows linking an eBay listing to its AliExpress
// source. Kept when a store is disconnected, so reconnecting the same
// seller account brings the sheet back.
const sheetKey = (userId, storeId) => `user:${userId}:ebay:sheet:${storeId}`;

export async function getStoreSheet(userId, storeId) {
  return (await kv.get(sheetKey(userId, storeId))) || { rows: [], updatedAt: null };
}

export async function saveStoreSheet(userId, storeId, rows) {
  const record = { rows, updatedAt: Date.now() };
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
