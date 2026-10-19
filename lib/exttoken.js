// lib/exttoken.js
// Personal access tokens for the browser extension. Only a SHA-256 hash of a
// token is stored, so a leaked database does not leak working tokens.
//
// A token has a scope: "all" (every store of the user) or a single store id. Each
// user can hold one token per scope; creating a new one for a scope revokes the
// old one for that scope. A store-scoped token lets the extension see and write
// to that store only, so each browser profile can be tied to one store.

import { createHash, randomBytes } from "node:crypto";
import { kv } from "@vercel/kv";

export const ALL_STORES = "all";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const byHash = (hash) => `ext-token:${hash}`;
// "all" keeps the key that was used before scopes existed, so existing tokens keep working.
const byScope = (userId, scope) =>
  scope === ALL_STORES ? `user:${userId}:ext-token` : `user:${userId}:ext-token:store:${scope}`;

// { hash, createdAt } or null. Never returns the token itself.
export async function getTokenInfo(userId, scope = ALL_STORES) {
  return (await kv.get(byScope(userId, scope))) || null;
}

// Returns the plain token once; it cannot be read back later.
export async function createToken(userId, scope = ALL_STORES) {
  const existing = await getTokenInfo(userId, scope);
  if (existing) await kv.del(byHash(existing.hash));

  const token = `oat_${randomBytes(32).toString("base64url")}`;
  const hash = hashToken(token);
  const createdAt = Date.now();
  await kv.set(byHash(hash), { userId, storeId: scope === ALL_STORES ? null : scope, createdAt });
  await kv.set(byScope(userId, scope), { hash, createdAt });
  return { token, createdAt };
}

export async function revokeToken(userId, scope = ALL_STORES) {
  const existing = await getTokenInfo(userId, scope);
  if (existing) await kv.del(byHash(existing.hash));
  await kv.del(byScope(userId, scope));
}

// Reads "Authorization: Bearer oat_..." and returns { userId, storeId } (storeId is
// null for an all-stores token), or null when the token is missing or unknown.
export async function authFromBearer(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(oat_[A-Za-z0-9_-]{20,80})$/);
  if (!match) return null;
  const record = await kv.get(byHash(hashToken(match[1])));
  return record?.userId ? { userId: record.userId, storeId: record.storeId || null } : null;
}

// True when the token may act on this store.
export function canUseStore(auth, storeId) {
  return !auth.storeId || auth.storeId === storeId;
}
