"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyPassword, setLegacyPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, legacyPassword }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Unable to sign in.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
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
          {mode === "register" ? "Create an account to manage your own stores." : "Sign in to your fulfillment console."}
        </p>
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", padding: "3px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
          {[{ id: "login", label: "Log in" }, { id: "register", label: "Create account" }].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => { setMode(option.id); setError(""); }}
              aria-pressed={mode === option.id}
              style={{ flex: 1, border: 0, borderRadius: "4px", padding: "7px 4px", cursor: "pointer", color: mode === option.id ? "var(--text-primary)" : "var(--text-secondary)", background: mode === option.id ? "var(--surface)" : "transparent", font: "inherit", fontSize: "12px" }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="input"
          style={{ marginBottom: "12px", textAlign: "left" }}
          autoComplete="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "register" ? "Password (12+ characters)" : "Password"}
          className="input"
          style={{ marginBottom: "14px", textAlign: "left" }}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 12 : undefined}
          maxLength={128}
          required
        />
        {mode === "register" && (
          <input
            type="password"
            value={legacyPassword}
            onChange={(e) => setLegacyPassword(e.target.value)}
            placeholder="Previous dashboard password (if migrating stores)"
            className="input"
            style={{ marginBottom: "14px", textAlign: "left" }}
            autoComplete="off"
          />
        )}
        {error && <p className="text-error" style={{ marginBottom: "12px", marginTop: "-6px" }}>{error}</p>}
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", padding: "9px" }}>
          {loading ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}
        </button>
        <a href="/privacy" style={{ display: "block", marginTop: "18px", color: "var(--text-tertiary)", fontSize: "11.5px", textDecoration: "none" }}>
          Privacy policy
        </a>
      </form>
    </main>
  );
}
