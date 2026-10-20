import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { isUnlocked } from "@/lib/pin";
import { monthRange, summarizeMonth } from "@/lib/finance";
import { fetchTransactionsInRange, isTokenExpired, refreshAccessToken } from "@/lib/ebay";
import { getAliCosts, getOrderRefs, getPartnership, listEbayStores, updateStoreAccessToken } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// GET /api/finance/report?month=2026-10[&store=<id>]   (needs the finance PIN)
// -> { month, stores: [{ storeId, label, partnership, report | error }] } for every connected store.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await isUnlocked(request, userId))) return NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month") || "";
  const range = monthRange(month);
  if (!range) return NextResponse.json({ error: "month must look like 2026-10" }, { status: 400 });

  // &store=<id> limits the report to one store (the store's own finance page).
  const only = new URL(request.url).searchParams.get("store");
  const stores = (await listEbayStores(userId)).filter((s) => !only || s.storeId === only);
  const out = await Promise.all(
    stores.map(async (s) => {
      const partnership = await getPartnership(userId, s.storeId);
      const base = { storeId: s.storeId, label: s.label || s.storeId, partnership };
      try {
        let record = s;
        if (isTokenExpired(record.tokens)) {
          const refreshed = await refreshAccessToken(record.tokens.refreshToken);
          record = await updateStoreAccessToken(userId, s.storeId, refreshed.accessToken, refreshed.expiresIn);
        }
        const [transactions, refs, costs] = await Promise.all([
          fetchTransactionsInRange(record.tokens.accessToken, range.from, range.to),
          getOrderRefs(userId, s.storeId),
          getAliCosts(userId, s.storeId),
        ]);
        return { ...base, report: summarizeMonth(transactions, refs, costs, partnership.vaPercent, month) };
      } catch (err) {
        console.error(`Finance report failed for store ${s.storeId}:`, err);
        return { ...base, error: err.code === "invalid_grant" ? "This eBay connection needs to be authorized again." : "Could not read this store's transactions from eBay." };
      }
    })
  );
  return NextResponse.json({ month, stores: out });
}
