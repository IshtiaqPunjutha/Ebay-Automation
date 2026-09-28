import { NextResponse } from "next/server";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { createUser } from "@/lib/users";
import { getLegacyEbayStoreCount, migrateLegacyEbayStores } from "@/lib/store";
import { timingSafeEqual } from "node:crypto";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const legacyPassword = typeof body.legacyPassword === "string" ? body.legacyPassword : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: "Use a password between 12 and 128 characters" }, { status: 400 });
  }

  const legacyStoreCount = await getLegacyEbayStoreCount();
  if (legacyStoreCount > 0) {
    const previousPassword = process.env.APP_PASSWORD || "";
    const providedBuffer = Buffer.from(legacyPassword);
    const expectedBuffer = Buffer.from(previousPassword);
    const passwordMatches =
      providedBuffer.length > 0 &&
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Enter the previous dashboard password to move the existing stores into this account" },
        { status: 401 }
      );
    }
  }

  const user = await createUser(email, await hashPassword(password));
  if (!user) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  let migratedStores = 0;
  try {
    if (legacyStoreCount > 0) migratedStores = await migrateLegacyEbayStores(user.id);
  } catch (error) {
    console.error("Legacy eBay store migration failed:", error);
    return NextResponse.json(
      { error: "Account created, but store migration failed. Log in again to resume migration." },
      { status: 503 }
    );
  }

  const sessionValue = await createSessionCookieValue(user.id);
  const response = NextResponse.json({ ok: true, migratedStores });
  response.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}