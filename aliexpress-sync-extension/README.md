# AliExpress Sync for the Order Dashboard

Sends your AliExpress order numbers to the matching eBay order in the dashboard.

## Install (once)

1. In Chrome open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `aliexpress-sync-extension` folder.
3. In the dashboard open **Account, then Browser extension**, choose **Token for** (all stores, or one
   store) and press **Create token**. A token made for one store makes the extension show only
   that store's orders and sync only into that store, so each browser or AliExpress account can be
   tied to its own store. You can create one token per store.
4. Click the extension icon, paste the dashboard address and the token, press **Test connection**.
   Chrome asks once for permission to talk to your dashboard; allow it.

## Use

1. In the dashboard, open an order and click the blue **arrow** next to it. The AliExpress
   product opens, and the extension remembers which eBay order it is for.
2. Buy it on AliExpress as usual.
3. Open your AliExpress orders. A small blue **Sync** button appears right next to each order's
   **Ref. Number**.
4. Press **Sync**. If exactly one eBay order has the product of that AliExpress order (matched through the AliExpress links in your sheet), it is synced straight away and a message with an **Undo** button shows which eBay order got the number. If two or more eBay orders have the same product it asks you, with those orders first. Otherwise a small menu lists the eBay orders that still need an AliExpress number (the one you opened with the arrow comes first, then the rest, newest first, with buyer and product) and you pick one. The number then shows on that order in the dashboard.

You do not have to use the arrow: the extension asks the dashboard which eBay orders still need a number, so it also works when the dashboard and AliExpress are in different browsers (install the extension, with its token, in the browser where AliExpress is).

## Notes

- The Sync button is placed next to the "Ref. Number: 3077062172300812" shown on each AliExpress
  order (also "Order ID" and `?orderId=` in the address). AliExpress changes its pages from time
  to time; if the button stops appearing, that detection (`lib.js`) is the place to adjust.
- The extension must be installed, with its token, in the browser where AliExpress is open.
  Settings and the arrow's memory are kept per browser.
- The token only lets the extension list your stores and unshipped orders (without buyer
  addresses) and add AliExpress order numbers. Create a new token in the dashboard at any time to
  cut off an old one.
