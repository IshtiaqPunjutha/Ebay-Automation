import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DATE_PATTERN, MONTH_PATTERN, cleanText, guardFinance, readJson, validAmount } from "@/lib/financeAuth";
import { getPayments, savePayments } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const MAX_PAYMENTS = 500;

// POST /api/finance/payments?store=<id>   body: { month: "2026-10", amount, date: "2026-11-02", note? }
// Records money paid to the VA for that month's profit.
export async function POST(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || !MONTH_PATTERN.test(body.month || "") || !DATE_PATTERN.test(body.date || "")) {
    return NextResponse.json({ error: "A month and a payment date are needed." }, { status: 400 });
  }
  if (!validAmount(body.amount) || body.amount === 0) {
    return NextResponse.json({ error: "The amount must be above 0, with at most 2 decimals." }, { status: 400 });
  }
  const list = await getPayments(g.userId, g.storeId);
  if (list.length >= MAX_PAYMENTS) return NextResponse.json({ error: "Too many payments saved." }, { status: 400 });
  await savePayments(g.userId, g.storeId, [
    ...list,
    { id: randomUUID(), month: body.month, amount: body.amount, date: body.date, note: cleanText(body.note, 80) },
  ]);
  return NextResponse.json({ ok: true });
}

// DELETE /api/finance/payments?store=<id>   body: { id }
export async function DELETE(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "A payment id is needed." }, { status: 400 });
  const list = await getPayments(g.userId, g.storeId);
  await savePayments(g.userId, g.storeId, list.filter((p) => p.id !== body.id));
  return NextResponse.json({ ok: true });
}
