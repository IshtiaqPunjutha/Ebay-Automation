import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { isUnlocked } from "@/lib/pin";
import { monthRange, summarizeMonth } from "@/lib/finance";
import { fetchOrderEarnings, fetchTransactionsInRange, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { getEbayStore, updateStoreAccessToken } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;
const MAX_ORDERS = 150;

// GET /api/finance/verify?store=<id>&month=2026-10   (needs the finance PIN)
// Checks every order of the month against eBay a second way: the same per-order lookup the orders pages use
// for their Earnings column. Returns the orders where the two disagree.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await isUnlocked(request, userId))) return NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store") || "";
  const month = searchParams.get("month") || "";
  const range = monthRange(month);
  if (!STORE_ID_PATTERN.test(storeId) || !range) return NextResponse.json({ error: "A store and a month like 2026-10 are needed." }, { status: 400 });

  let store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  try {
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }
    const token = store.tokens.accessToken;
    const transactions = await fetchTransactionsInRange(token, range.from, range.to);
    const report = summarizeMonth(transactions, {}, {}, 0, month);
    const orders = report.orders.slice(0, MAX_ORDERS);

    const mismatches = [];
    let unavailable = 0;
    const CONCURRENCY = 6;
    for (let i = 0; i < orders.length; i += CONCURRENCY) {
      await Promise.all(
        orders.slice(i, i + CONCURRENCY).map(async (o) => {
          const other = await fetchOrderEarnings(token, o.orderId);
          if (!other) {
            unavailable += 1;
            return;
          }
          if (Math.round(other.earnings * 100) !== Math.round(o.net * 100)) {
            mismatches.push({ orderId: o.orderId, finance: o.net, ordersPage: other.earnings });
          }
        })
      );
    }
    return NextResponse.json({
      checked: orders.length - unavailable,
      unavailable,
      skipped: report.orders.length - orders.length,
      mismatches,
    });
  } catch (err) {
    console.error(`Finance verify failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not check this month against eBay." }, { status: 502 });
  }
}
