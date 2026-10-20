const $ = (id) => document.getElementById(id);
const msg = (text, ok) => {
  $("msg").textContent = text;
  $("msg").className = ok ? "ok" : "err";
};

async function loadSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  $("url").value = settings?.dashboardUrl || "";
  $("token").value = settings?.token || "";
}

async function renderPending() {
  const res = await chrome.runtime.sendMessage({ type: "GET_PENDING" });
  const list = res?.pending || [];
  $("empty").style.display = list.length ? "none" : "block";
  const ul = $("pending");
  ul.innerHTML = "";
  for (const p of list) {
    const li = document.createElement("li");
    const label = document.createElement("code");
    label.textContent = p.orderId;
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "REMOVE_PENDING", orderId: p.orderId, storeId: p.storeId });
      renderPending();
    });
    li.append(label, remove);
    ul.append(li);
  }
}

// The dashboard lives on its own address, so the browser must be told the
// extension may talk to it. This has to happen inside a click.
async function save() {
  const origin = AliSyncLib.originOf($("url").value);
  const token = $("token").value.trim();
  if (!origin) return msg("Enter the dashboard address, like https://your-dashboard.vercel.app", false);
  if (!/^oat_[A-Za-z0-9_-]{20,80}$/.test(token)) return msg("That does not look like a token from the dashboard.", false);
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return msg("Permission to reach the dashboard was not given.", false);
  await chrome.storage.local.set({ settings: { dashboardUrl: origin, token } });
  $("url").value = origin;
  msg("Saved.", true);
  return true;
}

async function test() {
  if (!(await save())) return;
  msg("Testing…", true);
  const res = await chrome.runtime.sendMessage({ type: "TEST" });
  if (res?.ok) {
    const names = (res.data.stores || []).map((s) => s.label).join(", ") || "no stores yet";
    msg(
      res.data.scope === "store"
        ? `Connected to one store: ${names}. This token works for that store only.`
        : `Connected. Stores: ${names}`,
      true
    );
  } else {
    msg(res?.error || "Could not connect.", false);
  }
}

const ago = (time) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

// What happened to each order's tracking: read and sent, or why not.
async function renderTracking() {
  const res = await chrome.runtime.sendMessage({ type: "TRACK_STATUS" });
  const list = res?.list || [];
  $("trackingEmpty").style.display = list.length ? "none" : "block";
  const ul = $("tracking");
  ul.innerHTML = "";
  for (const item of list) {
    const li = document.createElement("li");
    li.style.display = "block";
    const head = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = item.aliOrderId;
    head.append(code);
    const detail = document.createElement("div");
    detail.className = item.uploadedAt ? "ok" : "muted";
    if (item.uploadedAt) detail.textContent = `✓ ${item.trackingNumber} sent ${ago(item.uploadedAt)}`;
    else detail.textContent = `Not read ${item.attemptAt ? ago(item.attemptAt) : ""}${item.lastError ? `: ${item.lastError}` : ""}`.trim();
    li.append(head, detail);
    ul.append(li);
  }
}

$("retry").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TRACK_RETRY" });
  $("retryMsg").textContent = "Done. Now refresh the AliExpress orders page and they will be tried again.";
  renderTracking();
});

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
loadSettings();
renderPending();
renderTracking();
