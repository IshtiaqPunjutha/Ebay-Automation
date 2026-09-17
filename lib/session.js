// lib/session.js
// Very simple session handling for the Step 1 password gate.
// This is intentionally minimal — good enough for "just me" or a small
// trusted group. If we later need per-client accounts with separate data,
// we'll replace this with a real user table + per-user sessions.

const COOKIE_NAME = "app_session";

async function sign(value) {
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

export async function createSessionCookieValue() {
  const payload = `authenticated.${Date.now()}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function isValidSessionCookie(cookieValue) {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [label, ts, signature] = parts;
  const payload = `${label}.${ts}`;
  const expected = await sign(payload);
  if (signature.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
