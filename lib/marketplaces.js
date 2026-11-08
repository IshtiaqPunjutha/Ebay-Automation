// lib/marketplaces.js
// What differs between eBay sites: the Browse API's category tree, the seller's clock (for month boundaries),
// the money format and the listing web domain. A store's marketplace comes from eBay itself (its account, and the
// marketplace each order was sold on), never from a setting that has to be kept in step by hand.

// The UK site uses GMT (UTC) for months and days: eBay's own financial statement is cut at "12:00 AM - 11:59 PM GMT",
// so a sale in the first or last hour of a month counts in the same month as on the statement even in summer time.
const SITES = {
  EBAY_GB: { tree: "3", tz: "UTC", currency: "GBP", locale: "en-GB", domain: "www.ebay.co.uk", name: "UK" },
  EBAY_US: { tree: "0", tz: "America/Los_Angeles", currency: "USD", locale: "en-US", domain: "www.ebay.com", name: "US" },
  EBAY_CA: { tree: "2", tz: "America/Toronto", currency: "CAD", locale: "en-CA", domain: "www.ebay.ca", name: "Canada" },
  EBAY_AU: { tree: "15", tz: "Australia/Sydney", currency: "AUD", locale: "en-AU", domain: "www.ebay.com.au", name: "Australia" },
  EBAY_DE: { tree: "77", tz: "Europe/Berlin", currency: "EUR", locale: "de-DE", domain: "www.ebay.de", name: "Germany" },
  EBAY_FR: { tree: "71", tz: "Europe/Paris", currency: "EUR", locale: "fr-FR", domain: "www.ebay.fr", name: "France" },
  EBAY_IT: { tree: "101", tz: "Europe/Rome", currency: "EUR", locale: "it-IT", domain: "www.ebay.it", name: "Italy" },
  EBAY_ES: { tree: "186", tz: "Europe/Madrid", currency: "EUR", locale: "es-ES", domain: "www.ebay.es", name: "Spain" },
  EBAY_IE: { tree: "205", tz: "Europe/Dublin", currency: "EUR", locale: "en-IE", domain: "www.ebay.ie", name: "Ireland" },
};

export const DEFAULT_MARKETPLACE = process.env.EBAY_MARKETPLACE_ID || "EBAY_GB";

export function isKnownMarketplace(id) {
  return Object.prototype.hasOwnProperty.call(SITES, id);
}

// A store's marketplace id, or the default when it is not known (yet).
export function marketplaceOf(store) {
  const id = store?.marketplaceId;
  return isKnownMarketplace(id) ? id : DEFAULT_MARKETPLACE;
}

export function marketplaceInfo(id) {
  return SITES[id] || SITES[DEFAULT_MARKETPLACE] || SITES.EBAY_GB;
}

// The seller's clock for a store. FINANCE_TIMEZONE, when set, wins for every store (the old single-site behaviour).
export function timezoneOf(store) {
  return process.env.FINANCE_TIMEZONE || marketplaceInfo(marketplaceOf(store)).tz;
}

// Money in the currency's own style: $1,234.50 for USD, £1,234.50 for GBP.
export function formatMoney(value, currency) {
  const n = Number(value) || 0;
  const code = currency || "GBP";
  const locale = code === "USD" ? "en-US" : code === "CAD" ? "en-CA" : code === "AUD" ? "en-AU" : "en-GB";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(n);
  } catch {
    return n.toFixed(2);
  }
}
