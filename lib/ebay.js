// lib/ebay.js
// All the direct interaction with eBay's OAuth + Fulfillment/Finances/Browse
// APIs lives here, isolated from the Next.js routes.

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
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed: ${res.status} ${text}`);
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
    if (!res.ok) return null;
    const data = await res.json();
    return {
      itemId: data.itemId || null,
      title: data.title || null,
      subtitle: data.subtitle || null,
      imageUrl: data.image?.imageUrl || null,
      price: data.price || null,
      condition: data.condition || null,
      itemWebUrl: data.itemWebUrl || null,
      categoryPath: data.categoryPath || null,
      localizedAspects: data.localizedAspects || [],
    };
  } catch (err) {
    return null;
  }
}

// What the seller actually keeps after eBay's fees, for one order.
// Matches the "What you earned" breakdown eBay shows in Seller Hub:
// order total minus every selling-cost fee line (transaction fee,
// ad fee, etc). Returns null if eBay hasn't posted the transaction yet
// (common for very fresh orders, and common in Sandbox test accounts,
// which often don't generate real fee transactions at all).
export async function fetchOrderEarnings(accessToken, orderId) {
  try {
    const params = new URLSearchParams({ filter: `orderId:{${orderId}}` });
    const res = await fetch(
      `${APIZ_BASE}/sell/finances/v1/transaction?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const transactions = data.transactions || [];
    if (transactions.length === 0) return null;

    let gross = 0;
    let fees = 0;
    let currency = null;

    for (const txn of transactions) {
      if (txn.amount?.value) {
        gross += parseFloat(txn.amount.value);
        currency = txn.amount.currency || currency;
      }
      if (txn.totalFeeAmount?.value) {
        fees += parseFloat(txn.totalFeeAmount.value);
      } else {
        for (const li of txn.orderLineItems || []) {
          for (const fee of li.marketplaceFees || []) {
            if (fee.amount?.value) fees += parseFloat(fee.amount.value);
          }
        }
      }
    }

    return { earnings: +(gross - fees).toFixed(2), currency: currency || "GBP" };
  } catch (err) {
    return null;
  }
}

// Fetch unshipped orders, enriched with product images and real earnings.
export async function fetchUnshippedOrders(accessToken, appAccessToken) {
  const params = new URLSearchParams({
    filter: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}",
    limit: "50",
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

  const baseOrders = (data.orders || []).map((order) => {
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

  return enrichedOrders;
}
