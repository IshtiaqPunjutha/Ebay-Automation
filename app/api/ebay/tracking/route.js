import { NextResponse } from "next/server";
import { getEbayStore, getTracking } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// GET /api/ebay/tracking?store=<storeId>
//   -> { tracking: { [aliOrderId]: { trackingNumber, carrierText, statusText, estimateText, updatedAt } } }
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const storeId = new URL(request.url).searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });
  }
  if (!(await getEbayStore(userId, storeId))) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  try {
    return NextResponse.json({ tracking: await getTracking(userId, storeId) });
  } catch (err) {
    console.error(`Error reading tracking for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to load tracking" }, { status: 500 });
  }
}
