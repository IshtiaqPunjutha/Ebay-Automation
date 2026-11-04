// lib/orderNote.js
// Keeps the private note of an eBay order ("Add note" in Seller Hub) in step with the AliExpress numbers saved
// for it here, so the number can be found from either side. It never blocks saving: a failure is only logged.
import { fetchOrderForShipping, isTokenExpired, refreshAccessToken, setOrderLineNote } from "./ebay";
import { updateStoreAccessToken } from "./store";

// "AE: 3077299049050812, 3077631727180812" (eBay allows 255 characters).
export function noteTextFor(aliOrderIds) {
  let text = "AE:";
  for (const id of aliOrderIds) {
    if (text.length + id.length + 2 > 255) break;
    text += `${text === "AE:" ? " " : ", "}${id}`;
  }
  return text;
}

// An empty list leaves the note alone (it may hold something you wrote yourself).
export async function syncOrderNote(userId, store, orderId, aliOrderIds) {
  if (process.env.ORDER_NOTE_SYNC === "off" || !aliOrderIds?.length) return { skipped: true };
  try {
    let record = store;
    if (isTokenExpired(record.tokens)) {
      const refreshed = await refreshAccessToken(record.tokens.refreshToken);
      record = (await updateStoreAccessToken(userId, record.storeId, refreshed.accessToken, refreshed.expiresIn)) || record;
    }
    const token = record.tokens.accessToken;
    const order = await fetchOrderForShipping(token, orderId);
    const text = noteTextFor(aliOrderIds);
    for (const li of order.lineItems) {
      const result = await setOrderLineNote(token, { itemId: li.legacyItemId, transactionId: li.lineItemId, text, marketplaceId: record.marketplaceId });
      if (!result.ok) {
        console.error(`eBay order note not saved for ${orderId}:`, result.errors, result.raw);
        return { ok: false };
      }
    }
    return { ok: true };
  } catch (err) {
    console.error(`eBay order note errored for ${orderId}:`, err);
    return { ok: false };
  }
}
