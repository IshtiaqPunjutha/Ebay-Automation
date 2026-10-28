import { NextResponse } from "next/server";
import { getDeliveries, getOrderRefs, getTracking, listEbayStores, setDeliveries, setTrackEvents, setTracking } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";
import { cleanCarrierName } from "@/lib/shipping";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const REF_PATTERN = /^[A-Za-z0-9-]{6,32}$/;
// Courier tracking numbers are letters and digits (eBay accepts no spaces or symbols either).
const TRACKING_PATTERN = /^[A-Za-z0-9]{6,40}$/;

const text = (value, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// The steps of the parcel, cleaned: at most 25, each field short.
function cleanEvents(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 25)
    .map((e) => ({ title: text(e?.title, 60), desc: text(e?.desc, 140), note: text(e?.note, 100), time: text(e?.time, 40) }))
    .filter((e) => e.title || e.desc);
}

// POST /api/ext/tracking   (Authorization: Bearer <extension token>)
//   body: { aliOrderId, trackingNumber, carrierName?, carrierText?, statusText?, estimateText?, delivered?: true }
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
    // One AliExpress order can belong to several eBay orders (one buyer, one parcel), in this store or in another
    // of the person's stores: the tracking is saved for every store that uses the number, and every eBay order that
    // has all of its parcels delivered is marked delivered.
    const events = cleanEvents(body.events);
    const results = [];
    for (const store of stores) {
      const refs = await getOrderRefs(auth.userId, store.storeId);
      const orderIds = Object.keys(refs).filter((id) => (refs[id].aliOrderIds || []).includes(aliOrderId));
      if (orderIds.length === 0) continue;
      if (events.length) await setTrackEvents(auth.userId, store.storeId, aliOrderId, events);
      const saved = await setTracking(auth.userId, store.storeId, aliOrderId, {
        // The newest step, for the Status column.
        statusDesc: text(events[0]?.desc, 140),
        statusTime: text(events[0]?.time, 40),
        trackingNumber,
        // The delivery carrier AliExpress shows on the tracking page (such as "InPost"); empty until it appears.
        carrierName: cleanCarrierName(body.carrierName),
        carrierText: text(body.carrierText),
        statusText: text(body.statusText),
        estimateText: text(body.estimateText),
        // Sent only when AliExpress's tracking page says Delivered.
        ...(body.delivered === true ? { delivered: true, deliveredText: text(body.deliveredTime, 60) } : {}),
      });

      // An eBay order counts as delivered once EVERY AliExpress parcel of it is delivered.
      const markedDelivered = [];
      if (saved.delivered) {
        const all = await getTracking(auth.userId, store.storeId);
        const already = await getDeliveries(auth.userId, store.storeId);
        for (const orderId of orderIds) {
          const parcels = refs[orderId].aliOrderIds || [];
          if (parcels.length > 0 && parcels.every((id) => all[id]?.delivered) && !already[orderId]) {
            await setDeliveries(auth.userId, store.storeId, [orderId], true, { source: "aliexpress" });
            markedDelivered.push(orderId);
          }
        }
      }
      results.push({ storeId: store.storeId, orderIds, tracking: saved, markedDelivered });
    }
    if (results.length > 0) {
      const first = results[0];
      return NextResponse.json({ ok: true, storeId: first.storeId, orderId: first.orderIds[0], tracking: first.tracking, markedDelivered: first.markedDelivered.length > 0, linked: results });
    }
    return NextResponse.json({ error: "That AliExpress order is not synced to an eBay order yet." }, { status: 404 });
  } catch (err) {
    console.error("Extension tracking save failed:", err);
    return NextResponse.json({ error: "Failed to save tracking" }, { status: 500 });
  }
}
