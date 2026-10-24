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

// A guess at the carrier from the look of the tracking number, used only to pre-select the choice on the review
// screen when AliExpress has not shown the carrier. It is only ever a suggestion: a person confirms it before sending.
export function guessCarrier(trackingNumber) {
  const t = String(trackingNumber || "").trim().toUpperCase();
  if (/^JJD\d{10,}$/.test(t)) return "InPost"; // AliExpress "Inpost Shops" parcels in the UK
  if (/^[A-Z]{2}\d{9}GB$/.test(t)) return "Royal Mail"; // UPU-style number from the UK
  if (/^H[0-9][A-Z0-9]{13,15}$/.test(t)) return "Evri";
  return "";
}

// orderId:  the eBay order
// refs:     { [ebayOrderId]: { aliOrderIds: [...] } }
// tracking: { [aliOrderId]: { trackingNumber, carrierName, ... } }   read from AliExpress by the extension
// sent:     { [ebayOrderId]: { trackingNumber, ... } }  tracking already sent to eBay
// Returns { ok: true, aliOrderId, trackingNumber, carrierName, carrierGuess, carrierText } or { ok: false, reason }.
// carrierName is what AliExpress shows (it appears when the parcel reaches the local carrier). When it is not there
// yet the order can still be sent by hand: carrierName is "" and a person picks the carrier on the review screen
// (carrierGuess is a suggestion from the tracking number). The automatic job never sends without a carrier name.
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
  return {
    ok: true,
    aliOrderId,
    trackingNumber: found.trackingNumber,
    carrierName,
    carrierGuess: carrierName ? "" : guessCarrier(found.trackingNumber),
    carrierText: found.carrierText || "",
  };
}
