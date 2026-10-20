import { NextResponse } from "next/server";
import { MONTH_PATTERN, guardFinance, readJson } from "@/lib/financeAuth";
import { loadMonthReport, monthHasEnded } from "@/lib/financeReport";
import { getClosedMonths, getEbayStore, saveClosedMonths } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// POST /api/finance/close?store=<id>   body: { month: "2026-10" }   (needs the finance PIN)
// Freezes the month: its figures, the partnership split and the expenses are saved as they are now.
export async function POST(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || !MONTH_PATTERN.test(body.month || "")) return NextResponse.json({ error: "A month like 2026-10 is needed." }, { status: 400 });
  const month = body.month;
  if (!monthHasEnded(month)) return NextResponse.json({ error: "This month is not over yet. Close it after its last day." }, { status: 400 });

  const closed = await getClosedMonths(g.userId, g.storeId);
  if (closed[month]) return NextResponse.json({ error: "This month is already closed." }, { status: 409 });

  try {
    const store = await getEbayStore(g.userId, g.storeId);
    const { partnership, report } = await loadMonthReport(g.userId, { ...store, storeId: g.storeId }, month);
    closed[month] = { closedAt: Date.now(), partnership, report };
    await saveClosedMonths(g.userId, g.storeId, closed);
    return NextResponse.json({ ok: true, closedAt: closed[month].closedAt });
  } catch (err) {
    console.error(`Closing ${month} failed for store ${g.storeId}:`, err);
    return NextResponse.json({ error: "Could not read this month from eBay, so it was not closed." }, { status: 502 });
  }
}

// DELETE /api/finance/close?store=<id>   body: { month }   Reopens a closed month (the figures are live again).
export async function DELETE(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || !MONTH_PATTERN.test(body.month || "")) return NextResponse.json({ error: "A month like 2026-10 is needed." }, { status: 400 });
  const closed = await getClosedMonths(g.userId, g.storeId);
  if (closed[body.month]) {
    delete closed[body.month];
    await saveClosedMonths(g.userId, g.storeId, closed);
  }
  return NextResponse.json({ ok: true });
}
