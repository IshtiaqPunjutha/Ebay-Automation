import { NextResponse } from "next/server";
import { createToken, getTokenInfo, revokeToken } from "@/lib/exttoken";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

async function currentUser(request) {
  return await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

// GET: is there a token, and since when? (The token itself is never returned.)
export async function GET(request) {
  const userId = await currentUser(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const info = await getTokenInfo(userId);
  return NextResponse.json({ exists: Boolean(info), createdAt: info?.createdAt || null });
}

// POST: create a new token (replacing any old one) and return it once.
export async function POST(request) {
  const userId = await currentUser(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { token, createdAt } = await createToken(userId);
  return NextResponse.json({ token, createdAt });
}

// DELETE: revoke the token.
export async function DELETE(request) {
  const userId = await currentUser(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  await revokeToken(userId);
  return NextResponse.json({ ok: true });
}
