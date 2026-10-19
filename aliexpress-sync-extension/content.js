// Runs on AliExpress pages. Two jobs:
//  1. When a product page was opened from the dashboard (?ebayOrder=...&ebayStore=...),
//     remember which eBay order it is being bought for.
//  2. On AliExpress order pages, show a small "Sync to dashboard" panel that sends an
//     AliExpress order number to the matching eBay order.
(function () {
  const lib = globalThis.AliSyncLib;
  if (!lib || !globalThis.chrome?.runtime?.id) return;

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false, error: "Extension unavailable" }));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- 1. Link a product page to an eBay order --------------------------------
  const params = new URLSearchParams(location.search);
  const ebayOrder = params.get("ebayOrder");
  const ebayStore = params.get("ebayStore");
  if (ebayOrder && ebayStore) {
    send({
      type: "ADD_PENDING",
      orderId: ebayOrder,
      storeId: ebayStore,
      aliItemId: lib.itemIdFromUrl(location.pathname),
      aliUrl: location.origin + location.pathname,
    }).then(() => toast(`Linked to eBay order ${ebayOrder}. After you pay, open your AliExpress orders and press Sync.`));
    // Keep the address bar clean.
    params.delete("ebayOrder");
    params.delete("ebayStore");
    const query = params.toString();
    history.replaceState(history.state, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }

  // ---- 2. Panel on order pages ------------------------------------------------
  let host = null;
  let root = null;

  function ensureHost() {
    if (host && host.isConnected) return root;
    host = document.createElement("div");
    host.id = "ebay-dashboard-sync-host";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Arial, sans-serif; }
      .card { width: 330px; max-width: calc(100vw - 32px); background: #fff; color: #18181b; border: 1px solid #d4d4d8; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.22); font-size: 13px; overflow: hidden; }
      .head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #2a78d6; color: #fff; cursor: pointer; font-weight: 600; }
      .body { padding: 10px 12px; max-height: 60vh; overflow: auto; }
      .row { padding: 8px 0; border-bottom: 1px solid #eee; }
      .row:last-child { border-bottom: none; }
      .num { font-family: ui-monospace, Consolas, monospace; font-size: 12px; font-weight: 600; }
      select, input { width: 100%; margin-top: 6px; padding: 6px 8px; border: 1px solid #d4d4d8; border-radius: 8px; font-size: 12px; background: #fff; color: #18181b; }
      button.sync { margin-top: 6px; width: 100%; padding: 7px; border: none; border-radius: 8px; background: #2a78d6; color: #fff; font-weight: 600; cursor: pointer; }
      button.sync:disabled { opacity: .55; cursor: default; }
      .ok { color: #0a860a; font-weight: 600; margin-top: 4px; }
      .err { color: #d03b3b; margin-top: 4px; }
      .muted { color: #71717a; font-size: 12px; }
      .hint { color: #71717a; font-size: 12px; margin-top: 4px; }
    </style><div class="card"><div class="head" id="head"><span>Sync to dashboard</span><span id="count"></span></div><div class="body" id="body"></div></div>`;
    document.documentElement.appendChild(host);
    root.getElementById("head").addEventListener("click", () => {
      state.open = !state.open;
      render();
    });
    root.getElementById("body").addEventListener("click", onBodyClick);
    root.getElementById("body").addEventListener("change", onBodyChange);
    return root;
  }

  const state = {
    open: true,
    configured: true,
    pending: [],
    synced: {},
    items: [], // { id, itemIds }
    selection: {}, // aliOrderId -> "storeId|orderId"
    status: {}, // aliOrderId -> { busy, error }
    manual: "",
  };

  function pendingKey(p) {
    return `${p.storeId}|${p.orderId}`;
  }

  // Product ids shown next to an order number, used to match it to the right eBay order.
  function itemIdsNear(orderId) {
    const found = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.includes(orderId)) continue;
      let el = node.parentElement;
      for (let depth = 0; el && depth < 10; depth += 1, el = el.parentElement) {
        // Once the container holds more than one order number it is the whole list,
        // not this order's card; its products would belong to other orders too.
        if (lib.orderIdsFromText(el.innerText || "").length > 1) break;
        const links = [...el.querySelectorAll("a[href]")].map((a) => lib.itemIdFromUrl(a.href)).filter(Boolean);
        if (links.length) {
          links.forEach((id) => found.add(id));
          break;
        }
      }
      break;
    }
    return [...found];
  }

  function scan() {
    if (!document.body) return;
    const ids = [...new Set([...lib.orderIdsFromUrl(location.search), ...lib.orderIdsFromText(document.body.innerText)])].slice(0, 30);
    const manualIds = state.items.filter((i) => i.manual).map((i) => i.id);
    const all = [...new Set([...ids, ...manualIds])];
    state.items = all.map((id) => ({ id, manual: manualIds.includes(id) && !ids.includes(id), itemIds: itemIdsNear(id) }));
    // Pre-select the best eBay order for each AliExpress order, unless the user already chose.
    for (const item of state.items) {
      if (state.selection[item.id]) continue;
      const pick = lib.pickPending(state.pending, item.itemIds);
      if (pick) state.selection[item.id] = pendingKey(pick.entry);
    }
    render();
  }

  async function refreshState() {
    const res = await send({ type: "GET_STATE" });
    if (res?.ok) {
      state.configured = res.configured;
      state.pending = res.pending;
      state.synced = res.synced;
    }
  }

  function render() {
    const r = ensureHost();
    const body = r.getElementById("body");
    r.getElementById("count").textContent = state.open ? "–" : `${state.items.length} order${state.items.length === 1 ? "" : "s"}`;
    body.style.display = state.open ? "block" : "none";
    if (!state.open) return;

    if (!state.configured) {
      body.innerHTML = `<div class="muted">Open the extension (puzzle icon, then AliExpress Sync) and enter your dashboard address and token first.</div>`;
      return;
    }

    let html = "";
    if (state.items.length === 0) {
      html += `<div class="muted">No AliExpress "Ref. Number" found on this page yet. Scroll the orders into view, or add the number below.</div>`;
    }
    for (const item of state.items) {
      const done = state.synced[item.id];
      const st = state.status[item.id] || {};
      html += `<div class="row"><div class="num">${esc(item.id)}</div>`;
      if (done) {
        html += `<div class="ok">Synced to eBay order ${esc(done.orderId)}</div>`;
      } else if (state.pending.length === 0) {
        html += `<div class="hint">Open the product from the dashboard's AliExpress arrow so it knows which eBay order this is for.</div>`;
      } else {
        const selected = state.selection[item.id];
        const byProduct = lib.pickPending(state.pending, item.itemIds)?.byProduct;
        html += `<select data-id="${esc(item.id)}">${state.pending
          .map((p) => `<option value="${esc(pendingKey(p))}" ${pendingKey(p) === selected ? "selected" : ""}>eBay ${esc(p.orderId)}</option>`)
          .join("")}</select>`;
        if (byProduct && selected && selected === pendingKey(lib.pickPending(state.pending, item.itemIds).entry)) {
          html += `<div class="hint">Matched by product.</div>`;
        }
        html += `<button class="sync" data-sync="${esc(item.id)}" ${st.busy ? "disabled" : ""}>${st.busy ? "Syncing…" : "Sync to dashboard"}</button>`;
        if (st.error) html += `<div class="err">${esc(st.error)}</div>`;
      }
      html += `</div>`;
    }
    html += `<div class="row"><div class="muted">Number not listed? Add it:</div><input id="manual" placeholder="AliExpress order number" value="${esc(state.manual)}" /></div>`;
    body.innerHTML = html;
    const manual = body.querySelector("#manual");
    if (manual) {
      manual.addEventListener("input", () => (state.manual = manual.value));
      manual.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const id = manual.value.trim();
        if (/^\d{12,20}$/.test(id)) {
          state.items.push({ id, manual: true, itemIds: [] });
          state.manual = "";
          scan();
        }
      });
    }
  }

  async function onBodyClick(e) {
    const id = e.target?.dataset?.sync;
    if (!id) return;
    const selected = state.selection[id] || (root.querySelector(`select[data-id="${CSS.escape(id)}"]`)?.value ?? "");
    const [storeId, ...rest] = selected.split("|");
    const orderId = rest.join("|");
    if (!storeId || !orderId) return;
    state.status[id] = { busy: true };
    render();
    const res = await send({ type: "SYNC", storeId, orderId, aliOrderId: id });
    state.status[id] = res?.ok ? {} : { error: res?.error || "Could not sync." };
    await refreshState();
    render();
  }

  function onBodyChange(e) {
    const id = e.target?.dataset?.id;
    if (id) state.selection[id] = e.target.value;
  }

  // ---- small page toast -----------------------------------------------------------
  function toast(text) {
    const show = () => {
      const t = document.createElement("div");
      t.textContent = text;
      t.style.cssText =
        "position:fixed;top:16px;right:16px;max-width:340px;z-index:2147483647;padding:10px 14px;border-radius:8px;background:#202124;color:#fff;border-left:4px solid #188038;font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)";
      document.documentElement.appendChild(t);
      setTimeout(() => t.remove(), 6000);
    };
    if (document.documentElement) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }

  // AliExpress is a single-page app: moving from the home page to "My orders" does not
  // reload the page, so the address is checked again each time instead of only once.
  const onOrderPage = () => /order/i.test(location.pathname) || lib.orderIdsFromUrl(location.search).length > 0;

  function hidePanel() {
    if (host && host.isConnected) host.remove();
  }

  let timer = null;
  let lastHref = "";
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!onOrderPage()) return hidePanel();
      await refreshState();
      scan();
    }, 1200);
  }

  function start() {
    lastHref = location.href;
    schedule();
    // Order lists load their content late; rescan when the page changes.
    new MutationObserver(() => {
      if (onOrderPage()) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    // Notice in-app navigation (no reload) to or from an order page.
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        schedule();
      }
    }, 800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
