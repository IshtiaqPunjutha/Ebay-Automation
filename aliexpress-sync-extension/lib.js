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

  // Which waiting eBay order does an AliExpress order most likely belong to?
  // The one whose product id appears in the AliExpress order; otherwise the newest.
  function pickPending(pending, itemIds) {
    if (!pending || pending.length === 0) return null;
    const wanted = new Set(itemIds || []);
    const matched = pending.find((p) => p.aliItemId && wanted.has(p.aliItemId));
    if (matched) return { entry: matched, byProduct: true };
    const newest = [...pending].sort((a, b) => b.addedAt - a.addedAt)[0];
    return { entry: newest, byProduct: false };
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

  const api = { orderIdsFromText, orderIdsFromUrl, itemIdFromUrl, pickPending, originOf };
  root.AliSyncLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
