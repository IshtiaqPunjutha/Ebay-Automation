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
  function toast(text, isError = false, action = null) {
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
      if (action) {
        const button = el(
          "button",
          { type: "button", textContent: action.label },
          "margin-top:6px;padding:3px 12px;border:1px solid #8ab4f8;border-radius:12px;background:transparent;color:#8ab4f8;font:600 12px Arial,sans-serif;cursor:pointer;"
        );
        button.addEventListener("click", () => {
          t.remove();
          action.onClick();
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
  const BTN_STYLE =
    "margin-left:10px;padding:2px 10px;border:none;border-radius:12px;background:#2a78d6;color:#fff;font:600 12px/18px Arial,sans-serif;cursor:pointer;vertical-align:middle;white-space:nowrap;";

  const state = { pending: [], synced: {}, tracked: {}, configured: true };

  async function refreshState() {
    const res = await send({ type: "GET_STATE" });
    if (res?.ok) {
      state.pending = res.pending;
      state.synced = res.synced;
      state.tracked = res.tracked || {};
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
  function requestTracking() {
    for (const link of document.querySelectorAll('a[href*="/p/tracking/"]')) {
      const aliOrderId = lib.trackingOrderIdFromUrl(link.href);
      if (!aliOrderId || !state.synced[aliOrderId] || state.tracked[aliOrderId] || askedForTracking.has(aliOrderId)) continue;
      askedForTracking.add(aliOrderId);
      send({ type: "FETCH_TRACKING", aliOrderId, url: link.href });
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
    return {
      aliOrderId,
      trackingNumber,
      carrierName,
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
            ? `Tracking ${data.trackingNumber}${data.carrierName ? ` (${data.carrierName})` : ", carrier not shown yet,"} saved to the dashboard.`
            : res?.error || "Could not save the tracking.",
          !res?.ok
        );
      }
    }, 500);
  }

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
  let lastCostLog = "";
  function scanCosts() {
    const totals = document.querySelectorAll('[class*="price-total"]');
    let found = 0;
    for (const totalNode of totals) {
      const money = lib.parseMoney(totalNode.textContent);
      let id = "";
      let box = totalNode.parentElement;
      for (let depth = 0; box && depth < 20; depth += 1, box = box.parentElement) {
        const ids = lib.orderIdsFromText(box.innerText || "");
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
      if (!state.synced[id]) continue;
      const key = `${money.amount}${money.currency}`;
      if (costsSent.get(id) === key) continue;
      costsSent.set(id, key);
      send({ type: "COST", aliOrderId: id, amount: money.amount, currency: money.currency }).then((res) => {
        // A failed save is tried again on the next scan.
        if (!res?.ok) costsSent.delete(id);
        console.log(`[AliExpress Sync] cost ${money.amount} ${money.currency} for ${id}:`, res?.ok ? "saved" : res?.error);
      });
    }
    const summary = `totals on page=${totals.length}, read=${found}`;
    if (summary !== lastCostLog) {
      lastCostLog = summary;
      console.log(`[AliExpress Sync] ${summary}`);
    }
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

  async function sync(button, id, node, entry) {
    button.textContent = "Syncing…";
    button.disabled = true;
    const res = await send({ type: "SYNC", storeId: entry.storeId, orderId: entry.orderId, aliOrderId: id });
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
    } else {
      paint(button, id);
      toast(res?.error || "Could not sync this number.", true);
    }
  }

  async function onClick(button, id, node) {
    if (state.synced[id]) return;
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
    const matches = lib.matchesByProduct(choices, card.itemIds);
    if (matches.length === 1) return sync(button, id, node, matches[0]);

    // Rank by how well each order fits the card (title words, chosen size/colour), then by
    // arrow / newest. Same-product orders always come first.
    const rank = (list) =>
      list
        .map((entry) => ({ ...entry, score: lib.scoreAgainstCard(entry, card.text) }))
        .sort((a, b) => b.score - a.score || (b.source === "arrow") - (a.source === "arrow") || b.addedAt - a.addedAt);
    const matchedKeys = new Set(matches.map((m) => `${m.storeId}|${m.orderId}`));
    const same = rank(matches).map((m) => ({ ...m, sameProduct: true }));
    const rest = rank(choices.filter((c) => !matchedKeys.has(`${c.storeId}|${c.orderId}`)));
    const ordered = [...same, ...rest];

    // Point out a clear best guess (it still needs a click): it must fit well and clearly better than the next.
    const [first, second] = ordered;
    if (first && first.score >= 3 && (!second || first.score >= second.score + 2)) first.bestGuess = true;
    chooseOrder(button, ordered.map((entry) => ({ entry })), (entry) => sync(button, id, node, entry));
  }

  function addButtons() {
    if (!document.body) return;
    // One cheap pass over the page text first; the element search below is only worth it when a number exists.
    if (lib.orderIdsFromText(document.body.innerText).length === 0) return;
    scanCosts();
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
  let lastHref = "";
  let lastStateAt = 0;
  let lastLog = "";
  // A scan runs 0.9s after the first change and then not again until it has run. (It used to
  // restart the wait on every change; the order list keeps changing, so it never got to run.)
  function schedule() {
    if (dead || timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        if (!alive()) return die();
        if (!onOrderPage()) return removeButtons();
        if (Date.now() - lastStateAt > 4000) {
          lastStateAt = Date.now();
          await refreshState();
        }
        addButtons();
        requestTracking();
        const summary = `refs=${lib.orderIdsFromText(document.body.innerText).length} buttons=${document.querySelectorAll(`[${BTN_ATTR}]`).length}`;
        if (summary !== lastLog) {
          lastLog = summary;
          console.info(`[AliExpress Sync] ${summary} on`, location.pathname);
        }
      } catch (err) {
        console.error("[AliExpress Sync] scan failed:", err);
      }
    }, 900);
  }

  function start() {
    lastHref = location.href;
    schedule();
    observer = new MutationObserver(() => {
      if (onOrderPage()) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    let ticks = 0;
    poll = setInterval(() => {
      if (!alive()) return die();
      ticks += 1;
      if (location.href !== lastHref) {
        lastHref = location.href;
        schedule();
      } else if (ticks % 4 === 0 && onOrderPage()) {
        // Safety net: rescan every few seconds in case the page changed without us noticing.
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
