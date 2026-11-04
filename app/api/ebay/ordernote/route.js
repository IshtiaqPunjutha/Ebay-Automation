import { NextResponse } from "next/server";
import { getEbayStore, getOrderRefs } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { noteTextFor, writeOrderNote } from "@/lib/orderNote";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

// POST /api/ebay/ordernote?store=<storeId>   body: { orderId, action: "sync" | "clear" }
// sync  = write the order's saved AliExpress numbers into its private eBay note ("Add note" in Seller Hub)
// clear = remove that note from eBay (the numbers saved here stay)
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
  if (!ORDER_ID_PATTERN.test(orderId)) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  if (body?.action !== "sync" && body?.action !== "clear") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  let text = "";
  if (body.action === "sync") {
    const ids = (await getOrderRefs(userId, storeId))[orderId]?.aliOrderIds || [];
    if (ids.length === 0) return NextResponse.json({ error: "This order has no AliExpress number yet." }, { status: 400 });
    text = noteTextFor(ids);
  }
  const result = await writeOrderNote(userId, store, orderId, text);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, noteText: text || null });
}
