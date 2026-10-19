"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, KeyRound, LogOut, User } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import ExtensionTokenDialog from "./ExtensionTokenDialog";

// Account button pinned to the bottom of the sidebar. Opens a small menu
// with the theme switch and log out.
export default function AccountMenu({ collapsed }) {
  const [open, setOpen] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="account" ref={ref}>
      {open && (
        <div className="menu" role="menu">
          <ThemeToggle variant="menu" />
          <button
            onClick={() => {
              setOpen(false);
              setShowToken(true);
            }}
            className="menu-item"
            role="menuitem"
          >
            <KeyRound strokeWidth={2} />
            Browser extension
          </button>
          <div className="menu-sep" />
          <button onClick={handleLogout} className="menu-item danger" role="menuitem">
            <LogOut strokeWidth={2} />
            Log out
          </button>
        </div>
      )}
      <button
        className="account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? "Account" : undefined}
      >
        <span className="avatar" style={{ width: 28, height: 28 }}>
          <User size={14} strokeWidth={2} />
        </span>
        <span className="nav-label account-name">Account</span>
        <ChevronsUpDown className="nav-label account-chevron" strokeWidth={2} />
      </button>
      {showToken && <ExtensionTokenDialog onClose={() => setShowToken(false)} />}
    </div>
  );
}
