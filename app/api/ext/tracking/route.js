import { NextResponse } from "next/server";
import { getOrderRefs, listEbayStores, setTracking } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";
import { cleanCarrierName } from "@/lib/shipping";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;
// Courier tracking numbers are letters and digits (eBay accepts no spaces or symbols either).
const TRACKING_PATTERN = /^[A-Za-z0-9]{6,40}$/;

const text = (value, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// POST /api/ext/tracking   (Authorization: Bearer <extension token>)
//   body: { aliOrderId, trackingNumber, carrierText?, statusText?, estimateText? }
// Saves the tracking the extension read from AliExpress for an order that is already synced to an
// eBay order. It finds that eBay order from the AliExpress number, so the extension never has to
// know which store or order it belongs to.
export async function POST(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const aliOrderId = text(body?.aliOrderId, 32);
  const trackingNumber = text(body?.trackingNumber, 40).replace(/\s+/g, "");
  if (!REF_PATTERN.test(aliOrderId)) return NextResponse.json({ error: "Invalid AliExpress order number" }, { status: 400 });
  if (!TRACKING_PATTERN.test(trackingNumber)) return NextResponse.json({ error: "Invalid tracking number" }, { status: 400 });

  try {
    const stores = (await listEbayStores(auth.userId)).filter((s) => canUseStore(auth, s.storeId));
    for (const store of stores) {
      const refs = await getOrderRefs(auth.userId, store.storeId);
      const orderId = Object.keys(refs).find((id) => (refs[id].aliOrderIds || []).includes(aliOrderId));
      if (!orderId) continue;
      const saved = await setTracking(auth.userId, store.storeId, aliOrderId, {
        trackingNumber,
        // The delivery carrier AliExpress shows on the tracking page (such as "InPost"); empty until it appears.
        carrierName: cleanCarrierName(body.carrierName),
        carrierText: text(body.carrierText),
        statusText: text(body.statusText),
        estimateText: text(body.estimateText),
      });
      return NextResponse.json({ ok: true, storeId: store.storeId, orderId, tracking: saved });
    }
    return NextResponse.json({ error: "That AliExpress order is not synced to an eBay order yet." }, { status: 404 });
  } catch (err) {
    console.error("Extension tracking save failed:", err);
    return NextResponse.json({ error: "Failed to save tracking" }, { status: 500 });
  }
}
