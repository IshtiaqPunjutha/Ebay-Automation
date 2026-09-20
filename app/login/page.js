"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("That password isn't right.");
    }
  }

  return (
    <main style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.brandMark}>OA</div>
        <h1 style={styles.heading}>Order Automation</h1>
        <p style={styles.sub}>Sign in to your fulfillment console.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={styles.input}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Checking…" : "Log in"}
        </button>
        <a href="/privacy" style={styles.privacyLink}>
          Privacy policy
        </a>
      </form>
    </main>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    fontFamily: "var(--font-sans), sans-serif",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: "36px",
    borderRadius: "14px",
    width: "320px",
    textAlign: "center",
  },
  brandMark: {
    width: "36px",
    height: "36px",
    borderRadius: "9px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    fontSize: "13px",
    margin: "0 auto 16px auto",
  },
  heading: { color: "var(--text-primary)", fontSize: "17px", fontWeight: 700, margin: "0 0 4px 0" },
  sub: { color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 22px 0" },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border-strong)",
    background: "var(--bg)",
    color: "var(--text-primary)",
    marginBottom: "14px",
    boxSizing: "border-box",
    fontSize: "13.5px",
    textAlign: "left",
  },
  error: { color: "var(--danger)", fontSize: "12.5px", marginBottom: "12px", marginTop: "-6px" },
  button: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "none",
    background: "var(--accent)",
    color: "#1a0f06",
    fontWeight: 700,
    fontSize: "13.5px",
    cursor: "pointer",
  },
  privacyLink: {
    display: "block",
    marginTop: "18px",
    color: "var(--text-tertiary)",
    fontSize: "11.5px",
    textDecoration: "none",
  },
};
