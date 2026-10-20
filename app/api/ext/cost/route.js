import { NextResponse } from "next/server";
import { getOrderRefs, listEbayStores, setAliCost } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;

// POST /api/ext/cost   (Authorization: Bearer <extension token>)
//   body: { aliOrderId, amount, currency }
// The total paid for an AliExpress order, as shown on its card. Only kept for orders already synced.
export async function POST(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const aliOrderId = typeof body?.aliOrderId === "string" ? body.aliOrderId.trim() : "";
  const amount = Number(body?.amount);
  const currency = typeof body?.currency === "string" ? body.currency : "";
  if (!REF_PATTERN.test(aliOrderId)) return NextResponse.json({ error: "Invalid AliExpress order number" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e6) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 });

  try {
    const stores = (await listEbayStores(auth.userId)).filter((s) => canUseStore(auth, s.storeId));
    for (const store of stores) {
      const refs = await getOrderRefs(auth.userId, store.storeId);
      const synced = Object.values(refs).some((r) => (r.aliOrderIds || []).includes(aliOrderId));
      if (!synced) continue;
      const saved = await setAliCost(auth.userId, store.storeId, aliOrderId, { amount: +amount.toFixed(2), currency });
      return NextResponse.json({ ok: true, storeId: store.storeId, cost: saved });
    }
    return NextResponse.json({ error: "That AliExpress order is not synced to an eBay order yet." }, { status: 404 });
  } catch (err) {
    console.error("Extension cost save failed:", err);
    return NextResponse.json({ error: "Failed to save cost" }, { status: 500 });
  }
}
