// lib/store.js
// Thin wrapper around Vercel KV so token storage logic lives in one place.
// Using a fixed key for now since this is a single-store setup (Step 1).
// When we add multi-store support later, we'll key this by store/account id.

import { kv } from "@vercel/kv";

const TOKEN_KEY = "ebay:tokens:primary";
const hasKvConfig = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);

export async function saveEbayTokens(tokens) {
  if (!hasKvConfig) {
    throw new Error("Vercel KV is not configured");
  }
  await kv.set(TOKEN_KEY, tokens);
}

export async function getEbayTokens() {
  if (!hasKvConfig) return null;
  return await kv.get(TOKEN_KEY);
}

export async function updateAccessToken(newAccessToken, expiresIn) {
  if (!hasKvConfig) {
    throw new Error("Vercel KV is not configured");
  }
  const existing = await getEbayTokens();
  const updated = {
    ...existing,
    accessToken: newAccessToken,
    expiresIn,
    obtainedAt: Date.now(),
  };
  await kv.set(TOKEN_KEY, updated);
  return updated;
}

export async function clearEbayTokens() {
  if (!hasKvConfig) return;
  await kv.del(TOKEN_KEY);
}
