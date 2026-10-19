import { NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchEbayIdentity } from "@/lib/ebay";
import { saveEbayStore, slugifyStoreId } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import crypto from "crypto";

// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

// Step 4 of the OAuth flow: eBay redirects here with ?code=... after the
// seller approves access. We exchange that code for real tokens, figure out
// which eBay account we just connected (so we can label it), save it as its
// own store record, then send the seller back to the dashboard.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const oauthStateCookie = request.cookies.get("ebay_oauth_state")?.value || "";
  const [oauthUserId, expectedState] = oauthStateCookie.split(".");

  const baseUrl = process.env.APP_BASE_URL;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?ebay_error=missing_code`);
  }

  if (!userId || oauthUserId !== userId || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(`${baseUrl}/?ebay_error=state_mismatch`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Try to find out whose account this is, so we can label it nicely.
    // If the identity scope wasn't granted for some reason, fall back to a
    // random id rather than failing the whole connection.
    const identity = await fetchEbayIdentity(tokens.accessToken);
    const label = identity?.username || `store-${crypto.randomBytes(3).toString("hex")}`;
    const storeId = slugifyStoreId(`production-${label}`);

    await saveEbayStore(userId, storeId, { tokens, label });
  } catch (err) {
    console.error("eBay OAuth callback error:", err);
    return NextResponse.redirect(`${baseUrl}/?ebay_error=token_exchange_failed`);
  }

  const res = NextResponse.redirect(`${baseUrl}/?ebay_connected=1`);
  res.cookies.set("ebay_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}
