"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  }

  const Icon = theme === "dark" ? Sun : Moon;
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  if (compact) {
    return (
      <button onClick={toggle} className="icon-btn" title={label} aria-label={label}>
        <Icon strokeWidth={2} />
      </button>
    );
  }

  return (
    <button onClick={toggle} className="btn btn-ghost">
      <Icon strokeWidth={2} />
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
