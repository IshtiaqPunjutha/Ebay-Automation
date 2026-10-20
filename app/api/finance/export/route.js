import { NextResponse } from "next/server";
import { MONTH_PATTERN, guardFinance } from "@/lib/financeAuth";
import { buildHistoryWorkbook, buildMonthWorkbook } from "@/lib/financeExcel";
import { loadMonthReport, monthSummaryRow } from "@/lib/financeReport";
import { getClosedMonths, getEbayStore, getPayments } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const safeName = (text) => String(text).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "store";

function download(buffer, filename) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// GET /api/finance/export?store=<id>&month=2026-10   one month (closed months exactly as closed)
// GET /api/finance/export?store=<id>&all=1           every closed month, one row each
// Needs the finance PIN.
export async function GET(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const store = await getEbayStore(g.userId, g.storeId);
  const label = store.label || g.storeId;
  const params = new URL(request.url).searchParams;

  try {
    if (params.get("all") === "1") {
      const [closed, payments] = await Promise.all([getClosedMonths(g.userId, g.storeId), getPayments(g.userId, g.storeId)]);
      const rows = Object.entries(closed)
        .map(([month, snap]) => {
          const row = monthSummaryRow(month, snap);
          const paid = payments.filter((p) => p.month === month).reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
          return { ...row, vaPaid: paid / 100, vaBalance: (Math.round(row.vaShare * 100) - paid) / 100 };
        })
        .sort((a, b) => a.month.localeCompare(b.month));
      if (rows.length === 0) return NextResponse.json({ error: "No month has been closed yet." }, { status: 404 });
      return download(await buildHistoryWorkbook({ storeLabel: label, rows }), `finance-${safeName(label)}-closed-months.xlsx`);
    }

    const month = params.get("month") || "";
    if (!MONTH_PATTERN.test(month)) return NextResponse.json({ error: "A month like 2026-10 is needed." }, { status: 400 });
    const { partnership, report, closed } = await loadMonthReport(g.userId, { ...store, storeId: g.storeId }, month);
    const buffer = await buildMonthWorkbook({ storeLabel: label, month, partnership, report, closedAt: closed?.at });
    return download(buffer, `finance-${safeName(label)}-${month}${closed ? "" : "-open"}.xlsx`);
  } catch (err) {
    console.error(`Finance export failed for store ${g.storeId}:`, err);
    return NextResponse.json({ error: "Could not build the Excel file." }, { status: 502 });
  }
}
