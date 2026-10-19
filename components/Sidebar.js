"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LayoutGrid, Store, PackageSearch, Table2, ListChecks } from "lucide-react";
import AccountMenu from "./AccountMenu";

// The sidebar's contents follow where you are: workspace pages show the
// general menu, and inside a store it switches to that store's own menu.
function workspaceGroups() {
  return [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutGrid },
        { href: "/stores", label: "Stores", icon: Store },
      ],
    },
    {
      label: "Coming soon",
      items: [{ label: "Order queue", icon: ListChecks, soon: true }],
    },
  ];
}

function storeGroups(storeId) {
  return [
    {
      label: "Store",
      items: [
        { href: `/stores/${storeId}`, label: "Orders", icon: PackageSearch, exact: true },
        { href: `/stores/${storeId}/sheet`, label: "Sheet mapping", icon: Table2 },
      ],
    },
    {
      label: "Coming soon",
      items: [{ label: "Order queue", icon: ListChecks, soon: true }],
    },
  ];
}

export default function Sidebar({ collapsed, store, onNavigate }) {
  const pathname = usePathname();
  const groups = store ? storeGroups(store.id) : workspaceGroups();

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="brand-mark">OA</div>
        <div className="brand-text">
          <div className="brand-name">Order Automation</div>
          <div className="brand-sub">Fulfillment console</div>
        </div>
      </div>

      {/* One keyed wrapper per mode: switching between the workspace menu and a
          store's menu remounts the card and the nav together, so a stale store
          card can never be left behind. */}
      <div className="sidebar-body" key={store ? `store-${store.id}` : "workspace"}>
      {store && (
        <div className="store-card">
          <Link href="/stores" className="store-card-back" onClick={onNavigate}>
            <ChevronLeft strokeWidth={2} />
            All stores
          </Link>
          <div className="store-card-name">{store.label || "Store"}</div>
          <div className="store-card-sub">eBay store</div>
        </div>
      )}

      <nav className={`sidebar-nav${store ? " slide-in" : ""}`}>
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
              const active = item.exact || item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);
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
      </div>

      <div className="sidebar-footer">
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
