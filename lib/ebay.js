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

// Step 2 of the OAuth flow: build the URL we send the seller to.
export function getEbayAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID,
    redirect_uri: process.env.EBAY_RUNAME,
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
        sku: li.sku || null,
        quantity: li.quantity,
        variants, // e.g. { Color: "Red", Size: "M" }
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
    };
  });

  return orders;
}
