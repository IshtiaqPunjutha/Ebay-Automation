// lib/shipping.js
// The rule for when an eBay order may have its AliExpress tracking sent to eBay. Pure code with
// no storage access: the orders page uses it to decide which rows can be ticked, and the server
// uses the very same rule again before it ships anything.

// Carrier names offered on the review screen. eBay takes the carrier as text; "Other" is for
// AliExpress services that are not one of the usual couriers.
export const CARRIER_CHOICES = ["Other", "Royal Mail", "Evri", "DPD", "DHL", "UPS", "FedEx", "Yodel", "Parcelforce", "InPost"];

export const CARRIER_PATTERN = /^[A-Za-z0-9 .&'/-]{2,40}$/;

// The local carrier AliExpress shows on the tracking page ("InPost"), tidied into something eBay will
// take: whitespace collapsed, a trailing colon dropped, odd characters removed. "" when nothing usable.
export function cleanCarrierName(text) {
  const name = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[:：]\s*$/, "")
    .replace(/[^A-Za-z0-9 .&'/-]/g, "")
    .trim()
    .slice(0, 40);
  return CARRIER_PATTERN.test(name) ? name : "";
}

// Matches a carrier name to one of the usual choices regardless of letter case ("INPOST" -> "InPost").
export function carrierChoiceFor(name) {
  return CARRIER_CHOICES.find((c) => c.toLowerCase() === String(name || "").toLowerCase()) || name;
}

// orderId:  the eBay order
// refs:     { [ebayOrderId]: { aliOrderIds: [...] } }
// tracking: { [aliOrderId]: { trackingNumber, carrierName, ... } }   read from AliExpress by the extension
// sent:     { [ebayOrderId]: { trackingNumber, ... } }  tracking already sent to eBay
// Returns { ok: true, aliOrderId, trackingNumber, carrierName, carrierText } or { ok: false, reason }.
// An order is only ready once AliExpress shows the delivery carrier (it appears when the parcel reaches the
// local carrier), because that is the carrier eBay must be told.
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
  const carrierName = cleanCarrierName(found.carrierName);
  if (!carrierName) {
    return { ok: false, reason: "AliExpress has not shown the delivery carrier yet (it appears once the parcel reaches the local carrier)." };
  }
  return { ok: true, aliOrderId, trackingNumber: found.trackingNumber, carrierName, carrierText: found.carrierText || "" };
}
