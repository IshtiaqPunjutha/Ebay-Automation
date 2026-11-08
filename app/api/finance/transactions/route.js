import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { isUnlocked } from "@/lib/pin";
import { monthRange } from "@/lib/finance";
import { fetchTransactionsInRange, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { getEbayStore, updateStoreAccessToken } from "@/lib/store";
import { timezoneOf } from "@/lib/marketplaces";
import { ensureStoreMarketplace } from "@/lib/storeMarketplace";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

const cell = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// GET /api/finance/transactions?store=<id>&month=2026-10   (needs the finance PIN)
// Every eBay transaction of the month exactly as eBay reports it, as a CSV file, to compare line by line with eBay's statement.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await isUnlocked(request, userId))) return NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store") || "";
  const month = searchParams.get("month") || "";
  if (!STORE_ID_PATTERN.test(storeId) || !monthRange(month)) return NextResponse.json({ error: "A store and a month like 2026-10 are needed." }, { status: 400 });

  let store = await getEbayStore(userId, storeId);
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  try {
    if (isTokenExpired(store.tokens)) {
      const refreshed = await refreshAccessToken(store.tokens.refreshToken);
      store = await updateStoreAccessToken(userId, storeId, refreshed.accessToken, refreshed.expiresIn);
    }
    const range = monthRange(month, timezoneOf((await ensureStoreMarketplace(userId, store)).store));
    const rows = await fetchTransactionsInRange(store.tokens.accessToken, range.from, range.to);
    const header = ["date", "type", "feeType", "status", "bookingEntry", "amount", "currency", "orderId", "references", "totalFeeAmount", "totalFeeBasisAmount", "transactionId"];
    const lines = [header.join(",")];
    for (const t of rows) {
      lines.push(
        [
          t.transactionDate,
          t.transactionType,
          t.feeType,
          t.transactionStatus,
          t.bookingEntry,
          t.amount?.value,
          t.amount?.currency,
          t.orderId,
          (t.references || []).map((r) => `${r.referenceType}:${r.referenceId}`).join(" "),
          t.totalFeeAmount?.value,
          t.totalFeeBasisAmount?.value,
          t.transactionId,
        ]
          .map(cell)
          .join(",")
      );
    }
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ebay-transactions-${storeId}-${month}.csv"`,
      },
    });
  } catch (err) {
    console.error(`Transactions export failed for store ${storeId}:`, err);
    return NextResponse.json({ error: "Could not read the transactions from eBay." }, { status: 502 });
  }
}
