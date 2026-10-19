import { NextResponse } from "next/server";
import {
  fetchRootCategoryIds,
  fetchSellerListings,
  getApplicationAccessToken,
  isTokenExpired,
  itemIdFromLink,
} from "@/lib/ebay";
import {
  getCachedAppToken,
  getCachedRootCategories,
  getEbayStore,
  getStoreSheet,
  saveAppToken,
  saveRootCategories,
  saveStoreSheet,
} from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Sweeping every top-level category takes a few seconds.
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const MAX_ROWS = 5000;

// POST /api/ebay/sheet/sync?store=<storeId>
// Adds every active listing of the store's seller to the sheet. Existing rows
// (and the AliExpress links already filled in) are left untouched.
export async function POST(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const storeId = new URL(request.url).searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });
  }
  const store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  // The store label is the seller's eBay username; a "store-xxxxxx" label means
  // the username could not be read when the store was connected.
  const seller = store.label;
  if (!seller || /^store-[0-9a-f]{6}$/.test(seller)) {
    return NextResponse.json(
      { error: "This store has no eBay username saved. Disconnect and reconnect it, then try again." },
      { status: 409 }
    );
  }

  try {
    let appToken = await getCachedAppToken();
    if (isTokenExpired(appToken)) {
      appToken = await getApplicationAccessToken();
      await saveAppToken(appToken);
    }

    let rootIds = await getCachedRootCategories();
    if (!Array.isArray(rootIds) || rootIds.length === 0) {
      rootIds = await saveRootCategories(await fetchRootCategoryIds(appToken.accessToken));
    }

    const listings = await fetchSellerListings(seller, appToken.accessToken, rootIds);

    const sheet = await getStoreSheet(userId, storeId);
    const rows = sheet.rows.map((row) => ({ ...row, itemId: row.itemId || itemIdFromLink(row.ebayLink) }));
    const known = new Set(rows.map((row) => row.itemId).filter(Boolean));

    let added = 0;
    for (const listing of listings) {
      if (known.has(listing.itemId)) {
        // Fill in a title for rows that were pasted without one.
        const existing = rows.find((row) => row.itemId === listing.itemId);
        if (existing && !existing.title) existing.title = listing.title;
        continue;
      }
      if (rows.length >= MAX_ROWS) break;
      rows.push({
        id: crypto.randomUUID(),
        itemId: listing.itemId,
        title: listing.title,
        ebayLink: listing.url,
        aliLink: "",
        notes: "",
      });
      known.add(listing.itemId);
      added += 1;
    }

    const saved = await saveStoreSheet(userId, storeId, rows);
    return NextResponse.json({ ok: true, rows: saved.rows, added, found: listings.length, seller });
  } catch (err) {
    console.error(`Listing sync failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not fetch listings from eBay. Please try again." }, { status: 502 });
  }
}
