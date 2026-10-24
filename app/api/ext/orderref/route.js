import { NextResponse } from "next/server";
import { MAX_REFS_PER_ORDER, getEbayStore, getOrderRefs, setOrderRefs } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;

// POST /api/ext/orderref   (Authorization: Bearer <extension token>)
//   body: { storeId, orderId, aliOrderId, lineItemId? }
// Adds one AliExpress order number to an eBay order (or to one item of it). Safe to repeat: a number
// already on the order is not added twice.
export async function POST(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  const userId = auth.userId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const aliOrderId = typeof body?.aliOrderId === "string" ? body.aliOrderId.trim() : "";
  // Set when the order has several items and this AliExpress order was bought for one of them.
  const lineItemId = typeof body?.lineItemId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.lineItemId) ? body.lineItemId : "";
  if (!STORE_ID_PATTERN.test(storeId)) return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  if (!ORDER_ID_PATTERN.test(orderId)) return NextResponse.json({ error: "Invalid eBay order id" }, { status: 400 });
  if (!REF_PATTERN.test(aliOrderId)) return NextResponse.json({ error: "Invalid AliExpress order number" }, { status: 400 });

  if (!canUseStore(auth, storeId)) {
    return NextResponse.json({ error: "This token is for a different store." }, { status: 403 });
  }

  try {
    // The store must belong to the token's owner.
    const store = await getEbayStore(userId, storeId);
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const refs = await getOrderRefs(userId, storeId);
    const existing = refs[orderId]?.aliOrderIds || [];
    if (existing.includes(aliOrderId)) {
      return NextResponse.json({ ok: true, alreadySaved: true, aliOrderIds: existing });
    }
    if (existing.length >= MAX_REFS_PER_ORDER) {
      return NextResponse.json({ error: "This order already has the maximum number of AliExpress orders" }, { status: 400 });
    }
    const lines = { ...(refs[orderId]?.lines || {}), ...(lineItemId ? { [aliOrderId]: lineItemId } : {}) };
    const entry = await setOrderRefs(userId, storeId, orderId, [...existing, aliOrderId], lines);
    return NextResponse.json({ ok: true, alreadySaved: false, aliOrderIds: entry.aliOrderIds });
  } catch (err) {
    console.error("Extension order ref save failed:", err);
    return NextResponse.json({ error: "Failed to save order number" }, { status: 500 });
  }
}

// DELETE /api/ext/orderref   (Authorization: Bearer <extension token>)
//   body: { storeId, orderId, aliOrderId }
// Takes one AliExpress number back off an eBay order (the extension's "Undo").
export async function DELETE(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const storeId = typeof body?.storeId === "string" ? body.storeId.trim() : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const aliOrderId = typeof body?.aliOrderId === "string" ? body.aliOrderId.trim() : "";
  if (!STORE_ID_PATTERN.test(storeId) || !ORDER_ID_PATTERN.test(orderId) || !REF_PATTERN.test(aliOrderId)) {
    return NextResponse.json({ error: "Invalid store, order or number" }, { status: 400 });
  }
  if (!canUseStore(auth, storeId)) {
    return NextResponse.json({ error: "This token is for a different store." }, { status: 403 });
  }

  try {
    if (!(await getEbayStore(auth.userId, storeId))) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const refs = await getOrderRefs(auth.userId, storeId);
    const existing = refs[orderId]?.aliOrderIds || [];
    const remaining = existing.filter((id) => id !== aliOrderId);
    if (remaining.length !== existing.length) await setOrderRefs(auth.userId, storeId, orderId, remaining);
    return NextResponse.json({ ok: true, removed: remaining.length !== existing.length, aliOrderIds: remaining });
  } catch (err) {
    console.error("Extension order ref removal failed:", err);
    return NextResponse.json({ error: "Failed to remove order number" }, { status: 500 });
  }
}
