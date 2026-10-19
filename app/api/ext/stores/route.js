import { NextResponse } from "next/server";
import { listEbayStores } from "@/lib/store";
import { authFromBearer, canUseStore } from "@/lib/exttoken";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

// GET /api/ext/stores   (Authorization: Bearer <extension token>)
// Lets the extension check its token and see which stores it can sync to. A token made
// for one store sees only that store.
export async function GET(request) {
  const auth = await authFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
  try {
    const stores = (await listEbayStores(auth.userId)).filter((s) => canUseStore(auth, s.storeId));
    return NextResponse.json({
      scope: auth.storeId ? "store" : "all",
      stores: stores.map((s) => ({ storeId: s.storeId, label: s.label })),
    });
  } catch (err) {
    console.error("Extension store list failed:", err);
    return NextResponse.json({ error: "Failed to list stores" }, { status: 500 });
  }
}
