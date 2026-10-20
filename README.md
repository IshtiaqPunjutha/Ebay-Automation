# eBay Order Dashboard — Step 1

Scope of this step: **connect your eBay seller account and see your unshipped
orders on a dashboard.** No AliExpress, no sheet matching, no tracking sync
yet — that comes in later steps.

## What's included
- Email/password accounts with individual signed-in sessions
- User-isolated eBay stores, tokens, and order access
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
2. Create a production application for access to your live seller account.
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

- `SESSION_SECRET` — at least 32 random characters, used to sign user sessions
- `APP_PASSWORD` — temporarily retain the previous shared dashboard password
  if migrating its existing eBay stores; remove it after the first account signup
- `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME` — from step 1
- `EBAY_SIGNATURE_KEY_JWE`, `EBAY_SIGNATURE_PRIVATE_KEY` — generated with
  eBay's [Key Management API](https://developer.ebay.com/api-docs/developer/key-management/overview.html).
  The private key is returned only once; store it securely as a Vercel
  environment variable and never commit it to Git.
- `EBAY_ENV` — set to `production`
- `APP_BASE_URL` — your deployed Vercel URL, e.g. `https://your-app.vercel.app`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — from step 2

The Finances API requires eBay digital-signature headers for UK/EU sellers.
The app uses eBay's Node.js signing SDK for these requests. From the project
folder, run `node generate-ebay-signing-key.js`. To replace an existing local
signing key, run `node generate-ebay-signing-key.js --replace`. The script uses the
Production app credentials in `.env.local`, creates an `ED25519` keypair, and
saves `EBAY_SIGNATURE_KEY_JWE` and PEM-formatted `EBAY_SIGNATURE_PRIVATE_KEY`
to the ignored `.env.local` file without printing them. Copy those two values into Vercel's
Production environment variables, then redeploy. eBay returns the private key
only once, so keep it secure and never commit it to Git.

### 4. Deploy
```bash
npm install
npx vercel deploy --prod
```
(Or connect this repo to Vercel via their dashboard for auto-deploys.)

### 5. Use it
1. Visit your deployed URL and create an account, or log in with your email.
2. Click **"Connect Your eBay Store"**.
3. Log into eBay with your seller account and click **Allow**.
4. You'll land back on your private dashboard — your unshipped orders should
   now be listed.

## Notes
- Each account has a separate store index and separate store/token records.
  Users cannot list, fetch orders from, refresh, or disconnect another
  account's stores.
- Stores saved by the old shared-password version are not automatically
  assigned to an account. The first account signup must provide the previous
  `APP_PASSWORD` to claim and migrate those stores; the old global KV entries
  are removed after a successful copy. If there are no legacy stores, this
  password is not required.

## Next steps (not built yet, on purpose)
- Google Sheet / Excel lookup: eBay SKU → AliExpress link + variant mapping
- Order queue UI with "Process Next" action
- Browser extension: AliExpress auto-fill (product page, address popup,
  variant, quantity) + review-before-submit screen
- Tracking number sync back to eBay via Fulfillment API

## Store pages and sheet mapping

- Inside a store the sidebar switches to that store's menu: **Orders** and
  **Sheet mapping**.
- **Sheet mapping** (`/stores/<id>/sheet`) is a per-store grid for pairing an
  eBay link with its AliExpress link (plus notes). It autosaves to Vercel KV
  through `/api/ebay/sheet` and accepts pasted rows from Excel or Google Sheets.
  The sheet is kept if the store is disconnected.

## Browser extension (AliExpress Sync)

`aliexpress-sync-extension/` is a Chrome extension that sends AliExpress order numbers to the
matching eBay order. Create its token in the dashboard under **Account, then Browser extension**,
and see `aliexpress-sync-extension/README.md` for install and use. It talks to `/api/ext/*`, which
accepts that token (a hash of it is stored in KV) instead of the login cookie.

## Sending AliExpress tracking to eBay

Orders on the **New orders** page whose AliExpress tracking has been read by the extension get an
enabled tick box. Tick them (or press **Select all with tracking**) and press **Send tracking to eBay**:
a review screen lists each order with its tracking number and the carrier AliExpress showed (changeable), and nothing is sent until
the confirmation box is ticked. Sending marks the order as **shipped on eBay** and tells the buyer; the
API offers no way to undo that.

The server checks every order again before sending (`/api/ebay/ship`): the tracking must be the one read
from AliExpress for that order, the order must have exactly one AliExpress order, eBay must still show it
as not shipped, and the same tracking is never sent twice. Each order gets its own result. Orders with
several AliExpress orders, or without tracking yet, cannot be ticked.

`EBAY_API_BASE` (optional) points the eBay Fulfillment calls at another host and exists only for testing
against a fake server.

### Automatic sending (before the dispatch-by date)

On **New orders**, the **Auto-send** button opens the settings for that store: turn it on, choose how many
days before eBay's dispatch-by date to send (default 2). The carrier is taken per order from AliExpress. It starts off.

An order only becomes sendable once AliExpress shows the local carrier name (e.g. InPost) next to the
tracking number; until then it shows "Waiting for carrier" and the extension keeps re-reading it.

Once a day (07:00 UTC, see `vercel.json`) the job `/api/cron/auto-ship` looks at every store that has it
switched on and sends the tracking of each unshipped order that is due, using exactly the same checks as the
manual button (`lib/shipOrders.js`): the tracking was read from AliExpress, the order has exactly one
AliExpress order, eBay still shows it as not shipped, and it was never sent before. Orders that are not ready
are left alone and the **What would be sent now?** button shows why. What the job did is listed in the dialog.

**Setup (once):** add an environment variable `CRON_SECRET` (any random text, 16+ characters) in Vercel and
redeploy. Vercel then calls the job with `Authorization: Bearer <CRON_SECRET>`. Without it the job refuses to
run, so nothing is sent automatically. Vercel's Hobby plan allows one run a day, so an order may go out up to a
day later than the exact moment; the tracking itself is only available once the extension has read it from
AliExpress (Chrome must have been running).

## Finance (PIN protected)

The **Finance** page shows, for a chosen month and for every store, the eBay earnings (after eBay's fees,
from the Finances API), the AliExpress cost, other charges, the profit, and each partner's share. Each
store has its own split ("VA gets 40%", owner gets the rest), saved with **Save split**.

- The AliExpress cost is read by the extension from the order list ("Total: £ 2.04") once an order has
  been synced to an eBay order (extension 1.3.0, reload it). Orders without a cost are counted and
  flagged, because their profit is then overstated.
- The first visit asks you to create a 4 to 8 digit PIN; after that the PIN is asked on every visit. The
  page locks again when you leave it (and after 15 minutes). Five wrong tries lock it for 5 minutes.
- Costs in a different currency than the earnings are not converted; they are reported and left out.

_Finance page: redeploy trigger._

### Finance extras (per store, PIN protected)

- **Typed cost**: in the orders table of a store's Finance page, "Add cost" / "Edit" sets the AliExpress cost of one
  eBay order by hand. It replaces the extension's figure for that order; "Remove mine" brings the extension's back.
- **Extra expenses**: costs eBay does not know about (tools, packaging ...), added with a date inside the month. They
  are taken off the profit, so both partners share them.
- **VA payments**: record what you paid the VA for a month. The page shows what is owed, paid and still to pay.
- Money is added in whole pence, months and days follow UK time (set `FINANCE_TIMEZONE` to change it), and
  **Check against eBay** compares every order with the orders page's own figure.

### Closing a month and Excel (per store, PIN protected)

On a store's Finance page, **Close month** (only after the month's last day) saves the month as it is: orders,
earnings, costs, charges, expenses and the partnership split. A closed month never changes again, whatever eBay
or the extension says later; VA payments can still be recorded against it. **Reopen month** makes it live again.
**Closed months** lists every closed month; **Download Excel** gives a workbook for one month (Summary, Days, Orders,
Other charges, Extra expenses, VA payments) and **Download all as Excel** one row per closed month.

### New-order alerts

While the dashboard is open in a tab, it checks every store for new orders (about every 90 seconds, every 3 minutes
when the tab is in the background). A new order plays a short chime, shows a browser notification (allow it once)
and refreshes the open New orders list. The sidebar shows a red number next to **New orders** and **Stores** for
the orders that still have no AliExpress number, the tab title shows the total, and each such order carries a red
**New** tag that disappears once its AliExpress number is synced. The bell in the top bar turns the sound on or off.
This runs in the browser tab: with the dashboard closed nothing is checked (a Vercel cron cannot play a sound, and the
free plan only runs it once a day).
