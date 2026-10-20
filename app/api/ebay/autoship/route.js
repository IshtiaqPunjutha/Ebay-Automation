import { NextResponse } from "next/server";
import { runAutoShip } from "@/lib/autoship";
import { getAutoShip, getAutoShipLog, getEbayStore, setAutoShip } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

async function resolve(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const storeId = new URL(request.url).searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  }
  if (!(await getEbayStore(userId, storeId))) {
    return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  }
  return { userId, storeId };
}

// GET /api/ebay/autoship?store=<id>             -> { settings, log }
// GET /api/ebay/autoship?store=<id>&preview=1   -> also { preview: { due, waiting } }: what the job would
//                                                  send right now and why it leaves the others. Sends nothing.
export async function GET(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  try {
    const out = {
      settings: await getAutoShip(r.userId, r.storeId),
      log: await getAutoShipLog(r.userId, r.storeId),
      // The daily job refuses to run without a CRON_SECRET in the project settings; tell the page.
      cronReady: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
    };
    if (new URL(request.url).searchParams.get("preview") === "1") {
      try {
        const { plan } = await runAutoShip(r.userId, r.storeId, { dryRun: true });
        out.preview = plan;
      } catch (err) {
        out.previewError = err.code === "invalid_grant" ? "This eBay connection needs to be authorized again." : "Could not read your orders from eBay.";
      }
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error(`Error reading automatic sending for store ${r.storeId}:`, err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

// PUT /api/ebay/autoship?store=<id>   body: { enabled, daysBefore (0-14) }
// (the carrier is taken per order from AliExpress's tracking page, so it is not a setting any more)
export async function PUT(request) {
  const r = await resolve(request);
  if (r.error) return r.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const daysBefore = Number(body?.daysBefore);
  if (typeof body?.enabled !== "boolean" || !Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 14) {
    return NextResponse.json({ error: "enabled (true/false) and daysBefore (0 to 14) are needed." }, { status: 400 });
  }
  try {
    return NextResponse.json({ settings: await setAutoShip(r.userId, r.storeId, { enabled: body.enabled, daysBefore }) });
  } catch (err) {
    console.error(`Error saving automatic sending for store ${r.storeId}:`, err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
