import { NextResponse } from "next/server";
import { createShippingFulfillment, fetchOrderForShipping, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import {
  getEbayStore,
  getOrderRefs,
  getShipSent,
  getTracking,
  markShipSent,
  updateStoreAccessToken,
} from "@/lib/store";
import { CARRIER_PATTERN, checkReadyToShip } from "@/lib/shipping";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const TRACKING_PATTERN = /^[A-Za-z0-9]{6,40}$/;
const MAX_PER_CALL = 20;

async function resolve(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const storeId = new URL(request.url).searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  }
  const store = await getEbayStore(userId, storeId);
  if (!store) return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  return { userId, storeId, store };
}

// GET /api/ebay/ship?store=<storeId>  ->  { sent: { [ebayOrderId]: { trackingNumber, carrier, at } } }
export async function GET(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  try {
    return NextResponse.json({ sent: await getShipSent(r.userId, r.storeId) });
  } catch (err) {
    console.error(`Error reading sent tracking for store ${r.storeId}:`, err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// POST /api/ebay/ship?store=<storeId>
//   body: { items: [{ orderId, trackingNumber, carrier }] }   (at most 20)
// Sends the tracking to eBay for each order, which marks it as shipped and tells the buyer.
// That cannot be undone from here, so every order is checked again on the server first:
//  - the tracking must be the one the extension read from AliExpress for that order
//  - the order must have exactly one AliExpress order, and must not have been sent already
//  - eBay must still say the order has not been shipped
// Each order gets its own result; one failing does not stop the others.
export async function POST(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  const { userId, storeId } = r;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0 || items.length > MAX_PER_CALL) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_PER_CALL} orders at a time.` }, { status: 400 });
  }

  try {
    let store = r.store;
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }
    const accessToken = store.tokens.accessToken;

    const [refs, tracking, sent] = await Promise.all([
      getOrderRefs(userId, storeId),
      getTracking(userId, storeId),
      getShipSent(userId, storeId),
    ]);

    const seen = new Set();
    const results = [];
    for (const item of items) {
      const orderId = typeof item?.orderId === "string" ? item.orderId.trim() : "";
      const fail = (error) => results.push({ orderId, ok: false, error });

      if (!ORDER_ID_PATTERN.test(orderId)) {
        fail("Invalid order id.");
        continue;
      }
      if (seen.has(orderId)) {
        fail("This order was listed twice.");
        continue;
      }
      seen.add(orderId);

      const carrier = typeof item.carrier === "string" ? item.carrier.trim() : "";
      const trackingNumber = typeof item.trackingNumber === "string" ? item.trackingNumber.trim() : "";
      if (!CARRIER_PATTERN.test(carrier)) {
        fail("Choose a carrier (letters and digits only).");
        continue;
      }
      if (!TRACKING_PATTERN.test(trackingNumber)) {
        fail("Invalid tracking number.");
        continue;
      }

      const ready = checkReadyToShip(orderId, refs, tracking, sent);
      if (!ready.ok) {
        fail(ready.reason);
        continue;
      }
      if (ready.trackingNumber !== trackingNumber) {
        fail("The tracking changed since you opened this list. Reload and check it again.");
        continue;
      }

      try {
        const order = await fetchOrderForShipping(accessToken, orderId);
        if (order.status !== "NOT_STARTED") {
          fail(`eBay says this order is already ${String(order.status || "shipped").toLowerCase().replace(/_/g, " ")}.`);
          continue;
        }
        if (order.lineItems.length === 0) {
          fail("eBay returned no items for this order.");
          continue;
        }
        const { fulfillmentId } = await createShippingFulfillment(accessToken, orderId, {
          lineItems: order.lineItems,
          carrier,
          trackingNumber,
        });
        // Remember it straight away so a repeat click cannot send it twice.
        sent[orderId] = await markShipSent(userId, storeId, orderId, { trackingNumber, carrier, fulfillmentId });
        results.push({ orderId, ok: true, fulfillmentId });
      } catch (err) {
        fail(err.message || "eBay did not accept this tracking.");
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    if (err.code === "invalid_grant") {
      return NextResponse.json(
        { error: "This eBay connection needs to be authorized again.", reconnectRequired: true },
        { status: 409 }
      );
    }
    console.error(`Sending tracking failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not reach eBay. Nothing was sent." }, { status: 502 });
  }
}
