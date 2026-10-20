// lib/financeAuth.js
// The checks every finance route starts with: signed in, PIN entered, and a store of this account.
import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "./session";
import { isUnlocked } from "./pin";
import { getEbayStore } from "./store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// -> { userId, storeId } or { error: NextResponse }
export async function guardFinance(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!(await isUnlocked(request, userId))) {
    return { error: NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 }) };
  }
  const storeId = new URL(request.url).searchParams.get("store") || "";
  if (!STORE_ID_PATTERN.test(storeId)) return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  if (!(await getEbayStore(userId, storeId))) return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  return { userId, storeId };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// A money amount typed by a person: a number with at most 2 decimals, 0 up to 1,000,000.
export function validAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e6 && Math.round(value * 100) / 100 === value;
}

export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const cleanText = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
