// lib/pin.js
// The finance PIN: one per account, asked for every time the finance page is opened.
// A correct PIN gives a short-lived signed cookie; the finance API refuses requests without it.
import { signValue } from "./session";
import { hashPassword, verifyPassword } from "./password";
import { getPinHash, getPinTries, setPinHash, setPinTries } from "./store";

export const PIN_COOKIE = "fin_unlock";
export const UNLOCK_TTL_MS = 15 * 60 * 1000;
const MAX_TRIES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export const PIN_PATTERN = /^\d{4,8}$/;

export async function createUnlockCookieValue(userId) {
  const expires = Date.now() + UNLOCK_TTL_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${await signValue(`fin:${payload}`)}`;
}

export async function isUnlocked(request, userId) {
  const value = request.cookies.get(PIN_COOKIE)?.value || "";
  const [id, expires, signature] = value.split(".");
  if (!id || id !== userId || !/^\d+$/.test(expires || "") || Number(expires) <= Date.now() || !signature) return false;
  const expected = await signValue(`fin:${id}.${expires}`);
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i += 1) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function hasPin(userId) {
  return Boolean(await getPinHash(userId));
}

// False when a PIN already exists (it can only be created once).
export async function createPin(userId, pin) {
  if (await hasPin(userId)) return false;
  await setPinHash(userId, await hashPassword(pin));
  return true;
}

// -> { ok } or { ok:false, locked, waitSeconds }
export async function checkPin(userId, pin) {
  const tries = await getPinTries(userId);
  if (tries.until > Date.now()) return { ok: false, locked: true, waitSeconds: Math.ceil((tries.until - Date.now()) / 1000) };
  const hash = await getPinHash(userId);
  if (hash && (await verifyPassword(pin, hash))) {
    if (tries.count) await setPinTries(userId, { count: 0, until: 0 });
    return { ok: true };
  }
  const count = tries.count + 1;
  const locked = count >= MAX_TRIES;
  await setPinTries(userId, { count: locked ? 0 : count, until: locked ? Date.now() + LOCKOUT_MS : 0 });
  return { ok: false, locked, waitSeconds: locked ? LOCKOUT_MS / 1000 : 0 };
}
