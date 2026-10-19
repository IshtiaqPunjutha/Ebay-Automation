// lib/ebay.js
// All the direct interaction with eBay's OAuth + Fulfillment/Finances/Browse
// APIs lives here, isolated from the Next.js routes.
import * as DigitalSignatureSDK from "digital-signature-nodejs-sdk";

const AUTH_BASE = "https://auth.ebay.com";
const API_BASE = "https://api.ebay.com";

// Identity + Finances live on the "apiz" host, not "api".
const APIZ_BASE = "https://apiz.ebay.com";

// Which eBay site to ask the Browse API to price/localize images for.
// Override with EBAY_MARKETPLACE_ID if you sell on a different site.
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_GB";

// sell.fulfillment          = read/manage orders
// commerce.identity.readonly = label each connected store by username
// sell.finances             = real "order earnings" after eBay's fees
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
].join(" ");

// Step 2 of the OAuth flow: build the URL we send the seller to.
export function getEbayAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID,
    redirect_uri: process.env.EBAY_RUNAME,
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${AUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

function basicAuthHeader() {
  const creds = `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

// Step 4: exchange the one-time "code" for access + refresh tokens.
export async function exchangeCodeForTokens(code) {
  const res = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.EBAY_RUNAME,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token exchange failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

// Silently get a new access token using the stored refresh token.
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let code = null;
    let description = text;
    try {
      const errorData = JSON.parse(text);
      code = errorData.error || null;
      description = errorData.error_description || text;
    } catch (err) {
      // Preserve the response text if eBay returns a non-JSON error.
    }
    const error = new Error(`eBay token refresh failed: ${res.status} ${description}`);
    error.code = code;
    throw error;
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

// A "client credentials" (application-level) token — not tied to any
// seller. Used only for the Browse API, which just needs public catalog
// data (product images), not the seller's own account.
export async function getApplicationAccessToken() {
  const res = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay app token failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    obtainedAt: Date.now(),
  };
}

export function isTokenExpired(tokenRecord) {
  if (!tokenRecord?.accessToken) return true;
  const ageMs = Date.now() - tokenRecord.obtainedAt;
  const bufferMs = 2 * 60 * 1000;
  return ageMs > tokenRecord.expiresIn * 1000 - bufferMs;
}

export function createEbaySignatureHeaders(url, method = "GET") {
  const jwe = process.env.EBAY_SIGNATURE_KEY_JWE;
  const privateKey = process.env.EBAY_SIGNATURE_PRIVATE_KEY;
  if (!jwe || !privateKey) {
    throw new Error("eBay digital-signature keys are not configured");
  }

  const headers = { "x-ebay-signature-key": jwe };
  const config = {
    digestAlgorithm: "sha256",
    jwe,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    signatureParams: ["x-ebay-signature-key", "@method", "@path", "@authority"],
    signatureComponents: {
      authority: url.host,
      method,
      path: url.pathname,
      requestTarget: `${url.pathname}${url.search}`,
      scheme: url.protocol.slice(0, -1),
      targetUri: url.href,
    },
  };

  headers["signature-input"] = DigitalSignatureSDK.generateSignatureInput(headers, config);
  headers.signature = DigitalSignatureSDK.generateSignature(headers, config);
  return headers;
}

// Whose eBay account did we just connect? Used to label the store.
export async function fetchEbayIdentity(accessToken) {
  try {
    const res = await fetch(`${APIZ_BASE}/commerce/identity/v1/user/`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { username: data.username || null };
  } catch (err) {
    console.error("eBay identity fetch failed:", err);
    return null;
  }
}

// Public catalog details, via the Browse API's "legacy id" lookup.
export async function fetchItemProduct(legacyItemId, appAccessToken) {
  if (!legacyItemId || !appAccessToken) return null;
  try {
    const params = new URLSearchParams({ legacy_item_id: legacyItemId });
    const res = await fetch(
      `${API_BASE}/buy/browse/v1/item/get_item_by_legacy_id?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${appAccessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
        },
      }
    );
    if (!res.ok) {
      console.warn(`eBay Browse lookup failed for item ${legacyItemId}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const imageUrl = data.image?.imageUrl || data.thumbnailImages?.[0]?.imageUrl || null;
    if (!imageUrl) {
      console.warn(`eBay Browse returned no image for item ${legacyItemId}`);
    }
    return {
      itemId: data.itemId || null,
      title: data.title || null,
      subtitle: data.subtitle || null,
      imageUrl,
      price: data.price || null,
      condition: data.condition || null,
      itemWebUrl: data.itemWebUrl || null,
      categoryPath: data.categoryPath || null,
      localizedAspects: data.localizedAspects || [],
    };
  } catch (err) {
    console.error(`eBay Browse lookup errored for item ${legacyItemId}:`, err);
    return null;
  }
}

// The numeric item id inside an eBay listing link (…/itm/123456789012).
export function itemIdFromLink(link) {
  const match = String(link || "").match(/\/itm\/(?:[^/?]+\/)?(\d{9,})/);
  return match ? match[1] : "";
}

// Top-level category ids of the marketplace's category tree. The Browse API
// can't list a seller's items without a keyword or category, so listings are
// gathered by sweeping each top-level category with a seller filter.
export async function fetchRootCategoryIds(appAccessToken) {
  const res = await fetch(`${API_BASE}/commerce/taxonomy/v1/category_tree/3`, {
    headers: { Authorization: `Bearer ${appAccessToken}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID },
  });
  if (!res.ok) throw new Error(`eBay category tree failed: ${res.status}`);
  const data = await res.json();
  const ids = (data.rootCategoryNode?.childCategoryTreeNodes || []).map((n) => n.category.categoryId);
  if (ids.length === 0) throw new Error("eBay category tree returned no root categories");
  return ids;
}

// Every active listing a seller has on this marketplace, via the public Browse
// API (no extra OAuth scope needed). Returns [{ itemId, title, url }].
export async function fetchSellerListings(sellerUsername, appAccessToken, rootCategoryIds) {
  const listings = new Map();
  const PAGE = 200;

  async function sweepCategory(categoryId) {
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({
        category_ids: categoryId,
        filter: `sellers:{${sellerUsername}}`,
        limit: String(PAGE),
        offset: String(offset),
      });
      const res = await fetch(`${API_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${appAccessToken}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID },
      });
      if (!res.ok) throw new Error(`eBay listing search failed: ${res.status}`);
      const data = await res.json();
      for (const item of data.itemSummaries || []) {
        const itemId = item.legacyItemId || String(item.itemId || "").split("|")[1];
        if (!itemId || !item.itemWebUrl) continue;
        // Drop tracking parameters so the link is a clean /itm/<id> URL.
        listings.set(itemId, { itemId, title: item.title || "", url: item.itemWebUrl.split("?")[0] });
      }
      offset += PAGE;
      if (offset >= (data.total || 0) || offset >= 10000) break;
    }
  }

  // A handful of categories at a time keeps the sweep quick without hammering the API.
  const CONCURRENCY = 6;
  for (let i = 0; i < rootCategoryIds.length; i += CONCURRENCY) {
    await Promise.all(rootCategoryIds.slice(i, i + CONCURRENCY).map(sweepCategory));
  }
  return [...listings.values()];
}

// Finances SALE amounts are already net of selling fees; linked debit
// transactions such as ad fees must then be subtracted from the earnings.
// Returns null until eBay posts a transaction for the order.
export async function fetchOrderEarnings(accessToken, orderId) {
  try {
    const params = new URLSearchParams({ filter: `orderId:{${orderId}}` });
    const url = new URL(`${APIZ_BASE}/sell/finances/v1/transaction?${params.toString()}`);
    const res = await fetch(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
          ...createEbaySignatureHeaders(url),
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const transactions = data.transactions || [];
    if (transactions.length === 0) return null;

    let earnings = 0;
    let hasAmount = false;
    let currency = null;

    for (const txn of transactions) {
      const amount = Number(txn.amount?.value);
      if (!Number.isFinite(amount)) continue;

      const direction = txn.bookingEntry === "DEBIT" ? -1 : 1;
      earnings += direction * Math.abs(amount);
      currency = txn.amount.currency || currency;
      hasAmount = true;
    }

    if (!hasAmount) return null;
    return { earnings: +earnings.toFixed(2), currency: currency || "GBP" };
  } catch (err) {
    return null;
  }
}

// "new" = not shipped yet (including partly shipped); "dispatched" = fulfilled.
const ORDER_STATUS_FILTERS = {
  new: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}",
  // eBay only accepts {FULFILLED|IN_PROGRESS} (not FULFILLED alone); partly
  // shipped orders are dropped again below because they belong to "new".
  dispatched: "orderfulfillmentstatus:{FULFILLED|IN_PROGRESS}",
};

export function isOrderStatus(value) {
  return Object.prototype.hasOwnProperty.call(ORDER_STATUS_FILTERS, value);
}

// One page of orders, enriched with product images and real earnings.
// Returns { orders, total } where total counts every matching order, so the
// caller can page through all of them. Enrichment only runs for this page.
export async function fetchOrders(accessToken, appAccessToken, { status = "new", limit = 25, offset = 0 } = {}) {
  const params = new URLSearchParams({
    filter: ORDER_STATUS_FILTERS[status] || ORDER_STATUS_FILTERS.new,
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(
    `${API_BASE}/sell/fulfillment/v1/order?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay order fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  const pageOrders = (data.orders || []).filter(
    (order) => status !== "dispatched" || order.orderFulfillmentStatus === "FULFILLED"
  );

  const baseOrders = pageOrders.map((order) => {
    const buyer = order.buyer || {};
    const shipTo =
      order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo || {};
    const contact = shipTo.contactAddress || {};
    const pricing = order.pricingSummary || {};

    const lineItems = (order.lineItems || []).map((li) => {
      const variants = {};
      (li.lineItemProperties || li.variationAspects || []).forEach((prop) => {
        if (prop.name && prop.value) variants[prop.name] = prop.value;
      });

      return {
        lineItemId: li.lineItemId,
        legacyItemId: li.legacyItemId || null,
        title: li.title,
        sku: li.sku || null,
        quantity: li.quantity,
        variants,
        imageUrl: null, // filled in below
      };
    });

    return {
      orderId: order.orderId,
      orderDate: order.creationDate,
      buyerUsername: buyer.username || null,
      shipTo: {
        fullName: shipTo.fullName || null,
        addressLine1: contact.addressLine1 || null,
        addressLine2: contact.addressLine2 || null,
        city: contact.city || null,
        stateOrProvince: contact.stateOrProvince || null,
        postalCode: contact.postalCode || null,
        countryCode: contact.countryCode || null,
        phone: shipTo.primaryPhone?.phoneNumber || null,
      },
      lineItems,
      fulfillmentStatus: order.orderFulfillmentStatus,
      itemCount: lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0),
      orderTotal: pricing.total?.value ? parseFloat(pricing.total.value) : null,
      currency: pricing.total?.currency || null,
      earnings: null, // filled in below
    };
  });

  // Enrich every order in parallel: real earnings (Finances API) +
  // a product image per line item (Browse API), so one slow/failing
  // lookup doesn't block the rest.
  const enrichedOrders = await Promise.all(
    baseOrders.map(async (order) => {
      const [earnings, lineItemsWithImages] = await Promise.all([
        fetchOrderEarnings(accessToken, order.orderId),
        Promise.all(
          order.lineItems.map(async (li) => {
            const product = await fetchItemProduct(li.legacyItemId, appAccessToken);
            return { ...li, imageUrl: product?.imageUrl || null, product };
          })
        ),
      ]);
      return { ...order, earnings, lineItems: lineItemsWithImages };
    })
  );

  return { orders: enrichedOrders, total: Number.isFinite(data.total) ? data.total : enrichedOrders.length };
}
