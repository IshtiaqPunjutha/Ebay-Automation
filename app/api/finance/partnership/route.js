import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { isUnlocked } from "@/lib/pin";
import { isValidPercent } from "@/lib/finance";
import { getEbayStore, setPartnership } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// PUT /api/finance/partnership?store=<id>   body: { vaPercent }   (needs the finance PIN)
// vaPercent is the VA's share of the profit; the owner gets the rest (40 means 40 / 60).
export async function PUT(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await isUnlocked(request, userId))) return NextResponse.json({ error: "Enter your PIN first.", locked: true }, { status: 403 });

  const storeId = new URL(request.url).searchParams.get("store") || "";
  if (!STORE_ID_PATTERN.test(storeId)) return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });
  if (!(await getEbayStore(userId, storeId))) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isValidPercent(body?.vaPercent)) {
    return NextResponse.json({ error: "The VA share must be a number from 0 to 100 (at most 2 decimals)." }, { status: 400 });
  }
  return NextResponse.json({ partnership: await setPartnership(userId, storeId, body.vaPercent) });
}
