export const metadata = {
  title: "Order Automation Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0f1115" }}>{children}</body>
    </html>
  );
}
