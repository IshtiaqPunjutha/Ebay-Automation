// Runs on AliExpress pages. Two jobs:
//  1. When a product page was opened from the dashboard (?ebayOrder=...&ebayStore=...),
//     remember which eBay order it is being bought for.
//  2. On AliExpress order pages, put a small "Sync" button right next to each order's
//     "Ref. Number" that sends that number to the matching eBay order in the dashboard.
// Everything is built with DOM calls (no innerHTML) so strict page policies cannot block it.
(function () {
  const lib = globalThis.AliSyncLib;
  if (!lib || !globalThis.chrome?.runtime?.id) return;

  const VERSION = chrome.runtime.getManifest?.().version || "";
  console.info(`[AliExpress Sync ${VERSION}] active on`, location.pathname);

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false, error: "Extension unavailable" }));

  // ---- small helpers -----------------------------------------------------------
  function el(tag, props = {}, style = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (style) node.style.cssText = style;
    return node;
  }

  function toast(text, isError = false) {
    const show = () => {
      const t = el(
        "div",
        { textContent: text },
        `position:fixed;top:16px;right:16px;max-width:360px;z-index:2147483647;padding:10px 14px;border-radius:8px;background:#202124;color:#fff;border-left:4px solid ${isError ? "#d93025" : "#188038"};font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)`
      );
      document.documentElement.appendChild(t);
      setTimeout(() => t.remove(), 6500);
    };
    if (document.documentElement) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }

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

  // ---- 2. "Sync" buttons next to each Ref. Number -----------------------------
  const BTN_ATTR = "data-ebay-sync";
  const BTN_STYLE =
    "margin-left:10px;padding:2px 10px;border:none;border-radius:12px;background:#2a78d6;color:#fff;font:600 12px/18px Arial,sans-serif;cursor:pointer;vertical-align:middle;white-space:nowrap;";

  const state = { pending: [], synced: {}, configured: true };

  async function refreshState() {
    const res = await send({ type: "GET_STATE" });
    if (res?.ok) {
      state.pending = res.pending;
      state.synced = res.synced;
      state.configured = res.configured;
    }
  }

  const onOrderPage = () => /order/i.test(location.pathname) || lib.orderIdsFromUrl(location.search).length > 0;

  // The smallest elements whose text holds an order number, e.g. the
  // <div>Ref. Number : 3077062172300812<span>Copy</span></div> of an order card.
  function findRefElements() {
    const found = [];
    for (const node of document.body.querySelectorAll("div, span, p, li")) {
      if (node.closest(`[${BTN_ATTR}]`)) continue;
      const text = node.textContent || "";
      if (text.length > 90) continue;
      const ids = lib.orderIdsFromText(text);
      if (ids.length !== 1) continue;
      // Skip containers whose child already holds the number; keep the innermost one.
      if ([...node.children].some((child) => lib.orderIdsFromText(child.textContent || "").length === 1)) continue;
      found.push({ node, id: ids[0] });
    }
    return found;
  }

  // Product ids of the order card that this number belongs to.
  function itemIdsNear(node) {
    const found = new Set();
    let box = node;
    for (let depth = 0; box && depth < 12; depth += 1, box = box.parentElement) {
      // Once the container holds more than one order number it is the whole list.
      if (lib.orderIdsFromText(box.innerText || "").length > 1) break;
      const links = [...box.querySelectorAll("a[href]")].map((a) => lib.itemIdFromUrl(a.href)).filter(Boolean);
      if (links.length) {
        links.forEach((id) => found.add(id));
        break;
      }
    }
    return [...found];
  }

  function paint(button, id) {
    const done = state.synced[id];
    // Only touch the DOM when something changed, or the page observer would see our own edit and rescan forever.
    const label = done ? "Synced ✓" : "Sync";
    if (button.textContent !== label) button.textContent = label;
    button.title = done ? `Synced to eBay order ${done.orderId}` : "Send this number to your dashboard";
    button.style.cssText = done ? BTN_STYLE + "background:#188038;" : BTN_STYLE;
  }

  let openMenu = null;
  function closeMenu() {
    if (openMenu) openMenu.remove();
    openMenu = null;
  }

  function chooseOrder(button, choices, onPick) {
    closeMenu();
    const rect = button.getBoundingClientRect();
    const menu = el(
      "div",
      {},
      `position:fixed;left:${Math.max(8, Math.min(rect.left, innerWidth - 270))}px;top:${rect.bottom + 6}px;width:260px;z-index:2147483647;background:#fff;color:#18181b;border:1px solid #d4d4d8;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:13px Arial,sans-serif;overflow:hidden;`
    );
    menu.appendChild(el("div", { textContent: "Which eBay order is this for?" }, "padding:8px 10px;font-weight:600;border-bottom:1px solid #eee;"));
    for (const choice of choices) {
      const row = el(
        "button",
        { type: "button", textContent: `eBay ${choice.entry.orderId}${choice.hint ? ` (${choice.hint})` : ""}` },
        "display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:#fff;color:#18181b;font:13px Arial,sans-serif;cursor:pointer;"
      );
      row.addEventListener("mouseenter", () => (row.style.background = "#f4f4f5"));
      row.addEventListener("mouseleave", () => (row.style.background = "#fff"));
      row.addEventListener("click", () => {
        closeMenu();
        onPick(choice.entry);
      });
      menu.appendChild(row);
    }
    document.documentElement.appendChild(menu);
    openMenu = menu;
  }

  async function sync(button, id, node, entry) {
    button.textContent = "Syncing…";
    button.disabled = true;
    const res = await send({ type: "SYNC", storeId: entry.storeId, orderId: entry.orderId, aliOrderId: id });
    button.disabled = false;
    if (res?.ok) {
      await refreshState();
      paint(button, id);
      toast(`Synced ${id} to eBay order ${entry.orderId}.`);
    } else {
      paint(button, id);
      toast(res?.error || "Could not sync this number.", true);
    }
  }

  async function onClick(button, id, node) {
    if (state.synced[id]) return;
    await refreshState();
    if (!state.configured) {
      return toast("Open the extension (puzzle icon, AliExpress Sync) and enter your dashboard address and token first.", true);
    }
    if (state.pending.length === 0) {
      return toast("Open this product from the dashboard's AliExpress arrow first, so the extension knows which eBay order it is for.", true);
    }
    const itemIds = itemIdsNear(node);
    const pick = lib.pickPending(state.pending, itemIds);
    // Sure enough to sync straight away: matched by product, or only one order is waiting.
    if (pick.byProduct || state.pending.length === 1) return sync(button, id, node, pick.entry);
    const newest = pick.entry;
    const choices = [...state.pending]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((entry) => ({ entry, hint: entry === newest ? "newest" : "" }));
    chooseOrder(button, choices, (entry) => sync(button, id, node, entry));
  }

  function addButtons() {
    if (!document.body) return;
    // One cheap pass over the page text first; the element search below is only worth it when a number exists.
    if (lib.orderIdsFromText(document.body.innerText).length === 0) return;
    for (const { node, id } of findRefElements()) {
      const existing = node.querySelector(`[${BTN_ATTR}]`);
      if (existing) {
        if (existing.getAttribute(BTN_ATTR) === id) {
          paint(existing, id);
          continue;
        }
        existing.remove(); // the page reused this element for another order
      }
      const button = el("button", { type: "button" });
      button.setAttribute(BTN_ATTR, id);
      paint(button, id);
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(button, id, node);
      });
      node.appendChild(button);
    }
  }

  function removeButtons() {
    closeMenu();
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach((b) => b.remove());
  }

  // AliExpress is a single-page app: moving to "My orders" does not reload the page, and the
  // list fills in late, so the page is rescanned when it changes and when the address changes.
  let timer = null;
  let lastHref = "";
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        if (!onOrderPage()) return removeButtons();
        await refreshState();
        addButtons();
      } catch (err) {
        console.error("[AliExpress Sync] scan failed:", err);
      }
    }, 900);
  }

  function start() {
    lastHref = location.href;
    schedule();
    new MutationObserver(() => {
      if (onOrderPage()) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        schedule();
      }
    }, 800);
    document.addEventListener("mousedown", (e) => {
      if (openMenu && !openMenu.contains(e.target)) closeMenu();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
