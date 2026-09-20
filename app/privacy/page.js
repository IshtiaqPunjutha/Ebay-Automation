export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicy() {
  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Privacy policy</h1>
        <p style={styles.updated}>Last updated: {new Date().toLocaleDateString()}</p>

        <p style={styles.p}>
          This application is a private, internal order-fulfillment tool
          used to connect an eBay seller account to a fulfillment workflow.
          It is not a public-facing service and does not sell, share, or
          expose data to third parties.
        </p>

        <h2 style={styles.h2}>Data we access</h2>
        <p style={styles.p}>
          Through the eBay API, this application accesses order data
          necessary for fulfillment, including item titles and SKUs, buyer
          shipping name and address, order quantities, and selected product
          variants such as color or size.
        </p>

        <h2 style={styles.h2}>How data is used</h2>
        <p style={styles.p}>
          Order data is used solely to identify, process, and fulfill
          orders placed on the connected eBay account, and to update those
          orders with shipment tracking information once available.
        </p>

        <h2 style={styles.h2}>Data storage</h2>
        <p style={styles.p}>
          Access tokens and order data are stored securely and are only
          accessible to the operator of this application. Data is not
          shared with any third party other than the platforms directly
          involved in order fulfillment.
        </p>

        <h2 style={styles.h2}>Contact</h2>
        <p style={styles.p}>
          For questions about this policy, contact the operator of this
          application directly.
        </p>
      </div>
    </main>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "var(--bg)",
    fontFamily: "var(--font-sans), sans-serif",
    padding: "48px 20px",
  },
  card: {
    maxWidth: "640px",
    margin: "0 auto",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: "32px",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-primary)",
  },
  h1: { fontSize: "20px", fontWeight: 700, margin: "0 0 4px 0" },
  updated: { color: "var(--text-tertiary)", fontSize: "12px", margin: "0 0 26px 0" },
  h2: { fontSize: "14.5px", fontWeight: 600, marginTop: "24px", marginBottom: "8px" },
  p: { color: "var(--text-secondary)", fontSize: "13.5px", lineHeight: "1.65", margin: 0 },
};
