import { NextResponse } from "next/server";
import { guardFinance, readJson, validAmount } from "@/lib/financeAuth";
import { setManualCost } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const ORDER_ID_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

// PUT /api/finance/manual-cost?store=<id>   body: { orderId, amount }   (needs the finance PIN)
// amount is the AliExpress cost of that eBay order in pounds; null removes it (the extension's figure is used again).
export async function PUT(request) {
  const g = await guardFinance(request);
  if (g.error) return g.error;
  const body = await readJson(request);
  if (!body || !ORDER_ID_PATTERN.test(body.orderId || "")) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  if (body.amount !== null && !validAmount(body.amount)) {
    return NextResponse.json({ error: "The cost must be a number from 0 up, with at most 2 decimals." }, { status: 400 });
  }
  await setManualCost(g.userId, g.storeId, body.orderId, body.amount);
  return NextResponse.json({ ok: true });
}
