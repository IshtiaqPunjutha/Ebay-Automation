import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { backfillUsers, getProfile, listUsers } from "@/lib/users";
import { listEbayStores } from "@/lib/store";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// GET /api/admin/users  -> { total, users: [{ email, createdAt, lastLoginAt, stores }] }
// Only for the owner: the login emails listed in the ADMIN_EMAILS setting (comma separated).
export async function GET(request) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.length === 0) {
    return NextResponse.json({ error: "Set ADMIN_EMAILS (the login email of the owner) in the Vercel settings to see the account list." }, { status: 403 });
  }
  try {
    await backfillUsers();
    const me = await getProfile(userId);
    if (!me?.email || !admins.includes(String(me.email).toLowerCase())) {
      return NextResponse.json({ error: "Only the owner can see this page." }, { status: 403 });
    }
    const users = await listUsers();
    const withStores = await Promise.all(users.map(async (u) => ({ email: u.email, createdAt: u.createdAt || null, lastLoginAt: u.lastLoginAt || null, stores: (await listEbayStores(u.id)).length })));
    return NextResponse.json({ total: withStores.length, users: withStores });
  } catch (err) {
    console.error("Account list failed:", err);
    return NextResponse.json({ error: "Could not read the accounts." }, { status: 500 });
  }
}
