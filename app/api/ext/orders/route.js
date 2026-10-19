import { NextResponse } from "next/server";
import { fetchNewOrdersLight, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { buildCandidates } from "@/lib/candidates";
import { getEbayStore, getOrderRefs, getStoreSheet, updateStoreAccessToken } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 30;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// GET /api/ext/orders?store=<storeId>   (Authorization: Bearer <extension token>)
// The store's orders that still need shipping and have no AliExpress number yet, newest first.
// Add &all=1 to include orders that already have one.
export async function GET(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  const userId = auth.userId;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });
  }
  if (!canUseStore(auth, storeId)) {
    return NextResponse.json({ error: "This token is for a different store." }, { status: 403 });
  }

  let store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  try {
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }

    const [orders, refs, sheet] = await Promise.all([
      fetchNewOrdersLight(store.tokens.accessToken),
      getOrderRefs(userId, storeId),
      getStoreSheet(userId, storeId),
    ]);
    const candidates = buildCandidates(orders, refs, sheet.rows, { includeDone: searchParams.get("all") === "1" });
    return NextResponse.json({ storeId, storeLabel: store.label, orders: candidates });
  } catch (err) {
    if (err.code === "invalid_grant") {
      return NextResponse.json(
        { error: "This eBay store needs to be connected again in the dashboard.", reconnectRequired: true },
        { status: 409 }
      );
    }
    console.error(`Extension order list failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not load orders from eBay." }, { status: 502 });
  }
}
