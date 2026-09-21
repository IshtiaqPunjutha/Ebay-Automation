// lib/ebay.js
// All the direct interaction with eBay's OAuth + Fulfillment API lives here,
// isolated from the Next.js routes, so it's easy to find and update if eBay
// changes anything on their side later.

const isSandbox = process.env.EBAY_ENV === "sandbox";

const AUTH_BASE = isSandbox
  ? "https://auth.sandbox.ebay.com"
  : "https://auth.ebay.com";

const API_BASE = isSandbox
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

// The Identity API lives on a different host (apiz, not api).
const IDENTITY_BASE = isSandbox
  ? "https://apiz.sandbox.ebay.com"
  : "https://apiz.ebay.com";

// sell.fulfillment = read/manage orders.
// commerce.identity.readonly = lets us ask "whose account is this?" so we
// can label each connected store on the dashboard (e.g. by username).
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
].join(" ");

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const asNumber = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(asNumber) ? asNumber : 0;
}

function getNestedAmount(obj) {
  if (!obj || typeof obj !== "object") return 0;
  const rawValue = obj.value ?? obj.amount ?? obj.total ?? obj.price ?? 0;
  return normalizeAmount(rawValue);
}

function getOrderTotal(order) {
  const explicitTotal =
    order?.pricingSummary?.total ||
    order?.pricingSummary?.priceSubtotal ||
    order?.pricingSummary?.amount ||
    order?.amount ||
    order?.total?.amount ||
    order?.totalAmount ||
    null;

  if (explicitTotal) {
    return getNestedAmount(explicitTotal);
  }

  const lineItemTotal = (order?.lineItems || []).reduce((sum, lineItem) => {
    const unitPrice = getNestedAmount(lineItem?.price || lineItem?.unitPrice || lineItem?.total || null);
    const quantity = Number(lineItem?.quantity || 1);
    return sum + unitPrice * quantity;
  }, 0);

  return lineItemTotal;
}

function getOrderCurrency(order) {
  return (
    order?.pricingSummary?.total?.currency ||
    order?.pricingSummary?.priceSubtotal?.currency ||
    order?.amount?.currency ||
    order?.total?.amount?.currency ||
    order?.currency ||
    "GBP"
  );
}

export function estimateOrderEarnings(orderTotal) {
  const value = Number(orderTotal) || 0;
  const transactionFee = value * 0.12;
  const adFee = value * 0.15;
  const handlingCost = Math.max(0.5, value * 0.1);
  return Math.max(0, value - transactionFee - adFee - handlingCost);
}

export function buildAliExpressSearchUrl(title, maxPrice, currency = "GBP") {
  const suggestions = buildAliExpressProductSuggestions(title, maxPrice, currency);
  return suggestions[0]?.url || "https://www.aliexpress.com/wholesale";
}

export function buildAliExpressProductSuggestions(title, maxPrice, currency = "GBP") {
  const baseTitle = (title || "")
    .replace(/\s+/g, " ")
    .trim();

  const words = (baseTitle || "product")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["with", "for", "the", "and", "your", "this", "that"].includes(word));

  const priorityWords = words.slice(0, 5);
  const query = priorityWords.length ? priorityWords.join(" ") : (baseTitle || "product").slice(0, 40);
  const querySlug = query.replace(/\s+/g, "-");
  const target = Number(maxPrice) || 0;
  const formattedTarget = Number.isFinite(target) ? target.toFixed(2) : "0.00";
  const scoreBase = Math.min(95, 60 + priorityWords.length * 8);
  const priceScore = target > 0 ? Math.max(0, 100 - (target / Math.max(1, target + 1)) * 20) : 90;
  const score = Math.min(99, Math.round((scoreBase + priceScore) / 2));

  const productListBase = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(querySlug)}.html`;
  const directSearchBase = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(query)}`;
  const moneyCap = encodeURIComponent(`${formattedTarget} ${currency}`);

  const suggestions = [
    {
      label: "Best match",
      score,
      url: `${productListBase}?SearchText=${encodeURIComponent(query)}&Sort=price_asc&maxPrice=${moneyCap}`,
      reason: "Best title fit + target under your earnings",
    },
    {
      label: "Alternative",
      score: Math.max(75, score - 8),
      url: `${directSearchBase}&Sort=orders_desc&maxPrice=${moneyCap}`,
      reason: "Good title overlap with stronger seller history",
    },
    {
      label: "Budget pick",
      score: Math.max(70, score - 12),
      url: `${directSearchBase}&Sort=price_asc&minPrice=0&maxPrice=${moneyCap}`,
      reason: "Lowest-price option within your target",
    },
  ];

  return suggestions;
}

function getPhoneNumber(shipTo, contact) {
  return (
    shipTo?.phoneNumber ||
    shipTo?.primaryPhone?.phoneNumber ||
    shipTo?.contactAddress?.phoneNumber ||
    contact?.phoneNumber ||
    contact?.phone ||
    null
  );
}

function getImageUrl(item) {
  const candidates = [
    item?.image,
    item?.imageUrl,
    item?.thumbnailImage,
    item?.images,
    item?.images?.[0],
    item?.lineItemImage,
    item?.listingImage,
    item?.image?.url,
    item?.image?.imageUrl,
    item?.image?.src,
    item?.imageUrl?.url,
    item?.imageUrl?.imageUrl,
    item?.lineItemImage?.url,
    item?.listingImage?.imageUrl,
    item?.thumbnailImage?.url,
    item?.image?.[0],
    item?.thumbnailImage?.[0],
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      for (const nested of candidate) {
        const nestedUrl = nested && typeof nested === "object"
          ? nested.url || nested.imageUrl || nested.src || nested.href || nested.source || null
          : typeof nested === "string" ? nested : null;
        if (nestedUrl) return nestedUrl;
      }
    }

    if (typeof candidate === "string") return candidate;

    if (typeof candidate === "object") {
      const url =
        candidate.url ||
        candidate.imageUrl ||
        candidate.href ||
        candidate.src ||
        candidate.source ||
        candidate.webp ||
        candidate.jpg ||
        candidate.original ||
        null;
      if (url) return url;
    }
  }

  return null;
}

function getCallbackUrl() {
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  return new URL("/api/ebay/callback", baseUrl).toString();
}

// Step 2 of the OAuth flow: build the URL we send the seller to.
export function getEbayAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: SCOPES,
    state, // used to prevent CSRF - we generate + check this
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
      redirect_uri: getCallbackUrl(),
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
    expiresIn: data.expires_in, // seconds, usually ~7200
    obtainedAt: Date.now(),
  };
}

// Step 5: silently get a new access token using the stored refresh token.
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

export function isTokenExpired(tokenRecord) {
  if (!tokenRecord?.accessToken) return true;
  const ageMs = Date.now() - tokenRecord.obtainedAt;
  const bufferMs = 2 * 60 * 1000; // refresh 2 min early to be safe
  return ageMs > tokenRecord.expiresIn * 1000 - bufferMs;
}

// After connecting, we call this once to find out *whose* eBay account we
// just connected, so the dashboard can label it (e.g. "Connected: johns_store")
// instead of just showing an anonymous blob of tokens.
export async function fetchEbayIdentity(accessToken) {
  try {
    const res = await fetch(`${IDENTITY_BASE}/commerce/identity/v1/user/`, {
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

// Fetch unshipped orders via the Fulfillment API and shape them into
// exactly the fields our dashboard needs.
export async function fetchUnshippedOrders(accessToken) {
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

  const orders = (data.orders || []).map((order) => {
    const buyer = order.buyer || {};
    const shipTo =
      order.fulfillmentStartInstructions?.[0]?.shippingStep
        ?.shipTo || {};
    const contact = shipTo.contactAddress || {};

    const lineItems = (order.lineItems || []).map((li) => {
      // Pull color/size style options if present
      const variants = {};
      (li.lineItemProperties || li.variationAspects || []).forEach(
        (prop) => {
          if (prop.name && prop.value) variants[prop.name] = prop.value;
        }
      );

      return {
        lineItemId: li.lineItemId,
        title: li.title,
        imageUrl: getImageUrl(li),
        sku: li.sku || null,
        quantity: li.quantity,
        variants, // e.g. { Color: "Red", Size: "M" }
      };
    });

    const totalUnits = lineItems.reduce(
      (sum, li) => sum + (Number(li.quantity) || 0),
      0
    );
    const orderTotal = getOrderTotal(order);
    const currency = getOrderCurrency(order);
    const phone = getPhoneNumber(shipTo, contact);

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
        phone,
      },
      lineItems,
      fulfillmentStatus: order.orderFulfillmentStatus,
      itemCount: totalUnits,
      orderTotal,
      currency,
    };
  });

  return orders;
}
