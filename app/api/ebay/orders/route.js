import { NextResponse } from "next/server";
import {
  fetchUnshippedOrders,
  refreshAccessToken,
  isTokenExpired,
} from "@/lib/ebay";
import { getEbayStore, updateStoreAccessToken } from "@/lib/store";

// GET /api/ebay/orders?store=<storeId>
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");

  if (!storeId) {
    return NextResponse.json(
      { orders: [], error: "Missing store id" },
      { status: 400 }
    );
  }

  let storeRecord = await getEbayStore(storeId);

  if (!storeRecord) {
    return NextResponse.json(
      { orders: [], error: "Store not found" },
      { status: 404 }
    );
  }

  try {
    if (isTokenExpired(storeRecord.tokens)) {
      const refreshed = await refreshAccessToken(storeRecord.tokens.refreshToken);
      storeRecord = await updateStoreAccessToken(
        storeId,
        refreshed.accessToken,
        refreshed.expiresIn
      );
    }

    const orders = await fetchUnshippedOrders(storeRecord.tokens.accessToken);
    return NextResponse.json({ orders });
  } catch (err) {
    console.error(`Error fetching orders for store ${storeId}:`, err);
    return NextResponse.json(
      { orders: [], error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
