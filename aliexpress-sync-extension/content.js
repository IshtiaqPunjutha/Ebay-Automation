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

  // When the extension is reloaded or updated, scripts already running in open tabs lose their
  // connection to it (chrome.runtime disappears). Detect that, stop quietly, and ask for a refresh
  // instead of throwing errors on every scan.
  const BTN_ATTR = "data-ebay-sync";
  let dead = false;
  let timer = null;
  let poll = null;
  let observer = null;
  const alive = () => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (e) {
      return false;
    }
  };
  function die() {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    clearInterval(poll);
    observer?.disconnect();
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach((b) => b.remove());
    toast("AliExpress Sync was updated or reloaded. Refresh this page (F5) to use it again.", true);
  }

  const send = async (message) => {
    if (dead) return { ok: false, error: "Refresh this page: the extension was reloaded." };
    if (!alive()) {
      die();
      return { ok: false, error: "Refresh this page: the extension was reloaded." };
    }
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      if (!alive()) die();
      return { ok: false, error: "Extension unavailable" };
    }
  };

  // ---- small helpers -----------------------------------------------------------
  function el(tag, props = {}, style = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (style) node.style.cssText = style;
    return node;
  }

  // Messages stack in the top right corner instead of covering each other. An optional
  // action (such as Undo) shows as a small button inside the message.
  function toast(text, isError = false, actionOrActions = null) {
    const actions = actionOrActions ? [].concat(actionOrActions) : [];
    const action = actions.length ? actions[0] : null;
    const show = () => {
      let box = document.getElementById("ebay-sync-toasts");
      if (!box) {
        box = el(
          "div",
          { id: "ebay-sync-toasts" },
          "position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;"
        );
        document.documentElement.appendChild(box);
      }
      const t = el(
        "div",
        {},
        `max-width:360px;padding:10px 14px;border-radius:8px;background:#202124;color:#fff;border-left:4px solid ${isError ? "#d93025" : "#188038"};font:13px/1.4 Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto;`
      );
      t.appendChild(el("div", { textContent: text }));
      for (const act of actions) {
        const button = el(
          "button",
          { type: "button", textContent: act.label },
          "margin:6px 6px 0 0;padding:3px 12px;border:1px solid #8ab4f8;border-radius:12px;background:transparent;color:#8ab4f8;font:600 12px Arial,sans-serif;cursor:pointer;"
        );
        button.addEventListener("click", () => {
          t.remove();
          act.onClick();
        });
        t.appendChild(button);
      }
      box.appendChild(t);
      setTimeout(() => t.remove(), action ? 12000 : 6500);
    };
    if (document.documentElement) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }

  // ---- 1. Link a product page to an eBay order --------------------------------
  const params = new URLSearchParams(location.search);
  const ebayOrder = params.get("ebayOrder");
  const ebayStore = params.get("ebayStore");
  const ebayLine = params.get("ebayLine") || "";
  if (ebayOrder && ebayStore) {
    send({
      type: "ADD_PENDING",
      orderId: ebayOrder,
      storeId: ebayStore,
      lineItemId: ebayLine,
      aliItemId: lib.itemIdFromUrl(location.pathname),
      aliUrl: location.origin + location.pathname,
    }).then(() => toast(`Linked to eBay order ${ebayOrder}. After you pay, open your AliExpress orders and press Sync.`));
    // Keep the address bar clean.
    params.delete("ebayOrder");
    params.delete("ebayStore");
    params.delete("ebayLine");
    const query = params.toString();
    history.replaceState(history.state, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }

  // ---- 2. "Sync" buttons next to each Ref. Number -----------------------------
  const BTN_STYLE =
    "margin-left:10px;padding:2px 10px;border:none;border-radius:12px;background:#2a78d6;color:#fff;font:600 12px/18px Arial,sans-serif;cursor:pointer;vertical-align:middle;white-space:nowrap;";

  const state = { pending: [], synced: {}, tracked: {}, costed: {}, configured: true };

  async function refreshState() {
    const res = await send({ type: "GET_STATE" });
    if (res?.ok) {
      state.pending = res.pending;
      state.synced = res.synced;
      state.tracked = res.tracked || {};
      state.costed = res.costed || {};
      state.configured = res.configured;
    }
  }

  const isTrackingPage = () => /\/p\/tracking\//i.test(location.pathname);
  const onOrderPage = () => !isTrackingPage() && (/order/i.test(location.pathname) || lib.orderIdsFromUrl(location.search).length > 0);

  // ---- 3. Tracking numbers ------------------------------------------------------
  // On the order list, orders that have tracking show a "Track status" link. For orders that are
  // synced to the dashboard and whose tracking has not been read yet, ask the background worker
  // to open that link in a background tab; the tracking page itself (below) reads the number.
  const askedForTracking = new Set();
  function requestTracking(refs) {
    for (const link of document.querySelectorAll('a[href*="/p/tracking/"]')) {
      const aliOrderId = lib.trackingOrderIdFromUrl(link.href);
      if (!aliOrderId || !state.synced[aliOrderId] || state.tracked[aliOrderId] || askedForTracking.has(aliOrderId)) continue;
      askedForTracking.add(aliOrderId);
      send({ type: "FETCH_TRACKING", aliOrderId, url: link.href });
    }
    // Orders without a "Track status" link on the list (delivered ones lose it) are read from their tracking page directly.
    for (const { id } of refs || []) {
      if (!state.synced[id] || state.tracked[id] || askedForTracking.has(id)) continue;
      askedForTracking.add(id);
      send({ type: "FETCH_TRACKING", aliOrderId: id, url: `https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=${encodeURIComponent(id)}` });
    }
  }

  // The first line of an element's text, e.g. "In transit" or "Delivery: Oct 28 - 30".
  const firstLine = (node) =>
    (node?.innerText || node?.textContent || "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) || "";

  // The tracking page: the number is in <span class="logistic-info-v2--mailNoValue--…"> and the
  // shipping service in <div class="logistic-info-v2--carrier--…"> (class names end in a changing
  // suffix, so they are matched by their start).
  function readTrackingPage() {
    const aliOrderId = lib.trackingOrderIdFromUrl(location.href);
    const trackingNumber = lib.cleanTrackingNumber(document.querySelector('[class*="logistic-info-v2--mailNoValue"]')?.textContent);
    if (!aliOrderId || !trackingNumber) return null;
    // "AliExpress Selection Premium shipping: InPost": the first part is the shipping service, the
    // second (…carrierValue…) the local carrier that delivers it. The carrier only appears once the
    // parcel has reached it, so it can be empty on the first reading.
    const serviceNode = document.querySelector('[class*="logistic-info-v2--carrierTitle"]');
    const carrierName = (document.querySelector('[class*="logistic-info-v2--carrierValue"]')?.textContent || "").replace(/\s+/g, " ").trim();
    // The newest event is the first node: its title ("In transit", "Delivered") and description
    // ("Package delivered.") say where the parcel is. Only a clear "Delivered" counts.
    const latestTitle = firstLine(document.querySelector('[class*="logistic-info-v2--nodeTitle"]'));
    const latestDesc = firstLine(document.querySelector('[class*="logistic-info-v2--nodeDesc"]'));
    const delivered = /^delivered\b/i.test(latestTitle) || /^(package|parcel) delivered/i.test(latestDesc);
    // Every step the page lists, newest first: "Delivered / Package delivered. / Carrier note: ... / Tue | Oct. 20 12:42".
    const events = [...document.querySelectorAll('[class*="logistic-info-v2--node--"]')]
      .slice(0, 25)
      .map((n) => ({
        title: firstLine(n.querySelector('[class*="logistic-info-v2--nodeTitle"]')),
        desc: firstLine(n.querySelector('[class*="logistic-info-v2--nodeDesc"]')),
        note: firstLine(n.querySelector('[class*="logistic-info-v2--nodeNote"]')),
        time: firstLine(n.querySelector('[class*="logistic-info-v2--nodeTime"]')),
      }))
      .filter((e) => e.title || e.desc);
    return {
      aliOrderId,
      trackingNumber,
      carrierName,
      events,
      delivered,
      deliveredTime: delivered ? firstLine(document.querySelector('[class*="logistic-info-v2--nodeTime"]')) : "",
      carrierText: (serviceNode ? firstLine(serviceNode) : firstLine(document.querySelector('[class*="logistic-info-v2--carrier"]'))).replace(/[:：]\s*$/, ""),
      statusText: firstLine(document.querySelector('[class*="logistic-info-v2--trackWrap"]')),
      estimateText: firstLine(document.querySelector('[class*="arrival-time"]')),
    };
  }

  function runTrackingPage() {
    let tries = 0;
    const timerId = setInterval(async () => {
      tries += 1;
      if (dead || tries > 50) return clearInterval(timerId); // 50 x 0.5s: the page may load slowly
      const data = readTrackingPage();
      if (!data) return;
      clearInterval(timerId);
      const res = await send({ type: "TRACKING_FOUND", ...data });
      // Only say something if a person is looking at this page (not in our background tab).
      if (document.visibilityState === "visible") {
        toast(
          res?.ok
            ? `Tracking ${data.trackingNumber}${data.carrierName ? ` (${data.carrierName})` : ", carrier not shown yet,"} saved to the dashboard${data.delivered ? ". Delivered." : "."}`
            : res?.error || "Could not save the tracking.",
          !res?.ok
        );
      }
    }, 500);
  }

  // The smallest elements whose text holds an order number, e.g. the
  // <div>Ref. Number : 3077062172300812<span>Copy</span></div> of an order card.
  // Found by walking the page's text nodes only (a long number in a small piece of text), so the cost
  // grows with the text on the page, not with every element and everything nested in it. This is what
  // kept the page slow when the list held many orders.
  const LONG_NUMBER = /\d{12,20}/;
  function findRefElements() {
    const found = [];
    if (!document.body) return found;
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const value = textNode.nodeValue;
      if (!value || value.length < 12 || !LONG_NUMBER.test(value)) continue;
      // The smallest element around this text that also holds the label ("Ref. Number :").
      let node = textNode.parentElement;
      let id = "";
      for (let up = 0; node && up < 3; up += 1, node = node.parentElement) {
        if (node.closest(`[${BTN_ATTR}]`)) {
          node = null;
          break;
        }
        const text = node.textContent || "";
        if (text.length > 90) {
          node = null;
          break;
        }
        const ids = lib.orderIdsFromText(text);
        if (ids.length === 1) {
          id = ids[0];
          break;
        }
        if (ids.length > 1) {
          node = null;
          break;
        }
      }
      if (!node || !id || seen.has(node)) continue;
      seen.add(node);
      found.push({ node, id });
    }
    return found;
  }

  // The order card that this number belongs to: the product ids it links to and its text
  // (product name, "Black, 1m" and so on), used to work out which eBay order it is for.
  function cardInfo(node) {
    const found = new Set();
    let text = "";
    let box = node;
    for (let depth = 0; box && depth < 12; depth += 1, box = box.parentElement) {
      const boxText = box.innerText || "";
      // Once the container holds more than one order number it is the whole list.
      if (lib.orderIdsFromText(boxText).length > 1) break;
      const links = [...box.querySelectorAll("a[href]")].map((a) => lib.itemIdFromUrl(a.href)).filter(Boolean);
      if (links.length) {
        links.forEach((id) => found.add(id));
        text = boxText;
        break;
      }
    }
    return { itemIds: [...found], text };
  }

  // What was paid for each order: the "Total: £ 2.04" shown in its card. The scan starts from the
  // total (not from the Ref. Number): the first ancestor that holds exactly one order number is its card.
  const costsSent = new Map();
  const totalSeen = new WeakMap();
  let lastCostLog = "";
  function scanCosts() {
    const totals = document.querySelectorAll('[class*="price-total"]');
    let found = 0;
    for (const totalNode of totals) {
      const money = lib.parseMoney(totalNode.textContent);
      // A total that was already read and has not changed is not worked out again.
      const known = totalSeen.get(totalNode);
      if (known && money && known.text === totalNode.textContent) {
        found += 1;
        continue;
      }
      let id = "";
      let box = totalNode.parentElement;
      for (let depth = 0; box && depth < 20; depth += 1, box = box.parentElement) {
        const ids = lib.orderIdsFromText(box.textContent || "");
        if (ids.length > 1) break;
        if (ids.length === 1) {
          id = ids[0];
          break;
        }
      }
      if (!money || !money.currency || !id) {
        if (!costsSent.has("diag")) {
          costsSent.set("diag", true);
          const codes = [...(totalNode.textContent || "")].map((ch) => ch.charCodeAt(0).toString(16)).join(" ");
          console.log(`[AliExpress Sync] could not use a total: text=${JSON.stringify(totalNode.textContent)} codes=${codes} parsed=${JSON.stringify(money)} orderId=${id || "none"}`);
        }
        continue;
      }
      found += 1;
      // Only remembered once the order is synced; before that it is looked at again (a number can be synced any moment).
      if (state.synced[id]) totalSeen.set(totalNode, { text: totalNode.textContent });
      if (!state.synced[id]) continue;
      const key = `${money.amount}${money.currency}`;
      if (costsSent.get(id) === key) continue;
      costsSent.set(id, key);
      send({ type: "COST", aliOrderId: id, amount: money.amount, currency: money.currency }).then((res) => {
        // A failed save is tried again on the next scan.
        if (!res?.ok) {
          costsSent.delete(id);
          totalSeen.delete(totalNode);
        }
        console.log(`[AliExpress Sync] cost ${money.amount} ${money.currency} for ${id}:`, res?.ok ? "saved" : res?.error);
      });
    }
    const summary = `totals on page=${totals.length}, read=${found}`;
    if (summary !== lastCostLog) {
      lastCostLog = summary;
      console.log(`[AliExpress Sync] ${summary}`);
    }
  }

  // In the tab the automatic check opened (and only there), scroll down the orders list so every
  // synced order gets read, not just the first page. Stops when every synced order has its cost, when the
  // list stops growing, or after a while.
  const FORTY_FIVE_DAYS = 45 * 24 * 60 * 60 * 1000;
  async function autoScrollForCosts() {
    const who = await send({ type: "IS_AUTO_TAB" });
    if (!who?.auto) return;
    let lastHeight = 0;
    let stale = 0;
    for (let round = 0; round < 80 && !dead; round += 1) {
      await refreshState();
      scanCosts();
      await new Promise((r) => setTimeout(r, 700)); // let the costs just sent reach the background
      await refreshState();
      const missing = Object.entries(state.synced).filter(
        ([id, v]) => !state.costed?.[id] && !costsSent.has(id) && (!v.at || Date.now() - v.at < FORTY_FIVE_DAYS)
      );
      if (missing.length === 0) break;

      window.scrollTo(0, document.body.scrollHeight);
      // Some lists load more with a button instead of by scrolling.
      for (const b of document.querySelectorAll("button, a, div[role=button]")) {
        if (/^(view|load|show) more( orders)?$/i.test((b.textContent || "").trim()) && isVisibleBox(b)) b.click();
      }
      await new Promise((r) => setTimeout(r, 1300));
      const height = document.body.scrollHeight;
      stale = height === lastHeight ? stale + 1 : 0;
      lastHeight = height;
      if (stale >= 4) break; // the bottom: nothing more loads
    }
    send({ type: "AUTO_SCAN_DONE" });
  }

  const isVisibleBox = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  function paint(button, id) {
    const done = state.synced[id];
    // Only touch the DOM when something changed, or the page observer would see our own edit and rescan forever.
    const label = done ? "Synced ✓" : "Sync";
    if (button.textContent !== label) button.textContent = label;
    // Styles and title are only written when the state changed (many orders = many buttons per scan).
    const shown = done ? `1|${done.orderId}` : "0";
    if (button.__painted === shown) return;
    button.__painted = shown;
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
      `position:fixed;left:${Math.max(8, Math.min(rect.left, innerWidth - 340))}px;top:${Math.max(8, Math.min(rect.bottom + 6, innerHeight - Math.min(innerHeight * 0.6, 420) - 8))}px;width:330px;max-height:min(60vh,420px);overflow:auto;z-index:2147483647;background:#fff;color:#18181b;border:1px solid #d4d4d8;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);font:13px Arial,sans-serif;`
    );
    // Sticky header with a search box: type part of an order number, buyer name or product to narrow the list.
    const header = el("div", {}, "position:sticky;top:0;padding:8px 10px;border-bottom:1px solid #eee;background:#fff;z-index:1;");
    const title = el("div", { textContent: `Which eBay order is this for? (${choices.length})` }, "font-weight:600;");
    const search = el(
      "input",
      { type: "search", placeholder: "Search order no., buyer or product" },
      "display:block;width:100%;margin-top:6px;padding:6px 8px;border:1px solid #d4d4d8;border-radius:8px;font:13px Arial,sans-serif;color:#18181b;background:#fff;box-sizing:border-box;"
    );
    header.append(title, search);
    menu.appendChild(header);
    const none = el("div", { textContent: "No orders match." }, "display:none;padding:12px 10px;color:#71717a;");
    const rows = [];
    for (const choice of choices) {
      const entry = choice.entry;
      const row = el(
        "button",
        { type: "button" },
        "display:block;width:100%;text-align:left;padding:8px 10px;border:none;border-bottom:1px solid #f4f4f5;background:#fff;color:#18181b;font:13px Arial,sans-serif;cursor:pointer;"
      );
      rows.push({
        row,
        entry,
        haystack: [entry.orderId, entry.buyer, entry.title, entry.storeLabel, ...(entry.items || []).map((i) => i.variantText)]
          .join(" ")
          .toLowerCase(),
      });
      const head = [
        `eBay ${entry.orderId}`,
        entry.buyer,
        entry.bestGuess ? "best guess" : "",
        entry.sameProduct ? "same product" : "",
        entry.shipped ? "already shipped" : "",
        entry.scope === "order" ? "whole order" : entry.scope === "item" ? "this item only" : "",
        entry.source === "arrow" ? "opened from arrow" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      row.appendChild(el("div", { textContent: head }, `font-weight:600;${entry.bestGuess ? "color:#188038;" : ""}`));
      const detail = [entry.title ? entry.title.slice(0, 60) : "", entry.storeLabel].filter(Boolean).join("  |  ");
      if (detail) row.appendChild(el("div", { textContent: detail }, "color:#71717a;font-size:12px;margin-top:2px;"));
      // What exactly was bought (size, colour, how many): often the only difference between two orders.
      const bought = (entry.items || [])
        .slice(0, 3)
        .map((item) => [item.variantText, item.quantity > 1 ? `x${item.quantity}` : ""].filter(Boolean).join(" "))
        .filter(Boolean)
        .join("  /  ");
      if (bought) row.appendChild(el("div", { textContent: bought }, "color:#18181b;font-size:12px;margin-top:2px;font-style:italic;"));
      row.addEventListener("mouseenter", () => (row.style.background = "#f4f4f5"));
      row.addEventListener("mouseleave", () => (row.style.background = "#fff"));
      row.addEventListener("click", () => {
        closeMenu();
        onPick(entry);
      });
      menu.appendChild(row);
    }
    menu.appendChild(none);

    function applyFilter() {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const item of rows) {
        const match = words.every((w) => item.haystack.includes(w));
        item.row.style.display = match ? "block" : "none";
        if (match) shown += 1;
      }
      none.style.display = shown === 0 ? "block" : "none";
      title.textContent = `Which eBay order is this for? (${shown}${shown === choices.length ? "" : ` of ${choices.length}`})`;
    }
    search.addEventListener("input", applyFilter);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
      // Enter picks the first order that is still shown.
      if (e.key === "Enter") rows.find((item) => item.row.style.display !== "none")?.row.click();
    });

    document.documentElement.appendChild(menu);
    openMenu = menu;
    search.focus();
  }

  // The orders on the last list of choices, so that after a sync the same buyer's other orders can be offered.
  let lastChoices = [];
  const buyerKey = (e) => String(e.buyer || "").trim().toLowerCase();

  async function sync(button, id, node, entry) {
    button.textContent = "Syncing…";
    button.disabled = true;
    const res = await send({ type: "SYNC", storeId: entry.storeId, orderId: entry.orderId, aliOrderId: id, lineItemId: entry.lineItemId || "" });
    button.disabled = false;
    if (res?.ok) {
      await refreshState();
      paint(button, id);
      toast(`Synced ${id} to eBay order ${entry.orderId}${entry.buyer ? ` (${entry.buyer})` : ""}.`, false, {
        label: "Undo",
        onClick: async () => {
          const undone = await send({ type: "UNSYNC", storeId: entry.storeId, orderId: entry.orderId, aliOrderId: id });
          await refreshState();
          paint(button, id);
          toast(undone?.ok ? `Removed ${id} from eBay order ${entry.orderId}.` : undone?.error || "Could not undo.", !undone?.ok);
        },
      });
      offerSameBuyer(id, entry);
    } else {
      paint(button, id);
      toast(res?.error || "Could not sync this number.", true);
    }
  }

  // One AliExpress order is often one parcel for several eBay orders of the same buyer (even of different stores).
  // After a sync, the buyer's other orders that still wait for a number are offered with one click.
  function offerSameBuyer(aliId, entry) {
    const key = buyerKey(entry);
    if (!key) return;
    const seen = new Set();
    const siblings = lastChoices.filter((c) => {
      if (c.scope === "item" || c.shipped || buyerKey(c) !== key) return false;
      if (c.orderId === entry.orderId && c.storeId === entry.storeId) return false;
      const k = `${c.storeId}|${c.orderId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (siblings.length === 0) return;
    toast(`${entry.buyer} has ${siblings.length} more order${siblings.length === 1 ? "" : "s"} waiting: ${siblings.map((s) => s.orderId).join(", ")}. Is ${aliId} the same parcel?`, false, {
      label: `Also link to ${siblings.length === 1 ? "it" : `all ${siblings.length}`}`,
      onClick: async () => {
        let done = 0;
        let failed = "";
        for (const s of siblings) {
          const res = await send({ type: "SYNC", storeId: s.storeId, orderId: s.orderId, aliOrderId: aliId, lineItemId: "" });
          if (res?.ok) done += 1;
          else failed = res?.error || "failed";
        }
        await refreshState();
        toast(failed ? `Linked ${done}, then: ${failed}` : `Linked ${aliId} to ${done} more order${done === 1 ? "" : "s"} of ${entry.buyer}.`, Boolean(failed));
      },
    });
  }

  async function onClick(button, id, node) {
    // A number that is already synced can still be linked to another order (the same buyer's second order, for example).
    const alreadySynced = Boolean(state.synced[id]);
    button.textContent = "Loading…";
    button.disabled = true;
    await refreshState();
    if (!state.configured) {
      paint(button, id);
      button.disabled = false;
      return toast("Open the extension (puzzle icon, AliExpress Sync) and enter your dashboard address and token first.", true);
    }

    // Two sources of "which eBay order is this for": the ones opened with the dashboard's
    // arrow (remembered in this browser) and the orders the dashboard says still need a number.
    const fromDashboard = await send({ type: "GET_CANDIDATES" });
    // A token made for one store must not offer orders of other stores that were opened with the arrow.
    const allowedStores = fromDashboard?.ok ? new Set(fromDashboard.storeIds || []) : null;
    const arrow = state.pending
      .filter((p) => !allowedStores || allowedStores.has(p.storeId))
      .map((p) => ({ ...p, source: "arrow" }));
    paint(button, id);
    button.disabled = false;

    const choices = lib.mergeChoices(arrow, fromDashboard?.ok ? fromDashboard.candidates : []);
    lastChoices = choices;
    if (choices.length === 0) {
      return toast(
        fromDashboard?.ok
          ? "No eBay orders are waiting for an AliExpress number."
          : fromDashboard?.error || "Could not load your eBay orders from the dashboard.",
        !fromDashboard?.ok
      );
    }
    if (fromDashboard?.ok && fromDashboard.errors?.length) {
      toast(`Some stores could not be loaded: ${fromDashboard.errors.join("; ")}`, true);
    }

    // Sync straight away only when exactly one eBay order has this product. With two or more
    // (the same product sold twice) it cannot know which one, so it asks, same-product orders first.
    const card = cardInfo(node);
    // Orders eBay already shipped are only offered in the list, never picked automatically: an old
    // order of the same product must not steal a new purchase.
    const matches = lib.matchesByProduct(choices, card.itemIds);
    const freshMatches = matches.filter((m) => !m.shipped);
    if (freshMatches.length === 1 && !alreadySynced) return sync(button, id, node, freshMatches[0]);

    // Rank by how well each order fits the card (title words, chosen size/colour), then by
    // arrow / newest. Same-product orders always come first.
    const rank = (list) =>
      list
        .map((entry) => ({ ...entry, score: lib.scoreAgainstCard(entry, card.text) }))
        .sort((a, b) => (a.shipped ? 1 : 0) - (b.shipped ? 1 : 0) || b.score - a.score || (b.source === "arrow") - (a.source === "arrow") || b.addedAt - a.addedAt);
    const keyOf = (m) => `${m.storeId}|${m.orderId}|${m.lineItemId || ""}`;
    const matchedKeys = new Set(matches.map(keyOf));
    const same = rank(matches).map((m) => ({ ...m, sameProduct: true }));
    const rest = rank(choices.filter((c) => !matchedKeys.has(keyOf(c))));
    const ordered = [...same, ...rest];

    // Point out a clear best guess (it still needs a click): it must fit well and clearly better than the next.
    const [first, second] = ordered;
    if (first && first.score >= 3 && (!second || first.score >= second.score + 2)) first.bestGuess = true;
    chooseOrder(button, ordered.map((entry) => ({ entry })), (entry) => sync(button, id, node, entry));
  }

  function addButtons() {
    if (!document.body) return [];
    const refs = findRefElements(); // one pass over the page, shared with the tracking check
    if (refs.length === 0) return refs;
    scanCosts();
    for (const { node, id } of refs) {
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
    return refs;
  }

  function removeButtons() {
    closeMenu();
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach((b) => b.remove());
  }

  // AliExpress is a single-page app: moving to "My orders" does not reload the page, and the
  // list fills in late, so the page is rescanned when it changes and when the address changes.
  let lastHref = "";
  let lastStateAt = 0;
  let lastLog = "";
  // A scan runs 0.9s after the first change and then not again until it has run. (It used to
  // restart the wait on every change; the order list keeps changing, so it never got to run.)
  // Scans are also spaced out (at most one every 2.5 s) and skipped in a tab nobody is looking at, so a
  // long order list stays smooth; coming back to the tab scans at once.
  let lastScanAt = 0;
  const MIN_GAP_MS = 2500;
  function schedule() {
    if (dead || timer) return;
    const wait = Math.max(900, lastScanAt + MIN_GAP_MS - Date.now());
    timer = setTimeout(async () => {
      timer = null;
      try {
        if (!alive()) return die();
        if (!onOrderPage()) return removeButtons();
        if (document.hidden) return; // scanned when the tab is shown again
        lastScanAt = Date.now();
        if (Date.now() - lastStateAt > 4000) {
          lastStateAt = Date.now();
          await refreshState();
        }
        const refs = addButtons();
        requestTracking(refs);
        lastCount = document.getElementsByTagName("*").length;
        const summary = `refs=${refs.length} buttons=${document.querySelectorAll(`[${BTN_ATTR}]`).length}`;
        if (summary !== lastLog) {
          lastLog = summary;
          console.info(`[AliExpress Sync] ${summary} on`, location.pathname);
        }
      } catch (err) {
        console.error("[AliExpress Sync] scan failed:", err);
      }
    }, wait);
  }
  let lastCount = 0;

  // In the automatic check's own tab: wait for the list to appear, then scroll through it. If the tab ended up
  // somewhere else (a login page, say) it says it is done at once, so the check does not wait for nothing.
  async function maybeAutoScan() {
    const who = await send({ type: "IS_AUTO_TAB" });
    if (!who?.auto) return;
    await new Promise((r) => setTimeout(r, 6000));
    if (!onOrderPage() || dead) return send({ type: "AUTO_SCAN_DONE" });
    await autoScrollForCosts();
  }

  function start() {
    lastHref = location.href;
    maybeAutoScan().catch(() => {});
    // Any AliExpress page being opened lets the extension look at the parcels (see quickCheck in the background).
    send({ type: "PAGE_OPENED" });
    schedule();
    // Our own buttons and toasts being added must not trigger another scan.
    const ours = (n) => n.nodeType === 1 && (n.hasAttribute?.(BTN_ATTR) || Boolean(n.closest?.(`[${BTN_ATTR}]`)));
    observer = new MutationObserver((records) => {
      if (!onOrderPage()) return;
      const outside = records.some((r) => {
        if (r.target.closest?.(`[${BTN_ATTR}]`)) return false;
        const nodes = [...r.addedNodes, ...r.removedNodes];
        return nodes.length > 0 && !nodes.every(ours);
      });
      if (outside) schedule();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    let ticks = 0;
    poll = setInterval(() => {
      if (!alive()) return die();
      ticks += 1;
      if (location.href !== lastHref) {
        lastHref = location.href;
        schedule();
      } else if (ticks % 6 === 0 && onOrderPage() && !document.hidden && document.getElementsByTagName("*").length !== lastCount) {
        // Safety net: rescan in case the page changed without us noticing (only if its size really changed).
        schedule();
      }
    }, 800);
    document.addEventListener("mousedown", (e) => {
      if (openMenu && !openMenu.contains(e.target)) closeMenu();
    });
  }

  const begin = () => {
    if (isTrackingPage()) runTrackingPage();
    start();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();
})();
