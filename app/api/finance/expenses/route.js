import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DATE_PATTERN, MONTH_PATTERN, cleanText, guardFinance, readJson, validAmount } from "@/lib/financeAuth";
import { getClosedMonths, getExpenses, saveExpenses } from "@/lib/store";

const CLOSED = "This month is closed. Reopen it first if you need to change it.";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const MAX_PER_MONTH = 200;

// POST /api/finance/expenses?store=<id>   body: { month: "2026-10", label, amount, date: "2026-10-14" }
// An expense eBay does not know about (a tool, packaging ...). It is taken off the month's profit, so both
// partners share it. The date must fall inside the month.
export async function POST(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  const label = cleanText(body?.label, 80);
  if (!body || !MONTH_PATTERN.test(body.month || "") || !DATE_PATTERN.test(body.date || "") || !body.date.startsWith(body.month)) {
    return NextResponse.json({ error: "A month and a date inside that month are needed." }, { status: 400 });
  }
  if (!label) return NextResponse.json({ error: "Write what the expense is for." }, { status: 400 });
  if (!validAmount(body.amount) || body.amount === 0) {
    return NextResponse.json({ error: "The amount must be above 0, with at most 2 decimals." }, { status: 400 });
  }
  if ((await getClosedMonths(g.userId, g.storeId))[body.month]) return NextResponse.json({ error: CLOSED }, { status: 409 });
  const list = await getExpenses(g.userId, g.storeId, body.month);
  if (list.length >= MAX_PER_MONTH) return NextResponse.json({ error: "Too many expenses for one month." }, { status: 400 });
  await saveExpenses(g.userId, g.storeId, body.month, [...list, { id: randomUUID(), label, amount: body.amount, date: body.date }]);
  return NextResponse.json({ ok: true });
}

// DELETE /api/finance/expenses?store=<id>   body: { month, id }
export async function DELETE(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || !MONTH_PATTERN.test(body.month || "") || typeof body.id !== "string") {
    return NextResponse.json({ error: "A month and an expense id are needed." }, { status: 400 });
  }
  if ((await getClosedMonths(g.userId, g.storeId))[body.month]) return NextResponse.json({ error: CLOSED }, { status: 409 });
  const list = await getExpenses(g.userId, g.storeId, body.month);
  await saveExpenses(g.userId, g.storeId, body.month, list.filter((e) => e.id !== body.id));
  return NextResponse.json({ ok: true });
}
