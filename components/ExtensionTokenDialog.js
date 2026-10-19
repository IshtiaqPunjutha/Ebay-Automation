"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, KeyRound, X } from "lucide-react";

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const Icon = copied ? Check : Copy;
  return (
    <div className="dialog-field">
      <div className="dialog-field-label">{label}</div>
      <div className="dialog-field-row">
        <code>{value}</code>
        <button type="button" className="icon-btn" onClick={copy} title="Copy" aria-label={`Copy ${label}`}>
          <Icon strokeWidth={2} style={copied ? { color: "var(--success)" } : undefined} />
        </button>
      </div>
    </div>
  );
}

// Lets the signed-in user create the token the browser extension uses to talk
// to this dashboard. The token is shown once, right after it is created.
export default function ExtensionTokenDialog({ onClose }) {
  const [status, setStatus] = useState(null); // { exists, createdAt }
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account/ext-token")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setError("Could not check the token."));
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    if (status?.exists && !confirm("This replaces your current token. The extension will stop working until you paste the new one. Continue?")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/ext-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the token.");
      setToken(data.token);
      setStatus({ exists: true, createdAt: data.createdAt });
    } catch (err) {
      setError(err.message || "Could not create the token.");
    }
    setBusy(false);
  }

  async function revoke() {
    if (!confirm("Revoke the token? The extension will stop syncing.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/ext-token", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not revoke the token.");
      setToken("");
      setStatus({ exists: false, createdAt: null });
    } catch (err) {
      setError(err.message || "Could not revoke the token.");
    }
    setBusy(false);
  }

  // Rendered into <body> so the sidebar's own layout cannot clip or move it.
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Browser extension token">
        <div className="dialog-header">
          <div className="dialog-title">
            <KeyRound strokeWidth={2} />
            Browser extension
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X strokeWidth={2} />
          </button>
        </div>

        <p className="text-muted" style={{ marginTop: 0 }}>
          The AliExpress Sync extension uses this to send AliExpress order numbers to your dashboard.
          Paste both values into the extension's settings.
        </p>

        {error && <p className="text-error">{error}</p>}

        <CopyField label="Dashboard address" value={typeof window !== "undefined" ? window.location.origin : ""} />

        {token ? (
          <>
            <CopyField label="Your token" value={token} />
            <p className="text-muted" style={{ fontSize: 12 }}>
              Copy it now. For safety it is not shown again; if you lose it, create a new one.
            </p>
          </>
        ) : (
          <p className="text-muted">
            {status === null
              ? "Checking…"
              : status.exists
                ? `A token was created on ${new Date(status.createdAt).toLocaleDateString()}. It cannot be shown again.`
                : "No token yet."}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || status === null}>
            {status?.exists ? "Create a new token" : "Create token"}
          </button>
          {status?.exists && (
            <button type="button" className="btn btn-danger-ghost" onClick={revoke} disabled={busy}>
              Revoke
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
