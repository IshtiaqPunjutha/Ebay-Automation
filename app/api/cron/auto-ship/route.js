import { NextResponse } from "next/server";
import { runAutoShip } from "@/lib/autoship";
import { listAutoShipStores } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 300;

// Runs once a day (see vercel.json). Vercel calls it with "Authorization: Bearer <CRON_SECRET>". Without
// a CRON_SECRET set in the project, the job refuses to run at all, so it can never be started by anyone.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET is not set (at least 16 characters), so the automatic job is off." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stores = await listAutoShipStores();
  const summary = [];
  for (const { userId, storeId } of stores) {
    try {
      const { plan, results } = await runAutoShip(userId, storeId);
      summary.push({
        storeId,
        due: plan.due.length,
        sent: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      });
    } catch (err) {
      // One store failing (for example its eBay connection expired) must not stop the others.
      console.error(`Automatic sending failed for store ${storeId}:`, err);
      summary.push({ storeId, error: err.code === "invalid_grant" ? "eBay connection needs to be authorized again" : "failed" });
    }
  }
  return NextResponse.json({ ok: true, stores: summary });
}
