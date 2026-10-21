import { NextResponse } from "next/server";
import { getEbayStore, getOrderRefs, getTrackEvents } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;

// GET /api/ebay/tracking/events?store=<storeId>&ali=<aliOrderId>
//   -> { events: [{ title, desc, note, time }] } every step AliExpress lists for that parcel, newest first.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store") || "";
  const ali = params.get("ali") || "";
  if (!STORE_ID_PATTERN.test(storeId) || !REF_PATTERN.test(ali)) {
    return NextResponse.json({ error: "Missing or invalid store or order number" }, { status: 400 });
  }
  if (!(await getEbayStore(userId, storeId))) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  // Only parcels that belong to this store's orders.
  const refs = await getOrderRefs(userId, storeId);
  const known = Object.values(refs).some((r) => (r.aliOrderIds || []).includes(ali));
  if (!known) return NextResponse.json({ events: [] });
  return NextResponse.json({ events: await getTrackEvents(userId, storeId, ali) });
}
