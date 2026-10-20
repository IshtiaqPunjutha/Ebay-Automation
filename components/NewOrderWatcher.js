"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_VISIBLE_MS = 90 * 1000;
const POLL_HIDDEN_MS = 3 * 60 * 1000;
const SEEN_KEY = (storeId) => `seenOrders:${storeId}`;
const SOUND_KEY = "newOrderSound";

function readSeen(storeId) {
  try {
    const raw = localStorage.getItem(SEEN_KEY(storeId));
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeSeen(storeId, ids) {
  try {
    // Only the orders that are still unshipped matter, so the list never grows without limit.
    localStorage.setItem(SEEN_KEY(storeId), JSON.stringify([...ids].slice(-600)));
  } catch {}
}

// A short two-note chime made with the browser's own audio, so no sound file is needed.
function chime(audio) {
  try {
    const now = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.32);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.35);
    });
  } catch {}
}

// Checks every store for new orders while the dashboard is open: plays a chime, shows a notification, keeps
// per-store counts for the sidebar and tells the open orders page to refresh.
//
// counts: { [storeId]: { total, needsAli } }  total = orders still to ship, needsAli = those without an AliExpress number
export default function useNewOrderWatch() {
  const [counts, setCounts] = useState({});
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef(null);
  const soundRef = useRef(true);
  const timerRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      const on = saved !== "off";
      soundRef.current = on;
      setSoundOn(on);
    } catch {}
    // Browsers only allow sound after the person has used the page once.
    function unlock() {
      try {
        if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (audioRef.current.state === "suspended") audioRef.current.resume();
      } catch {}
    }
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSoundOn(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {}
    if (next) {
      try {
        if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
        audioRef.current.resume?.();
        chime(audioRef.current); // let the person hear it
      } catch {}
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const res = await fetch("/api/ebay/neworders", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const next = {};
        const announce = [];
        for (const store of data.stores || []) {
          if (!store.orders) continue; // that store could not be read this time; keep what is shown
          const ids = store.orders.map((o) => o.orderId);
          next[store.storeId] = { total: ids.length, needsAli: store.orders.filter((o) => !o.hasAli).length };
          const seen = readSeen(store.storeId);
          const fresh = seen ? ids.filter((id) => !seen.has(id)) : [];
          writeSeen(store.storeId, new Set([...(seen || []), ...ids]));
          if (fresh.length) {
            announce.push({ storeId: store.storeId, label: store.label, count: fresh.length });
            window.dispatchEvent(new CustomEvent("new-orders", { detail: { storeId: store.storeId } }));
          }
        }
        if (stopped) return;
        setCounts((prev) => ({ ...prev, ...next }));

        if (announce.length) {
          if (soundRef.current && audioRef.current) chime(audioRef.current);
          const total = announce.reduce((n, a) => n + a.count, 0);
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(total === 1 ? "New eBay order" : `${total} new eBay orders`, {
                body: announce.map((a) => `${a.label}: ${a.count} new`).join("\n"),
                tag: "new-ebay-order",
              });
            } catch {}
          }
        }
      } catch {}
    }

    function schedule() {
      if (stopped) return;
      timerRef.current = setTimeout(async () => {
        await check();
        schedule();
      }, document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
    }

    check().then(schedule);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // The tab title shows how many orders still need an AliExpress number.
  const waiting = Object.values(counts).reduce((n, c) => n + c.needsAli, 0);
  useEffect(() => {
    const clean = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = waiting > 0 ? `(${waiting}) ${clean}` : clean;
  }, [waiting]);

  return { counts, soundOn, toggleSound };
}
