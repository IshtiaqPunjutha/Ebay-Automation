// lib/storeMarketplace.js
// Which eBay site (UK, US, ...) a store sells on. It is read from the seller's eBay account once, when the store
// is connected; stores connected before that existed are looked up the first time they are needed and remembered.
import { fetchEbayIdentity, isTokenExpired, refreshAccessToken } from "./ebay";
import { isKnownMarketplace } from "./marketplaces";
import { setStoreMarketplace, updateStoreAccessToken } from "./store";

// -> { store, marketplaceId } where marketplaceId is null if eBay would not say (callers then use the default site).
export async function ensureStoreMarketplace(userId, store) {
  if (isKnownMarketplace(store?.marketplaceId)) return { store, marketplaceId: store.marketplaceId };
  try {
    let record = store;
    if (isTokenExpired(record.tokens)) {
      const refreshed = await refreshAccessToken(record.tokens.refreshToken);
      record = (await updateStoreAccessToken(userId, record.storeId, refreshed.accessToken, refreshed.expiresIn)) || record;
    }
    const identity = await fetchEbayIdentity(record.tokens.accessToken);
    if (identity?.marketplaceId) {
      const saved = await setStoreMarketplace(userId, record.storeId, identity.marketplaceId);
      return { store: saved || record, marketplaceId: identity.marketplaceId };
    }
    return { store: record, marketplaceId: null };
  } catch (err) {
    console.error(`Could not read the eBay site of store ${store?.storeId}:`, err);
    return { store, marketplaceId: null };
  }
}
