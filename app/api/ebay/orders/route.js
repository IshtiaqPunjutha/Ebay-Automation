import { NextResponse } from "next/server";
import {
  fetchUnshippedOrders,
  refreshAccessToken,
  isTokenExpired,
} from "@/lib/ebay";
import { getEbayTokens, updateAccessToken } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  let tokens = await getEbayTokens();

  if (!tokens) {
    return NextResponse.json(
      { connected: false, orders: [] },
      { status: 200 }
    );
  }

  try {
    if (isTokenExpired(tokens)) {
      const refreshed = await refreshAccessToken(tokens.refreshToken);
      tokens = await updateAccessToken(
        refreshed.accessToken,
        refreshed.expiresIn
      );
    }

    const orders = await fetchUnshippedOrders(tokens.accessToken);
    return NextResponse.json({ connected: true, orders });
  } catch (err) {
    console.error("Error fetching eBay orders:", err);
    return NextResponse.json(
      { connected: true, orders: [], error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
