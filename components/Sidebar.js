"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Store, PackageSearch, Link2, Settings, LogOut } from "lucide-react";

const groups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutGrid },
      { href: "/stores", label: "Stores", icon: Store },
    ],
  },
  {
    label: "Coming soon",
    items: [
      { label: "Order queue", icon: PackageSearch, soon: true },
      { label: "Sheet mapping", icon: Link2, soon: true },
      { label: "Settings", icon: Settings, soon: true },
    ],
  },
];

export default function Sidebar({ collapsed, onNavigate }) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="brand-mark">OA</div>
        <div className="brand-text">
          <div className="brand-name">Order Automation</div>
          <div className="brand-sub">Fulfillment console</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-section-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              if (item.soon) {
                return (
                  <div key={item.label} className="nav-link-disabled" title={collapsed ? `${item.label} (coming soon)` : undefined}>
                    <Icon strokeWidth={2} />
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-soon">Soon</span>
                  </div>
                );
              }
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${active ? " active" : ""}`}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Icon strokeWidth={2} />
                  <span className="nav-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="nav-link" title={collapsed ? "Log out" : undefined}>
          <LogOut strokeWidth={2} />
          <span className="nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
