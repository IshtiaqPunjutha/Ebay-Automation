import { NextResponse } from "next/server";
import { getEbayStore, getNicknames, listEbayStores, setNickname } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// GET -> { stores: [{ storeId, label, username, nickname, connectedAt }] }
// `label` is the name to show: the nickname if there is one, otherwise the eBay username.
export async function GET(request) {
  try {
    const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const [stores, nicknames] = await Promise.all([listEbayStores(userId), getNicknames(userId)]);
    const shaped = stores.map((s) => ({
      storeId: s.storeId,
      label: nicknames[s.storeId] || s.label,
      username: s.label,
      nickname: nicknames[s.storeId] || "",
      connectedAt: s.connectedAt,
    }));
    return NextResponse.json({ stores: shaped });
  } catch (err) {
    console.error("Error listing eBay stores:", err);
    return NextResponse.json({ stores: [], error: "Failed to list stores" }, { status: 500 });
  }
}

// PUT  body: { storeId, nickname }   (an empty nickname goes back to the eBay username)
export async function PUT(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  if (!STORE_ID_PATTERN.test(storeId)) return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  if (!(await getEbayStore(userId, storeId))) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  await setNickname(userId, storeId, nickname);
  return NextResponse.json({ ok: true, nickname });
}
