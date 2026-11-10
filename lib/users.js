import { createHash, randomUUID } from "node:crypto";
import { kv } from "@vercel/kv";

// Accounts are stored by the hash of their email; a second record per account (and an index of all account ids)
// lets the owner see how many accounts exist, who they are and when they last logged in.
const INDEX_KEY = "app:users:index";

function userKey(email) {
  const emailHash = createHash("sha256").update(email).digest("hex");
  return `app:user:${emailHash}`;
}
const profileKey = (id) => `app:userid:${id}`;

export async function getUserByEmail(email) {
  return await kv.get(userKey(email));
}

export async function createUser(email, passwordHash) {
  const user = { id: randomUUID(), email, passwordHash, createdAt: Date.now() };
  const result = await kv.set(userKey(email), user, { nx: true });
  if (!result) return null;
  await kv.set(profileKey(user.id), { email, createdAt: user.createdAt, lastLoginAt: null });
  await kv.sadd(INDEX_KEY, user.id);
  return user;
}

// Remembers the last login (and adds accounts created before the list existed).
export async function noteLogin(user) {
  const old = (await kv.get(profileKey(user.id))) || {};
  await kv.set(profileKey(user.id), { email: user.email, createdAt: user.createdAt, ...old, lastLoginAt: Date.now() });
  await kv.sadd(INDEX_KEY, user.id);
}

export async function getProfile(id) {
  return await kv.get(profileKey(id));
}

// Finds accounts that were created before the list existed and adds them to it.
export async function backfillUsers() {
  let cursor = 0;
  do {
    const [next, keys] = await kv.scan(cursor, { match: "app:user:*", count: 200 });
    cursor = Number(next);
    for (const key of keys) {
      const user = await kv.get(key);
      if (!user?.id || !user.email) continue;
      if (!(await kv.get(profileKey(user.id)))) await kv.set(profileKey(user.id), { email: user.email, createdAt: user.createdAt || null, lastLoginAt: null });
      await kv.sadd(INDEX_KEY, user.id);
    }
  } while (cursor !== 0);
}

// [{ id, email, createdAt, lastLoginAt }], newest first.
export async function listUsers() {
  const ids = (await kv.smembers(INDEX_KEY)) || [];
  const profiles = await Promise.all(ids.map(async (id) => ({ id, ...((await kv.get(profileKey(id))) || {}) })));
  return profiles.filter((p) => p.email).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
