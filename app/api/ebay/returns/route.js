import { NextResponse } from "next/server";
import { RETURN_ALI_STATUSES, getAliCosts, getEbayStore, getOrderRefs, getReturns, removeReturnEntry, setReturnEntry, updateStoreAccessToken } from "@/lib/store";
import { fetchOrderEarnings, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { fetchEbayReturns, fetchOrderBrief, fetchOrderIdMap } from "@/lib/returns";
import { marketplaceOf } from "@/lib/marketplaces";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const MAX_ROWS = 80;

async function authorize(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const storeId = new URL(request.url).searchParams.get("store") || "";
  if (!STORE_ID_PATTERN.test(storeId)) return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  const store = await getEbayStore(userId, storeId);
  if (!store) return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  return { userId, storeId, store };
}

// GET /api/ebay/returns?store=<id>
// -> { rows: [...], ebayError }  one row per returned order: those eBay lists as returns plus those marked by hand.
export async function GET(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const { userId, storeId } = auth;
  let store = auth.store;
  try {
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }
    const token = store.tokens.accessToken;
    const [saved, refs, costs] = await Promise.all([getReturns(userId, storeId), getOrderRefs(userId, storeId), getAliCosts(userId, storeId)]);

    // eBay's own returns (best effort: the older API may refuse this token).
    let ebayError = null;
    const byOrder = {};
    try {
      const list = await fetchEbayReturns(token, marketplaceOf(store));
      const map = list.length ? await fetchOrderIdMap(token) : {};
      for (const r of list) {
        const orderId = map[`${r.itemId}|${r.transactionId}`];
        if (!orderId) continue;
        byOrder[orderId] = r;
      }
    } catch (err) {
      ebayError = String(err?.message || "eBay returns could not be read").slice(0, 240);
    }

    const ids = [...new Set([...Object.keys(saved), ...Object.keys(byOrder)])].slice(0, MAX_ROWS);
    const rows = await Promise.all(
      ids.map(async (orderId) => {
        const entry = saved[orderId] || null;
        const aliOrderIds = refs[orderId]?.aliOrderIds || [];
        const knownCosts = aliOrderIds.map((id) => costs[id]).filter(Boolean);
        // What eBay left for this order after the sale, its fees and the refund (usually a little below zero for a fully refunded order).
        const [order, earned] = await Promise.all([fetchOrderBrief(token, orderId), fetchOrderEarnings(token, orderId)]);
        return {
          orderId,
          ebay: byOrder[orderId] || null,
          manual: entry ? entry.source === "manual" : false,
          ali: entry?.ali || { status: "waiting", amount: 0, note: "" },
          createdAt: entry?.createdAt || null,
          aliOrderIds,
          aliCost: knownCosts.length ? Math.round(knownCosts.reduce((sum, c) => sum + Number(c.amount || 0), 0) * 100) / 100 : null,
          order,
          ebayNet: earned ? earned.earnings : null,
        };
      })
    );
    rows.sort((a, b) => String(b.ebay?.created || b.order?.date || "").localeCompare(String(a.ebay?.created || a.order?.date || "")));
    return NextResponse.json({ rows, ebayError });
  } catch (err) {
    console.error(`Returns failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not load the returns." }, { status: 500 });
  }
}

// PUT /api/ebay/returns?store=<id>
//   body: { orderId, ali?: { status, amount, note } }  add the order as a returned one / change its AliExpress side
//   body: { orderId, remove: true }                    forget the AliExpress side / the manual mark
export async function PUT(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!ORDER_ID_PATTERN.test(orderId)) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

  try {
    if (body.remove) {
      await removeReturnEntry(auth.userId, auth.storeId, orderId);
      return NextResponse.json({ ok: true });
    }
    let ali;
    if (body.ali !== undefined) {
      const status = body.ali?.status;
      const amount = Number(body.ali?.amount ?? 0);
      const note = typeof body.ali?.note === "string" ? body.ali.note.slice(0, 200) : "";
      if (!RETURN_ALI_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid AliExpress status" }, { status: 400 });
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      ali = { status, amount: status === "received" ? Math.round(amount * 100) / 100 : 0, note };
    }
    const entry = await setReturnEntry(auth.userId, auth.storeId, orderId, { source: body.source === "ebay" ? "ebay" : "manual", ali });
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error(`Saving a return failed for ${orderId}:`, err);
    return NextResponse.json({ error: "Could not save the return." }, { status: 500 });
  }
}
