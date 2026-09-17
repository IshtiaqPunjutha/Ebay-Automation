import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f1115" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "32px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
