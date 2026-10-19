// lib/candidates.js
// Turns eBay orders into the list the browser extension shows: the orders that
// still need an AliExpress number, each with the AliExpress product ids from the
// store's sheet so the extension can tell which order an AliExpress purchase is for.

// The product id in an AliExpress product link: /item/1005001234567890.html
export function aliItemIdFromUrl(url) {
  const text = String(url || "");
  const match = text.match(/\/(?:item|i)\/(?:[^/?#]*\/)?(\d{8,20})\.html/i) || text.match(/(\d{10,20})\.html/);
  return match ? match[1] : "";
}

// orders:   [{ orderId, orderDate, buyer, items: [{ legacyItemId, title, quantity }] }]
// refs:     { [ebayOrderId]: { aliOrderIds: [...] } }   numbers already added
// sheetRows:[{ itemId, ebayLink, aliLinks: [...] }]     the store's sheet mapping
export function buildCandidates(orders, refs, sheetRows, { includeDone = false } = {}) {
  // eBay item id -> AliExpress product ids from the sheet
  const aliByItem = new Map();
  for (const row of sheetRows || []) {
    const itemId = row.itemId || String(row.ebayLink || "").match(/\/itm\/(?:[^/?]+\/)?(\d{9,})/)?.[1] || "";
    if (!itemId) continue;
    const ids = (row.aliLinks || []).map(aliItemIdFromUrl).filter(Boolean);
    if (ids.length) aliByItem.set(itemId, ids);
  }

  return (orders || [])
    .filter((order) => includeDone || !(refs?.[order.orderId]?.aliOrderIds || []).length)
    .map((order) => ({
      orderId: order.orderId,
      orderDate: order.orderDate,
      buyer: order.buyer,
      title: order.items?.[0]?.title || "",
      itemCount: (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0),
      // What was bought, in short: lets the extension compare an AliExpress order with this one
      // (title words and the chosen size/colour) and lets a person tell similar orders apart.
      items: (order.items || []).slice(0, 5).map((item) => ({
        title: item.title || "",
        quantity: item.quantity || 1,
        variantText: Object.entries(item.variants || {})
          .map(([name, value]) => `${name}: ${value}`)
          .join(", "),
        variantValues: Object.values(item.variants || {}).map(String),
      })),
      aliItemIds: [...new Set((order.items || []).flatMap((item) => aliByItem.get(item.legacyItemId) || []))],
      aliOrderIds: refs?.[order.orderId]?.aliOrderIds || [],
    }))
    // Newest first.
    .sort((a, b) => String(b.orderDate || "").localeCompare(String(a.orderDate || "")));
}
