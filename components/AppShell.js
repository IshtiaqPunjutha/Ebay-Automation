"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeft } from "lucide-react";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";

function crumbsFor(pathname) {
  if (pathname === "/") return [{ label: "Dashboard" }];
  if (pathname === "/stores") return [{ label: "Stores" }];
  if (pathname.startsWith("/stores/")) {
    return [{ label: "Stores", href: "/stores" }, { label: "Orders" }];
  }
  return [{ label: "Dashboard" }];
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar") === "collapsed");
    } catch (e) {}
  }, []);

  // A route change always closes the mobile drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    // On phones the same button opens the drawer; on desktop it collapses the rail.
    if (window.matchMedia("(max-width: 767px)").matches) {
      setDrawerOpen((open) => !open);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar", next ? "collapsed" : "open");
    } catch (e) {}
  }

  const crumbs = crumbsFor(pathname);
  const shellClass = ["app-shell", collapsed ? "collapsed" : "", drawerOpen ? "drawer-open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <Sidebar collapsed={collapsed} onNavigate={() => setDrawerOpen(false)} />
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
      <div className="app-body">
        <header className="topbar">
          <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
            <PanelLeft strokeWidth={2} />
          </button>
          <span className="topbar-divider" />
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 && <ChevronRight strokeWidth={2} />}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span className="breadcrumb-current">{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
          <div className="topbar-actions">
            <ThemeToggle compact />
          </div>
        </header>
        <main className="main">
          <div className="container">{children}</div>
        </main>
      </div>
    </div>
  );
}
