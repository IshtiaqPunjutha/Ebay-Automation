// lib/session.js
const COOKIE_NAME = "app_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function signValue(value) {
  return sign(value);
}

async function sign(value) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookieValue(userId) {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}.${issuedAt + SESSION_TTL_MS}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function getSessionUserId(cookieValue) {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return null;
  const [userId, issuedAtValue, expiresAtValue, signature] = parts;
  if (!/^[a-f0-9-]{36}$/i.test(userId)) return null;
  const issuedAt = Number(issuedAtValue);
  const expiresAt = Number(expiresAtValue);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (issuedAt > now + 60_000 || expiresAt <= now || expiresAt - issuedAt !== SESSION_TTL_MS) return null;
  const payload = `${userId}.${issuedAtValue}.${expiresAtValue}`;
  const expected = await sign(payload);
  if (!/^[a-f0-9]+$/i.test(signature) || signature.length !== expected.length) return null;

  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0 ? userId : null;
}

export async function isValidSessionCookie(cookieValue) {
  return Boolean(await getSessionUserId(cookieValue));
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
