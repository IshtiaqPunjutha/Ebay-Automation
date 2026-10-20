// lib/shipping.js
// The rule for when an eBay order may have its AliExpress tracking sent to eBay. Pure code with
// no storage access: the orders page uses it to decide which rows can be ticked, and the server
// uses the very same rule again before it ships anything.

// orderId:  the eBay order
// refs:     { [ebayOrderId]: { aliOrderIds: [...] } }
// tracking: { [aliOrderId]: { trackingNumber, ... } }   read from AliExpress by the extension
// sent:     { [ebayOrderId]: { trackingNumber, ... } }  tracking already sent to eBay
// Returns { ok: true, aliOrderId, trackingNumber, carrierText } or { ok: false, reason }.
export function checkReadyToShip(orderId, refs, tracking, sent) {
  if (sent?.[orderId]) return { ok: false, reason: "Tracking was already sent to eBay for this order." };
  const aliOrderIds = refs?.[orderId]?.aliOrderIds || [];
  if (aliOrderIds.length === 0) return { ok: false, reason: "No AliExpress order number on this order yet." };
  if (aliOrderIds.length > 1) {
    return { ok: false, reason: "This order has several AliExpress orders, so it cannot be sent in one go. Add the tracking on eBay by hand." };
  }
  const aliOrderId = aliOrderIds[0];
  const found = tracking?.[aliOrderId];
  if (!found?.trackingNumber) return { ok: false, reason: "AliExpress has not given a tracking number yet." };
  return { ok: true, aliOrderId, trackingNumber: found.trackingNumber, carrierText: found.carrierText || "" };
}

// Carrier names offered on the review screen. eBay takes the carrier as text; "Other" is for
// AliExpress services that are not one of the usual couriers.
export const CARRIER_CHOICES = ["Other", "Royal Mail", "Evri", "DPD", "DHL", "UPS", "FedEx", "Yodel", "Parcelforce", "InPost"];

export const CARRIER_PATTERN = /^[A-Za-z0-9 .&'/-]{2,40}$/;
