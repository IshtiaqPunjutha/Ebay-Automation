import { NextResponse } from "next/server";
import {
  fetchUnshippedOrders,
  refreshAccessToken,
  isTokenExpired,
  getApplicationAccessToken,
} from "@/lib/ebay";
import {
  getEbayStore,
  updateStoreAccessToken,
  getCachedAppToken,
  saveAppToken,
} from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

// GET /api/ebay/orders?store=<storeId>
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ orders: [], error: "Authentication required" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");

  if (!storeId) {
    return NextResponse.json({ orders: [], error: "Missing store id" }, { status: 400 });
  }

  let storeRecord = await getEbayStore(userId, storeId);
  if (!storeRecord) {
    return NextResponse.json({ orders: [], error: "Store not found" }, { status: 404 });
  }

  try {
    // Refresh the seller's token if needed.
    if (isTokenExpired(storeRecord.tokens)) {
      const refreshed = await refreshAccessToken(storeRecord.tokens.refreshToken);
      storeRecord = await updateStoreAccessToken(
        userId,
        storeId,
        refreshed.accessToken,
        refreshed.expiresIn
      );
    }

    // Get (or refresh) the shared application token used for product images.
    let appToken = await getCachedAppToken();
    if (isTokenExpired(appToken)) {
      appToken = await getApplicationAccessToken();
      await saveAppToken(appToken);
    }

    const orders = await fetchUnshippedOrders(storeRecord.tokens.accessToken, appToken.accessToken);
    return NextResponse.json({ orders });
  } catch (err) {
    console.error(`Error fetching orders for store ${storeId}:`, err);
    return NextResponse.json({ orders: [], error: "Failed to fetch orders" }, { status: 500 });
  }
}
