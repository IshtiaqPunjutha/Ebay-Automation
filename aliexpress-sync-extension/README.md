# AliExpress Sync for the Order Dashboard

Sends your AliExpress order numbers to the matching eBay order in the dashboard.

## Install (once)

1. In Chrome open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `aliexpress-sync-extension` folder.
3. In the dashboard open **Account, then Browser extension** and press **Create token**.
4. Click the extension icon, paste the dashboard address and the token, press **Test connection**.
   Chrome asks once for permission to talk to your dashboard; allow it.

## Use

1. In the dashboard, open an order and click the blue **arrow** next to it. The AliExpress
   product opens, and the extension remembers which eBay order it is for.
2. Buy it on AliExpress as usual.
3. Open your AliExpress orders. A small blue **Sync** button appears right next to each order's
   **Ref. Number**.
4. Press **Sync**. If the product in that AliExpress order is the one linked to an eBay order in your sheet, it is synced straight away. Otherwise a small menu lists the eBay orders that still need an AliExpress number (the one you opened with the arrow comes first, then the rest, newest first, with buyer and product) and you pick one. The number then shows on that order in the dashboard.

You do not have to use the arrow: the extension asks the dashboard which eBay orders still need a number, so it also works when the dashboard and AliExpress are in different browsers (install the extension, with its token, in the browser where AliExpress is).

If a number is not detected, type it into the box at the bottom of the panel and press Enter.

## Notes

- The panel looks for the "Ref. Number: 3077062172300812" shown on each AliExpress order (also "Order ID" and `?orderId=` in the address).
  AliExpress changes its pages from time to time; if numbers stop being found, that detection
  (`lib.js`) is the place to adjust.
- The token only lets the extension add AliExpress order numbers and list your store names.
  Create a new token in the dashboard at any time to cut off an old one.
