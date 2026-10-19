import { NextResponse } from "next/server";
import { getDeliveries, getEbayStore, setDeliveries } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const MAX_ORDERS_PER_CALL = 200;

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

// GET /api/ebay/delivery?store=<storeId>  ->  { marks: { [ebayOrderId]: { at } } }
export async function GET(request) {
  const storeId = new URL(request.url).searchParams.get("store");
  const auth = await authorize(request, storeId);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ marks: await getDeliveries(auth.userId, storeId) });
  } catch (err) {
    console.error(`Error reading deliveries for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to load delivery marks" }, { status: 500 });
  }
}

// PUT /api/ebay/delivery?store=<storeId>   body: { orderIds: ["..."], delivered: true|false }
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
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds : [];
  if (
    orderIds.length === 0 ||
    orderIds.length > MAX_ORDERS_PER_CALL ||
    orderIds.some((id) => typeof id !== "string" || !ORDER_ID_PATTERN.test(id)) ||
    typeof body?.delivered !== "boolean"
  ) {
    return NextResponse.json({ error: "Send orderIds (1 to 200) and delivered (true or false)" }, { status: 400 });
  }

  try {
    const marks = await setDeliveries(auth.userId, storeId, orderIds, body.delivered);
    return NextResponse.json({ ok: true, marks });
  } catch (err) {
    console.error(`Error saving deliveries for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
