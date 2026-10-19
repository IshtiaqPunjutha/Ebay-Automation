import { NextResponse } from "next/server";
import { getEbayStore, getOrderRefs } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// GET /api/ext/refs?store=<storeId>   (Authorization: Bearer <extension token>)
// { refs: { [ebayOrderId]: { aliOrderIds, updatedAt } } }: the AliExpress numbers the dashboard
// holds for a store. The extension uses it to show "Synced" only for numbers that are really there
// (so a number removed in the dashboard stops showing as synced).
export async function GET(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });

  const storeId = new URL(request.url).searchParams.get("store");
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 });
  }
  if (!canUseStore(auth, storeId)) {
    return NextResponse.json({ error: "This token is for a different store." }, { status: 403 });
  }

  try {
    if (!(await getEbayStore(auth.userId, storeId))) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    return NextResponse.json({ refs: await getOrderRefs(auth.userId, storeId) });
  } catch (err) {
    console.error("Extension refs read failed:", err);
    return NextResponse.json({ error: "Failed to load order numbers" }, { status: 500 });
  }
}
