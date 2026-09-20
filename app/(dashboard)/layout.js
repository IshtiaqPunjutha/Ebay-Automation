import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
