import { NextResponse } from "next/server";
import { removeEbayStore } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { storeId } = await request.json();
  if (!storeId) {
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  }
  await removeEbayStore(userId, storeId);
  return NextResponse.json({ ok: true });
}
