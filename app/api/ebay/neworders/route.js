import { NextResponse } from "next/server";
import { fetchNewOrdersLight, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { getNicknames, getOrderRefs, listEbayStores, updateStoreAccessToken } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 30;

// GET /api/ebay/neworders
// A small, fast look at every store's orders that still need shipping, for the dashboard's new-order alerts:
// { stores: [{ storeId, label, orders: [{ orderId, hasAli }] | error }] }. hasAli is true once the order has
// an AliExpress number.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const [stores, nicknames] = await Promise.all([listEbayStores(userId), getNicknames(userId)]);
  const out = await Promise.all(
    stores.map(async (s) => {
      const base = { storeId: s.storeId, label: nicknames[s.storeId] || s.label || s.storeId };
      try {
        let record = s;
        if (isTokenExpired(record.tokens)) {
          const refreshed = await refreshAccessToken(record.tokens.refreshToken);
          record = await updateStoreAccessToken(userId, s.storeId, refreshed.accessToken, refreshed.expiresIn);
        }
        const [orders, refs] = await Promise.all([
          fetchNewOrdersLight(record.tokens.accessToken, { max: 300 }),
          getOrderRefs(userId, s.storeId),
        ]);
        return { ...base, orders: orders.map((o) => ({ orderId: o.orderId, hasAli: (refs[o.orderId]?.aliOrderIds || []).length > 0 })) };
      } catch (err) {
        console.error(`New order check failed for store ${s.storeId}:`, err);
        return { ...base, error: err.code === "invalid_grant" ? "reconnect" : "failed" };
      }
    })
  );
  return NextResponse.json({ stores: out });
}
