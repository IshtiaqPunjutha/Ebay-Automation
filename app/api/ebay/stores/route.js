import { NextResponse } from "next/server";
import { listEbayStores } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const stores = await listEbayStores(userId);
    const shaped = stores.map((s) => ({
      storeId: s.storeId,
      label: s.label,
      connectedAt: s.connectedAt,
    }));
    return NextResponse.json({ stores: shaped });
  } catch (err) {
    console.error("Error listing eBay stores:", err);
    return NextResponse.json({ stores: [], error: "Failed to list stores" }, { status: 500 });
  }
}
