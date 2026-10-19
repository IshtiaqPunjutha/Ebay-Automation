import { NextResponse } from "next/server";
import { ALL_STORES, createToken, getTokenInfo, revokeToken } from "@/lib/exttoken";
import { getEbayStore } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

// ?store=all (default) for a token that covers every store, or ?store=<storeId> for one store.
async function resolve(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };

  const scope = new URL(request.url).searchParams.get("store") || ALL_STORES;
  if (scope !== ALL_STORES) {
    if (!STORE_ID_PATTERN.test(scope)) {
      return { error: NextResponse.json({ error: "Invalid store id" }, { status: 400 }) };
    }
    if (!(await getEbayStore(userId, scope))) {
      return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
    }
  }
  return { userId, scope };
}

// GET: is there a token for this scope, and since when? (The token itself is never returned.)
export async function GET(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  const info = await getTokenInfo(r.userId, r.scope);
  return NextResponse.json({ scope: r.scope, exists: Boolean(info), createdAt: info?.createdAt || null });
}

// POST: create a new token for this scope (replacing any old one) and return it once.
export async function POST(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  const { token, createdAt } = await createToken(r.userId, r.scope);
  return NextResponse.json({ scope: r.scope, token, createdAt });
}

// DELETE: revoke the token for this scope.
export async function DELETE(request) {
  const r = await resolve(request);
  if (r.error) return r.error;
  await revokeToken(r.userId, r.scope);
  return NextResponse.json({ ok: true });
}
