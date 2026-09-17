import { NextResponse } from "next/server";
import { removeEbayStore } from "@/lib/store";

export async function POST(request) {
  const { storeId } = await request.json();
  if (!storeId) {
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  }
  await removeEbayStore(storeId);
  return NextResponse.json({ ok: true });
}
