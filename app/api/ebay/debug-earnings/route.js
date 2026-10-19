import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  getEbayStore,
  updateStoreAccessToken,
} from "@/lib/store";
import {
  createEbaySignatureHeaders,
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/ebay";

// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");
  const orderId = searchParams.get("order");
  if (!storeId || !orderId || orderId.length > 128) {
    return NextResponse.json(
      { error: "Both store and order are required" },
      { status: 400 }
    );
  }

  let storeRecord = await getEbayStore(userId, storeId);
  if (!storeRecord) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    if (isTokenExpired(storeRecord.tokens)) {
      const refreshed = await refreshAccessToken(storeRecord.tokens.refreshToken);
      storeRecord = await updateStoreAccessToken(
        userId,
        storeId,
        refreshed.accessToken,
        refreshed.expiresIn
      );
    }

    const params = new URLSearchParams({ filter: `orderId:{${orderId}}` });
    const url = new URL(`https://apiz.ebay.com/sell/finances/v1/transaction?${params.toString()}`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${storeRecord.tokens.accessToken}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_GB",
        ...createEbaySignatureHeaders(url),
      },
    });
    const responseText = await response.text();
    let body = responseText;
    try {
      body = JSON.parse(responseText);
    } catch (err) {
      // Keep the raw body when eBay does not return JSON.
    }
    return NextResponse.json({ status: response.status, body });
  } catch (error) {
    if (error.code === "invalid_grant") {
      return NextResponse.json(
        { error: "This eBay connection needs to be authorized again.", reconnectRequired: true },
        { status: 409 }
      );
    }
    console.error(`Error debugging earnings for store ${storeId}:`, error);
    return NextResponse.json({ error: "Could not query eBay Finances API" }, { status: 502 });
  }
}