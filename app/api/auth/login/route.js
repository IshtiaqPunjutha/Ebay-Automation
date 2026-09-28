import { NextResponse } from "next/server";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { getUserByEmail } from "@/lib/users";
import { resumeLegacyEbayStoreMigration } from "@/lib/store";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 128) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  try {
    await resumeLegacyEbayStoreMigration(user.id);
  } catch (error) {
    console.error("Legacy eBay store migration retry failed:", error);
    return NextResponse.json({ error: "Store migration is temporarily unavailable. Please try again." }, { status: 503 });
  }

  const sessionValue = await createSessionCookieValue(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
