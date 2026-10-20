import { NextResponse } from "next/server";
import {
  fetchOrders,
  isOrderStatus,
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

// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const PAGE_SIZES = [10, 25, 50, 100];

// GET /api/ebay/orders?store=<storeId>&status=new|dispatched&page=1&pageSize=25[&order=<orderId>]
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ orders: [], error: "Authentication required" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");

  if (!storeId) {
    return NextResponse.json({ orders: [], error: "Missing store id" }, { status: 400 });
  }

  const status = searchParams.get("status") || "new";
  if (!isOrderStatus(status)) {
    return NextResponse.json({ orders: [], error: "Invalid status" }, { status: 400 });
  }
  const orderId = searchParams.get("order") || "";
  if (orderId && !/^[A-Za-z0-9-]{4,64}$/.test(orderId)) {
    return NextResponse.json({ orders: [], error: "Invalid order id" }, { status: 400 });
  }
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const requestedSize = parseInt(searchParams.get("pageSize") || "25", 10);
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;

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

    const { orders, total } = await fetchOrders(storeRecord.tokens.accessToken, appToken.accessToken, {
      status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderId,
    });
    return NextResponse.json({ orders, total, page, pageSize });
  } catch (err) {
    if (err.code === "invalid_grant") {
      return NextResponse.json(
        {
          orders: [],
          error: "This eBay connection needs to be authorized again.",
          reconnectRequired: true,
        },
        { status: 409 }
      );
    }
    console.error(`Error fetching orders for store ${storeId}:`, err);
    // Include eBay's own reason (first part only) so a failure can be diagnosed from the screen.
    const detail = String(err?.message || "").slice(0, 200);
    return NextResponse.json(
      { orders: [], error: detail ? `Failed to fetch orders. ${detail}` : "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
