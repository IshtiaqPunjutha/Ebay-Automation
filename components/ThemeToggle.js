"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ style }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") || "dark";
    setTheme(stored);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button onClick={toggle} style={{ ...styles.btn, ...style }}>
      <span>{theme === "dark" ? "☀️" : "🌙"}</span>
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

const styles = {
  btn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
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
};
