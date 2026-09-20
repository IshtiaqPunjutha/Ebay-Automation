"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: "20px", right: "20px" }}>
        <ThemeToggle compact />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "32px",
          borderRadius: "var(--radius-lg)",
          width: "300px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            fontSize: "12px",
            margin: "0 auto 18px auto",
          }}
        >
          OA
        </div>
        <h1 style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: 600, margin: "0 0 4px 0", letterSpacing: "-0.01em" }}>
          Order Automation
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 22px 0" }}>
          Sign in to your fulfillment console.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="input"
          style={{ marginBottom: "14px", textAlign: "left" }}
          autoFocus
        />
        {error && <p className="text-error" style={{ marginBottom: "12px", marginTop: "-6px" }}>{error}</p>}
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", padding: "9px" }}>
          {loading ? "Checking…" : "Log in"}
        </button>
        <a href="/privacy" style={{ display: "block", marginTop: "18px", color: "var(--text-tertiary)", fontSize: "11.5px", textDecoration: "none" }}>
          Privacy policy
        </a>
      </form>
    </main>
  );
}
