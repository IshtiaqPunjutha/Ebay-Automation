import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "40px 44px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: "1080px", margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
