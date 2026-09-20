"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/stores", label: "Stores" },
];

const comingSoon = ["Order queue", "Sheet mapping", "Settings"];

export default function Sidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brandBlock}>
        <div style={styles.brandMark}>OA</div>
        <div>
          <div style={styles.brandName}>Order Automation</div>
          <div style={styles.brandSub}>Fulfillment console</div>
        </div>
      </div>

      <nav style={styles.nav}>
        {navItems.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...styles.navItem,
                ...(active ? styles.navItemActive : {}),
              }}
            >
              <span
                style={{
                  ...styles.navIndicator,
                  background: active ? "var(--accent)" : "transparent",
                }}
              />
              {item.label}
            </Link>
          );
        })}

        <div style={styles.comingSoonBlock}>
          <div style={styles.comingSoonLabel}>More tools coming soon</div>
          {comingSoon.map((label) => (
            <div key={label} style={styles.navItemDisabled}>
              <span style={styles.navIndicator} />
              {label}
            </div>
          ))}
        </div>
      </nav>

      <div style={styles.footer}>
        <ThemeToggle />
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Log out
        </button>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: "232px",
    minHeight: "100vh",
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    padding: "20px 16px",
    boxSizing: "border-box",
    position: "sticky",
    top: 0,
  },
  brandBlock: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "4px 8px 24px 8px",
  },
  brandMark: {
    width: "30px",
    height: "30px",
    borderRadius: "7px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    fontSize: "12px",
    flexShrink: 0,
  },
  brandName: {
    color: "var(--text-primary)",
    fontWeight: 700,
    fontSize: "13.5px",
    lineHeight: 1.3,
  },
  brandSub: {
    color: "var(--text-tertiary)",
    fontSize: "11px",
    marginTop: "1px",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "6px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: "13.5px",
    fontWeight: 500,
  },
  navItemActive: {
    background: "var(--accent-soft)",
    color: "var(--accent-text)",
  },
  navItemDisabled: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "6px",
    color: "var(--text-tertiary)",
    fontSize: "13.5px",
    cursor: "default",
  },
  navIndicator: {
    width: "3px",
    height: "14px",
    borderRadius: "2px",
    flexShrink: 0,
  },
  comingSoonBlock: {
    marginTop: "20px",
    paddingTop: "16px",
    borderTop: "1px solid var(--border)",
  },
  comingSoonLabel: {
    color: "var(--text-tertiary)",
    fontSize: "11.5px",
    padding: "0 10px 8px 10px",
  },
  logoutBtn: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    color: "var(--text-secondary)",
    padding: "8px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
    width: "100%",
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
};
