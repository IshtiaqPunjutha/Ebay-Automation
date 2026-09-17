import { NextResponse } from "next/server";
import { listEbayStores } from "@/lib/store";

export async function GET() {
  try {
    const stores = await listEbayStores();
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
