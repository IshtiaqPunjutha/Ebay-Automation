importScripts("lib.js");

const MAX_PENDING = 30;
const PENDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || { dashboardUrl: "", token: "" };
}

// eBay orders opened from the dashboard that are waiting for an AliExpress order number.
async function getPending() {
  const { pending } = await chrome.storage.local.get("pending");
  const now = Date.now();
  return (pending || []).filter((p) => now - p.addedAt < PENDING_TTL_MS);
}

async function savePending(list) {
  await chrome.storage.local.set({ pending: list.slice(0, MAX_PENDING) });
}

async function addPending(entry) {
  const list = (await getPending()).filter((p) => !(p.orderId === entry.orderId && p.storeId === entry.storeId));
  list.unshift({ ...entry, addedAt: Date.now() });
  await savePending(list);
}

async function removePending(orderId, storeId) {
  await savePending((await getPending()).filter((p) => !(p.orderId === orderId && p.storeId === storeId)));
}

async function api(path, options = {}) {
  const { dashboardUrl, token } = await getSettings();
  const origin = AliSyncLib.originOf(dashboardUrl);
  if (!origin || !token) {
    return { ok: false, error: "Add your dashboard address and token in the extension first." };
  }
  try {
    const res = await fetch(`${origin}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { ok: false, error: "The token was not accepted. Create a new one in the dashboard." };
    if (!res.ok) return { ok: false, error: data.error || `Dashboard error (${res.status})` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: "Could not reach the dashboard. Check the address and your connection." };
  }
}

// The dashboard is the source of truth for "which AliExpress numbers are on which eBay order".
// The list kept in this browser can go stale (a number removed or added in the dashboard), so it
// is compared with the dashboard from time to time. Stores that cannot be reached keep their old entries.
let lastReconcile = 0;
const RECONCILE_EVERY_MS = 20 * 1000;

async function reconcileSynced(force = false) {
  if (!force && Date.now() - lastReconcile < RECONCILE_EVERY_MS) return;
  lastReconcile = Date.now();

  const stores = await api("/api/ext/stores");
  if (!stores.ok) return;

  const covered = new Set();
  const truth = {};
  await Promise.all(
    (stores.data.stores || []).map(async (store) => {
      const res = await api(`/api/ext/refs?store=${encodeURIComponent(store.storeId)}`);
      if (!res.ok) return;
      covered.add(store.storeId);
      for (const [orderId, entry] of Object.entries(res.data.refs || {})) {
        for (const aliOrderId of entry.aliOrderIds || []) {
          truth[aliOrderId] = { orderId, storeId: store.storeId, at: entry.updatedAt || Date.now() };
        }
      }
    })
  );

  const { synced } = await chrome.storage.local.get("synced");
  const next = {};
  for (const [id, value] of Object.entries(synced || {})) {
    if (!covered.has(value.storeId)) next[id] = value;
  }
  Object.assign(next, truth);
  await chrome.storage.local.set({ synced: next });
}

// eBay orders that still need an AliExpress number, asked of the dashboard for every
// connected store. Kept for a short while so pressing Sync on several orders in a row
// does not ask eBay each time.
let candidateCache = null;
const CANDIDATE_TTL_MS = 45 * 1000;

async function getCandidates() {
  if (candidateCache && Date.now() - candidateCache.at < CANDIDATE_TTL_MS) return candidateCache.result;

  const stores = await api("/api/ext/stores");
  if (!stores.ok) return stores;

  const lists = await Promise.all(
    (stores.data.stores || []).map(async (store) => ({
      store,
      res: await api(`/api/ext/orders?store=${encodeURIComponent(store.storeId)}`),
    }))
  );

  const candidates = [];
  const errors = [];
  for (const { store, res } of lists) {
    if (!res.ok) {
      errors.push(`${store.label}: ${res.error}`);
      continue;
    }
    for (const order of res.data.orders || []) {
      candidates.push({
        storeId: store.storeId,
        storeLabel: store.label,
        orderId: order.orderId,
        buyer: order.buyer || "",
        title: order.title || "",
        items: order.items || [],
        aliItemIds: order.aliItemIds || [],
        addedAt: Date.parse(order.orderDate) || 0,
      });
    }
  }
  // The stores this token may use (a token made for one store lists just that store).
  const result = { ok: true, candidates, errors, storeIds: (stores.data.stores || []).map((s) => s.storeId) };
  candidateCache = { at: Date.now(), result };
  return result;
}

async function handle(message) {
  switch (message?.type) {
    case "GET_CANDIDATES":
      return await getCandidates();
    case "ADD_PENDING":
      await addPending({
        orderId: String(message.orderId),
        storeId: String(message.storeId),
        aliItemId: message.aliItemId || "",
        aliUrl: message.aliUrl || "",
      });
      return { ok: true };
    case "GET_PENDING":
      return { ok: true, pending: await getPending() };
    case "REMOVE_PENDING":
      await removePending(String(message.orderId), String(message.storeId));
      return { ok: true };
    case "GET_STATE": {
      try {
        await reconcileSynced();
      } catch (e) {
        // Offline or the dashboard is down: keep showing what was last known.
      }
      const settings = await getSettings();
      const { synced } = await chrome.storage.local.get("synced");
      return {
        ok: true,
        configured: Boolean(AliSyncLib.originOf(settings.dashboardUrl) && settings.token),
        pending: await getPending(),
        synced: synced || {},
      };
    }
    case "TEST":
      return await api("/api/ext/stores");
    case "UNSYNC": {
      // Undo: take the number back off the eBay order in the dashboard.
      const result = await api("/api/ext/orderref", {
        method: "DELETE",
        body: JSON.stringify({ storeId: message.storeId, orderId: message.orderId, aliOrderId: message.aliOrderId }),
      });
      if (result.ok) {
        const { synced } = await chrome.storage.local.get("synced");
        const next = { ...(synced || {}) };
        delete next[message.aliOrderId];
        await chrome.storage.local.set({ synced: next });
        candidateCache = null;
        lastReconcile = 0;
      }
      return result;
    }
    case "SYNC": {
      const result = await api("/api/ext/orderref", {
        method: "POST",
        body: JSON.stringify({
          storeId: message.storeId,
          orderId: message.orderId,
          aliOrderId: message.aliOrderId,
        }),
      });
      if (result.ok) {
        const { synced } = await chrome.storage.local.get("synced");
        const next = { ...(synced || {}), [message.aliOrderId]: { orderId: message.orderId, storeId: message.storeId, at: Date.now() } };
        await chrome.storage.local.set({ synced: next });
        await removePending(message.orderId, message.storeId);
        candidateCache = null; // the dashboard's list has changed
      }
      return result;
    }
    default:
      return { ok: false, error: "Unknown request" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // answer asynchronously
});
