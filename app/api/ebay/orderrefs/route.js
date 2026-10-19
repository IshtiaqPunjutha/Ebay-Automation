import { NextResponse } from "next/server";
import { MAX_REFS_PER_ORDER, getEbayStore, getOrderRefs, setOrderRefs } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;

async function authorize(request, storeId) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  }
  const store = await getEbayStore(userId, storeId);
  if (!store) return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  return { userId };
}

// GET /api/ebay/orderrefs?store=<storeId>  ->  { refs: { [ebayOrderId]: { aliOrderIds, updatedAt } } }
export async function GET(request) {
  const storeId = new URL(request.url).searchParams.get("store");
  const auth = await authorize(request, storeId);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ refs: await getOrderRefs(auth.userId, storeId) });
  } catch (err) {
    console.error(`Error reading order refs for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to load order numbers" }, { status: 500 });
  }
}

// PUT /api/ebay/orderrefs?store=<storeId>   body: { orderId, aliOrderIds: ["..."] }
// Replaces the AliExpress order numbers of one eBay order. An empty list clears them.
export async function PUT(request) {
  const storeId = new URL(request.url).searchParams.get("store");
  const auth = await authorize(request, storeId);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!ORDER_ID_PATTERN.test(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  if (!Array.isArray(body?.aliOrderIds) || body.aliOrderIds.length > MAX_REFS_PER_ORDER) {
    return NextResponse.json({ error: `aliOrderIds must be a list of at most ${MAX_REFS_PER_ORDER}` }, { status: 400 });
  }
  const ids = [...new Set(body.aliOrderIds.map((v) => (typeof v === "string" ? v.trim() : "")))];
  if (ids.some((id) => !REF_PATTERN.test(id))) {
    return NextResponse.json(
      { error: "An AliExpress order number can only contain letters, digits and dashes (6 to 32 characters)." },
      { status: 400 }
    );
  }

  try {
    const entry = await setOrderRefs(auth.userId, storeId, orderId, ids);
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error(`Error saving order refs for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to save order number" }, { status: 500 });
  }
}
