import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { isUnlocked } from "@/lib/pin";
import { monthRange } from "@/lib/finance";
import { loadMonthReport } from "@/lib/financeReport";
import { getNicknames, getPartnership, listEbayStores } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// GET /api/finance/report?month=2026-10[&store=<id>]   (needs the finance PIN)
// -> { month, stores: [{ storeId, label, partnership, closed, report | error }] } for every connected store.
// A closed month comes back exactly as it was closed.
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await isUnlocked(request, userId))) return NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month") || "";
  if (!monthRange(month)) return NextResponse.json({ error: "month must look like 2026-10" }, { status: 400 });

  // &store=<id> limits the report to one store (the store's own finance page).
  const only = new URL(request.url).searchParams.get("store");
  const nicknames = await getNicknames(userId);
  const stores = (await listEbayStores(userId)).filter((s) => !only || s.storeId === only);
  const out = await Promise.all(
    stores.map(async (s) => {
      const label = nicknames[s.storeId] || s.label || s.storeId;
      try {
        const { partnership, report, closed } = await loadMonthReport(userId, s, month);
        return { storeId: s.storeId, label, partnership, closed, report };
      } catch (err) {
        console.error(`Finance report failed for store ${s.storeId}:`, err);
        return {
          storeId: s.storeId,
          label,
          partnership: await getPartnership(userId, s.storeId),
          closed: null,
          error: err.code === "invalid_grant" ? "This eBay connection needs to be authorized again." : "Could not read this store's transactions from eBay.",
        };
      }
    })
  );
  return NextResponse.json({ month, stores: out });
}
