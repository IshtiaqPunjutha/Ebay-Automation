import { NextResponse } from "next/server";
import crypto from "crypto";
import { getEbayAuthUrl } from "@/lib/ebay";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

// Step 2 + 3 of the OAuth flow: send the seller to eBay's login/consent page.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  // "state" is a CSRF guard — we set it as a cookie and check it matches
  // when eBay redirects back to our callback.
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = getEbayAuthUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("ebay_oauth_state", `${userId}.${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes is plenty for the login round-trip
  });
  return res;
}
