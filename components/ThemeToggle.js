"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button onClick={toggle} className="btn btn-ghost" style={compact ? { width: "auto" } : undefined}>
      <Icon strokeWidth={2} />
      {!compact && (theme === "dark" ? "Light mode" : "Dark mode")}
    </button>
  );
}
