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

// ---- AliExpress tracking ------------------------------------------------------
// The order list shows a "Track status" link for orders that have tracking. For orders that are
// synced to the dashboard, that link is opened in a background tab, the tracking page's content
// script reads the number, and it is uploaded to the dashboard (shown under the order's number).
const TRACK_RETRY_MS = 3 * 60 * 60 * 1000; // try an order again after 3 hours if nothing was read
const TRACK_TAB_TIMEOUT_MS = 30 * 1000;
const trackQueue = [];
const trackActive = new Set(); // orders waiting in the queue or being read right now
let trackRunning = false;
const trackTabs = new Map(); // tab id -> function that ends that job

async function getTrackState() {
  const { trackState } = await chrome.storage.local.get("trackState");
  return trackState || {};
}

async function patchTrackState(aliOrderId, patch) {
  const all = await getTrackState();
  all[aliOrderId] = { ...(all[aliOrderId] || {}), ...patch };
  await chrome.storage.local.set({ trackState: all });
}

async function uploadTracking(data) {
  const result = await api("/api/ext/tracking", { method: "POST", body: JSON.stringify(data) });
  if (result.ok) {
    await patchTrackState(data.aliOrderId, { trackingNumber: data.trackingNumber, uploadedAt: Date.now() });
  } else {
    await patchTrackState(data.aliOrderId, { attemptAt: Date.now(), lastError: result.error });
  }
  return result;
}

function openAndRead(job) {
  return new Promise((resolve) => {
    let tabId = null;
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (tabId !== null) {
        trackTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }
      resolve(ok);
    };
    const timer = setTimeout(async () => {
      await patchTrackState(job.aliOrderId, {
        attemptAt: Date.now(),
        lastError: "Nothing was read from the tracking page (it may not have finished loading, or you may need to log in to AliExpress).",
      });
      finish(false);
    }, TRACK_TAB_TIMEOUT_MS);
    chrome.tabs
      .create({ url: job.url, active: false })
      .then((tab) => {
        tabId = tab.id;
        trackTabs.set(tab.id, finish);
        if (finished) chrome.tabs.remove(tab.id).catch(() => {});
      })
      .catch(() => finish(false));
  });
}

async function runTrackQueue() {
  if (trackRunning) return;
  trackRunning = true;
  try {
    while (trackQueue.length) {
      const job = trackQueue.shift();
      await openAndRead(job);
      trackActive.delete(job.aliOrderId);
      await new Promise((r) => setTimeout(r, 1500)); // be gentle with AliExpress
    }
  } finally {
    trackRunning = false;
  }
}

async function enqueueTracking(aliOrderId, url) {
  // Only an AliExpress tracking link whose order number matches may be opened.
  if (AliSyncLib.trackingOrderIdFromUrl(url) !== String(aliOrderId)) return { ok: false, error: "Not an AliExpress tracking link" };
  const state = (await getTrackState())[aliOrderId] || {};
  if (state.uploadedAt) return { ok: true, skipped: "already uploaded" };
  if (state.attemptAt && Date.now() - state.attemptAt < TRACK_RETRY_MS) return { ok: true, skipped: "tried recently" };
  if (trackActive.has(String(aliOrderId))) return { ok: true, skipped: "already queued or open" };
  trackActive.add(String(aliOrderId));
  trackQueue.push({ aliOrderId: String(aliOrderId), url });
  runTrackQueue();
  return { ok: true, queued: true };
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

async function handle(message, sender) {
  switch (message?.type) {
    case "FETCH_TRACKING":
      return await enqueueTracking(message.aliOrderId, message.url);
    case "TRACK_STATUS": {
      // For the popup: what happened to each order's tracking, newest first.
      const all = await getTrackState();
      const list = Object.entries(all)
        .map(([aliOrderId, v]) => ({ aliOrderId, ...v }))
        .sort((a, b) => (b.uploadedAt || b.attemptAt || 0) - (a.uploadedAt || a.attemptAt || 0))
        .slice(0, 12);
      return { ok: true, list };
    }
    case "TRACK_RETRY": {
      // Let every order whose tracking was not read be tried again the next time its page is open.
      const all = await getTrackState();
      for (const v of Object.values(all)) if (!v.uploadedAt) delete v.attemptAt;
      await chrome.storage.local.set({ trackState: all });
      return { ok: true };
    }
    case "TRACKING_FOUND": {
      // Sent by the tracking page's content script, from a background tab we opened or from a
      // page the person opened themselves; both are uploaded.
      const number = AliSyncLib.cleanTrackingNumber(message.trackingNumber);
      const aliOrderId = String(message.aliOrderId || "");
      if (!number || !/^\d{12,20}$/.test(aliOrderId)) return { ok: false, error: "Nothing usable on this tracking page" };
      const result = await uploadTracking({
        aliOrderId,
        trackingNumber: number,
        carrierText: message.carrierText || "",
        statusText: message.statusText || "",
        estimateText: message.estimateText || "",
      });
      const end = sender?.tab?.id !== undefined ? trackTabs.get(sender.tab.id) : null;
      if (end) end(result.ok); // the tab we opened for this job has done its work
      return result;
    }
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
      const trackState = await getTrackState();
      const tracked = {};
      for (const [id, value] of Object.entries(trackState)) if (value.uploadedAt) tracked[id] = true;
      return {
        ok: true,
        configured: Boolean(AliSyncLib.originOf(settings.dashboardUrl) && settings.token),
        pending: await getPending(),
        synced: synced || {},
        tracked,
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
  handle(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // answer asynchronously
});
