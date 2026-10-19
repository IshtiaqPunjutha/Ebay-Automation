import { NextResponse } from "next/server";
import { getEbayStore, getStoreSheet, saveStoreSheet } from "@/lib/store";
import { getSessionUserId, SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";
// Redis (KV) calls go over fetch; never let Next.js cache their answers.
export const fetchCache = "force-no-store";

const MAX_ROWS = 5000;
const MAX_CELL = 2000;
const STORE_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

function cleanCell(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CELL) : "";
}

async function authorize(request, storeId) {
  const userId = await getSessionUserId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!userId) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!storeId || !STORE_ID_PATTERN.test(storeId)) {
    return { error: NextResponse.json({ error: "Missing or invalid store id" }, { status: 400 }) };
  }
  // The sheet belongs to a store this user has connected.
  const store = await getEbayStore(userId, storeId);
  if (!store) return { error: NextResponse.json({ error: "Store not found" }, { status: 404 }) };
  return { userId };
}

// GET /api/ebay/sheet?store=<storeId>
export async function GET(request) {
  const storeId = new URL(request.url).searchParams.get("store");
  const auth = await authorize(request, storeId);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await getStoreSheet(auth.userId, storeId));
  } catch (err) {
    console.error(`Error reading sheet for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to load sheet" }, { status: 500 });
  }
}

// PUT /api/ebay/sheet?store=<storeId>   body: { rows: [{ id, itemId, title, ebayLink, aliLink, notes }] }
export async function PUT(request) {
  const storeId = new URL(request.url).searchParams.get("store");
  const auth = await authorize(request, storeId);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.rows) || body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `rows must be an array of at most ${MAX_ROWS}` }, { status: 400 });
  }

  const rows = body.rows
    .map((row) => ({
      id: cleanCell(row?.id) || crypto.randomUUID(),
      itemId: cleanCell(row?.itemId),
      title: cleanCell(row?.title),
      ebayLink: cleanCell(row?.ebayLink),
      aliLink: cleanCell(row?.aliLink),
      notes: cleanCell(row?.notes),
    }))
    // Fully empty rows are not worth storing.
    .filter((row) => row.ebayLink || row.aliLink || row.notes || row.title);

  try {
    const saved = await saveStoreSheet(auth.userId, storeId, rows);
    return NextResponse.json({ ok: true, rows: saved.rows.length, updatedAt: saved.updatedAt });
  } catch (err) {
    console.error(`Error saving sheet for store ${storeId}:`, err);
    return NextResponse.json({ error: "Failed to save sheet" }, { status: 500 });
  }
}
