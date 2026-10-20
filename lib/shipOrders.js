// lib/shipOrders.js
// Sends AliExpress tracking to eBay for a list of orders. Used by the "Send tracking to eBay" button
// and by the automatic daily job, so both apply exactly the same checks. Sending marks an order as
// shipped on eBay and tells the buyer; it cannot be undone from here, so every order is checked again:
//  - the tracking must be the one the extension read from AliExpress for that order
//  - the order must have exactly one AliExpress order, and must not have been sent already
//  - eBay must still say the order has not been shipped
// Each order gets its own result; one failing does not stop the others.

import { createShippingFulfillment, fetchOrderForShipping } from "./ebay";
import { markShipSent } from "./store";
import { CARRIER_PATTERN, checkReadyToShip } from "./shipping";

const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const TRACKING_PATTERN = /^[A-Za-z0-9]{6,40}$/;

// items: [{ orderId, trackingNumber, carrier }]; refs / tracking / sent as in lib/shipping.js (the
// `sent` object is updated as orders go out). `auto` marks the record as sent by the daily job.
export async function shipOrders({ accessToken, userId, storeId, items, refs, tracking, sent, auto = false }) {
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
      // Remember it straight away so a repeat click (or the next job run) cannot send it twice.
      sent[orderId] = await markShipSent(userId, storeId, orderId, { trackingNumber, carrier, fulfillmentId, auto });
      results.push({ orderId, ok: true, fulfillmentId });
    } catch (err) {
      fail(err.message || "eBay did not accept this tracking.");
    }
  }
  return results;
}
