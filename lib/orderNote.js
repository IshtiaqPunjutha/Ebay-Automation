// lib/orderNote.js
// Keeps the private note of an eBay order ("Add note" in Seller Hub) in step with the AliExpress numbers saved
// for it here, so the number can be found from either side. It never blocks saving: a failure is only logged.
import { fetchOrderForShipping, isTokenExpired, refreshAccessToken, setOrderLineNote } from "./ebay";
import { setOrderNoteText, updateStoreAccessToken } from "./store";

// "3077299049050812, 3077631727180812" (eBay allows 255 characters).
export function noteTextFor(aliOrderIds) {
  let text = "";
  for (const id of aliOrderIds) {
    if (text.length + id.length + 2 > 255) break;
    text += `${text ? ", " : ""}${id}`;
  }
  return text;
}

// Writes text as the note of every item of the order ("" removes the note). -> { ok, error? }
export async function writeOrderNote(userId, store, orderId, text) {
  try {
    let record = store;
    if (isTokenExpired(record.tokens)) {
      const refreshed = await refreshAccessToken(record.tokens.refreshToken);
      record = (await updateStoreAccessToken(userId, record.storeId, refreshed.accessToken, refreshed.expiresIn)) || record;
    }
    const token = record.tokens.accessToken;
    const order = await fetchOrderForShipping(token, orderId);
    for (const li of order.lineItems) {
      const result = await setOrderLineNote(token, { itemId: li.legacyItemId, transactionId: li.lineItemId, text, marketplaceId: record.marketplaceId });
      // Removing a note that is already gone (taken off by hand in Seller Hub) makes eBay answer 16202: that is the goal reached.
      if (!result.ok && !text && result.errors.length > 0 && result.errors.every((e) => e.code === "16202")) continue;
      if (!result.ok) {
        console.error(`eBay order note not saved for ${orderId}:`, result.errors, result.raw);
        const why = result.errors.map((e) => `${e.code} ${e.message}`.trim()).join("; ") || result.raw;
        return { ok: false, error: `eBay did not accept the note: ${why}` };
      }
    }
    await setOrderNoteText(userId, record.storeId, orderId, text);
    return { ok: true };
  } catch (err) {
    console.error(`eBay order note errored for ${orderId}:`, err);
    return { ok: false, error: String(err?.message || "Could not save the note").slice(0, 200) };
  }
}

// After the numbers of an order are saved: the same numbers go into its note. An empty list leaves the note
// alone (it may hold something you wrote yourself). Never throws.
export async function syncOrderNote(userId, store, orderId, aliOrderIds) {
  if (process.env.ORDER_NOTE_SYNC === "off" || !aliOrderIds?.length) return { skipped: true };
  return await writeOrderNote(userId, store, orderId, noteTextFor(aliOrderIds));
}
