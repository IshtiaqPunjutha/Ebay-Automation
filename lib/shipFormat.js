// lib/shipFormat.js
// A buyer's address and phone the way eBay's own copy gives them, which is what the AliExpress autofill extension reads:
// one item per line, the country spelled out and the phone as +<country code><number without the leading 0>.

const DIAL = {
  GB: "44", UK: "44", IE: "353", US: "1", CA: "1", AU: "61", NZ: "64", DE: "49", AT: "43", CH: "41", FR: "33", IT: "39",
  ES: "34", PT: "351", NL: "31", BE: "32", LU: "352", SE: "46", NO: "47", DK: "45", FI: "358", PL: "48", CZ: "420", GR: "30",
};
// Countries whose national numbers have no leading 0 to drop.
const NO_TRUNK_ZERO = new Set(["US", "CA"]);

// "07855951518", "+44 7855 951518", "+4407855951518", "447855951518" -> "+447855951518". A number that clearly
// belongs to another country keeps its own code; a country this does not know is left as it came.
export function formatPhone(raw, countryCode) {
  const original = String(raw || "").trim();
  if (!original) return "";
  let digits = original.replace(/\D/g, "");
  if (!digits) return original;
  const code = String(countryCode || "").toUpperCase();
  const dial = DIAL[code];
  const international = /^(\+|00)/.test(original);
  if (/^00/.test(original)) digits = digits.slice(2);
  if (!dial) return international ? `+${digits}` : original;

  let national;
  if (international) {
    if (!digits.startsWith(dial)) return `+${digits}`;
    national = digits.slice(dial.length);
  } else if (digits.startsWith(dial) && digits.length - dial.length >= 9 && (!NO_TRUNK_ZERO.has(code) || digits.length === 11)) {
    national = digits.slice(dial.length);
  } else {
    national = digits;
  }
  if (!NO_TRUNK_ZERO.has(code)) national = national.replace(/^0/, "");
  return `+${dial}${national}`;
}

export function countryName(code) {
  const c = String(code || "").toUpperCase();
  if (!c) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c === "UK" ? "GB" : c) || c;
  } catch {
    return c;
  }
}

// The address lines in eBay's order: street, second line, city, county/state, postcode, country name.
export function addressLines(shipTo = {}) {
  return [shipTo.addressLine1, shipTo.addressLine2, shipTo.city, shipTo.stateOrProvince, shipTo.postalCode, countryName(shipTo.countryCode)]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}
