// Shared helpers for the content script, popup and background worker.
// Plain functions with no browser APIs, so they can also be unit-tested in Node.
(function (root) {
  // AliExpress labels the number "Ref. Number: 3077062172300812" on the order list.
  // Also accepted: "Order ID: ...", "Order No. ...", "Order number #...", "Order: ...", "Reference ...".
  const ORDER_LABEL =
    /(?:ref(?:erence)?\.?\s*(?:number|no\.?|id|#)?|order\s*(?:id|no\.?|number|#)|order)\s*[:：#]?\s*(\d{12,20})/gi;

  // AliExpress order numbers found in a block of page text, in order of appearance.
  function orderIdsFromText(text) {
    const ids = [];
    const re = new RegExp(ORDER_LABEL.source, "gi");
    let match;
    while ((match = re.exec(String(text || "")))) {
      if (!ids.includes(match[1])) ids.push(match[1]);
    }
    return ids;
  }

  // Order detail pages carry the number in the address (?orderId=...).
  function orderIdsFromUrl(search) {
    const params = new URLSearchParams(search || "");
    const ids = [];
    for (const key of ["orderId", "tradeOrderId", "orderNo"]) {
      const value = params.get(key);
      if (value && /^\d{12,20}$/.test(value) && !ids.includes(value)) ids.push(value);
    }
    return ids;
  }

  // The product id in an AliExpress product link: /item/1005001234567890.html
  function itemIdFromUrl(url) {
    const text = String(url || "");
    const match = text.match(/\/(?:item|i)\/(?:[^/?#]*\/)?(\d{8,20})\.html/i) || text.match(/(\d{10,20})\.html/);
    return match ? match[1] : "";
  }

  // An eBay order can be matched to an AliExpress order by product: either the product
  // it was opened with (aliItemId, from the dashboard arrow) or the products linked to
  // its items in the sheet (aliItemIds, from the dashboard's order list).
  function matchesProduct(entry, wanted) {
    if (entry.aliItemId && wanted.has(entry.aliItemId)) return true;
    return (entry.aliItemIds || []).some((id) => wanted.has(id));
  }

  const normalize = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wordsOf = (text) => [...new Set(String(text || "").toLowerCase().match(/[a-z0-9]{4,}/g) || [])];

  // How well an eBay order's items fit the text of an AliExpress order card: a point for every
  // title word they share, and three for every chosen size/colour that appears in the card
  // ("Black, 1m" fits an eBay order for "Color: Black, Cable Length: 1 m").
  function scoreAgainstCard(entry, cardText) {
    const haystack = normalize(cardText);
    const cardWords = new Set(wordsOf(cardText));
    let score = 0;
    for (const item of entry.items || []) {
      for (const value of item.variantValues || []) {
        const needle = normalize(value);
        if (needle.length >= 2 && haystack.includes(needle)) score += 3;
      }
      for (const word of wordsOf(item.title)) if (cardWords.has(word)) score += 1;
    }
    return score;
  }

  // Every eBay order whose product appears in the AliExpress order: the ones opened with the
  // arrow first, then the newest.
  function matchesByProduct(entries, itemIds) {
    const wanted = new Set(itemIds || []);
    if (wanted.size === 0) return [];
    return (entries || [])
      .filter((e) => matchesProduct(e, wanted))
      .sort((a, b) => (b.source === "arrow") - (a.source === "arrow") || b.addedAt - a.addedAt);
  }

  // The first of those, or null.
  function matchByProduct(entries, itemIds) {
    return matchesByProduct(entries, itemIds)[0] || null;
  }

  // Which waiting eBay order does an AliExpress order most likely belong to?
  // The one whose product id appears in the AliExpress order; otherwise the newest.
  function pickPending(pending, itemIds) {
    if (!pending || pending.length === 0) return null;
    const matched = matchByProduct(pending, itemIds);
    if (matched) return { entry: matched, byProduct: true };
    const newest = [...pending].sort((a, b) => b.addedAt - a.addedAt)[0];
    return { entry: newest, byProduct: false };
  }

  // Merge eBay orders opened with the arrow and orders listed by the dashboard into one
  // list without repeats; the arrow entry wins but borrows the dashboard's details.
  function mergeChoices(arrowEntries, dashboardEntries) {
    const byKey = new Map();
    for (const e of dashboardEntries || []) byKey.set(`${e.storeId}|${e.orderId}`, { ...e, source: "dashboard" });
    for (const e of arrowEntries || []) {
      const key = `${e.storeId}|${e.orderId}`;
      const known = byKey.get(key) || {};
      byKey.set(key, { ...known, ...e, aliItemIds: known.aliItemIds || [], source: "arrow" });
    }
    return [...byKey.values()];
  }

  // "https://my-app.vercel.app/some/page" -> "https://my-app.vercel.app"
  function originOf(input) {
    try {
      const url = new URL(String(input || "").trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.origin;
    } catch (e) {
      return "";
    }
  }

  // AliExpress's tracking page: https://www.aliexpress.com/p/tracking/index.html?...&tradeOrderId=3077...
  // The tradeOrderId in it is the order's "Ref. Number". Returns "" for anything else.
  function trackingOrderIdFromUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const ok = u.protocol === "https:" && (host === "aliexpress.com" || host.endsWith(".aliexpress.com") || host.endsWith(".aliexpress.us"));
      if (!ok || !/\/p\/tracking\//i.test(u.pathname)) return "";
      const id = u.searchParams.get("tradeOrderId") || u.searchParams.get("orderId") || "";
      return /^\d{12,20}$/.test(id) ? id : "";
    } catch (e) {
      return "";
    }
  }

  // A courier tracking number: letters and digits only, no spaces.
  function cleanTrackingNumber(text) {
    const value = String(text || "").replace(/\s+/g, "");
    return /^[A-Za-z0-9]{6,40}$/.test(value) ? value : "";
  }

  // "£ 2.04", "Total:£2.04", "US $12.50", "€1,299.00" -> { amount: 2.04, currency: "GBP" }; null if unclear.
  function parseMoney(text) {
    const t = String(text || "").replace(/\s+/g, " ");
    const symbols = { "£": "GBP", "€": "EUR", "$": "USD" };
    const m = t.match(/([£€$])\s*([0-9][0-9.,]*)/);
    if (!m) return null;
    let n = m[2];
    // "1,299.00" or "1.299,00": the last separator is the decimal point when two digits follow it.
    const last = Math.max(n.lastIndexOf("."), n.lastIndexOf(","));
    if (last >= 0 && n.length - last - 1 === 2) n = n.slice(0, last).replace(/[.,]/g, "") + "." + n.slice(last + 1);
    else n = n.replace(/[.,]/g, "");
    const amount = Number(n);
    return Number.isFinite(amount) && amount >= 0 && amount < 1e6 ? { amount, currency: symbols[m[1]] } : null;
  }

  const api = { parseMoney, trackingOrderIdFromUrl, cleanTrackingNumber, orderIdsFromText, orderIdsFromUrl, itemIdFromUrl, scoreAgainstCard, matchesByProduct, matchByProduct, pickPending, mergeChoices, originOf };
  root.AliSyncLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
