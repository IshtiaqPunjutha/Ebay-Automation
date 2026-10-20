import { NextResponse } from "next/server";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";
import { PIN_COOKIE, PIN_PATTERN, UNLOCK_TTL_MS, checkPin, createPin, createUnlockCookieValue, hasPin, isUnlocked } from "@/lib/pin";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const cookieOptions = (maxAge) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge });

async function userOf(request) {
  return getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

// GET /api/finance/pin -> { hasPin, unlocked }
export async function GET(request) {
  const userId = await userOf(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ hasPin: await hasPin(userId), unlocked: await isUnlocked(request, userId) });
}

// POST /api/finance/pin  body: { pin }
// The first time (no PIN yet) this creates the PIN and unlocks; afterwards it checks the PIN.
export async function POST(request) {
  const userId = await userOf(request);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!PIN_PATTERN.test(pin)) return NextResponse.json({ error: "The PIN is 4 to 8 digits." }, { status: 400 });

  let created = false;
  if (!(await hasPin(userId))) {
    created = await createPin(userId, pin);
  } else {
    const result = await checkPin(userId, pin);
    if (!result.ok) {
      const error = result.locked
        ? `Too many wrong tries. Wait ${Math.ceil(result.waitSeconds / 60)} minute(s).`
        : "Wrong PIN.";
      return NextResponse.json({ error }, { status: result.locked ? 429 : 403 });
    }
  }
  const response = NextResponse.json({ ok: true, created });
  response.cookies.set(PIN_COOKIE, await createUnlockCookieValue(userId), cookieOptions(UNLOCK_TTL_MS / 1000));
  return response;
}

// DELETE /api/finance/pin -> locks again (done when the finance page is left).
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PIN_COOKIE, "", cookieOptions(0));
  return response;
}
