"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Store, PackageSearch, Link2, Settings } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/stores", label: "Stores", icon: Store },
];

const comingSoon = [
  { label: "Order queue", icon: PackageSearch },
  { label: "Sheet mapping", icon: Link2 },
  { label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">OA</div>
        <div>
          <div className="brand-name">Order Automation</div>
          <div className="brand-sub">Fulfillment console</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`nav-link${active ? " active" : ""}`}>
              <Icon strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}

        <div className="sidebar-section">
          <div className="sidebar-section-label">More tools coming soon</div>
          {comingSoon.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="nav-link-disabled">
                <Icon strokeWidth={2} />
                {item.label}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
        <button onClick={handleLogout} className="btn btn-ghost">
          Log out
        </button>
      </div>
    </aside>
  );
}
