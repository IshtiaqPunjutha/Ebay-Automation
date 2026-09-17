"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/stores", label: "Stores", icon: "🏬" },
];

const comingSoon = [
  { label: "Order Queue", icon: "📦" },
  { label: "Sheet Mapping", icon: "🔗" },
  { label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>Order Automation</div>

      <nav style={styles.nav}>
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...styles.navItem,
                ...(active ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <div style={styles.sectionLabel}>Coming soon</div>
        {comingSoon.map((item) => (
          <div key={item.label} style={styles.navItemDisabled}>
            <span style={styles.navIcon}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>

      <button onClick={handleLogout} style={styles.logoutBtn}>
        Log Out
      </button>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: "220px",
    minHeight: "100vh",
    background: "#14161c",
    borderRight: "1px solid #22252d",
    display: "flex",
    flexDirection: "column",
    padding: "20px 14px",
    boxSizing: "border-box",
    position: "sticky",
    top: 0,
  },
  brand: {
    color: "#fff",
    fontWeight: 700,
    fontSize: "15px",
    padding: "0 10px 20px 10px",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 10px",
    borderRadius: "8px",
    color: "#c7cad1",
    textDecoration: "none",
    fontSize: "14px",
  },
  navItemActive: {
    background: "#3b82f6",
    color: "#fff",
  },
  navItemDisabled: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 10px",
    borderRadius: "8px",
    color: "#565a63",
    fontSize: "14px",
    cursor: "default",
  },
  navIcon: { fontSize: "14px", width: "16px", textAlign: "center" },
  sectionLabel: {
    color: "#565a63",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "16px 10px 4px 10px",
  },
  logoutBtn: {
    background: "transparent",
    border: "1px solid #2c2f36",
    color: "#c7cad1",
    padding: "9px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },
};
