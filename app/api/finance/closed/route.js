import { NextResponse } from "next/server";
import { guardFinance } from "@/lib/financeAuth";
import { monthSummaryRow } from "@/lib/financeReport";
import { getClosedMonths, getPayments } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

// GET /api/finance/closed?store=<id>   (needs the finance PIN)
// -> { months: [{ month, closedAt, orders, earnings, cost, otherCharges, expenses, profit, vaPercent, vaShare,
//                 ownerShare, vaPaid, vaBalance }] } newest first.
export async function GET(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const [closed, payments] = await Promise.all([getClosedMonths(g.userId, g.storeId), getPayments(g.userId, g.storeId)]);
  const months = Object.entries(closed)
    .map(([month, snap]) => {
      const row = monthSummaryRow(month, snap);
      const paid = payments.filter((p) => p.month === month).reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
      return { ...row, vaPaid: paid / 100, vaBalance: (Math.round(row.vaShare * 100) - paid) / 100 };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
  return NextResponse.json({ months });
}
