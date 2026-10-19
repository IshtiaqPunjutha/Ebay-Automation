// lib/exttoken.js
// Personal access tokens for the browser extension. Only a SHA-256 hash of a
// token is stored, so a leaked database does not leak working tokens. Each
// user has one token; creating a new one revokes the old.

import { createHash, randomBytes } from "node:crypto";
import { kv } from "@vercel/kv";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const byHash = (hash) => `ext-token:${hash}`;
const byUser = (userId) => `user:${userId}:ext-token`;

// { hash, createdAt } or null. Never returns the token itself.
export async function getTokenInfo(userId) {
  return (await kv.get(byUser(userId))) || null;
}

// Returns the plain token once; it cannot be read back later.
export async function createToken(userId) {
  const existing = await getTokenInfo(userId);
  if (existing) await kv.del(byHash(existing.hash));

  const token = `oat_${randomBytes(32).toString("base64url")}`;
  const hash = hashToken(token);
  const createdAt = Date.now();
  await kv.set(byHash(hash), { userId, createdAt });
  await kv.set(byUser(userId), { hash, createdAt });
  return { token, createdAt };
}

export async function revokeToken(userId) {
  const existing = await getTokenInfo(userId);
  if (existing) await kv.del(byHash(existing.hash));
  await kv.del(byUser(userId));
}

// Reads "Authorization: Bearer oat_..." and returns the owning user id, or null.
export async function userIdFromBearer(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(oat_[A-Za-z0-9_-]{20,80})$/);
  if (!match) return null;
  const record = await kv.get(byHash(hashToken(match[1])));
  return record?.userId || null;
}
