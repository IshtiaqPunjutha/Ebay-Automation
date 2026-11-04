import { NextResponse } from "next/server";
import { fetchOrderForShipping, isTokenExpired, refreshAccessToken, setOrderLineNote } from "@/lib/ebay";
import { getEbayStore, updateStoreAccessToken } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

// POST /api/ebay/ordernote?store=<storeId>   body: { orderId, text }
// Writes text as the private note ("Add note") of every item of the eBay order. Empty text removes the note.
export async function POST(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const storeId = new URL(request.url).searchParams.get("store") || "";
  if (!STORE_ID_PATTERN.test(storeId)) return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!ORDER_ID_PATTERN.test(orderId)) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  if (text.length > 255) return NextResponse.json({ error: "A note can be at most 255 characters." }, { status: 400 });

  let store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  try {
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }
    const token = store.tokens.accessToken;
    const order = await fetchOrderForShipping(token, orderId);
    const results = [];
    for (const li of order.lineItems) {
      results.push(await setOrderLineNote(token, { orderLineItemId: li.lineItemId, text, marketplaceId: store.marketplaceId }));
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error(`Order note failed for ${orderId}:`, failed[0].errors, failed[0].raw);
      const why = failed[0].errors.map((e) => `${e.code} ${e.message}`.trim()).join("; ") || failed[0].raw;
      return NextResponse.json({ error: `eBay did not accept the note: ${why}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, items: results.length });
  } catch (err) {
    console.error(`Order note errored for ${orderId}:`, err);
    return NextResponse.json({ error: String(err?.message || "Could not save the note").slice(0, 200) }, { status: 502 });
  }
}
