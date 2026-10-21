"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronLeft, Inbox, LayoutGrid, Store, PackageSearch, Table2, ListChecks, Truck, Landmark } from "lucide-react";
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
        { href: "/finance", label: "Finance (all stores)", icon: Landmark },
      ],
    },
  ];
}

function storeGroups(storeId) {
  return [
    {
      label: "Store",
      items: [
        {
          label: "Orders",
          icon: PackageSearch,
          children: [
            { href: `/stores/${storeId}`, label: "New orders", icon: Inbox, exact: true },
            { href: `/stores/${storeId}/dispatched`, label: "Dispatched", icon: Truck },
          ],
        },
        { href: `/stores/${storeId}/sheet`, label: "Sheet mapping", icon: Table2 },
        { href: `/stores/${storeId}/finance`, label: "Finance", icon: Landmark },
      ],
    },
  ];
}

export default function Sidebar({ collapsed, store, onNavigate, counts = {}, storeCount = 0 }) {
  // Orders still without an AliExpress number: shown as a number next to "New orders" and "Stores".
  const waitingHere = store ? counts[store.id]?.needsAli || 0 : 0;
  const pathname = usePathname();
  const groups = store ? storeGroups(store.id) : workspaceGroups();
  const [ordersOpen, setOrdersOpen] = useState(true);

  function isActive(item) {
    return item.exact || item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);
  }

  function renderLink(item, extraClass = "") {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-link${extraClass}${active ? " active" : ""}`}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
      >
        <Icon strokeWidth={2} />
        <span className="nav-label">{item.label}</span>
        {(() => {
          const n = item.label === "New orders" ? waitingHere : item.label === "Stores" ? storeCount : 0;
          return n > 0 ? (
            <span className="nav-count" title={item.label === "Stores" ? `${n} connected store${n === 1 ? "" : "s"}` : `${n} order${n === 1 ? "" : "s"} still need an AliExpress number`}>
              {n}
            </span>
          ) : null;
        })()}
      </Link>
    );
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
              if (item.children) {
                const anyActive = item.children.some(isActive);
                // In the collapsed rail the children show as plain icons.
                if (collapsed) return item.children.map((child) => renderLink(child));
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      className={`nav-link nav-parent${anyActive ? " parent-active" : ""}`}
                      onClick={() => setOrdersOpen((open) => !open)}
                      aria-expanded={ordersOpen}
                    >
                      <Icon strokeWidth={2} />
                      <span className="nav-label">{item.label}</span>
                      <ChevronDown className={`nav-chevron${ordersOpen ? " open" : ""}`} strokeWidth={2} />
                    </button>
                    {ordersOpen && <div className="nav-sub">{item.children.map((child) => renderLink(child))}</div>}
                  </div>
                );
              }
              if (item.soon) {
                return (
                  <div key={item.label} className="nav-link-disabled" title={collapsed ? `${item.label} (coming soon)` : undefined}>
                    <Icon strokeWidth={2} />
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-soon">Soon</span>
                  </div>
                );
              }
              return renderLink(item);
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
