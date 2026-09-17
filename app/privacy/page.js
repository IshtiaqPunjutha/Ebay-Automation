export const metadata = {
  title: "Privacy Policy | Order Automation Dashboard",
};

export default function PrivacyPolicyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.content}>
        <a href="/login" style={styles.backLink}>
          Back to login
        </a>
        <h1 style={styles.heading}>Privacy Policy</h1>
        <p style={styles.updated}>Last updated: September 17, 2026</p>

        <p>
          This Privacy Policy explains how the Order Automation Dashboard
          collects, uses, and protects information when you use this service.
        </p>

        <h2>Information we collect</h2>
        <p>
          The dashboard may process eBay account and order information that you
          authorize through eBay&apos;s OAuth connection. This can include order,
          buyer, item, shipping, and fulfillment details needed to display and
          manage your orders.
        </p>
        <p>
          We also process login information needed to protect access to the
          dashboard. The application does not store your eBay password.
        </p>

        <h2>How we use information</h2>
        <p>
          Information is used to authenticate authorized users, retrieve and
          display eBay orders, support order automation, and maintain the
          security and reliability of the service. We do not sell personal
          information or use it for unrelated advertising.
        </p>

        <h2>Data storage and security</h2>
        <p>
          OAuth access and refresh tokens are stored in the application&apos;s
          configured secure data store. Access to dashboard data is restricted
          by authentication and session controls. No online service can
          guarantee absolute security, but reasonable technical safeguards are
          used to protect the information processed by this application.
        </p>

        <h2>Third-party services</h2>
        <p>
          This service connects to eBay APIs. Your use of eBay remains subject
          to eBay&apos;s own privacy policy and terms. We only request and use the
          permissions needed for the dashboard&apos;s connected features.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          Information is retained only for as long as needed to provide the
          dashboard and its connected features. You can disconnect the eBay
          account or request deletion of stored connection data from the
          service operator.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          This policy may be updated when the service or its data practices
          change. The updated version will be published on this page with a new
          revision date.
        </p>
      </article>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "48px 20px",
    boxSizing: "border-box",
    background: "#0f1115",
    color: "#d7dae0",
    fontFamily: "system-ui, sans-serif",
  },
  content: {
    maxWidth: "760px",
    margin: "0 auto",
    lineHeight: 1.7,
  },
  backLink: {
    color: "#60a5fa",
    fontSize: "14px",
    textDecoration: "none",
  },
  heading: { color: "#fff", fontSize: "36px", margin: "28px 0 4px" },
  updated: { color: "#8a8f98", fontSize: "13px", marginTop: 0 },
  h2: { color: "#fff", fontSize: "21px", margin: "32px 0 8px" },
};