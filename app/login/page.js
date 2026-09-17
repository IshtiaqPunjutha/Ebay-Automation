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
      setError("Incorrect password.");
    }
  }

  return (
    <main style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.heading}>Order Automation Dashboard</h1>
        <p style={styles.sub}>Enter password to continue</p>
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
          {loading ? "Checking..." : "Log In"}
        </button>
        <a href="/privacy" style={styles.privacyLink}>
          Privacy Policy
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
    background: "#0f1115",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1a1d24",
    padding: "40px",
    borderRadius: "12px",
    width: "320px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  heading: { color: "#fff", fontSize: "18px", marginBottom: "4px" },
  sub: { color: "#8a8f98", fontSize: "13px", marginBottom: "20px" },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #2c2f36",
    background: "#0f1115",
    color: "#fff",
    marginBottom: "12px",
    boxSizing: "border-box",
  },
  error: { color: "#f87171", fontSize: "13px", marginBottom: "12px" },
  button: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  privacyLink: {
    display: "block",
    marginTop: "18px",
    color: "#8a8f98",
    fontSize: "12px",
    textAlign: "center",
    textDecoration: "none",
  },
};
