# eBay Order Dashboard — Step 1

Scope of this step: **connect your eBay seller account and see your unshipped
orders on a dashboard.** No AliExpress, no sheet matching, no tracking sync
yet — that comes in later steps.

## What's included
- Password-gated login (`APP_PASSWORD` env var)
- "Connect Your eBay Store" button → real eBay OAuth flow
- Token storage in Vercel KV (survives across requests — required since
  Vercel functions are stateless)
- Automatic token refresh (no re-login needed until the refresh token
  itself expires, ~18 months)
- Dashboard table of unshipped orders: item, SKU, variant, qty, buyer, ship-to address

## Setup steps

### 1. Create your eBay Developer app
1. Go to https://developer.ebay.com and sign in with the eBay account
   you actually sell on.
2. Create an application (Sandbox first is recommended for testing —
   gives you fake test orders before touching your real store).
3. Under your app's keys, note down: **Client ID**, **Client Secret**.
4. Under "User Tokens" / OAuth settings, set up a **RuName**:
   - Set the redirect (accept) URL to:
     `https://YOUR-VERCEL-DOMAIN/api/ebay/callback`
   - eBay will give you back a **RuName** value — this goes in your
     env vars, not the raw URL.

### 2. Create a Vercel KV database
1. In your Vercel project dashboard → Storage → Create Database → KV.
2. Connect it to this project. Vercel will auto-populate
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your project's env vars.

### 3. Set environment variables
Copy `.env.local.example` to `.env.local` for local dev, and also add the
same variables in Vercel → Project → Settings → Environment Variables for
production:

- `APP_PASSWORD` — password you'll use to log into your own dashboard
- `SESSION_SECRET` — any long random string
- `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME` — from step 1
- `EBAY_ENV` — `sandbox` while testing, `production` when you're ready
  to connect your real live store
- `APP_BASE_URL` — your deployed Vercel URL, e.g. `https://your-app.vercel.app`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — from step 2

### 4. Deploy
```bash
npm install
npx vercel deploy --prod
```
(Or connect this repo to Vercel via their dashboard for auto-deploys.)

### 5. Use it
1. Visit your deployed URL → log in with `APP_PASSWORD`.
2. Click **"Connect Your eBay Store"**.
3. Log into eBay with your actual seller account and click **Allow**.
4. You'll land back on the dashboard — your unshipped orders should
   now be listed.

## Notes
- Start with `EBAY_ENV=sandbox` and eBay's sandbox seller account to
  confirm the whole flow works end-to-end before pointing this at your
  real, live store (`EBAY_ENV=production` + real Client ID/Secret/RuName
  from a production eBay app).
- This uses a single shared password for login (Step 1 scope, as agreed).
  If you later need separate logins per client/store, that's a follow-up
  step, not part of this one.
- Token storage is currently single-store (one eBay account at a time).
  Multi-store support is a planned later step.

## Next steps (not built yet, on purpose)
- Google Sheet / Excel lookup: eBay SKU → AliExpress link + variant mapping
- Order queue UI with "Process Next" action
- Browser extension: AliExpress auto-fill (product page, address popup,
  variant, quantity) + review-before-submit screen
- Tracking number sync back to eBay via Fulfillment API
